import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../index.js";
import { testDb, connectTestDb, closeTestDb } from "./testDb.js";
import { response } from "express";

const testEmail = "duplicate-registration@example.test";

describe("GET /api/session", () => {
  it("returns 401 when finds no user", async () => {
    const response = await request(app).get("/api/session");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Not authenticated.");
  });
});

describe("POST /api/registration", () => {
  beforeEach(async () => {
    await connectTestDb();

    await testDb.query("DELETE FROM users WHERE email = $1", [testEmail]);

    await testDb.query(
      `INSERT INTO users (name, email, password, googleid)
       VALUES ($1, $2, $3, $4)`,
      ["Test User", testEmail, "unused-test-password", null],
    );
  });

  afterEach(async () => {
    await testDb.query("DELETE FROM users WHERE email = $1", [testEmail]);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("returns 409 when the email is already registered", async () => {
    const response = await request(app).post("/api/registration").send({
      name: "Another User",
      email: testEmail,
      password: "some-test-password",
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "A user with this email already exists. So just Login ;)",
    );
  });
});

describe("DELETE /api/delete", () => {
  it("Returns 400 when there's no id", async () => {
    const res = await request(app).delete("/api/delete").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("There's some problem deleting this movie.");
  });
});
