import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("app", () => {
  it("GET /api/health returns 200 { status: 'ok' }", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("unknown route returns 404 { error }", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: expect.any(String) });
  });

  it("thrown error returns { error } with its status", async () => {
    const app = buildApp();
    app.get("/api/boom", () => {
      throw Object.assign(new Error("boom"), { statusCode: 400 });
    });
    const res = await app.inject({ method: "GET", url: "/api/boom" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "boom" });
  });
});
