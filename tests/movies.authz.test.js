import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
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
