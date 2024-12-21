import { describe, expect, test } from "@jest/globals";
import { expressWXServer, initExpressApp } from "..";

describe("init app with request", () => {
  test("test express app.request should extend the request prototype", async () => {
    const app = await initExpressApp();
    (app as any).request.querystring = function () {
      return require("url").parse(this.url).query;
    };

    app.use(function (req, res) {
      res.end((req as any).querystring());
    });

    let response = await expressWXServer({
      event: { path: "/foo?name=tobi" },
      app,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("name=tobi");
  });

  test("test express app.request should only extend for the referenced app", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).request.foobar = function () {
      return "tobi";
    };

    app1.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    app2.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    let response;
    response = await expressWXServer({
      event: { path: "/" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("tobi");

    response = await expressWXServer({
      event: { path: "/" },
      app: app2,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual(
      expect.stringMatching(/(?:not a function|has no method)/)
    );
  });

  test("test express app.request should inherit to sub apps", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).request.foobar = function () {
      return "tobi";
    };

    app1.use("/sub", app2);

    app1.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    app2.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    let response;
    response = await expressWXServer({
      event: { path: "/" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("tobi");

    response = await expressWXServer({
      event: { path: "/sub" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("tobi");
  });

  test("test express app.request should allow sub app to override", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).request.foobar = function () {
      return "tobi";
    };

    (app2 as any).request.foobar = function () {
      return "loki";
    };

    app1.use("/sub", app2);

    app1.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    app2.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    let response;
    response = await expressWXServer({
      event: { path: "/" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("tobi");

    response = await expressWXServer({
      event: { path: "/sub" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("loki");
  });

  test("test express app.request should not pollute parent app", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).request.foobar = function () {
      return "tobi";
    };

    (app2 as any).request.foobar = function () {
      return "loki";
    };

    app1.use("/sub", app2);

    app1.get("/sub/foo", function (req, res) {
      res.send((req as any).foobar());
    });

    app2.get("/", function (req, res) {
      res.send((req as any).foobar());
    });

    let response;
    response = await expressWXServer({
      event: { path: "/sub" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("loki");

    response = await expressWXServer({
      event: { path: "/sub/foo" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("tobi");
  });
});
