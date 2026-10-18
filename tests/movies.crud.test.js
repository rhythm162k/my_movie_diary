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
import {
  createLoggedInUser,
  deleteUsersByEmail,
  insertMovie,
  getMovie,
} from "./helpers.js";

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

const FALLBACK = /displate\.com/; // part of your fallbackPoster URL
const DEFAULT_POSTER = "https://example.test/default.jpg";

function mockOmdb() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ Response: "True", Poster: DEFAULT_POSTER }),
  });
}

async function deleteMoviesOf(...users) {
  for (const user of users) {
    await testDb.query("DELETE FROM movies WHERE userid = $1", [user.userId]);
  }
}

/* =====================  POST /api/movies  ===================== */
describe("POST /api/movies extra cases", () => {
  const emailA = "crud2-post-a@example.test";
  const emailB = "crud2-post-b@example.test";
  let userA, userB;

  const payload = {
    title: "Interstellar",
    description: "Space and time.",
    rating: 9,
  };

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
  });

  beforeEach(async () => {
    await deleteMoviesOf(userA, userB);
    mockOmdb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => deleteUsersByEmail(emailA, emailB));

  // T041
  it.each([
    [{ title: "   ", description: "x", rating: 5 }, "Title is required."],
    [{ title: "X", description: "   ", rating: 5 }, "Description is required."],
  ])("returns 400 for whitespace-only field #%#", async (body, message) => {
    const res = await userA.agent.post("/api/movies").send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  // T042 (accepted boundaries)
  it.each([[0], [10]])("accepts rating %i and stores it", async (rating) => {
    const res = await userA.agent
      .post("/api/movies")
      .send({ title: `Boundary ${rating}`, description: "x", rating });

    expect(res.status).toBe(201);
    const { rows } = await testDb.query(
      "SELECT rating FROM movies WHERE userid = $1",
      [userA.userId],
    );
    expect(Number(rows[0].rating)).toBe(rating);
  });

  // T042 (rejected values)
  it.each([
    [{ rating: -1 }],
    [{ rating: 10.5 }],
    [{ rating: "abc" }],
    [{ rating: "" }],
    [{}], // rating missing entirely
  ])("rejects bad rating %j", async (ratingPart) => {
    const res = await userA.agent
      .post("/api/movies")
      .send({ title: "Bad Rating", description: "x", ...ratingPart });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Rating is required with a number between 0 and 10.",
    );
  });

  // T043 + T044
  it.each([
    ["OMDb responds with ok: false", { ok: false }],
    [
      "OMDb returns Poster 'N/A'",
      {
        ok: true,
        json: async () => ({ Response: "True", Poster: "N/A" }),
      },
    ],
  ])("uses the fallback poster when %s", async (_label, omdbResponse) => {
    globalThis.fetch.mockResolvedValue(omdbResponse);

    const res = await userA.agent.post("/api/movies").send(payload);
    expect(res.status).toBe(201);

    const { rows } = await testDb.query(
      "SELECT imgsrc FROM movies WHERE userid = $1",
      [userA.userId],
    );
    expect(rows[0].imgsrc).toMatch(FALLBACK);
  });

  // T046
  it("ignores a userid sent in the body; the session user owns the movie", async () => {
    const res = await userA.agent
      .post("/api/movies")
      .send({ ...payload, userid: userB.userId });

    expect(res.status).toBe(201);

    const { rows } = await testDb.query(
      "SELECT userid FROM movies WHERE title = $1 AND userid IN ($2, $3)",
      [payload.title, userA.userId, userB.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userid).toBe(userA.userId);
  });

  // T047 (depends on your unique constraint: per user, or global?)
  it("lets two different users add the same title", async () => {
    const resA = await userA.agent.post("/api/movies").send(payload);
    const resB = await userB.agent.post("/api/movies").send(payload);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });
});

/* =====================  GET /api/movies and search  ===================== */
describe("GET /api/movies and /api/movies/search", () => {
  const emailA = "crud2-list-a@example.test";
  const emailB = "crud2-list-b@example.test";
  let userA, userB;

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
  });

  beforeEach(async () => {
    await deleteMoviesOf(userA, userB);
  });

  afterAll(() => deleteUsersByEmail(emailA, emailB));

  // T048
  it("returns an empty list for a user with no movies", async () => {
    const res = await userA.agent.get("/api/movies");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // T049
  it("returns the newest movie first", async () => {
    await insertMovie(userA.userId, { title: "First added" });
    await insertMovie(userA.userId, { title: "Second added" });

    const res = await userA.agent.get("/api/movies");

    expect(res.body.map((m) => m.title)).toEqual([
      "Second added",
      "First added",
    ]);
  });

  // T050
  it.each(["incep", "INCEP", "ception"])(
    "search for '%s' finds 'Inception' (partial, case-insensitive)",
    async (term) => {
      await insertMovie(userA.userId, { title: "Inception" });

      const res = await userA.agent
        .get("/api/movies/search")
        .query({ title: term });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe("Inception");
    },
  );

  // T051
  it("search returns only the current user's movies", async () => {
    await insertMovie(userA.userId, { title: "Dune" });
    await insertMovie(userB.userId, { title: "Dune: Part Two" });

    const res = await userA.agent
      .get("/api/movies/search")
      .query({ title: "dune" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userid).toBe(userA.userId);
  });

  // T052
  it("search with no matches returns an empty list", async () => {
    await insertMovie(userA.userId, { title: "Inception" });

    const res = await userA.agent
      .get("/api/movies/search")
      .query({ title: "zzz-no-match" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // T053
  it.each([[undefined], ["   "]])(
    "search with title %j returns 400",
    async (title) => {
      const res = await userA.agent
        .get("/api/movies/search")
        .query(title === undefined ? {} : { title });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Title is required");
    },
  );

  it.each([
    [`'; DROP TABLE products; --`], // tries to destroy the table
    [`' OR '1'='1`], // tries to make the filter always true
  ])("treats the payload %s as plain text", async (payload) => {
    await insertMovie(userA.userId, { title: "Harry Potter" });
    const res = await userA.agent
      .get("/api/movies/search")
      .query({ title: payload });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    const { rows } = await testDb.query(
      "SELECT title FROM movies WHERE userid = $1",
      [userA.userId],
    );
    expect(rows).toHaveLength(1);
  });
});

/* =====================  PATCH /api/movies/edit  ===================== */
describe("PATCH /api/movies/edit behaviour", () => {
  const email = "crud2-patch@example.test";
  let user, movieId;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  beforeEach(async () => {
    await deleteMoviesOf(user);
    movieId = await insertMovie(user.userId, {
      title: "Original Title",
      description: "Original description",
      rating: 7,
    });
    mockOmdb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => deleteUsersByEmail(email));

  const patch = (body, id = movieId) =>
    user.agent.patch(`/api/movies/edit?id=${id}`).send(body);

  // T056
  it("changing the title fetches a new poster and saves it", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        Response: "True",
        Poster: "https://example.test/new-poster.jpg",
      }),
    });

    const res = await patch({ title: "New Title" });

    expect(res.status).toBe(200);
    const movie = await getMovie(movieId);
    expect(movie.title).toBe("New Title");
    expect(movie.imgsrc).toBe("https://example.test/new-poster.jpg");
  });

  // T057
  it("still updates the title when the OMDb request throws", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await patch({ title: "Renamed Anyway" });

    expect(res.status).toBe(200);
    const movie = await getMovie(movieId);
    expect(movie.title).toBe("Renamed Anyway");
    expect(movie.imgsrc).toBe("https://example.test/x.jpg"); // insertMovie's default
  });

  // T058 (rejected)
  it.each([
    ["", "Rating must be a valid number."],
    [null, "Rating must be a valid number."],
    ["abc", "Rating must be a valid number."],
    [-1, "Rating must be between 0 and 10."],
    [11, "Rating must be between 0 and 10."],
  ])("rejects rating %j", async (rating, message) => {
    const res = await patch({ rating });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  // T058 (accepted)
  it.each([[0], [10]])("accepts rating %i", async (rating) => {
    const res = await patch({ rating });

    expect(res.status).toBe(200);
    expect(Number((await getMovie(movieId)).rating)).toBe(rating);
  });

  // T059
  it.each([
    [{ title: "" }, "Title cannot be empty."],
    [{ title: "   " }, "Title cannot be empty."],
    [{ description: "" }, "Description cannot be empty."],
    [{ description: "   " }, "Description cannot be empty."],
  ])("rejects empty field #%#", async (body, message) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  // T060
  it("returns 400 for an empty body", async () => {
    const res = await patch({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No fields provided for update");
  });

  // T061
  it("returns 400 when the id is missing", async () => {
    const res = await user.agent
      .patch("/api/movies/edit")
      .send({ description: "x" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid movie id.");
  });

  // T062
  it("returns 404 for an id that does not exist", async () => {
    const res = await patch({ description: "x" }, 2147483000);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Movie not found.");
  });

  // T063
  it("updates several fields in one request", async () => {
    const res = await patch({ description: "Both changed", rating: 3 });

    expect(res.status).toBe(200);
    const movie = await getMovie(movieId);
    expect(movie.description).toBe("Both changed");
    expect(Number(movie.rating)).toBe(3);
  });

  // T064
  it("changes only the fields that were sent", async () => {
    const res = await patch({ description: "Only this changes" });

    expect(res.status).toBe(200);
    const movie = await getMovie(movieId);
    expect(movie.description).toBe("Only this changes");
    expect(movie.title).toBe("Original Title");
    expect(Number(movie.rating)).toBe(7);
  });

  // T065 (relies on the same unique constraint that makes POST return 409)
  it("returns 409 when renaming to a title you already have", async () => {
    const secondId = await insertMovie(user.userId, { title: "Second Movie" });

    const res = await patch({ title: "Original Title" }, secondId);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("A conflict occurred.");
  });
});
