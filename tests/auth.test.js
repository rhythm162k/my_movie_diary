import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  TEST_PASSWORD,
  createLoggedInUser,
  deleteUsersByEmail,
  insertGoogleOnlyUser,
} from "./helpers.js";

// Emails in this file are prefixed "auth-" so they never collide with other files.

describe("GET /api/session", () => {
  it("returns 401 when not logged in", async () => {
    const res = await request(app).get("/api/session");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Not authenticated.");
  });
});

describe("protected routes", () => {
  // No title on /search on purpose: proves 401 is checked BEFORE validation (400)
  it.each([
    ["get", "/api/movies"],
    ["get", "/api/movies/search"],
    ["post", "/api/movies"],
    ["patch", "/api/movies/edit?id=1"],
    ["delete", "/api/delete?id=1"],
  ])("%s %s returns 401 when not logged in", async (method, url) => {
    const res = await request(app)[method](url).send({});

    expect(res.status).toBe(401);
  });
});

describe("POST /api/registration", () => {
  const email = "auth-registration@example.test";

  beforeAll(async () => {
    await createLoggedInUser(email); // user now exists
  });

  afterAll(() => deleteUsersByEmail(email));

  it("returns 409 when the email is already registered", async () => {
    const res = await request(app).post("/api/registration").send({
      name: "Another User",
      email,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "A user with this email already exists. So just Login ;)",
    );
  });
});

describe("POST /api/registration validation", () => {
  it.each([
    [{ email: "a@example.test", password: "123456" }, "Name is required."],
    [
      { name: "X", email: "not-an-email", password: "123456" },
      "Please provide a valid email address.",
    ],
    [
      { name: "X", email: "a@example.test", password: "12345" },
      "Password must be at least 6 characters long.",
    ],
  ])("returns 400 for invalid body #%#", async (body, message) => {
    const res = await request(app).post("/api/registration").send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });
});

describe("POST /api/login", () => {
  const email = "auth-login@example.test";

  beforeAll(async () => {
    await createLoggedInUser(email); // user now exists
  });

  afterAll(() => deleteUsersByEmail(email));

  it("returns 200 and creates a session on successful login", async () => {
    const agent = request.agent(app); // fresh agent, not the registration one
    await agent
      .post("/api/login")
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    const res = await agent.get("/api/session");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeDefined();
  });

  it("wrong password returns 401 and creates no session", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/login")
      .send({ email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
    expect((await agent.get("/api/session")).status).toBe(401);
  });

  it("unknown email gets the same response as a wrong password", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "auth-nobody@example.test", password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
  });

  it("logout ends the session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send({ email, password: TEST_PASSWORD });
    await agent.post("/api/logout").expect(200);

    expect((await agent.get("/api/session")).status).toBe(401);
  });
});

describe("POST /api/login for a Google-only account", () => {
  const email = "auth-google-only@example.test";

  beforeAll(() => insertGoogleOnlyUser(email));
  afterAll(() => deleteUsersByEmail(email));

  it("returns 401 instead of crashing", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});
