# Test gap analysis and new tests

Written from `index.ts`, `middleware/rateLimiters.ts`, the existing `tests/` and the v8 coverage report
(87% statements, 82% branches).

> **Not run yet.** I had no database or `npm install` here. The files pass a TypeScript syntax check
> and are written against your code, but the first real run is on your machine. See "First run" at the bottom.

## 1. What the coverage report hides

The 5 uncovered line ranges are real holes, but the bigger problem is that **line coverage only says a line
ran, not that its behaviour was checked**. `rateLimiters.ts` shows 100%, yet it has no behavioural test:
`loginLimiter` is switched off in test mode, and nothing ever sends enough requests to get a 429.

| Uncovered lines | What they are | Why they were skipped |
| --- | --- | --- |
| 64 | `db.on("error")` handler | nothing emits a pool error |
| 142-189 | Google strategy (find or create the user) | `NODE_ENV === "test"` skips registering it |
| 210-214 | Google callback: start session, redirect, `next(error)` | no strategy, so the route never succeeds |
| 228-230 | logout when `session.destroy` fails | nothing makes destroy fail |
| 623-624 | `app.listen(...)` | skipped in test mode |

## 2. Gaps, by seriousness

| # | Gap | Seriousness | Tests |
| --- | --- | --- | --- |
| 1 | Rate limiters never exercised: brute-force protection on login/registration/Google, the general 100/15min cap, per-IP counters, spoofed `X-Forwarded-For` | **Serious** | T130-T136 |
| 2 | Google sign-in 0% tested: user lookup/creation/linking SQL, callback session creation, denied consent, failures | **Serious** | T101-T106, T110-T114, T148-T149 |
| 3 | Production-only config never run: `Secure` + `SameSite=None` cookie, `trust proxy`, bcrypt cost, `0.0.0.0` listen. A mistake here = works locally, nobody can log in on Render | **Serious** | T140-T148 |
| 4 | Logout only checked through the client's cookie jar. Nothing proved the server forgets the session (stolen-cookie replay), that re-login kills the old id, or that forged/expired cookies get 401 | **Serious** | T120-T126 |
| 5 | Bad input that gives 500 instead of 400 (probes, see section 4) | Medium | T180-T188 |
| 6 | Google email is not normalised the way registration does it, so a returning user can get a second, empty account (probe) | Medium | T115 |
| 7 | Failure paths of session handling: logout failure, regenerate/save failure on login, registration, Google | Medium | T104-T106, T127-T129 |
| 8 | OMDb request never inspected (URL, key, parameter injection); when OMDb must not be called; poster allow-list on PATCH | Low-medium | T150-T158 |
| 9 | Pool `error` event, 413 oversized body, `__proto__` and SQL-fragment keys, CORS rules | Low | T137, T170-T173, T146-T147 |

## 3. New files (all in `tests/`)

| File | What it covers |
| --- | --- |
| `freshApp.ts` | Helper. Imports a second copy of `index.ts` with other env vars (production or development), test DB only. Needed because `index.ts` reads `NODE_ENV` once, at import. Not a test file |
| `sessionHelpers.ts` | Helper. Reads the session cookie and its session id, logs in and returns the raw cookie so a test can replay it |
| `rateLimiting.test.ts` | T130-T136: all three limiters, per-IP budgets, spoofed `X-Forwarded-For` |
| `production.config.test.ts` | T140-T149: listen, Secure/SameSite=None cookie, silent no-cookie over plain HTTP, bcrypt cost, CORS, Google redirect, denied consent |
| `googleAuth.test.ts` | T101-T106 (callback route with a fake Google) and T110-T115 (real verify function against the test DB) |
| `session.lifecycle.test.ts` | T120-T129 and T137: server-side invalidation, fixation, expiry, forged cookies, failure paths, pool error |
| `movies.poster.test.ts` | T150-T158: OMDb request, bad OMDb answers, PATCH allow-list |
| `hardening.test.ts` | T170-T173 (already handled) and T180-T188 (probes) |

Test ids continue after your T086. Existing files are not touched.

## 4. Probes: `it.fails`

Tests marked `it.fails` describe behaviour that **should** exist but, from reading the code, does not.
They **pass while the bug exists** and go red the day you fix it. Then delete the `.fails`.
If one is red on your first run, my reading was wrong; the test then shows what the app really does.

| Test | Expected bug | Cause in `index.ts` | Fix idea |
| --- | --- | --- | --- |
| T180/T181 | rating `true`, `" "` or `[5]` gives 500 | `Number(x)` accepts them; Postgres rejects the raw value | require `typeof rating === "number"` or a numeric string matching a regex |
| T182 | login with an object password gives 500 for an existing email, 401 for an unknown one (reveals which emails exist) | `bcrypt.compare` only accepts strings | `typeof password !== "string"` -> 400, or `.isString()` in the validator |
| T183 | registration with a numeric password gives 500 | same, in `bcrypt.hash` | same |
| T184-T186 | `?id=1&id=2` or `?title=a&title=b` gives 500 | repeated keys become arrays | check `typeof req.query.id === "string"` or use `.isString()` |
| T187/T188 | PATCH stores padded text; POST trims, so duplicate titles slip past the unique rule | PATCH has no `.trim()` | trim the values in `updates` |
| T115 | Google login creates a second account when the email differs by case | registration lower-cases emails, Google's is used as is | lower-case the Google email before the lookups |

## 5. Not covered (on purpose or for later)

- **Frontend**: no tests at all. It needs Vitest + React Testing Library + jsdom in `frontend/package.json`, so it is outside "test files only".
- **OMDb timeout**: `fetch` has no timeout, so a slow OMDb makes add/edit hang. A test would hang too; fix with `AbortSignal.timeout(...)`.
- **Error handler's `res.headersSent` branch and the `err.statusCode` fallback**: no route can trigger them without changing `index.ts`.
- **Google account linking by email**: `index.ts` signs Google users into an existing password account with the same email without checking `profile.emails[0].verified`. T112 documents the current behaviour; consider whether you want that.

## 6. First run

```bash
npm test                    # everything
npx vitest run tests/rateLimiting.test.ts   # one file
npm run coverage            # lines 64, 142-189, 210-214, 228-230, 623-624 should now be covered
```

No new packages are needed. Things that could differ on your machine, in order of likelihood:

1. `session` table name or columns (used by `session.lifecycle.test.ts`): the tests use `session(sid, sess, expire)`, connect-pg-simple's defaults.
2. A test in `googleAuth.test.ts` or `production.config.test.ts` failing at import: send me the error, the fresh-app helper is the riskiest part.
3. A probe (section 4) that is red: see the note at the top of section 4.
