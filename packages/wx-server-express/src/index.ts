import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import contentType from 'content-type';
import express, {
  Application,
  Request,
  Response,
  json,
  response,
} from 'express';
import {
  ApplicationRequestHandler,
  PathParams,
  RequestHandlerParams,
  RequestParamHandler,
} from 'express-serve-static-core';

import qs from 'fast-querystring';
import { getWXContext } from 'wx-server-sdk';

type MaybePromise<T> = Promise<T> | T;

type WXContext = ReturnType<typeof getWXContext>;

type HTTPMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | string;

interface ParsedQueryString {
  [key: string]:
    | undefined
    | string
    | string[]
    | ParsedQueryString
    | ParsedQueryString[];
}

const httpError = (statusCode: number, message: string, errDtails = {}) => {
  return { statusCode, message, ...errDtails };
};

export const initExpressApp = async (
  configs?: ExpressAppConfigs
): Promise<Application> => {
  const {
    app,
    setters,
    params,
    ons,
    handlers,
    enableSettings,
    disableSettings,
    configureFn,
  } = configs ?? {};

  const _app: Application = app ?? express().use(json());

  await configureFn?.();

  disableSettings?.forEach((disableSetting) => _app.disable(disableSetting));
  enableSettings?.forEach((enableSetting) => _app.enable(enableSetting));
  setters?.forEach((setter) => _app.set(setter.setting, setter.val));
  params?.forEach((param) => _app.param(param.name, param.handler));
  ons?.forEach((on) => _app.on(on.event, on.callback));
  handlers?.forEach((handler) =>
    handler.path
      ? _app.use(
          handler.path,
          ...(handler.handlers
            ? Array.isArray(handler.handlers)
              ? handler.handlers
              : [handler.handlers]
            : [])
        )
      : _app.use(
          ...(handler.handlers
            ? Array.isArray(handler.handlers)
              ? handler.handlers
              : [handler.handlers]
            : [])
        )
  );

  return _app;
};

export const initExpressRequest = (
  url: string,
  method: HTTPMethod,
  headers: IncomingHttpHeaders,
  body: object | string | undefined
): Request => {
  const socket = new Socket();
  const req = new IncomingMessage(socket) as Request;

  req.url = url;
  req.method = method;
  req.headers = headers;

  if (body) {
    req.push(typeof body === 'string' ? body : JSON.stringify(body));
  }
  req.push(null);

  return req;
};

const setCharset = (
  type: string | contentType.RequestLike | contentType.ResponseLike,
  charset: string
) => {
  if (!type || !charset) {
    return type;
  }

  // parse type
  var parsed = contentType.parse(type);

  // set charset
  parsed.parameters.charset = charset;

  // format type
  return contentType.format(parsed);
};

export const initExpressResponse = (statusCode?: number): Response => {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req) as Response;

  // res.statusCode = statusCode ?? 500;

  res.send = function send(body: any): Response {
    let chunk = body;
    let encoding;
    const req: Request = this.req;
    let type: string | undefined;

    // settings
    const app: Application = this.app;

    switch (typeof chunk) {
      // string defaulting to html
      case 'string':
        if (!this.get('Content-Type')) {
          this.type('html');
        }
        break;
      case 'boolean':
      case 'number':
      case 'object':
        if (chunk === null) {
          chunk = '';
        } else if (Buffer.isBuffer(chunk)) {
          if (!this.get('Content-Type')) {
            this.type('bin');
          }
        } else {
          return this.json(chunk);
        }
        break;
    }

    // write strings in utf-8
    if (typeof chunk === 'string') {
      encoding = 'utf8';
      type = this.get('Content-Type');

      // reflect this in content-type
      if (typeof type === 'string') {
        this.set('Content-Type', setCharset(type, 'utf-8').toString());
      }
    }

    // determine if ETag should be generated
    var etagFn = app.get('etag fn');
    var generateETag = !this.get('ETag') && typeof etagFn === 'function';

    // populate Content-Length
    var len;
    if (chunk !== undefined) {
      if (Buffer.isBuffer(chunk)) {
        // get length of Buffer
        len = chunk.length;
      } else if (!generateETag && chunk.length < 1000) {
        // just calculate length when no ETag + small chunk
        len = Buffer.byteLength(chunk, encoding as BufferEncoding);
      } else {
        // convert chunk to Buffer and calculate
        chunk = Buffer.from(chunk, encoding as BufferEncoding);
        encoding = undefined;
        len = chunk.length;
      }

      this.set('Content-Length', len);
    }

    // populate ETag
    var etag;
    if (generateETag && len !== undefined) {
      if ((etag = etagFn(chunk, encoding))) {
        this.set('ETag', etag);
      }
    }

    // freshness
    if (req.fresh) this.status(304);

    // strip irrelevant headers
    if (204 === this.statusCode || 304 === this.statusCode) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      this.removeHeader('Transfer-Encoding');
      chunk = '';
    }

    // alter headers for 205
    if (this.statusCode === 205) {
      this.set('Content-Length', '0');
      this.removeHeader('Transfer-Encoding');
      chunk = '';
    }

    if (req.method === 'HEAD') {
      // skip body for HEAD
      this.end();
    } else {
      // respond
      this.end(chunk, encoding as BufferEncoding);
    }

    return this;
  };

  return res;
};

export type Options = OptionsData;

export interface OptionsData extends ExpressAppConfigs {
  event: any;
  context?: unknown;
  wxContext?: WXContext;
}

export type QueryString = ParsedQueryString;

export interface ExpressParams {
  path?: string;
  httpMethod?: HTTPMethod;
  headers?: IncomingHttpHeaders;
  queryStringParameters?: QueryString;
  body?: string;
  isBase64Encoded?: boolean;
}

export interface ExpressAppConfigs {
  app?: Application;
  setters?: Array<{ setting: string; val: any }>;
  params?: Array<{ name: string | string[]; handler: RequestParamHandler }>;
  ons?: Array<{ event: string; callback: (parent: Application) => void }>;
  handlers?: Array<{
    path?: PathParams;
    handlers?: RequestHandlerParams | RequestHandlerParams[];
  }>;
  enableSettings?: Array<string>;
  disableSettings?: Array<string>;
  configureFn?: () => MaybePromise<void>;
}

export async function expressWXServer(options: Options): Promise<any> {
  const app: Application = await initExpressApp(options);

  const params: ExpressParams = await getExpressParams(options.event);

  const path: string = params.path!;
  const method: HTTPMethod = params.httpMethod!;
  const headers: IncomingHttpHeaders = params.headers!;
  const query: QueryString = params.queryStringParameters!;
  let body: string = params.body!;

  if (params.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  const queryString: string = qs.stringify(query);
  const url: string = queryString ? `${path}?${queryString}` : path;

  const wxContext: WXContext | undefined = options.wxContext;

  const req: Request = initExpressRequest(url, method, headers, body);

  return new Promise((resolve, reject) => {
    const res: Response = initExpressResponse();

    const _end = res.end;
    const _write = res.write;

    let resBody = '';

    res.write = function write(
      chunk: any,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean {
      resBody += Buffer.isBuffer(chunk)
        ? Buffer.from(chunk as any, 'base64').toString('utf8')
        : chunk.toString();

      let encoding: BufferEncoding | undefined;
      let cb: ((error?: Error | null) => void) | undefined;
      if (typeof encodingOrCallback === 'function') {
        cb = encodingOrCallback;
      } else {
        encoding = encodingOrCallback;
        cb = callback;
      }

      if (encoding) {
        return _write.call(this, chunk, encoding, cb);
      }
      return _write.call(this, chunk, cb as any);
    };

    res.end = function end(
      chunk?: any,
      encodingOrCb?: BufferEncoding | (() => void),
      cb?: () => void
    ): Response {
      let encoding: BufferEncoding | undefined;
      let callback: (() => void) | undefined;
      let data: any;

      if (typeof chunk === 'function') {
        // Signature: end(cb)
        callback = chunk;
        data = undefined;
        encoding = undefined;
      } else if (typeof encodingOrCb === 'function') {
        // Signature: end(chunk, cb)
        data = chunk;
        callback = encodingOrCb;
        encoding = undefined;
      } else {
        // Signature: end(chunk, encoding, cb)
        data = chunk;
        encoding = encodingOrCb as BufferEncoding;
        callback = cb;
      }

      if (data) {
        data = Buffer.isBuffer(data)
          ? Buffer.from(data as any, 'base64').toString('utf8')
          : data.toString();
        this.write(data, encoding as BufferEncoding);
      }

      // Try to parse the body to JSON
      let responseBody: string | object;
      try {
        responseBody = JSON.parse(resBody);
      } catch (e) {
        responseBody = resBody;
      }

      // Include wxContext in the final response if it's an object
      if (typeof responseBody === 'object' && responseBody !== null) {
        responseBody = {
          ...responseBody,
          wxContext: {
            openid: wxContext?.OPENID,
            appid: wxContext?.APPID,
            unionid: wxContext?.UNIONID,
          },
        };
      }

      resolve({
        statusCode: res.statusCode,
        body:
          typeof responseBody === 'object'
            ? JSON.stringify(responseBody)
            : responseBody,
      });

      return _end.call(this, data, encoding as BufferEncoding, callback);
    };

    // Pass the mock request and response to the Express app
    app(req, res);
  });
}

export async function getExpressParams(param: any): Promise<ExpressParams> {
  let path: string | undefined = param.path;
  if (!path || typeof path !== 'string') {
    path = '/';
  }

  let httpMethod: HTTPMethod | undefined = param.httpMethod;
  if (!httpMethod || typeof httpMethod !== 'string') {
    httpMethod = 'GET';
  }
  httpMethod = httpMethod.toUpperCase();

  let headers: IncomingHttpHeaders | undefined = param.headers;
  if (!headers || typeof headers !== 'object') {
    headers = {};
  }

  let queryStringParameters: ParsedQueryString | undefined =
    param.queryStringParameters;
  if (!queryStringParameters || typeof queryStringParameters !== 'object') {
    queryStringParameters = {};
  }

  let body: string | object | undefined = param.body;
  if (!body || (typeof body !== 'string' && typeof body !== 'object')) {
    body = typeof body === 'object' ? JSON.stringify(body) : '';
  }

  const isBase64Encoded = !!param.isBase64Encoded;

  return {
    path,
    httpMethod,
    headers,
    queryStringParameters,
    body: body as string,
    isBase64Encoded,
  };
}
