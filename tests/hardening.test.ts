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
  TEST_PASSWORD,
  createLoggedInUser,
  deleteUsersByEmail,
  insertMovie,
  getMovie,
  type TestUser,
} from "./helpers.js";

/*
 * Hostile and odd input
 *
 * PART A: things the app already handles. These should pass today.
 * PART B: PROBES. Each one describes behaviour the app SHOULD have but, from reading
 *         index.ts, does not have yet (usually a 500 where a 400 belongs). They are
 *         written with it.fails: the test passes while the bug exists, and turns red
 *         the day you fix it, which is your signal to delete the ".fails".
 *         If one of them is red right now, my reading of the code was wrong: tell me.
 *
 * Emails in this file are prefixed "hard-" so they never collide with other files.
 */

const email = "hard-user@example.test";
let user: TestUser;

beforeAll(async () => {
  user = await createLoggedInUser(email);
});

beforeEach(async () => {
  await testDb.query("DELETE FROM movies WHERE userid = $1", [user.userId]);
  // POST and PATCH-with-title call OMDb: keep the network out of every test
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ Response: "False" }),
  } as unknown as Response);
  vi.spyOn(console, "error").mockImplementation(() => {}); // probes trigger logged 500s
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => deleteUsersByEmail(email, "hard-numeric-password@example.test"));

/* ======================== PART A: already handled ======================== */

describe("hostile input that is already handled", () => {
  // T170
  it("answers 413 'Invalid request.' for a request body over 100 kB", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ email: "a@example.test", password: "x".repeat(150 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.message).toBe("Invalid request.");
  });

  // T171
  it("a __proto__ key in the PATCH body is ignored and pollutes nothing", async () => {
    const movieId = await insertMovie(user.userId);

    const res = await user.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .set("Content-Type", "application/json")
      .send('{"description":"proto test","__proto__":{"userid":999999}}');

    expect(res.status).toBe(200);
    const movie = await getMovie(movieId);
    expect(movie.description).toBe("proto test");
    expect(movie.userid).toBe(user.userId);
    expect(({} as any).userid).toBeUndefined();
  });

  // T172
  it("an SQL fragment used as a PATCH field name is ignored (allow-list)", async () => {
    const movieId = await insertMovie(user.userId, { title: "Untouched" });

    const res = await user.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ description: "ok", "title = 'pwned' WHERE 1=1; --": 1 });

    expect(res.status).toBe(200);
    expect((await getMovie(movieId)).title).toBe("Untouched");
  });

  // T173
  it("SQL metacharacters in title and description are stored as plain text", async () => {
    const title = "Robert'); DROP TABLE movies;--";
    const description = "' OR 1=1 --";

    await user.agent.post("/api/movies").send({ title, description, rating: 5 }).expect(201);

    const { rows } = await testDb.query(
      "SELECT title, description FROM movies WHERE userid = $1",
      [user.userId],
    );
    expect(rows).toEqual([{ title, description }]);
  });
});

/* ============================ PART B: probes ============================ */

describe("PROBE: rating of the wrong type must be a 400, not a 500", () => {
  // Number(true) = 1, Number(" ") = 0 and Number([5]) = 5 all pass the range check in
  // index.ts, then Postgres rejects the real value ('true', ' ', '{"5"}') as a number.
  const badRatings: unknown[] = [true, " ", [5]];

  // T180
  for (const rating of badRatings) {
    it.fails(`POST /api/movies rejects rating ${JSON.stringify(rating)} with 400`, async () => {
      const res = await user.agent
        .post("/api/movies")
        .send({ title: "Bad Rating Type", description: "d", rating });

      expect(res.status).toBe(400);
    });
  }

  // T181
  for (const rating of badRatings) {
    it.fails(`PATCH /api/movies/edit rejects rating ${JSON.stringify(rating)} with 400`, async () => {
      const movieId = await insertMovie(user.userId);

      const res = await user.agent
        .patch(`/api/movies/edit?id=${movieId}`)
        .send({ rating });

      expect(res.status).toBe(400);
    });
  }
});

describe("PROBE: passwords that are not strings", () => {
  // express-validator turns any value into text before checking it, but bcrypt only
  // accepts real strings, so the check passes and bcrypt then throws.

  // T182
  it.fails("login with an object as password gives 401 (not 500) for an existing account", async () => {
    // Also matters for privacy: an unknown email gives 401 but a known one gives 500,
    // so the difference tells an attacker which emails have an account.
    const res = await request(app)
      .post("/api/login")
      .send({ email, password: { not: "a string" } });

    expect(res.status).toBe(401);
  });

  // T183
  it.fails("registration with a number as password never answers 500", async () => {
    const res = await request(app).post("/api/registration").send({
      name: "Numeric",
      email: "hard-numeric-password@example.test",
      password: 123456,
    });

    expect(res.status).toBeLessThan(500);
  });
});

describe("PROBE: the same query parameter sent twice (?id=1&id=2)", () => {
  // Express turns the repeated key into an array. The validator accepts it (every item
  // is a valid integer), then Postgres is handed an array where it expects one number.

  // T184
  it.fails("DELETE /api/delete?id=1&id=2 answers 400", async () => {
    const res = await user.agent.delete("/api/delete?id=1&id=2");

    expect(res.status).toBe(400);
  });

  // T185
  it.fails("PATCH /api/movies/edit?id=1&id=2 answers 400", async () => {
    const res = await user.agent
      .patch("/api/movies/edit?id=1&id=2")
      .send({ description: "x" });

    expect(res.status).toBe(400);
  });

  // T186
  it.fails("GET /api/movies/search?title=a&title=b answers 400", async () => {
    const res = await user.agent.get("/api/movies/search?title=a&title=b");

    expect(res.status).toBe(400);
  });
});

describe("PROBE: PATCH should trim text like POST does", () => {
  // POST trims title and description. PATCH only checks they are not blank and then
  // stores them untrimmed, so "Inception" and "Inception " can both exist for one user,
  // which gets around the one-title-per-user rule.

  // T187
  it.fails("stores a padded title trimmed", async () => {
    const movieId = await insertMovie(user.userId);

    await user.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ title: "  Padded Title  " })
      .expect(200);

    expect((await getMovie(movieId)).title).toBe("Padded Title");
  });

  // T188
  it.fails("stores a padded description trimmed", async () => {
    const movieId = await insertMovie(user.userId);

    await user.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ description: "  Padded description  " })
      .expect(200);

    expect((await getMovie(movieId)).description).toBe("Padded description");
  });
});
