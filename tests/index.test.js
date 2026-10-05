import { describe, it, expect } from "vitest";
import app from "../index";
import request from "supertest";
import pg from "pg";

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

describe("Backend Test", () => {
  it("returns 401 when GET /api/session finds no user hence not authenticated", async () => {
    const response = await request(app).get("/api/session");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Not authenticated.");
  });
});
