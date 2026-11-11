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
import type { Mock } from "vitest";
import { testDb } from "./testDb.js";
import {
  createLoggedInUser,
  deleteUsersByEmail,
  insertMovie,
  getMovie,
  type TestUser,
} from "./helpers.js";

/*
 * Poster lookup (fetchPoster) and the PATCH allow-list
 *
 * The existing tests MOCK fetch to control the poster, but never look at what the app
 * sends to OMDb. These tests check the request itself and the cases where OMDb must
 * not be called at all (it has a daily quota on the free key).
 *
 * Emails in this file are prefixed "poster-" so they never collide with other files.
 */

const email = "poster-user@example.test";
const FALLBACK = /displate\.com/;
const OMDB_POSTER = "https://example.test/from-omdb.jpg";
let user: TestUser;

function mockOmdb(response: object = { Response: "True", Poster: OMDB_POSTER }) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => response,
  } as unknown as Response);
}

// The URL of the most recent request the app made to OMDb
function lastOmdbUrl(): URL {
  const calls = (globalThis.fetch as unknown as Mock).mock.calls;
  return new URL(String(calls[calls.length - 1][0]));
}

beforeAll(async () => {
  user = await createLoggedInUser(email);
});

beforeEach(async () => {
  await testDb.query("DELETE FROM movies WHERE userid = $1", [user.userId]);
  mockOmdb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => deleteUsersByEmail(email));

describe("the request sent to OMDb", () => {
  // T150
  it("goes to omdbapi.com with the title and the API key", async () => {
    const title = "Spider-Man: Into the Spider-Verse";

    await user.agent
      .post("/api/movies")
      .send({ title, description: "d", rating: 9 })
      .expect(201);

    const url = lastOmdbUrl();
    expect(url.origin).toBe("https://www.omdbapi.com");
    expect(url.searchParams.get("t")).toBe(title);
    expect(url.searchParams.get("apikey")).toBe(String(process.env.OMDB_API_KEY));
  });

  // T151
  it("cannot be tricked into extra parameters by a hostile title", async () => {
    const title = "Tom & Jerry?apikey=evil&plot=full#fragment";

    await user.agent
      .post("/api/movies")
      .send({ title, description: "d", rating: 5 })
      .expect(201);

    const url = lastOmdbUrl();
    expect(url.searchParams.get("t")).toBe(title); // the whole title is one value
    expect([...url.searchParams.keys()].sort()).toEqual(["apikey", "t"]);
    expect(url.searchParams.getAll("apikey")).toEqual([
      String(process.env.OMDB_API_KEY),
    ]);
  });
});

describe("POST /api/movies with a bad OMDb answer", () => {
  const payload = { title: "Arrival", description: "Language.", rating: 8 };

  const savedPoster = async () =>
    (
      await testDb.query("SELECT imgsrc FROM movies WHERE userid = $1", [
        user.userId,
      ])
    ).rows[0].imgsrc;

  // T152
  it("saves the movie with the fallback poster when OMDb returns invalid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await user.agent.post("/api/movies").send(payload);

    expect(res.status).toBe(201);
    expect(await savedPoster()).toMatch(FALLBACK);
  });

  // T153
  it("saves the movie with the fallback poster when OMDb has no Poster field", async () => {
    mockOmdb({ Response: "True" });

    const res = await user.agent.post("/api/movies").send(payload);

    expect(res.status).toBe(201);
    expect(await savedPoster()).toMatch(FALLBACK);
  });
});

describe("PATCH /api/movies/edit and OMDb", () => {
  let movieId: number;
  const patch = (body: object) =>
    user.agent.patch(`/api/movies/edit?id=${movieId}`).send(body);

  beforeEach(async () => {
    movieId = await insertMovie(user.userId, {
      title: "Original Title",
      description: "Original description",
      imgsrc: "https://example.test/original.jpg",
    });
  });

  // T154
  it.each([
    ["description", { description: "New description" }],
    ["rating", { rating: 4 }],
  ])("does not call OMDb when only the %s changes", async (_field, body) => {
    const res = await patch(body);

    expect(res.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect((await getMovie(movieId)).imgsrc).toBe(
      "https://example.test/original.jpg",
    );
  });

  // T155 (documents current behaviour: a rename to a title OMDb does not know replaces the poster)
  it("replaces the poster with the fallback when the new title is unknown to OMDb", async () => {
    mockOmdb({ Response: "False" });

    const res = await patch({ title: "A Title OMDb Has Never Heard Of" });

    expect(res.status).toBe(200);
    expect((await getMovie(movieId)).imgsrc).toMatch(FALLBACK);
  });

  // T156
  it("ignores an imgsrc sent by the client when nothing else is editable", async () => {
    const res = await patch({ imgsrc: "https://evil.test/x.jpg" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No fields provided for update");
    expect((await getMovie(movieId)).imgsrc).toBe(
      "https://example.test/original.jpg",
    );
  });

  // T157
  it("takes the poster from OMDb, never from the client, when the title changes", async () => {
    const res = await patch({
      title: "Brand New Title",
      imgsrc: "https://evil.test/x.jpg",
    });

    expect(res.status).toBe(200);
    expect((await getMovie(movieId)).imgsrc).toBe(OMDB_POSTER);
  });

  // T158
  it("cannot change the movie's id through the body", async () => {
    const res = await patch({ id: 987654, description: "Still the same movie" });

    expect(res.status).toBe(200);
    expect((await getMovie(movieId)).description).toBe("Still the same movie");
    expect(await getMovie(987654)).toBeUndefined();
  });
});
