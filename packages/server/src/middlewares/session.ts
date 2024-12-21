import cookie, { SerializeOptions as CookieOptions } from "cookie";
import { v4 as uuidv4 } from "uuid";
import Emittery from "emittery";

type CallbackFunc = {
  bind: { apply: (arg0: any, arg1: IArguments) => Function };
} & ((...arg1: any[]) => void);

interface Request {
  sessionId: string;
  session?: Session;
  sessionStore: MemoryStore;
  secret?: string;
  secure?: boolean;
  header?: Record<string, any>;
  originalUrl: string;
}

/**
 * Session Cookie data.
 */
class Cookie implements CookieOptions {
  path: string = "/";

  httpOnly: boolean = true;

  private _maxAge?: number;

  private _expires?: Date;

  secure?: boolean;

  partitioned?: boolean;

  priority?: "low" | "medium" | "high";

  domain?: string;

  sameSite?: boolean | "lax" | "strict" | "none";

  constructor(options?: CookieOptions) {
    const _options: Partial<CookieOptions> = options ?? {};

    let _maxAge: number | undefined;
    let _expires: Date | undefined;
    for (const [k, v] of Object.entries(_options)) {
      if (k === "expires") {
        _expires = v as CookieOptions["expires"];
      } else if (k === "maxAge") {
        _maxAge = v as CookieOptions["maxAge"];
      } else {
        (this as any)[k] = v;
      }
    }

    if (!!_maxAge) {
      this.maxAge = _maxAge;
      this.setOriMaxAge(_maxAge);
    }

    if (!!_expires) {
      this.expires = _expires;
    }
  }

  set expires(date: Date) {
    this._expires = date;
    if (this.maxAge) {
      this.setOriMaxAge(this.maxAge);
    }
  }

  get expires(): Date | undefined {
    return this._expires;
  }

  set maxAge(ms: number | undefined) {
    if (!ms) return;
    this.expires = new Date(Date.now() + ms);
  }

  get maxAge(): number | undefined {
    return this.expires instanceof Date
      ? this.expires.valueOf() - Date.now()
      : this.expires;
  }

  get params(): CookieOptions {
    return {
      path: this.path,
      httpOnly: this.httpOnly,
      maxAge: this._maxAge,
      expires: this._expires,
      secure: this.secure,
      partitioned: this.partitioned,
      priority: this.priority,
      domain: this.domain,
      sameSite: this.sameSite,
    };
  }

  getOriMaxAge(): number | undefined {
    return this._maxAge;
  }

  setOriMaxAge(val: number): void {
    this._maxAge = val;
  }

  /**
   * Serialize data into a cookie header.
   *
   * Serialize a name value pair into a cookie string suitable for
   * http headers. An optional options object specifies cookie parameters.
   *
   * serialize('foo', 'bar', { httpOnly: true })
   *   => "foo=bar; httpOnly"
   *
   * @param {string} name
   * @param {string} val
   * @returns {string}
   */
  serialize(name: string, val: string): string {
    return cookie.serialize(name, val, this.params);
  }

  /**
   * JSON Representation of the cookie parameters.
   *
   * @returns {CookieOptions}
   */
  toJSON(): CookieOptions {
    return this.params;
  }
}

/**
 * Get Session from memory.
 * If it is already expired, then delete it before return.
 *
 * @param {MemoryStore} this memory.
 * @param {string} id session id.
 * @return {Session | undefined}
 */
function getSession(this: MemoryStore, id: string): Session | undefined {
  if (!this.sessions.has(id)) {
    return;
  }

  const _session: Session = this.sessions.get(id)!;

  if (_session.cookie) {
    const expires: Date | undefined = _session.cookie.expires;

    if (expires && expires.getTime() <= Date.now()) {
      this.sessions.delete(id);
      return;
    }
  }

  return _session;
}

/**
 * Memory for handling all sessions.
 */
class MemoryStore extends Emittery {
  sessions: Map<string, Session>;

  generate?: (req: Request) => void;

  constructor() {
    super();
    this.sessions = new Map<string, Session>();
  }

  /**
   * Get Session from memory.
   * If it is already expired, then delete it before return.
   *
   * @param {string} id session id.
   * @param callback
   */
  get(id: string, callback?: CallbackFunc): void {
    setImmediate(callback as CallbackFunc, null, getSession.call(this, id));
  }

  /**
   * Get all active Sessions. Delete any expired sessions.
   *
   * @param callback
   */
  getAll(callback?: CallbackFunc): void {
    const _sessionIds: string[] = Array.from(this.sessions.keys());
    const _sessions: Session[] = [];

    _sessionIds.forEach((id: string) => {
      const _session: Session | undefined = getSession.call(this, id);
      if (_session) {
        _sessions.push(_session);
      }
    });

    callback && setImmediate(callback, null, _sessions);
  }

  /**
   * Create a new session with refreshed expiration.
   *
   * @param {Request} req request data.
   * @param {Session} session session.
   */
  createSession(req: Request, session: Session): Session {
    const expires: Date | undefined = session.cookie?.expires;
    const oriMaxAge: number | undefined = session.cookie?.getOriMaxAge();

    session.cookie = new Cookie(session.cookie);

    if (expires) {
      session.cookie.expires = expires;
    }
    if (oriMaxAge) {
      session.cookie.setOriMaxAge(oriMaxAge);
    }

    req.session = new Session(req, session);
    return session;
  }

  /**
   * Destroy the session with the given id.
   *
   * @param {string} id session id.
   * @param callback
   */
  destroy(id: string, callback?: CallbackFunc): void {
    if (this.sessions.has(id)) {
      this.sessions.delete(id);
    }

    callback && process.nextTick(callback.bind.apply(callback, arguments));
  }

  /**
   * Commit the session with the given id.
   *
   * @param {string} id session id.
   * @param {Session} session session.
   * @param callback
   */
  commit(id: string, session: Session, callback?: CallbackFunc): void {
    this.sessions.set(id, session);

    callback && process.nextTick(callback.bind.apply(callback, arguments));
  }

  /**
   * Touch the session with the given id.
   * If it is already expired, then delete it before return.
   * Otherwise, update its expiration.
   *
   * @param {string} id session id.
   * @param {Session} session session.
   * @param callback
   */
  touch(id: string, session: Session, callback?: CallbackFunc): void {
    let currSession: Session | undefined = getSession.call(this, id);

    if (currSession) {
      currSession.cookie = session.cookie;
      this.sessions.set(id, currSession);
    }

    callback && process.nextTick(callback.bind.apply(callback, arguments));
  }

  /**
   * Clear all sessions.
   *
   * @param callback
   */
  clear(callback?: CallbackFunc): void {
    this.sessions = new Map<string, Session>();

    callback && process.nextTick(callback.bind.apply(callback, arguments));
  }

  /**
   * Destroy current session and then re-generate it.
   *
   * @param {Request} req request.
   */
  regenerate(req: Request): void {
    let self = this;
    this.destroy(
      req.sessionId,
      (): void => self.generate && self.generate(req)
    );
  }

  /**
   * Load a session with the given session id.
   *
   * @param {string} id session id.
   */
  load(id: string): void {
    let self = this;
    this.get(id, (session: Session): void => {
      if (!session) return;
      const _req: Request = { sessionId: id, sessionStore: self };
      self.createSession(_req, session);
    });
  }
}

/**
 * Single session.
 */
class Session {
  id: string;

  req: Request;

  cookie?: Cookie;

  constructor(req: Request, session?: Session) {
    this.id = req.sessionId;
    this.req = req;

    if (session) {
      for (const [k, v] of Object.entries(session)) {
        if (v !== null && (!(k in this) || !(this as any)[k])) {
          (this as any)[k] = v;
        }
      }
    }
  }

  /**
   * Touch the session to reset the cookie's maxAge to prevent cookie
   * expiration when the session is still alive.
   *
   * @returns {Session}
   */
  touch(): Session {
    if (this.cookie) {
      this.cookie.maxAge = this.cookie.getOriMaxAge();
    }
    return this;
  }

  /**
   * Save the session to the memory.
   *
   * @param callback
   * @returns {Session}
   */
  save(callback?: CallbackFunc): Session {
    this.req.sessionStore.commit(this.id, this, callback);
    return this;
  }

  /**
   * Reload the session without changing the maxAge property.
   *
   * @returns {Session}
   */
  reload(): Session {
    const _req: Request = this.req;
    const _store: MemoryStore = this.req.sessionStore;

    _store.get(this.id, (session: Session | undefined) => {
      if (!session) return;
      _store.createSession(_req, session);
    });

    return this;
  }

  /**
   * Destroy current session.
   *
   * @param callback
   * @returns {Session}
   */
  destroy(callback?: CallbackFunc): Session {
    delete this.req.session;
    this.req.sessionStore.destroy(this.id, callback);
    return this;
  }

  regenerate(): Session {
    this.req.sessionStore.regenerate(this.req);
    return this;
  }
}

function isSecure(req: Request, trustProxy: boolean | undefined): boolean {
  if (trustProxy === false) {
    return false;
  }

  if (!trustProxy) {
    return req.secure === true;
  }

  const header = req.header?.["x-forworded-proto"] || "";
  const index = header.indexOf(",");
  const proto =
    index !== -1
      ? header.substr(0, index).toLowerCase().trim()
      : header.toLowerCase().trim();

  return proto === "https";
}

export interface SessionOptions {
  name?: string;
  cookie?: CookieOptions;
  trustProxy?: boolean;
  secret?: string | string[];
  store?: MemoryStore;
}

export function session(options?: SessionOptions) {
  const _options: SessionOptions = options || {};

  const cookieOptions: CookieOptions = _options.cookie || {};

  const name: string = _options.name || "session-id";

  const store: MemoryStore = _options.store || new MemoryStore();

  const trustProxy: boolean | undefined = _options.trustProxy;

  const secret: string[] = _options.secret
    ? !Array.isArray(_options.secret)
      ? [_options.secret]
      : _options.secret
    : [];

  store.generate = (req: Request): void => {
    req.sessionId = uuidv4();
    req.session = new Session(req);
    req.session.cookie = new Cookie(cookieOptions);
    req.session.cookie.secure = isSecure(req, trustProxy);
  };

  let storeReady: boolean = true;
  store.on("disconnect", () => {
    storeReady = false;
  });
  store.on("connect", () => {
    storeReady = true;
  });

  return (req: Request, res: unknown, next?: Function) => {
    if (req.session) {
      next?.();
      return;
    }

    if (!storeReady) {
      console.debug("store is disconnected");
      next?.();
      return;
    }
  };
}
