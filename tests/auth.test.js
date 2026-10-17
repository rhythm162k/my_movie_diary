import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  TEST_PASSWORD,
  createLoggedInUser,
  deleteUsersByEmail,
  insertGoogleOnlyUser,
} from "./helpers.js";
import { testDb } from "./testDb.js";
import { name } from "ejs";
import passport from "passport";

// Emails in this file are prefixed "auth-" so they never collide with other files.

describe("GET /api/session", () => {
  it("returns 401 when not logged in", async () => {
    const res = await request(app).get("/api/session");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Not authenticated.");
  });
});

describe("Session Cookie is Defined", () => {
  const email = "set-session-cookie@example.test";
  const creds = {
    email,
    password: TEST_PASSWORD,
  };

  const getSid = (res) =>
    res.headers["set-cookie"]
      ?.find((c) => c.startsWith("connect.sid="))
      ?.split(";")[0];

  beforeAll(async () => {
    await createLoggedInUser(email); // user now exists
    deleteUsersByEmail("non-existing@example.com");
  });

  afterAll(() => deleteUsersByEmail(email));

  it("sets an HttpOnly session cookie on sign-in", async () => {
    const res = await request(app).post("/api/login").send(creds).expect(200);

    const cookies = res.headers["set-cookie"]; // array of strings
    expect(cookies).toBeDefined();
    const sid = cookies.find((c) => c.startsWith("connect.sid="));
    expect(sid).toBeDefined();
    expect(sid).toContain("HttpOnly");
    expect(sid).toContain("SameSite=Lax");
  });

  it("tells the browser to delete the cookie on sign-out", async () => {
    const agent = request.agent(app);
    await agent.post("/api/login").send(creds).expect(200);
    const res = await agent.post("/api/logout").expect(200);
    const cleared = res.headers["set-cookie"].find((c) =>
      c.startsWith("connect.sid=;"),
    );
    expect(cleared).toBeDefined();
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("issues a new session id when you sign in", async () => {
    const agent = request.agent(app);
    const first = await agent
      .post("/api/registration")
      .send({
        name: "newUserTest",
        email: "non-existing@example.com",
        password: "abc1223",
      })
      .expect(201);
    const second = await agent
      .post("/api/login")
      .send({
        email: "non-existing@example.com",
        password: "abc1223",
      })
      .expect(200);

    expect(getSid(first)).toBeDefined();
    expect(getSid(second)).toBeDefined();
    expect(getSid(second)).not.toBe(getSid(first));
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
  const email = "registration@example.test";

  afterAll(() => deleteUsersByEmail(email));

  it("returns 200 with a successful registration, stores the data and create a user session", async () => {
    const agent = await request.agent(app);
    await agent
      .post("/api/registration")
      .send({
        name: "Another User",
        email,
        password: TEST_PASSWORD,
      })
      .expect(201);

    const { rows } = await testDb.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Another User");
    expect(rows[0].email).toBe(email);
    const res = await agent.get("/api/session");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeDefined();
  });
});

describe("POST /api/registration with Existing mail", () => {
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

/* ---------- registration sanitising ---------- */
describe("POST /api/registration sanitising", () => {
  const mixedCaseEmail = "Auth2-MiXed@Example.Test";
  const normalisedEmail = mixedCaseEmail.toLowerCase();
  const trimEmail = "auth2-trim@example.test";

  beforeAll(() => deleteUsersByEmail(normalisedEmail, trimEmail));
  afterAll(() => deleteUsersByEmail(normalisedEmail, trimEmail));

  it("stores the email in lower case", async () => {
    await request(app)
      .post("/api/registration")
      .send({ name: "Mixed", email: mixedCaseEmail, password: TEST_PASSWORD })
      .expect(201);

    const { rows } = await testDb.query(
      "SELECT email FROM users WHERE LOWER(email) = $1",
      [normalisedEmail],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(normalisedEmail);
  });

  it("trims spaces around the name", async () => {
    await request(app)
      .post("/api/registration")
      .send({ name: "  Sami  ", email: trimEmail, password: TEST_PASSWORD })
      .expect(201);

    const { rows } = await testDb.query(
      "SELECT name FROM users WHERE email = $1",
      [trimEmail],
    );
    expect(rows[0].name).toBe("Sami");
  });
});

/* ---------- same email, different case ---------- */
describe("POST /api/registration with an email that differs only by case", () => {
  const email = "auth2-case-dup@example.test";

  beforeAll(() => createLoggedInUser(email));
  afterAll(() => deleteUsersByEmail(email));

  it("returns 409", async () => {
    const res = await request(app).post("/api/registration").send({
      name: "Duplicate",
      email: email.toUpperCase(),
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "A user with this email already exists. So just Login ;)",
    );
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

  it.each([
    {
      name: "malformed email",
      body: { email: "r453!_dfgbnedurf", password: TEST_PASSWORD },
      status: 400,
    },
    { name: "empty password", body: { email, password: "" }, status: 400 },
    {
      name: "wrong password",
      body: { email, password: "dftghydsf" },
      status: 401,
    },
  ])("POST /api/login rejects $name with $status", async ({ body, status }) => {
    const agent = request.agent(app);
    await agent.post("/api/login").send(body).expect(status);
    const res = await agent.get("/api/session");
    expect(res.status).toBe(401);
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

/* ---------- invalid login bodies ---------- */
describe("POST /api/login validation", () => {
  it.each([
    [
      { email: "not-an-email", password: "123456" },
      "Please provide a valid email address.",
    ],
    [{ email: "a@example.test", password: "12345" }, "Invalid password."],
  ])(
    "returns 400 with the route's message for body #%#",
    async (body, message) => {
      const res = await request(app).post("/api/login").send(body);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(message);
    },
  );

  it.each([[{}], [{ email: "a@example.test" }], [{ password: "123456" }]])(
    "returns 400 when fields are missing (body #%#)",
    async (body) => {
      const res = await request(app).post("/api/login").send(body);

      expect(res.status).toBe(400);
      expect(typeof res.body.message).toBe("string");
    },
  );
});

/* ---------- login variants ---------- */
describe("POST /api/login variants", () => {
  const email = "auth2-login@example.test";

  beforeAll(() => createLoggedInUser(email));
  afterAll(() => deleteUsersByEmail(email));

  it("works with an upper-case email", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/login")
      .send({ email: email.toUpperCase(), password: TEST_PASSWORD })
      .expect(200);

    expect((await agent.get("/api/session")).status).toBe(200);
  });

  it("works with a form-encoded body", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/login")
      .type("form")
      .send({ email, password: TEST_PASSWORD })
      .expect(200);

    expect((await agent.get("/api/session")).status).toBe(200);
  });
});

/* ---------- two users, two agents ---------- */
describe("GET /api/session with two users", () => {
  const emailA = "auth2-session-a@example.test";
  const emailB = "auth2-session-b@example.test";
  let userA, userB;

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
  });

  afterAll(() => deleteUsersByEmail(emailA, emailB));

  it("each agent sees its own userId", async () => {
    const resA = await userA.agent.get("/api/session");
    const resB = await userB.agent.get("/api/session");

    expect(resA.body.userId).toBe(userA.userId);
    expect(resB.body.userId).toBe(userB.userId);
    expect(resA.body.userId).not.toBe(resB.body.userId);
  });
});

/* ---------- logout edge cases ---------- */
describe("POST /api/logout edge cases", () => {
  const email = "auth2-logout@example.test";
  let user;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  afterAll(() => deleteUsersByEmail(email));

  it("returns 200 even when nobody is logged in", async () => {
    const res = await request(app).post("/api/logout");

    expect(res.status).toBe(200);
  });

  describe("after logging out", () => {
    beforeAll(async () => {
      await user.agent.post("/api/logout").expect(200);
    });

    it.each([
      ["get", "/api/movies"],
      ["post", "/api/movies"],
      ["delete", "/api/delete?id=1"],
    ])("%s %s returns 401", async (method, url) => {
      const res = await user.agent[method](url).send({});

      expect(res.status).toBe(401);
    });
  });
});
