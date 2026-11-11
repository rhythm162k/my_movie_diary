import net from "node:net";
import { vi } from "vitest";

/**
 * Loads a brand-new copy of index.ts (new Express app, new pg Pool, new
 * rate-limit counters) with different environment variables.
 *
 * Why this exists: index.ts reads NODE_ENV once, when it is imported. The normal
 * test app is always "test" mode, which switches OFF the Google strategy, the
 * login rate limiter, the Secure cookie flags and app.listen(). To test those
 * parts we have to import the file again while pretending to be production.
 *
 * It still talks to the TEST database only (PG_* come from .env.test).
 * Always call `cleanup()` in afterAll, it closes the extra pool.
 */
export async function loadFreshApp(env: Record<string, string> = {}) {
  if (!process.env.PG_DATABASE?.includes("test")) {
    throw new Error(
      `Refusing to load a fresh app against "${process.env.PG_DATABASE}"`,
    );
  }

  vi.resetModules();

  const settings: Record<string, string> = {
    NODE_ENV: "production",
    SESSION_SECRET: process.env.SESSION_SECRET ?? "fresh-app-session-secret",
    FRONTEND_URL: "https://movies.example.test",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    GOOGLE_CALLBACK_URL: "https://api.example.test/auth/google/callback",
    PORT: "4567",
    ...env,
  };
  for (const [key, value] of Object.entries(settings)) {
    vi.stubEnv(key, value);
  }

  // Outside "test" mode index.ts calls app.listen() while it is being imported, and
  // Express's listen() ends up in net.Server.prototype.listen. Intercept that one (it is
  // Node's own, so it cannot be a different copy) so no real port is opened. The spy is
  // removed right after the import because supertest needs the real listen().
  const listenSpy = vi
    .spyOn(net.Server.prototype, "listen")
    .mockImplementation(function (this: unknown) {
      return this;
    } as never);

  const { default: app, db } = await import("../index.js");
  const { default: passport } = await import("passport");
  const listenCalls = listenSpy.mock.calls.map((call) => [...call]);
  listenSpy.mockRestore();

  return {
    app,
    db,
    passport,
    listenCalls, // arguments of every listen() call made while importing: [port, host, callback]
    settings,
    async cleanup() {
      passport.unuse("google"); // the Google strategy is global to the passport module
      await db.end();
      vi.unstubAllEnvs();
      vi.resetModules();
    },
  };
}

export type FreshApp = Awaited<ReturnType<typeof loadFreshApp>>;
