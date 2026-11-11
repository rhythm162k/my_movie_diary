import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import passport from "passport";
import session from "express-session";
import app from "../index.js";
import {
  TEST_PASSWORD,
  createLoggedInUser,
  deleteUsersByEmail,
  insertGoogleOnlyUser,
  type TestUser,
} from "./helpers.js";
import { testDb } from "./testDb.js";
import { loadFreshApp, type FreshApp } from "./freshApp.js";
import {
  loginForCookie,
  rawSessionCookieFrom,
  sessionCookieFrom,
} from "./sessionHelpers.js";

/*
 * Google sign-in
 *
 * In test mode index.ts does not register the Google strategy at all, so lines 142-189
 * (the code that finds or creates the user) and 210-214 (the callback that starts the
 * session) were never executed. Two different tricks are used here:
 *
 *  Part 1  Register a FAKE "google" strategy on passport, so the REAL callback route
 *          (index.ts) runs: session creation, redirects, errors.
 *  Part 2  Load a "development" copy of the app (see freshApp.ts) that has the REAL
 *          strategy, and call its verify function directly with fake Google profiles.
 *          That exercises the real SQL against the test database.
 *
 * Emails are prefixed "gauth-" so they never collide with other files.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

/* ============ Part 1: the callback route, with a fake Google ============ */

type Outcome =
  | { type: "success"; userId: number }
  | { type: "fail" }
  | { type: "error" };
let outcome: Outcome = { type: "fail" };

const fakeGoogleStrategy = {
  name: "google",
  authenticate(this: any) {
    if (outcome.type === "success") return this.success({ userid: outcome.userId });
    if (outcome.type === "error") return this.error(new Error("google exploded"));
    return this.fail();
  },
};

const frontendUrl = () => process.env.FRONTEND_URL || "http://localhost:5173";

describe("GET /auth/google/callback (Google replaced by a fake)", () => {
  const emailA = "gauth-callback-a@example.test";
  const emailB = "gauth-callback-b@example.test";
  let userA: TestUser, userB: TestUser;

  beforeAll(async () => {
    passport.use("google", fakeGoogleStrategy as any);
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
  });

  afterAll(async () => {
    passport.unuse("google");
    await deleteUsersByEmail(emailA, emailB);
  });

  // T101
  it("logs the user in and redirects to the frontend home page", async () => {
    outcome = { type: "success", userId: userA.userId };
    const agent = request.agent(app);

    const res = await agent.get("/auth/google/callback");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${frontendUrl()}/home`);
    const me = await agent.get("/api/session");
    expect(me.status).toBe(200);
    expect(me.body.userId).toBe(userA.userId);
  });

  // T102
  it("replaces an existing session id (session fixation)", async () => {
    const oldCookie = await loginForCookie(app, emailA, TEST_PASSWORD);
    outcome = { type: "success", userId: userB.userId };

    const res = await request(app)
      .get("/auth/google/callback")
      .set("Cookie", oldCookie);
    const newCookie = sessionCookieFrom(res)!;

    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(oldCookie);
    expect(
      (await request(app).get("/api/session").set("Cookie", oldCookie)).status,
    ).toBe(401);
    const me = await request(app).get("/api/session").set("Cookie", newCookie);
    expect(me.body.userId).toBe(userB.userId);
  });

  // T103
  it("sends the user to the login page and creates no session when Google says no", async () => {
    outcome = { type: "fail" };
    const agent = request.agent(app);

    const res = await agent.get("/auth/google/callback");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${frontendUrl()}/login`);
    expect(rawSessionCookieFrom(res)).toBeUndefined();
    expect((await agent.get("/api/session")).status).toBe(401);
  });

  // T104
  it("returns a safe JSON 500 when the strategy itself errors", async () => {
    outcome = { type: "error" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).get("/auth/google/callback");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something went wrong.");
    expect(JSON.stringify(res.body)).not.toContain("google exploded");
  });

  // T105
  it("returns a safe 500 and logs nobody in when the session cannot be regenerated", async () => {
    outcome = { type: "success", userId: userA.userId };
    vi.spyOn(session.Session.prototype, "regenerate").mockImplementation(
      function (this: unknown, callback: (error: Error) => void) {
        callback(new Error("regenerate failed"));
        return this;
      } as never,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const agent = request.agent(app);

    const res = await agent.get("/auth/google/callback");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something went wrong.");
    vi.restoreAllMocks();
    expect((await agent.get("/api/session")).status).toBe(401);
  });

  // T106
  it("returns a safe 500 when the new session cannot be saved", async () => {
    outcome = { type: "success", userId: userA.userId };
    // Once only: express-session saves again itself at the end of the request
    vi.spyOn(session.Session.prototype, "save").mockImplementationOnce(
      function (this: unknown, callback: (error: Error) => void) {
        callback(new Error("save failed"));
        return this;
      } as never,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).get("/auth/google/callback");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something went wrong.");
  });
});

/* ============ Part 2: the real strategy's verify function ============ */

describe("Google strategy: finding or creating the user", () => {
  let fresh: FreshApp;

  const newEmail = "gauth-new@example.test";
  const localEmail = "gauth-local@example.test";
  const googleOnlyEmail = "gauth-google-only@example.test";
  const caseEmail = "gauth-case@example.test";
  const allEmails = [
    newEmail,
    localEmail,
    googleOnlyEmail,
    caseEmail,
    "Gauth-Case@Example.test", // what the probe below may create
  ];

  beforeAll(async () => {
    fresh = await loadFreshApp({ NODE_ENV: "development" });
    await deleteUsersByEmail(...allEmails);
  });

  afterAll(async () => {
    await deleteUsersByEmail(...allEmails);
    await fresh.cleanup();
  });

  // What Google gives the app after the user agrees
  const profile = (id: string, email?: string, displayName = "Gina Google") => ({
    id,
    displayName,
    emails: email ? [{ value: email }] : undefined,
  });

  // Calls the verify function the way passport-oauth2 does and waits for done(err, user)
  function signInWithGoogle(googleProfile: object) {
    const verify = (fresh.passport as any)._strategy("google")._verify;
    return new Promise<{ err: any; user: any }>((resolve) => {
      verify("access-token", "refresh-token", googleProfile, (err: any, user: any) =>
        resolve({ err, user }),
      );
    });
  }

  const countUsers = async (column: "email" | "googleid", value: string) =>
    Number(
      (
        await testDb.query(
          `SELECT COUNT(*) FROM users WHERE ${column} = $1`,
          [value],
        )
      ).rows[0].count,
    );

  // T110
  it("creates a new user, with no password, for a first-time Google account", async () => {
    const { err, user } = await signInWithGoogle(
      profile("gauth-new-google-id", newEmail),
    );

    expect(err).toBeNull();
    const { rows } = await testDb.query(
      "SELECT * FROM users WHERE googleid = $1",
      ["gauth-new-google-id"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Gina Google");
    expect(rows[0].email).toBe(newEmail);
    expect(rows[0].password).toBeNull();
    expect(user.userid).toBe(rows[0].userid);
  });

  // T111
  it("recognises a returning Google user by Google id, even if the email differs", async () => {
    await insertGoogleOnlyUser(googleOnlyEmail); // googleid = "google-test-id-123"
    const existing = (
      await testDb.query("SELECT userid FROM users WHERE email = $1", [
        googleOnlyEmail,
      ])
    ).rows[0];

    const { err, user } = await signInWithGoogle(
      profile("google-test-id-123", "changed-address@example.test"),
    );

    expect(err).toBeNull();
    expect(user.userid).toBe(existing.userid);
    expect(await countUsers("googleid", "google-test-id-123")).toBe(1);
  });

  // T112
  it("signs in to the existing email/password account that has the same email", async () => {
    const local = await createLoggedInUser(localEmail);

    const { err, user } = await signInWithGoogle(
      profile("gauth-link-google-id", localEmail),
    );

    expect(err).toBeNull();
    expect(user.userid).toBe(local.userId); // same account, so the user keeps their movies
    expect(await countUsers("email", localEmail)).toBe(1); // no duplicate account
  });

  // T113
  it("fails cleanly when Google sends no email address", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const { err, user } = await signInWithGoogle(
      profile("gauth-no-email-id", undefined),
    );

    expect(err).toBeInstanceOf(Error);
    expect(user).toBeUndefined();
    expect(await countUsers("googleid", "gauth-no-email-id")).toBe(0);
    expect(logged).toHaveBeenCalledWith(
      "Google authentication error:",
      expect.any(Error),
    );
  });

  // T114
  it("passes a database error to done() and creates nobody", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fresh.db, "query").mockRejectedValue(new Error("db down"));

    const { err, user } = await signInWithGoogle(
      profile("gauth-db-down-id", "gauth-db-down@example.test"),
    );

    expect(err).toBeInstanceOf(Error);
    expect(user).toBeUndefined();
    vi.restoreAllMocks();
    expect(await countUsers("googleid", "gauth-db-down-id")).toBe(0);
  });

  // T115  PROBE: expected to FAIL today, so it is written with it.fails (see TEST_GAPS.md)
  // Registration lower-cases emails (normalizeEmail), Google's profile email is used as is.
  // A user registered as "gauth-case@example.test" who later clicks "Sign in with Google"
  // and gets "Gauth-Case@Example.test" would get a SECOND, empty account.
  // When you fix it (normalise the Google email), delete the ".fails".
  it.fails("treats a Google email that differs only by case as the same account", async () => {
    const local = await createLoggedInUser(caseEmail);

    const { user } = await signInWithGoogle(
      profile("gauth-case-google-id", "Gauth-Case@Example.test"),
    );

    expect(user.userid).toBe(local.userId);
  });
});
