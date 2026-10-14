import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.test" });

if (!process.env.PG_DATABASE?.includes("test")) {
  throw new Error(`Refusing to run tests against "${process.env.PG_DATABASE}"`);
}

const testDb = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

let connected = false;

export async function connectTestDb() {
  if (!connected) {
    await testDb.connect();
    connected = true;
  }

  return testDb;
}

export async function closeTestDb() {
  if (connected) {
    await testDb.end();
    connected = false;
  }
}

export { testDb };
