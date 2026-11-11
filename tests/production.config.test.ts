import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { loadFreshApp, type FreshApp } from "./freshApp.js";
import { TEST_PASSWORD, deleteUsersByEmail } from "./helpers.js";
import { testDb } from "./testDb.js";
import { rawSessionCookieFrom, sessionCookieFrom } from "./sessionHelpers.js";

/*
 * Production-only configuration
 *
 * Everything in index.ts that depends on NODE_ENV === "production" (or "not test") is
 * skipped by the normal test run, so none of it was ever checked: Secure/SameSite=None
 * cookies, bcrypt cost 10, the Google strategy settings, app.listen(). If one of these
 * is wrong, the app works locally but nobody can log in on Render.
 *
 * Runs against a fresh "production" copy of the app (see freshApp.ts), test DB only.
 */

const email = "prodcfg-user@example.test";
let fresh: FreshApp;

beforeAll(async () => {
  fresh = await loadFreshApp();
});

beforeEach(() => deleteUsersByEmail(email));

afterAll(async () => {
  await deleteUsersByEmail(email);
  await fresh.cleanup();
});

const register = (headers: Record<string, string> = {}) =>
  request(fresh.app)
    .post("/api/registration")
    .set(headers)
    .send({ name: "Prod Tester", email, password: TEST_PASSWORD });

const HTTPS = { "X-Forwarded-Proto": "https" }; // what Render's proxy adds

describe("server start-up", () => {
  const listenArgs = () =>
    fresh.listenCalls[0] as unknown as [number, string, () => void];

  // T140
  it("listens on PORT and on 0.0.0.0", () => {
    expect(fresh.listenCalls).toHaveLength(1);
    const [port, host, callback] = listenArgs();

    expect(port).toBe(Number(fresh.settings.PORT));
    expect(host).toBe("0.0.0.0"); // Render only routes traffic to 0.0.0.0, not 127.0.0.1
    expect(typeof callback).toBe("function");
  });

  // T141
  it("logs which port it is running on", () => {
    const callback = listenArgs()[2];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    callback();

    expect(log).toHaveBeenCalledWith(
      `Server running on port ${fresh.settings.PORT}`,
    );
    log.mockRestore();
  });
});

describe("session cookie in production", () => {
  // T142
  it("is HttpOnly, Secure and SameSite=None behind an HTTPS proxy", async () => {
    const res = await register(HTTPS).expect(201);

    const cookie = rawSessionCookieFrom(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure"); // never sent over plain HTTP
    expect(cookie).toContain("SameSite=None"); // needed: frontend and API are on different sites
  });

  // T143
  it("is not issued at all when the request does not look like HTTPS", async () => {
    // Without X-Forwarded-Proto: https the Secure cookie is silently dropped. This pins
    // down why `trust proxy` matters: break it and users "register" but never get logged in.
    const res = await register().expect(201);

    expect(rawSessionCookieFrom(res)).toBeUndefined();
  });

  // T144
  it("keeps the user logged in on the next request", async () => {
    const res = await register(HTTPS).expect(201);
    const cookie = sessionCookieFrom(res)!;

    // A cookie jar would not send a Secure cookie over http://, so send it by hand
    const me = await request(fresh.app)
      .get("/api/session")
      .set(HTTPS)
      .set("Cookie", cookie);

    expect(me.status).toBe(200);
    expect(me.body.userId).toBeDefined();
  });
});

describe("password hashing in production", () => {
  // T145
  it("uses a real bcrypt cost (10 or more), not the test-mode cost of 4", async () => {
    await register(HTTPS).expect(201);
    const { rows } = await testDb.query(
      "SELECT password FROM users WHERE email = $1",
      [email],
    );

    const cost = Number(/^\$2[aby]\$(\d{2})\$/.exec(rows[0].password)?.[1]);

    expect(cost).toBeGreaterThanOrEqual(10); // lower this number if you change saltRounds on purpose
  });
});

describe("CORS in production", () => {
  const origin = "https://movies.example.test"; // = FRONTEND_URL in freshApp.ts

  // T146
  it("allows credentials for the frontend origin (preflight)", async () => {
    const res = await request(fresh.app)
      .options("/api/movies")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  // T147
  it("never allows another origin", async () => {
    const res = await request(fresh.app)
      .get("/api/session")
      .set("Origin", "https://evil.example.test");

    // The header always names the configured frontend, so a browser on the evil
    // site is refused. It must never be "*" or echo the evil origin back.
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
  });
});

describe("Google sign-in routes with the real strategy", () => {
  // T148
  it("GET /auth/google redirects to Google with the configured client", async () => {
    const res = await request(fresh.app).get("/auth/google");

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(
      fresh.settings.GOOGLE_CLIENT_ID,
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      fresh.settings.GOOGLE_CALLBACK_URL,
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("profile email");
  });

  // T149
  it("sends the user back to the login page when they deny access", async () => {
    const res = await request(fresh.app).get(
      "/auth/google/callback?error=access_denied",
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${fresh.settings.FRONTEND_URL}/login`);
    expect(rawSessionCookieFrom(res)).toBeUndefined(); // nobody got logged in
  });
});
