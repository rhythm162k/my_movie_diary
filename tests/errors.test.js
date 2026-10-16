import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import request from "supertest";
import app, { db } from "../index.js";
import {
  TEST_PASSWORD,
  createLoggedInUser,
  deleteUsersByEmail,
} from "./helpers.js";

function failQueriesContaining(fragment) {
  const realQuery = db.query.bind(db);
  vi.spyOn(db, "query").mockImplementation((sql, ...args) =>
    typeof sql === "string" && sql.includes(fragment)
      ? Promise.reject(new Error("db down: secret internal detail"))
      : realQuery(sql, ...args),
  );
  vi.spyOn(console, "error").mockImplementation(() => {}); // quiet logs
}

function expectSafe500(res) {
  expect(res.status).toBe(500);
  expect(res.body.message).toBe("Something went wrong.");
  expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Emails in this file are prefixed "errors-" so they never collide with other files.

describe("global error handler", () => {
  it("returns JSON 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/login")
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request.");
  });
});

describe("500 responses", () => {
  const email = "errors-db-failure@example.test";
  let user;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => deleteUsersByEmail(email));

  it("GET /api/movies returns a safe 500 when the DB fails", async () => {
    // Fail only the movies query. The session store uses the same pool,
    // so failing every query would break the session lookup and hang.
    const realQuery = db.query.bind(db);
    vi.spyOn(db, "query").mockImplementation((sql, ...args) =>
      typeof sql === "string" && sql.includes("FROM movies")
        ? Promise.reject(new Error("db down"))
        : realQuery(sql, ...args),
    );
    vi.spyOn(console, "error").mockImplementation(() => {}); // quiet logs

    const res = await user.agent.get("/api/movies");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Something went wrong.");
    expect(JSON.stringify(res.body)).not.toContain("db down"); // no internals leaked
  });
});

/* ---------- T083 ---------- */
describe("malformed JSON on movie routes", () => {
  const email = "errors2-json@example.test";
  let user;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  afterAll(() => deleteUsersByEmail(email));

  it.each([
    ["post", "/api/movies"],
    ["patch", "/api/movies/edit?id=1"],
  ])("%s %s returns a JSON 400", async (method, url) => {
    const res = await user.agent[method](url)
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request.");
  });
});

/* ---------- T085 ---------- */
describe("DB failure on movie routes returns a safe 500", () => {
  const email = "errors2-movies-500@example.test";
  let user;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  afterAll(() => deleteUsersByEmail(email));

  it.each([
    [
      "post",
      "/api/movies",
      { title: "T", description: "d", rating: 5 },
      "INSERT INTO movies",
    ],
    ["get", "/api/movies/search?title=abc", undefined, "FROM movies"],
    ["patch", "/api/movies/edit?id=1", { description: "x" }, "UPDATE movies"],
    ["delete", "/api/delete?id=1", undefined, "DELETE FROM movies"],
  ])("%s %s", async (method, url, body, sqlFragment) => {
    // POST calls OMDb before the INSERT, so keep the network out of the test
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ Response: "False" }),
    });
    failQueriesContaining(sqlFragment);

    const res = await user.agent[method](url).send(body);

    expectSafe500(res);
  });
});

/* ---------- T086 ---------- */
describe("DB failure on auth routes returns a safe 500", () => {
  it.each([
    [
      "/api/registration",
      {
        name: "Tester",
        email: "errors2-reg@example.test",
        password: TEST_PASSWORD,
      },
    ],
    [
      "/api/login",
      { email: "errors2-login@example.test", password: TEST_PASSWORD },
    ],
  ])("POST %s", async (url, body) => {
    failQueriesContaining("FROM users");

    const res = await request(app).post(url).send(body);

    expectSafe500(res);
  });
});
