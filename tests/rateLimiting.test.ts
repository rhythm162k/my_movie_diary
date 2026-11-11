import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loadFreshApp, type FreshApp } from "./freshApp.js";

/*
 * Rate limiters (middleware/rateLimiters.ts)
 *
 * The coverage report shows 100% for this file, but that only means the file was
 * LOADED. loginLimiter is switched off in test mode (skip: () => isTest) and nothing
 * ever sent enough requests to trigger a 429. So the brute-force protection on
 * login/registration/Google had no test at all.
 *
 * These tests load a "production" copy of the app (see freshApp.ts), where nothing is
 * skipped. Every test uses its own client IP (X-Forwarded-For) because the counters
 * are kept per IP, so the tests cannot affect each other. index.ts sets
 * `trust proxy` to 1, which is how Render's proxy tells the app who the client is.
 */

let fresh: FreshApp;

beforeAll(async () => {
  fresh = await loadFreshApp();
});

afterAll(() => fresh.cleanup());

const send = (
  method: "get" | "post",
  path: string,
  ip: string,
  body: object = {},
) => {
  const req = request(fresh.app)[method](path).set("X-Forwarded-For", ip);
  return method === "post" ? req.send(body) : req;
};

describe("generalLimiter (all /api routes: 100 requests per 15 minutes)", () => {
  const ip = "198.51.100.10";

  // T130
  it("blocks the 101st request with 429 and a JSON message", async () => {
    for (let i = 1; i <= 100; i++) {
      const res = await send("get", "/api/session", ip);
      expect(res.status).toBe(401); // logged out, but NOT rate limited yet
      if (i === 1) {
        // standardHeaders: true -> RateLimit-* headers; legacyHeaders: false -> no X-RateLimit-*
        expect(
          Object.keys(res.headers).some((h) => h.startsWith("ratelimit")),
        ).toBe(true);
        expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
      }
    }

    const blocked = await send("get", "/api/session", ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many requests. Please try again later.",
    );
    expect(blocked.headers["retry-after"]).toBeDefined();
  }, 30_000);

  // T131
  it("keeps a separate budget for every client IP", async () => {
    const res = await send("get", "/api/session", "198.51.100.11");

    expect(res.status).toBe(401);
  });

  // T132
  it("cannot be dodged by sending a fake X-Forwarded-For (trust proxy = 1)", async () => {
    // A proxy APPENDS the real address, so the attacker's invented value is on the left
    const res = await send("get", "/api/session", `10.9.8.7, ${ip}`);

    expect(res.status).toBe(429);
  });
});

describe("loginLimiter (login + registration: 10 requests per 15 minutes)", () => {
  // Empty bodies fail validation with 400. That is enough: the limiter runs
  // BEFORE validation and counts every request, so no bcrypt work is needed.

  // T133
  it("blocks the 11th POST /api/login with 429", async () => {
    const ip = "203.0.113.20";
    for (let i = 1; i <= 10; i++) {
      expect((await send("post", "/api/login", ip)).status).toBe(400);
    }

    const blocked = await send("post", "/api/login", ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many login attempts. Please try again later.",
    );
  });

  // T134
  it("blocks the 11th POST /api/registration with 429", async () => {
    const ip = "203.0.113.21";
    for (let i = 1; i <= 10; i++) {
      expect((await send("post", "/api/registration", ip)).status).toBe(400);
    }

    const blocked = await send("post", "/api/registration", ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many login attempts. Please try again later.",
    );
  });

  // T135
  it("counts a spoofed X-Forwarded-For as the same client", async () => {
    const realIp = "203.0.113.22";
    for (let i = 1; i <= 10; i++) {
      const res = await send("post", "/api/login", `192.0.2.${i}, ${realIp}`);
      expect(res.status).toBe(400);
    }

    const blocked = await send("post", "/api/login", `192.0.2.200, ${realIp}`);

    expect(blocked.status).toBe(429);
  });
});

describe("googleAuthLimiter (/auth/google: 20 requests per 15 minutes)", () => {
  // T136
  it("blocks the 21st request with 429", async () => {
    const ip = "203.0.113.30";
    for (let i = 1; i <= 20; i++) {
      // the real Google strategy is registered in this copy: 302 to accounts.google.com
      expect((await send("get", "/auth/google", ip)).status).toBe(302);
    }

    const blocked = await send("get", "/auth/google", ip);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many Google authentication requests. Please try again later.",
    );
  });
});
