import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import session from "express-session";
import app, { db } from "../index.js";
import {
  TEST_PASSWORD,
  createLoggedInUser,
  deleteUsersByEmail,
  type TestUser,
} from "./helpers.js";
import { testDb } from "./testDb.js";
import {
  loginForCookie,
  rawSessionCookieFrom,
  sessionCookieFrom,
  sidFromCookie,
} from "./sessionHelpers.js";

// Emails in this file are prefixed "sess-" so they never collide with other files.
//
// The existing tests use an agent (it keeps cookies like a browser). These tests keep the
// raw cookie instead, so they can REPLAY it, which is what someone holding a stolen
// cookie would do. That is the only way to prove the SERVER forgot the session.

const email = "sess-lifecycle@example.test";
const creds = { email, password: TEST_PASSWORD };
let user: TestUser;

async function sessionRow(cookie: string) {
  const { rows } = await testDb.query(
    "SELECT sess, expire FROM session WHERE sid = $1",
    [sidFromCookie(cookie)],
  );
  return rows[0];
}

const whoAmI = (cookie: string) =>
  request(app).get("/api/session").set("Cookie", cookie);

beforeAll(async () => {
  user = await createLoggedInUser(email);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => deleteUsersByEmail(email, "sess-reg-fail@example.test"));

describe("session storage and invalidation", () => {
  // T120
  it("stores the session in the database with the user's id", async () => {
    const cookie = await loginForCookie(app, email, TEST_PASSWORD);

    const row = await sessionRow(cookie);

    expect(row).toBeDefined();
    const sess = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
    expect(sess.userId).toBe(user.userId);
  });

  // T121
  it("logout deletes the session on the server: a replayed cookie gets 401", async () => {
    const cookie = await loginForCookie(app, email, TEST_PASSWORD);
    expect((await whoAmI(cookie)).status).toBe(200);

    await request(app).post("/api/logout").set("Cookie", cookie).expect(200);

    expect(await sessionRow(cookie)).toBeUndefined();
    expect((await whoAmI(cookie)).status).toBe(401);
  });

  // T122
  it("logging in again kills the old session id (session fixation)", async () => {
    const oldCookie = await loginForCookie(app, email, TEST_PASSWORD);

    const res = await request(app)
      .post("/api/login")
      .set("Cookie", oldCookie)
      .send(creds)
      .expect(200);
    const newCookie = sessionCookieFrom(res)!;

    expect(newCookie).not.toBe(oldCookie);
    expect((await whoAmI(oldCookie)).status).toBe(401);
    expect((await whoAmI(newCookie)).status).toBe(200);
  });

  // T123
  it("two devices have independent sessions: logging out of one keeps the other", async () => {
    const phone = await loginForCookie(app, email, TEST_PASSWORD);
    const laptop = await loginForCookie(app, email, TEST_PASSWORD);

    await request(app).post("/api/logout").set("Cookie", phone).expect(200);

    expect((await whoAmI(phone)).status).toBe(401);
    expect((await whoAmI(laptop)).status).toBe(200);
  });

  // T124
  it("the cookie lasts about 24 hours", async () => {
    const res = await request(app).post("/api/login").send(creds).expect(200);

    const expires = /Expires=([^;]+)/.exec(rawSessionCookieFrom(res)!)![1];
    const hoursLeft = (Date.parse(expires) - Date.now()) / 3_600_000;

    expect(hoursLeft).toBeGreaterThan(23);
    expect(hoursLeft).toBeLessThan(25);
  });

  // T125
  it.each([
    ["an unsigned value", "connect.sid=just-a-guess"],
    [
      "a well-formed value with a wrong signature",
      "connect.sid=s%3Anotarealsession.thisSignatureIsWrong",
    ],
    ["an empty value", "connect.sid="],
  ])("rejects %s with 401, not 500", async (_label, cookie) => {
    const res = await whoAmI(cookie);

    expect(res.status).toBe(401);
  });

  // T126
  it("rejects a session whose expiry time has passed", async () => {
    const cookie = await loginForCookie(app, email, TEST_PASSWORD);
    await testDb.query(
      "UPDATE session SET expire = now() - interval '1 day' WHERE sid = $1",
      [sidFromCookie(cookie)],
    );

    expect((await whoAmI(cookie)).status).toBe(401);
  });
});

describe("failures while creating or ending a session", () => {
  const failWith = (message: string) =>
    function (this: unknown, callback: (error: Error) => void) {
      callback(new Error(message));
      return this;
    } as never;

  // T127
  it("logout reports 500 and keeps the user logged in when the session cannot be destroyed", async () => {
    const cookie = await loginForCookie(app, email, TEST_PASSWORD);
    vi.spyOn(session.Session.prototype, "destroy").mockImplementation(
      failWith("store unavailable"),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).post("/api/logout").set("Cookie", cookie);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Could not log out.");
    expect(logged).toHaveBeenCalled();
    expect(rawSessionCookieFrom(res)).toBeUndefined(); // cookie not cleared: the logout did not happen

    vi.restoreAllMocks();
    expect((await whoAmI(cookie)).status).toBe(200); // so the user is told the truth
  });

  // T128
  it("login returns 500 and creates no session when regenerate fails", async () => {
    vi.spyOn(session.Session.prototype, "regenerate").mockImplementation(
      failWith("regenerate failed"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const agent = request.agent(app);

    const res = await agent.post("/api/login").send(creds);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something went wrong.");
    vi.restoreAllMocks();
    expect((await agent.get("/api/session")).status).toBe(401);
  });

  // T129
  it("registration returns 500 when the session cannot be started", async () => {
    vi.spyOn(session.Session.prototype, "regenerate").mockImplementation(
      failWith("regenerate failed"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).post("/api/registration").send({
      name: "Session Fail",
      email: "sess-reg-fail@example.test",
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something went wrong.");
  });
});

describe("database pool", () => {
  // T137
  it("handles an 'error' event from an idle connection instead of crashing", () => {
    // Without db.on("error", ...) Node throws on this event and the whole server dies
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const problem = new Error("idle client lost its connection");

    expect(() => db.emit("error", problem)).not.toThrow();

    expect(logged).toHaveBeenCalledWith("Unexpected database error:", problem);
  });
});
