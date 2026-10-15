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
import {
  createLoggedInUser,
  deleteUsersByEmail,
  insertMovie,
  getMovie,
} from "./helpers.js";

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

// One table-driven test replaces the separate "not logged in" tests
describe("protected routes", () => {
  it.each([
    ["get", "/api/movies"],
    ["get", "/api/movies/search?title=x"],
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
  beforeAll(async () => {
    await createLoggedInUser(email); // user now exists
  });

  afterAll(() => deleteUsersByEmail(email));

  it("returns 409 when the email is already registered", async () => {
    const response = await request(app).post("/api/registration").send({
      name: "Another User",
      email,
      password: "some-test-password",
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "A user with this email already exists. So just Login ;)",
    );
  });
});

describe("DELETE /api/delete", () => {
  const email = "delete@example.test";
  let user;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  afterAll(() => deleteUsersByEmail(email));

  it("returns 400 when there's no id", async () => {
    const res = await user.agent.delete("/api/delete").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("There's some problem deleting this movie.");
  });
});

describe("POST /api/movies", () => {
  const email = "post-movies@example.test";
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

    const res = await user.agent.post("/api/movies").send(payload);
    expect(res.status).toBe(201);
  });

  it("returns 409 when the same movie is added twice", async () => {
    await user.agent.post("/api/movies").send(payload).expect(201);
    const res = await user.agent.post("/api/movies").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("You already added this movie.");
  });
});

describe("PATCH /api/movies/edit authorization", () => {
  const emailA = "patch-a@example.test";
  const emailB = "patch-b@example.test";
  let userA, userB, movieId;

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
    movieId = await insertMovie(userA.userId, {
      title: "Original Title",
      description: "Original description",
    });
  });

  afterAll(() => deleteUsersByEmail(emailA, emailB));

  it("denies user B and leaves A's movie unchanged", async () => {
    const res = await userB.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ description: "hacked by B" });

    expect(res.status).toBe(404);
    expect((await getMovie(movieId)).description).toBe("Original description");
  });

  it("lets the owner edit their own movie", async () => {
    const res = await userA.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ description: "Updated by A" });

    expect(res.status).toBe(200);
    expect((await getMovie(movieId)).description).toBe("Updated by A");
  });
});

describe("POST /api/login", () => {
  let userid;
  const email = "testlogin@example.test";
  beforeAll(async () => {
    const user = await createLoggedInUser(email); // user now exists
    userid = user.userId;
  });

  afterAll(() => deleteUsersByEmail(email));

  const agent = request.agent(app);

  it("Returns 200 for a successfull Login", async () => {
    await agent
      .post("/api/login")
      .send({ email, password: "some-test-password" })
      .expect(200);
  });

  it("Returns 200 for GET /api/session after a successful login", async () => {
    const res = await agent.get("/api/session");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userid);
  });
});
