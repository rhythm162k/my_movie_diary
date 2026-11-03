console.log("SETUP LOADED");
import { beforeAll, afterAll } from "vitest";
import { connectTestDb, closeTestDb } from "./testDb.js";
import { db } from "../index.js";

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await closeTestDb();
  await db.end(); // the session store shares this pool, so it closes too
});
