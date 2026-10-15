import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import app, { db } from "../index.js";
import { createLoggedInUser, deleteUsersByEmail } from "./helpers.js";

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
