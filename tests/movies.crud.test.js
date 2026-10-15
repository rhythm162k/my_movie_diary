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
import { testDb } from "./testDb.js";
import { createLoggedInUser, deleteUsersByEmail } from "./helpers.js";

// Emails in this file are prefixed "crud-" so they never collide with other files.
// Future tests for GET /api/movies, /api/movies/search and PATCH title/rating
// validation belong in this file.

describe("POST /api/movies", () => {
  const email = "crud-post@example.test";
  let user;

  const payload = {
    title: "Inception",
    description: "A dream within a dream.",
    rating: 9,
  };

  beforeAll(async () => {
    user = await createLoggedInUser(email, "Movie Tester");
  });

  beforeEach(async () => {
    await testDb.query("DELETE FROM movies WHERE userid = $1", [user.userId]);

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

  afterAll(() => deleteUsersByEmail(email));

  it("creates a movie and stores the submitted values", async () => {
    const res = await user.agent.post("/api/movies").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Movie added successfully.");

    const { rows } = await testDb.query(
      "SELECT * FROM movies WHERE userid = $1",
      [user.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe(payload.title);
    expect(rows[0].description).toBe(payload.description);
    expect(Number(rows[0].rating)).toBe(payload.rating);
    expect(rows[0].imgsrc).toBe("https://example.test/inception.jpg");
  });

  it("inserts nothing when not logged in", async () => {
    await request(app).post("/api/movies").send(payload);

    const { rows } = await testDb.query(
      "SELECT * FROM movies WHERE userid = $1",
      [user.userId],
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
    const res = await user.agent.post("/api/movies").send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("uses the fallback poster when OMDb finds nothing", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ Response: "False" }),
    });

    const res = await user.agent.post("/api/movies").send(payload);
    expect(res.status).toBe(201);

    const { rows } = await testDb.query(
      "SELECT imgsrc FROM movies WHERE userid = $1",
      [user.userId],
    );
    expect(rows[0].imgsrc).toMatch(/displate\.com/);
  });

  it("still saves the movie when the OMDb request throws", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network down"));
    // Keep the test output clean; also proves the error was logged, not swallowed
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await user.agent.post("/api/movies").send(payload);

    expect(res.status).toBe(201);
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 409 when the same movie is added twice", async () => {
    await user.agent.post("/api/movies").send(payload).expect(201);
    const res = await user.agent.post("/api/movies").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("You already added this movie.");
  });
});
