import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import app from "../index.js";
import { testDb, connectTestDb, closeTestDb } from "./testDb.js";

const testEmail = "duplicate-registration@example.test";

describe("Backend API tests", () => {
  it("returns 401 when GET /api/session finds no user", async () => {
    const response = await request(app).get("/api/session");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Not authenticated.");
  });

  describe("POST /api/registration", () => {
    beforeEach(async () => {
      await connectTestDb();

      // Remove any leftover record from an earlier run.
      await testDb.query("DELETE FROM users WHERE email = $1", [testEmail]);

      // Prepare the existing user needed for this test.
      await testDb.query(
        `INSERT INTO users (name, email, password, googleid)
         VALUES ($1, $2, $3, $4)`,
        ["Test User", testEmail, "unused-test-password", null],
      );
    });

    afterEach(async () => {
      // Keep the test database clean.
      await testDb.query("DELETE FROM users WHERE email = $1", [testEmail]);
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

  afterAll(async () => {
    await closeTestDb();
  });
});
