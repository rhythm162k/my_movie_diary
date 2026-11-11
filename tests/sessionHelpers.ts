import request from "supertest";

const COOKIE_NAME = "connect.sid";

// The full "Set-Cookie: connect.sid=...; Path=/; HttpOnly; ..." line, or undefined
export function rawSessionCookieFrom(res: request.Response): string | undefined {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  return cookies?.find((c) => c.startsWith(`${COOKIE_NAME}=`));
}

// Just "connect.sid=<value>", the part a browser sends back in the Cookie header
export function sessionCookieFrom(res: request.Response): string | undefined {
  return rawSessionCookieFrom(res)?.split(";")[0];
}

// The cookie value looks like "s:<sid>.<signature>" (URL-encoded).
// The <sid> is the primary key of the row in the "session" table.
export function sidFromCookie(cookie: string): string {
  const value = decodeURIComponent(cookie.slice(`${COOKIE_NAME}=`.length));
  return value.slice(2).split(".")[0];
}

// Logs in over HTTP and hands back the raw cookie, so a test can "replay" it later
// (what an attacker with a stolen cookie would do) without an agent's cookie jar.
export async function loginForCookie(
  app: Parameters<typeof request>[0],
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app)
    .post("/api/login")
    .send({ email, password })
    .expect(200);
  return sessionCookieFrom(res)!;
}
