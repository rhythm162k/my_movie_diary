# My Movie Diary (TypeScript) - Setup & Running Guide

The whole app is now TypeScript: the Express backend (`.ts`) and the React frontend (`.tsx`/`.ts`).
Behaviour is the same as before. The only intentional differences are listed under **What changed** below.

---

## 1. Folder structure

```
myMovieDiary/
  index.ts                 Express server (was index.js)
  middleware/rateLimiters.ts
  tests/                   Vitest + Supertest tests (.ts)
  tsconfig.json            Backend TypeScript config (also used for the build)
  vitest.config.ts
  package.json             Backend scripts + dependencies
  .env.example             Template for .env / .env.test
  frontend/
    index.html
    vite.config.ts
    tsconfig.json / tsconfig.app.json / tsconfig.node.json
    eslint.config.js       (kept as .js on purpose, see "What changed")
    package.json
    .env.example           Template for frontend/.env
    public/                <- copy your images here (see step 3)
    src/
      main.tsx, App.tsx, api.ts, types.ts, vite-env.d.ts
      components/          Pagination, LoadingSVG, ServerWaking (new screen)
      context/             AuthContext.tsx
      Pages/               AddNew, EditPage, HomePage, LoginRegistration
```

---

## 2. Requirements

- Node.js 20 or newer (22 recommended)
- PostgreSQL databases: one for development, one for tests (production is Supabase)
- All three databases use the schema in `001_schema.sql`

---

## 3. First-time setup

1. **Unzip** into a fresh folder (do not unzip over your old project).

2. **Copy your private files** from the old project:
   - `.env`, `.env.test` -> into the new `myMovieDiary/` (root)
   - `frontend/.env` -> into the new `frontend/`
   - everything inside `frontend/public/` (images) -> into the new `frontend/public/`
   - your `.gitignore` files -> same places. Make sure the root `.gitignore` also contains `dist`.

   No `.env` files yet? Copy `.env.example` to `.env` (and `.env.test` for the test database) and fill the values in.
   The test database name **must contain the word "test"**, otherwise the tests refuse to run.

3. **Install dependencies** (two separate installs):

   ```bash
   npm install                # backend, in myMovieDiary/
   cd frontend
   npm install                # frontend
   cd ..
   ```

4. **Create the tables** in each database, if they are empty:

   ```bash
   psql -d <database-name> -f 001_schema.sql
   ```

   If `psql` complains about the `\restrict` / `\unrestrict` lines at the top and bottom of the dump,
   delete those two lines and run it again.

---

## 4. Run it locally (development)

Use two terminals.

**Terminal 1 - backend (http://localhost:3000):**

```bash
npm run dev
```

This runs `tsx watch index.ts`, which restarts the server when you save a file.

> `npm start` is now the **production** command (it runs the compiled `dist/index.js`).
> For local development always use `npm run dev`.

**Terminal 2 - frontend (http://localhost:5173):**

```bash
cd frontend
npm run dev
```

Open http://localhost:5173.

---

## 5. Useful commands

| Where | Command | What it does |
| --- | --- | --- |
| root | `npm run dev` | Dev server with auto-restart |
| root | `npm run typecheck` | Type-checks the backend without building |
| root | `npm run build` | Compiles the backend into `dist/` |
| root | `npm start` | Runs the compiled backend (production) |
| root | `npm test` | Runs all tests once (uses `.env.test`) |
| root | `npm run test:watch` | Tests in watch mode |
| root | `npm run coverage` | Tests + coverage report |
| root | `npm run typecheck:tests` | Optional: type-check the test files |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run build` | Type-checks, then builds into `frontend/dist/` |
| frontend | `npm run lint` | ESLint |
| frontend | `npm run preview` | Preview the production build |

Before deploying, run `npm run build` in **both** folders. If a build prints type errors, fix them (or send them to me) first.

---

## 6. Seeing the new "Waking up the server" screen locally

The screen appears when the first session check takes longer than 1.5 seconds. To preview it, set
`VITE_API_URL=http://10.255.255.1:3000` in `frontend/.env` (an address that never answers), restart `npm run dev`
in the frontend, and open the app. Put your real URL back afterwards.

---

## 7. Deploying on Render

**Backend (Web Service)** - the build step is new because TypeScript must be compiled:

| Setting | Value |
| --- | --- |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |

`--include=dev` makes sure TypeScript is installed even when Render sets `NODE_ENV=production`.
If your Start Command was `node index.js`, change it to `npm start`. All environment variables stay exactly as they are.

**Frontend (Static Site)**

| Setting | Value |
| --- | --- |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Keep `VITE_API_URL` set to your backend URL, and keep your rewrite rule `/*` -> `/index.html` if you have one.

---

## 8. What changed (so nothing surprises you)

- **Every `.js`/`.jsx` is now `.ts`/`.tsx`.** The only config file left as JavaScript is `frontend/eslint.config.js`, because ESLint needs an extra package to read a TypeScript config.
- **Salt rounds: 15 -> 10** (`index.ts`). Tests still use 4. Existing accounts keep working because each stored hash remembers its own cost.
- **New screen:** `frontend/src/components/ServerWaking.tsx` (+ `.css`) is shown by `AuthContext` while the first session check is pending, after a 1.5 second delay so a fast server never flashes it.
- **Build setup:** `tsconfig` files, `@types/*` packages, `tsx` (dev runner) and `typescript`. The backend now builds to `dist/`, and `npm start` runs that build.
- **Tiny changes that TypeScript needed (same behaviour):**
  - handlers use `res.status(...).json(...); return;` instead of `return res.status(...).json(...);`
  - `PORT` / `PG_PORT` are converted to numbers
  - Google callback passes `undefined` instead of `null` as the user on error
  - `useAuth()` throws a clear error if used outside `AuthProvider` (this lets TypeScript know the value always exists)
  - `Array(6).fill(undefined)` instead of `.fill()`, and `rows={6}` instead of `rows="6"`
- **Tests** are `.ts`. They use relaxed typing (`strict` is off for the `tests/` folder) and Vitest does not type-check them when running.
- **Not included in the zip:** `node_modules`, `package-lock.json` (it is regenerated by `npm install`), images, and hidden files.

## 9. Not tested yet

I wrote and converted all of this without being able to run `npm install`, `tsc`, your databases or the browser.
Everything passed a syntax check, but the real type-check happens when you run the commands above.
If `npm run build` shows errors, copy them to me and I'll fix them.
