import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../index.js";
import { testDb } from "./testDb.js";
import {
  createLoggedInUser,
  deleteUsersByEmail,
  insertMovie,
  getMovie,
} from "./helpers.js";

// Emails in this file are prefixed "authz-" so they never collide with other files.
// Rule used here: user A owns the movie, user B is the intruder.

// Gives user A exactly one fresh movie, so every test starts from the same state
async function resetMovieFor(user, overrides = {}) {
  await testDb.query("DELETE FROM movies WHERE userid = $1", [user.userId]);
  return insertMovie(user.userId, overrides);
}

describe("DELETE /api/delete", () => {
  const emailA = "authz-delete-a@example.test";
  const emailB = "authz-delete-b@example.test";
  let userA, userB, movieId;

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
  });

  beforeEach(async () => {
    movieId = await resetMovieFor(userA);
  });

  afterAll(() => deleteUsersByEmail(emailA, emailB));

  it("returns 400 when there's no id", async () => {
    const res = await userA.agent.delete("/api/delete").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("There's some problem deleting this movie.");
  });

  it.each(["abc", "0", "-5", "99999999999"])(
    "returns 400 for invalid id %s",
    async (badId) => {
      const res = await userA.agent.delete(`/api/delete?id=${badId}`);

      expect(res.status).toBe(400);
    },
  );

  it("denies user B and the movie still exists", async () => {
    const res = await userB.agent.delete(`/api/delete?id=${movieId}`);

    expect(res.status).toBe(404);
    expect(await getMovie(movieId)).toBeDefined();
  });

  it("lets the owner delete their own movie", async () => {
    const res = await userA.agent.delete(`/api/delete?id=${movieId}`);

    expect(res.status).toBe(200);
    expect(await getMovie(movieId)).toBeUndefined();
  });
});

describe("PATCH /api/movies/edit", () => {
  const emailA = "authz-patch-a@example.test";
  const emailB = "authz-patch-b@example.test";
  let userA, userB, movieId;

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    userB = await createLoggedInUser(emailB);
  });

  beforeEach(async () => {
    movieId = await resetMovieFor(userA, {
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

  it.each(["abc", "0"])("returns 400 for invalid id %s", async (badId) => {
    const res = await userA.agent
      .patch(`/api/movies/edit?id=${badId}`)
      .send({ description: "x" });

    expect(res.status).toBe(400);
  });

  it("ignores userid in the body (mass assignment)", async () => {
    const res = await userA.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ userid: userB.userId, description: "still mine" });

    expect(res.status).toBe(200);
    const movie = await getMovie(movieId);
    expect(movie.userid).toBe(userA.userId);
    expect(movie.description).toBe("still mine");
  });

  it("returns 400 when only unknown fields are sent", async () => {
    const res = await userA.agent
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ foo: "bar" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/movies isolation", () => {
  const emailA = "authz-list-a@example.test";
  const emailB = "authz-list-b@example.test";
  let userA;

  beforeAll(async () => {
    userA = await createLoggedInUser(emailA);
    const userB = await createLoggedInUser(emailB);
    await insertMovie(userA.userId, { title: "A's movie" });
    await insertMovie(userB.userId, { title: "B's movie" });
  });

  afterAll(() => deleteUsersByEmail(emailA, emailB));

  it("returns only the logged-in user's movies", async () => {
    const res = await userA.agent.get("/api/movies");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("A's movie");
  });
});

describe("DELETE /api/delete extra cases", () => {
  const email = "authz2-delete@example.test";
  let user;

  beforeAll(async () => {
    user = await createLoggedInUser(email);
  });

  beforeEach(async () => {
    await testDb.query("DELETE FROM movies WHERE userid = $1", [user.userId]);
  });

  afterAll(() => deleteUsersByEmail(email));

  // T076
  it("returns 404 for an id that does not exist", async () => {
    const res = await user.agent.delete("/api/delete?id=2147483000");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Movie not found.");
  });

  // T077
  it("deletes only the targeted movie", async () => {
    const keepId = await insertMovie(user.userId, { title: "Keep me" });
    const deleteId = await insertMovie(user.userId, { title: "Delete me" });

    await user.agent.delete(`/api/delete?id=${deleteId}`).expect(200);

    expect(await getMovie(deleteId)).toBeUndefined();
    expect(await getMovie(keepId)).toBeDefined();
  });

  // T078
  it("returns 200 the first time and 404 the second time", async () => {
    const id = await insertMovie(user.userId);

    const first = await user.agent.delete(`/api/delete?id=${id}`);
    const second = await user.agent.delete(`/api/delete?id=${id}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
  });
});

// T079: the 401 table in auth.test.js uses a fake id. Here the movie is real,
// so we can prove a logged-out request really changes nothing.
describe("logged-out PATCH and DELETE on a real movie", () => {
  const email = "authz2-loggedout@example.test";
  let movieId;

  beforeAll(async () => {
    const owner = await createLoggedInUser(email);
    movieId = await insertMovie(owner.userId, {
      description: "Original description",
    });
  });

  afterAll(() => deleteUsersByEmail(email));

  it("PATCH returns 401 and leaves the movie unchanged", async () => {
    const res = await request(app)
      .patch(`/api/movies/edit?id=${movieId}`)
      .send({ description: "hacked" });

    expect(res.status).toBe(401);
    expect((await getMovie(movieId)).description).toBe("Original description");
  });

  it("DELETE returns 401 and the movie still exists", async () => {
    const res = await request(app).delete(`/api/delete?id=${movieId}`);

    expect(res.status).toBe(401);
    expect(await getMovie(movieId)).toBeDefined();
  });
});
