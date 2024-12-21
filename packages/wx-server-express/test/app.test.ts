import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import { expressWXServer, initExpressApp } from "..";

describe("init app", () => {
  test("test express app inherit from event emitter", async () => {
    let success: boolean = false;
    const app = await initExpressApp({
      ons: [{ event: "foo", callback: () => (success = true) }],
    });
    app.emit("foo");
    expect(success).toBe(true);
  });

  test("test express app should be callable", async () => {
    const app = await initExpressApp();
    expect(typeof app).toBe("function");
  });

  test("test express app should 404 without routes", async () => {
    const app = await initExpressApp();
    const response = await expressWXServer({ event: { path: "/" }, app });
    expect(response.statusCode).toBe(404);
  });

  test("test express app.parent should return the parent when mounted", async () => {
    const blogAdmin = await initExpressApp();
    const blog = await initExpressApp({
      handlers: [{ path: "/admin", handlers: blogAdmin }],
    });
    const app = await initExpressApp({
      handlers: [{ path: "/blog", handlers: blog }],
    });

    expect(!(app as any).parent).toBeTruthy();
    expect((blog as any).parent).toStrictEqual(app);
    expect((blogAdmin as any).parent).toStrictEqual(blog);
  });

  test("test express app.mountpath should return the mounted path", async () => {
    const fallback = await initExpressApp();
    const admin = await initExpressApp();
    const blog = await initExpressApp({
      handlers: [{ path: "/admin", handlers: admin }],
    });
    const app = await initExpressApp({
      handlers: [{ path: "/blog", handlers: blog }, { handlers: fallback }],
    });

    expect(admin.mountpath).toBe("/admin");
    expect(app.mountpath).toBe("/");
    expect(blog.mountpath).toBe("/blog");
    expect(fallback.mountpath).toBe("/");
  });

  test("test express app should return the canonical", async () => {
    const blogAdmin = await initExpressApp();
    const blog = await initExpressApp({
      handlers: [{ path: "/admin", handlers: blogAdmin }],
    });
    const app = await initExpressApp({
      handlers: [{ path: "/blog", handlers: blog }],
    });

    expect(app.path()).toBe("");
    expect(blog.path()).toBe("/blog");
    expect(blogAdmin.path()).toBe("/blog/admin");
  });
});

describe("init app with development env", () => {
  const _beforeAll = function (this: any) {
    this.env = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
  };

  const _afterAll = function (this: any) {
    process.env.NODE_ENV = this.env;
  };

  beforeAll(_beforeAll);

  afterAll(_afterAll);

  test("test express app should disable 'view cache'", async () => {
    const app = await initExpressApp();

    expect(app.enabled("view cache")).toBeFalsy();
  });
});

describe("init app with production env", () => {
  const _beforeAll = function (this: any) {
    this.env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
  };

  const _afterAll = function (this: any) {
    process.env.NODE_ENV = this.env;
  };

  beforeAll(_beforeAll);

  afterAll(_afterAll);

  test("test express app should enable 'view cache'", async () => {
    const app = await initExpressApp();
    expect(app.enabled("view cache")).toBeTruthy();
  });
});

describe("init app without NODE_ENV", () => {
  const _beforeAll = function (this: any) {
    this.env = process.env.NODE_ENV;
    process.env.NODE_ENV = "";
  };

  const _afterAll = function (this: any) {
    process.env.NODE_ENV = this.env;
  };

  beforeAll(_beforeAll);

  afterAll(_afterAll);

  test("test express app should default to development", async () => {
    const app = await initExpressApp();
    expect(app.get("env")).toBe("development");
  });
});

describe("init app with option", () => {
  describe("param", () => {
    test("test express app.param should map the array", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: ["id", "uid"],
            handler: function (req, res, next, id) {
              id = Number(id);
              if (isNaN(id)) return next("route");
              req.params.id = id;
              next();
            },
          },
        ],
      });

      app.get("/post/:id", function (req, res) {
        var id = req.params.id;
        res.send(typeof id + ":" + id);
      });

      app.get("/user/:uid", function (req, res) {
        var id = (req.params as any).id;
        res.send(typeof id + ":" + id);
      });

      let response;

      response = await expressWXServer({
        event: { path: "/user/123" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("number:123");

      response = await expressWXServer({
        event: { path: "/post/123" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("number:123");
    });

    test("test express app.param should map logic for a single param", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "id",
            handler: function (req, res, next, id) {
              id = Number(id);
              if (isNaN(id)) return next("route");
              req.params.id = id;
              next();
            },
          },
        ],
      });

      app.get("/user/:id", function (req, res) {
        var id = req.params.id;
        res.send(typeof id + ":" + id);
      });

      let response;

      response = await expressWXServer({
        event: { path: "/user/123" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("number:123");

      response = await expressWXServer({
        event: { path: "/post/123" },
        app,
      });
      expect(response.statusCode).toBe(404);
    });

    test("test express app.param should only call once per request", async () => {
      var called = 0;
      var count = 0;

      const app = await initExpressApp({
        params: [
          {
            name: "user",
            handler: function (req, res, next, user) {
              called++;
              (req as any).user = user;
              next();
            },
          },
        ],
      });

      app.get("/foo/:user", function (req, res, next) {
        count++;
        next();
      });
      app.get("/foo/:user", function (req, res, next) {
        count++;
        next();
      });

      // The handler should after getters
      app.use(function (req, res) {
        res.end([count, called, (req as any).user].join(" "));
      });

      let response = await expressWXServer({
        event: { path: "/foo/bob" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("2 1 bob");
    });

    test("test express app.param should call when values differ", async () => {
      var called = 0;
      var count = 0;

      const app = await initExpressApp({
        params: [
          {
            name: "user",
            handler: function (
              req: any,
              res: any,
              next: () => void,
              user: any
            ) {
              called++;
              req.users = (req.users || []).concat(user);
              next();
            },
          },
        ],
      });

      app.get("/:user/bob", function (req, res, next) {
        count++;
        next();
      });

      app.get("/foo/:user", function (req, res, next) {
        count++;
        next();
      });

      // The handler should after getters
      app.use(function (req, res) {
        res.end([count, called, (req as any).users.join(",")].join(" "));
      });

      let response = await expressWXServer({
        event: { path: "/foo/bob" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("2 2 foo,bob");
    });

    test("test express app.param should support altering req.params across routes", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "user",
            handler: function (
              req: any,
              res: any,
              next: () => void,
              user: any
            ) {
              req.params.user = "loki";
              next();
            },
          },
        ],
      });

      app.get("/:user", function (req, res, next) {
        next("route");
      });

      app.get("/:user", function (req, res, next) {
        res.send(req.params.user);
      });

      let response = await expressWXServer({
        event: { path: "/bob" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("loki");
    });

    test("test express app.param should not invoke without route handler", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "thing",
            handler: function (
              req: any,
              res: any,
              next: () => void,
              thing: any
            ) {
              req.thing = thing;
              next();
            },
          },
          {
            name: "user",
            handler: function (
              req: any,
              res: any,
              next: (...args: any[]) => void,
              user: any
            ) {
              next(new Error("invalid invocation"));
            },
          },
        ],
      });

      app.post("/:user", function (req, res) {
        res.send(req.params.user);
      });

      app.get("/:thing", function (req, res) {
        res.send((req as any).thing);
      });

      let response = await expressWXServer({
        event: { path: "/bob" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("bob");
    });

    test("test express app.param should work with encoded values", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "name",
            handler: function (
              req: any,
              res: any,
              next: () => void,
              name: any
            ) {
              req.params.name = name;
              next();
            },
          },
        ],
      });

      app.get("/user/:name", function (req, res) {
        var name = req.params.name;
        res.send("" + name);
      });

      let response = await expressWXServer({
        event: { path: "/user/foo%25bar" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("foo%bar");
    });

    test("test express app.param should catch thrown secondary error", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "id",
            handler: function (req, res, next, id) {
              process.nextTick(next);
            },
          },
          {
            name: "id",
            handler: function (req, res, next, id) {
              throw new Error("err!");
            },
          },
        ],
      });

      app.get("/user/:id", function (req, res) {
        var id = req.params.id;
        res.send("" + id);
      });

      let response = await expressWXServer({
        event: { path: "/user/123" },
        app,
      });
      expect(response.statusCode).toBe(500);
    });

    test("test express app.param should defer to next route", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "id",
            handler: function (req, res, next, id) {
              next("route");
            },
          },
        ],
      });

      app.get("/user/:id", function (req, res) {
        var id = req.params.id;
        res.send("" + id);
      });

      app.get("/:name/123", function (req, res) {
        res.send("name");
      });

      let response = await expressWXServer({
        event: { path: "/user/123" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("name");
    });

    test("test express app.param should defer all the param routes", async () => {
      const app = await initExpressApp({
        params: [
          {
            name: "id",
            handler: function (req, res, next, id) {
              if (id === "new") return next("route");
              return next();
            },
          },
        ],
      });

      app.all("/user/:id", function (req, res) {
        res.send("all.id");
      });

      app.get("/user/:id", function (req, res) {
        res.send("get.id");
      });

      app.get("/user/new", function (req, res) {
        res.send("get.new");
      });

      let response = await expressWXServer({
        event: { path: "/user/new" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("get.new");
    });

    test("test express app.param should not call when values differ on error", async () => {
      var called = 0;
      var count = 0;

      const app = await initExpressApp({
        params: [
          {
            name: "user",
            handler: function (req, res, next, user) {
              called++;
              if (user === "foo") throw new Error("err!");
              (req as any).user = user;
              next();
            },
          },
        ],
      });

      app.get("/:user/bob", function (req, res, next) {
        count++;
        next();
      });
      app.get("/foo/:user", function (req, res, next) {
        count++;
        next();
      });

      app.use(function (err: any, req: any, res: any, next: () => void) {
        res.status(500);
        res.send([count, called, err.message].join(" "));
      });

      let response = await expressWXServer({
        event: { path: "/foo/bob" },
        app,
      });
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe("0 1 err!");
    });

    test(`test express app.param should call when values differ when using "next"`, async () => {
      var called = 0;
      var count = 0;

      const app = await initExpressApp({
        params: [
          {
            name: "user",
            handler: function (req, res, next, user) {
              called++;
              if (user === "foo") return next("route");
              (req as any).user = user;
              next();
            },
          },
        ],
      });

      app.get("/:user/bob", function (req, res, next) {
        count++;
        next();
      });
      app.get("/foo/:user", function (req, res, next) {
        count++;
        next();
      });
      app.use(function (req, res) {
        res.end([count, called, (req as any).user].join(" "));
      });

      let response = await expressWXServer({
        event: { path: "/foo/bob" },
        app,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("1 2 bob");
    });
  });
});
