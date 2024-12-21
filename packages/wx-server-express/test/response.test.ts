import { describe, expect, test } from "@jest/globals";
import { expressWXServer, initExpressApp } from "..";

describe("init app with response", () => {
  test("test express app.response should extend the response prototype", async () => {
    const app = await initExpressApp();
    (app as any).response.shout = function (str: string) {
      this.send(str.toUpperCase());
    };

    app.use(function (req, res) {
      (res as any).shout("hey");
    });

    let response = await expressWXServer({
      event: { path: "/" },
      app,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("HEY");
  });

  test("test express app.response should only extend for the referenced app", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).response.shout = function (str: string) {
      this.send(str.toUpperCase());
    };

    app1.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    app2.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    let response;
    response = await expressWXServer({
      event: { path: "/" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("FOO");

    response = await expressWXServer({
      event: { path: "/" },
      app: app2,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual(
      expect.stringMatching(/(?:not a function|has no method)/)
    );
  });

  test("test express app.response should inherit to sub apps", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).response.shout = function (str: string) {
      this.send(str.toUpperCase());
    };

    app1.use("/sub", app2);

    app1.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    app2.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    let response;
    response = await expressWXServer({
      event: { path: "/" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("FOO");

    response = await expressWXServer({
      event: { path: "/sub" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("FOO");
  });

  test("test express app.response should allow sub app to override", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).response.shout = function (str: string) {
      this.send(str.toUpperCase());
    };

    (app2 as any).response.shout = function (str: string) {
      this.send(str + "!");
    };

    app1.use("/sub", app2);

    app1.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    app2.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    let response;
    response = await expressWXServer({
      event: { path: "/" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("FOO");

    response = await expressWXServer({
      event: { path: "/sub" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("foo!");
  });

  test("test express app.response should not pollute parent app", async () => {
    const app1 = await initExpressApp();
    const app2 = await initExpressApp();

    (app1 as any).response.shout = function (str: string) {
      this.send(str.toUpperCase());
    };

    (app2 as any).response.shout = function (str: string) {
      this.send(str + "!");
    };

    app1.use("/sub", app2);

    app1.get("/sub/foo", function (req, res) {
      (res as any).shout("foo");
    });

    app2.get("/", function (req, res) {
      (res as any).shout("foo");
    });

    let response;
    response = await expressWXServer({
      event: { path: "/sub" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("foo!");

    response = await expressWXServer({
      event: { path: "/sub/foo" },
      app: app1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("FOO");
  });
});
