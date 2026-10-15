import request from "supertest";
import app from "../index.js";
import { testDb } from "./testDb.js";

export const TEST_PASSWORD = "some-test-password";

// Removes users AND their movies (movies first, so foreign keys don't complain)
export async function deleteUsersByEmail(...emails) {
  await testDb.query(
    `DELETE FROM movies
     WHERE userid IN (SELECT userid FROM users WHERE email = ANY($1))`,
    [emails],
  );
  await testDb.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
}

// Registers a fresh user and returns a logged-in agent plus their id
export async function createLoggedInUser(email, name = "Tester") {
  await deleteUsersByEmail(email); // clear leftovers from a crashed run

  const agent = request.agent(app);
  await agent
    .post("/api/registration")
    .send({ name, email, password: TEST_PASSWORD })
    .expect(201);

  const { rows } = await testDb.query(
    "SELECT userid FROM users WHERE email = $1",
    [email],
  );
  return { agent, userId: rows[0].userid, email };
}

// Inserts a movie straight into the DB (skips the API and OMDb)
export async function insertMovie(userId, overrides = {}) {
  const movie = {
    title: "Test Movie",
    rating: 7,
    description: "Test description",
    imgsrc: "https://example.test/x.jpg",
    ...overrides,
  };

  const { rows } = await testDb.query(
    `INSERT INTO movies (title, rating, description, imgsrc, userid)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [movie.title, movie.rating, movie.description, movie.imgsrc, userId],
  );
  return rows[0].id;
}

export async function getMovie(id) {
  const { rows } = await testDb.query("SELECT * FROM movies WHERE id = $1", [
    id,
  ]);
  return rows[0]; // undefined if it doesn't exist
}
