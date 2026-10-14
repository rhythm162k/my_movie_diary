import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import request from "supertest";
import app from "../index.js";
import { testDb, connectTestDb, closeTestDb } from "./testDb.js";

const testEmail = "test@example.test";
const testPassword = "some-test-password";

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe("GET /api/session", () => {
  it("returns 401 when finds no user", async () => {
    const response = await request(app).get("/api/session");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Not authenticated.");
  });
});

describe("POST /api/registration", () => {
  beforeEach(async () => {
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
    expect(res.body.message).toBe("There's some problem deleting this movie.");
  });
});

describe("POST /api/movies", () => {
  let agent;
  let userId;

  beforeAll(async () => {
    await testDb.query(
      "DELETE FROM movies WHERE userid IN (SELECT userid FROM users WHERE email = $1)",
      [testEmail],
    );
    await testDb.query("DELETE FROM users WHERE email = $1", [testEmail]);

    agent = request.agent(app);
    await agent
      .post("/api/registration")
      .send({ name: "Movie Tester", email: testEmail, password: testPassword })
      .expect(201);

    const { rows } = await testDb.query(
      "SELECT userid FROM users WHERE email = $1",
      [testEmail],
    );
    userId = rows[0].userid;
  }, 20000);

  beforeEach(async () => {
    await testDb.query("DELETE FROM movies WHERE userid = $1", [userId]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        Response: "True",
        Poster: "https://example.test/inception.jpg",
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await testDb.query("DELETE FROM movies WHERE userid = $1", [userId]);
    await testDb.query("DELETE FROM users WHERE userid = $1", [userId]);
  });
  const payload = {
    title: "Inception",
    description: "A dream within a dream.",
    rating: 9,
  };

  it("creates a movie and stores the submitted values", async () => {
    const res = await agent.post("/api/movies").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Movie added successfully.");

    const { rows } = await testDb.query(
      "SELECT * FROM movies WHERE userid = $1",
      [userId],
    );
    expect(rows).toHaveLength(1);

    expect(rows[0].title).toBe(payload.title);
    expect(rows[0].description).toBe(payload.description);
    expect(Number(rows[0].rating)).toBe(payload.rating);
    expect(rows[0].imgsrc).toBe("https://example.test/inception.jpg");
  });

  it("returns 401 and inserts nothing when not logged in", async () => {
    const res = await request(app).post("/api/movies").send(payload); // no agent = no cookie

    expect(res.status).toBe(401);
    const { rows } = await testDb.query(
      "SELECT * FROM movies WHERE userid = $1",
      [userId],
    );
    expect(rows).toHaveLength(0);
  });

  it.each([
    [{ description: "x", rating: 5 }, "Title is required."],
    [{ title: "X", rating: 5 }, "Description is required."],
    [
      { title: "X", description: "x", rating: 11 },
      "Rating is required with a number between 0 and 10.",
    ],
  ])("returns 400 for invalid body #%#", async (body, message) => {
    const res = await agent.post("/api/movies").send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("uses the fallback poster when OMDb finds nothing", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ Response: "False" }),
    });

    const res = await agent.post("/api/movies").send(payload);
    expect(res.status).toBe(201);

    const { rows } = await testDb.query(
      "SELECT imgsrc FROM movies WHERE userid = $1",
      [userId],
    );
    expect(rows[0].imgsrc).toMatch(/displate\.com/); // your fallbackPoster URL
  });

  it("still saves the movie when the OMDb request throws", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network down"));

    const res = await agent.post("/api/movies").send(payload);
    expect(res.status).toBe(201); // your try/catch around fetch makes this work
  });

  it("returns 409 when the same movie is added twice", async () => {
    await agent.post("/api/movies").send(payload).expect(201);
    const res = await agent.post("/api/movies").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("You already added this movie.");
  });
});
