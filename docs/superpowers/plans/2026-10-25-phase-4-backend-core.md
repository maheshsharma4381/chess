# Phase 4: Backend Core (accounts and persistence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can sign up (email + password, optionally Google), games are saved to an archive with profile stats and rating history, Game Reviews are computed by a server worker queue and cached by PGN hash, and the opening explorer is proxied by the server with a Redis cache.

**Architecture:**

- **`apps/server`:** a Node 24 Express 5 + Socket.io service with a `createApp(deps)` factory, so tests inject every dependency.
  - Postgres is reached through Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) in a dedicated `chess` schema.
  - Redis (ioredis) backs rate limits, the explorer cache and the BullMQ review queue.
  - A separate worker process runs `analyzeGame` (chess-core) on Stockfish.
- **The web app** reaches the server same-origin via Next `rewrites` (`/api/v1/*`), so auth cookies stay first-party and the server needs no CORS.

**Tech Stack (versions verified with `npm view` on 2026-10-25):**

| Area | Packages |
| --- | --- |
| Server | express 5.3.0, socket.io 4.8.4, helmet 8.3.0, cookie-parser 1.4.7, pino 10.4.0, zod 4.6.7, jose 6.2.13 |
| Data | prisma / @prisma/client / @prisma/adapter-pg 7.10.1, pg 8.23.1 |
| Queue and cache | ioredis 6.0.0, bullmq 6.4.2 |
| Tests | supertest 7.3.1, socket.io-client 4.8.4, @electric-sql/pglite 0.5.11, @electric-sql/pglite-socket 0.2.14 |
| Runtime | tsx 4.23.15 |

**Spec:** `docs/spec/product-spec.md` (accounts, archive, ratings per pool, server-side review, explorer caching) and the roadmap Phase 4 section `docs/superpowers/plans/2026-10-23-chess-platform-roadmap.md`.

## Global Constraints

- Secrets never reach the browser or a log.
  - The repo-root `.env` holds `database_url` (Supabase), `LICHESS_API_TOKEN`, Supabase keys, and the new `AUTH_SECRET`.
  - The pino logger redacts `authorization`, `cookie`, `set-cookie`, `password` and `token`.
- App tables live in the Postgres schema `chess`, never `public`: Supabase exposes `public` through PostgREST to the anon key. Tests use PGlite, an in-process Postgres 17 behind `pglite-socket`.
- Migrations are SQL files made with `prisma migrate diff` and applied with `prisma migrate deploy`. Never use `db push --accept-data-loss` or `migrate reset`; Prisma blocks them for agents and they destroy data.
- Passwords use `scrypt` from node:crypto (N=16384, r=8, p=1, 32-byte key, 16-byte salt) and are compared with `timingSafeEqual`.
- Access tokens are HS256 JWTs from jose, valid 15 minutes, with `sub` = user id and `sid` = session id.
- Refresh tokens are 32 random bytes, stored only as SHA-256. They rotate on every use; reusing a rotated token revokes the whole session family.
- Cookies:
  - `chess_access` (httpOnly, SameSite=Lax, Path=/, Secure in production).
  - `chess_refresh` (httpOnly, SameSite=Lax, Path=/api/auth, Secure in production).
  - Mobile sends `Authorization: Bearer` and gets refresh tokens in JSON.
- Bot games are unrated (spec). Rated pools: `bullet`, `blitz`, `rapid`, `daily`, `puzzle`. Every new user starts at Glicko-2 1500 / 350 / 0.06.
- The review cache key is `sha256(startFen + "\n" + sans.join(" "))` plus depth. Headers and comments don't change the key.
- The explorer cache:
  - Fresh for 10 minutes; stale entries are served for up to 24 hours while one background refresh runs.
  - At most one upstream request is in flight.
  - Upstream 429 → 60s back-off, during which stale data is served if any, otherwise 429.

## Rulings Baked Into This Plan

- R1: The Prisma models are User, Session, Rating, RatingEvent, Game and ReviewReport. The roadmap's other models (Puzzle, PuzzleAttempt, Tournament, TournamentEntry, LeagueWeek, FairPlaySignal, Friendship, Bot) land with the phase that first uses them. This matches the Phase 0 YAGNI ruling for types.
- R2: No Docker or WSL on the dev machine.
  - Redis is the portable Redis 8.10.2 build (winget `taizod1024.redis-windows-fork`). Test setup spawns it on a free port, or uses `REDIS_URL` when set (CI uses a `redis:7` service).
  - Production uses managed Redis.
- R3: The server runs TypeScript through `tsx`, in dev and in production. Workspace packages ship extensionless TS imports, which Node's own type stripping cannot load.
- R4: The review worker gets its engine from the engine factory:
  - `STOCKFISH_PATH` set → a native binary over a child-process UCI transport (deploy).
  - Otherwise → the stockfish npm WASM build in Node (dev, CI).
  - Worker concurrency is 1 (8 GB machine, single-threaded lite build).
- R5: Google sign-in uses the OIDC authorization-code flow with PKCE and `state`, and verifies the id_token against Google's JWKS. It is enabled only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Otherwise its routes answer 404 `{error: 'Google sign-in is not configured'}`.
- R6: Avatars are a choice from 12 preset ids (`avatar-01` … `avatar-12`), not uploads. That avoids storing user images in Phase 4.
- R7: Requests:
  - Same-origin through Next rewrites, so the server sends no CORS headers. Native mobile does not need CORS.
  - `beforeFiles` rewrites send `/api/opening-explorer/*` to the server when `SERVER_URL` is set. The web's own route stays as the standalone fallback.
  - The proxy core moves to `packages/explorer-proxy`, shared by both.
- R8: Auth is required for `POST /api/reviews` (it costs CPU), with a 10-per-hour-per-user rate limit. Cached reports are readable by id without auth.

## Review Focus

1. **Refresh-token races:** two tabs refresh at once with the same token. One wins; the other gets 401 without revoking the family. Reuse is detected only for a token rotated more than 10s ago. Test: two parallel refreshes with one token → one 200, one 401, then the winner's new token still refreshes.
2. **Duplicate sign-up:** the same email, in a different case or with spaces, gives 409, not a 500 from the unique index. Test in Task 3.
3. **Duplicate review jobs:** two users ask for the same game at once; one job runs (BullMQ `jobId` = cache key) and both see its progress. Test in Task 7.
4. **Server restart mid-review:** a job that was active when the worker died is retried (BullMQ stalled-job check), not stuck "active" forever. Test in Task 7 with a short `stalledInterval`.
5. **Saving a game twice:** a refresh on the game-over screen posts the same PGN again. The archive keeps one copy (unique `(userId, clientGameId)`). Test in Task 6.

---

## File Structure

```
apps/server/
  package.json, tsconfig.json, tsconfig.test.json, vitest.config.ts, prisma.config.ts
  prisma/schema.prisma, prisma/migrations/<n>_<name>/migration.sql
  src/
    main.ts            # HTTP + Socket.io server, graceful shutdown
    worker.ts          # review worker process
    config.ts          # env loading (process env, then repo-root .env) + zod validation
    logger.ts          # pino with redaction
    app.ts             # createApp(deps): express app
    db.ts              # createPrisma(url, schema)
    redis.ts           # createRedis(url)
    http/errors.ts     # HttpError, validation and the error handler
    http/rateLimit.ts  # Redis fixed-window limiter middleware
    realtime.ts        # attachSocket(server, deps): Socket.io with auth handshake
    auth/password.ts, auth/tokens.ts, auth/sessions.ts, auth/routes.ts, auth/middleware.ts, auth/google.ts
    users/routes.ts    # me, profile, public profile
    games/service.ts, games/routes.ts
    reviews/key.ts, reviews/queue.ts, reviews/routes.ts, reviews/processor.ts
    explorer/routes.ts
  test/helpers/{db.ts,redis.ts,app.ts}, test/*.test.ts
packages/explorer-proxy/   # moved from apps/web/lib/explorer/proxy.ts, cache made async
packages/engine/src/transports/process.ts   # child-process UCI transport
apps/web/
  lib/api/client.ts, lib/api/session.ts
  app/login/page.tsx, app/signup/page.tsx, app/profile/[username]/page.tsx
  components/auth/*, components/profile/*
```

## Tasks

### Task 1: Server scaffold and test infrastructure

**Files:**

- Create:
  - `apps/server/{package.json,tsconfig.json,tsconfig.test.json,vitest.config.ts}`
  - `src/{config,logger,app,redis,realtime,main}.ts`, `src/http/errors.ts`
  - `test/helpers/redis.ts`, `test/scaffold.test.ts`
- Modify: `pnpm-workspace.yaml` (catalog entries; `allowBuilds` for `prisma`, `@prisma/engines`), `.env.example`, `.gitignore` (`apps/server/src/generated/`).

**Interfaces:**

- Produces:
  - `loadConfig(env?: Record<string,string|undefined>, files?: string[]): Config`, with `Config = { port, databaseUrl, dbSchema, redisUrl, authSecret, webOrigin, lichessToken?, google?: {clientId, clientSecret, redirectUri}, stockfishPath?, production }`.
  - `createApp(deps: AppDeps): express.Express`, with `AppDeps = { config, logger, prisma, redis, reviews?, explorer? }`.
  - `class HttpError(status, message, details?)`.
  - `attachSocket(httpServer, deps): SocketServer`.

**Tests:**

- `loadConfig`:
  - reads the lowercase `database_url` key the user's `.env` uses;
  - rejects an `AUTH_SECRET` shorter than 32 chars;
  - `env` wins over files.
- `GET /health` → 200 `{status:'ok'}`.
- `GET /ready`:
  - 200 with db and redis up;
  - 503 `{status:'unavailable', checks:{db:false, redis:true}}` when the db ping throws.
- Unknown route → 404 JSON. A thrown `HttpError(418)` → 418 JSON. A thrown plain Error → 500 `{error:'Internal error'}`, with no stack in the body.
- The logger redacts `authorization` and `cookie`, checked with a captured stream.
- `socket.io-client` connects and `ping` acks `pong`.

### Task 2: Database schema and migrations

**Files:**

- Create:
  - `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql`, `prisma/migrations/migration_lock.toml`
  - `src/db.ts`, `test/helpers/db.ts`, `test/db.test.ts`
  - `scripts/db-deploy.mjs` (runs `prisma migrate deploy` against `database_url?schema=chess`)

**Interfaces:**

- Produces:
  - `createPrisma(url: string, schema: string): PrismaClient`.
  - `startTestDb(): Promise<{ prisma, url, reset(): Promise<void>, stop(): Promise<void> }>`. It starts PGlite + socket server on a free port and applies `migration.sql` files in order under `SET search_path`. `reset` truncates every app table.
- Models:
  - `User`: `id cuid`, `email unique`, `passwordHash?`, `googleSub unique?`, `username unique`, `displayName`, `country?`, `bio?`, `avatar`, `settings Json`, timestamps.
  - `Session`: `id`, `userId`, `family`, `refreshHash unique`, `expiresAt`, `revokedAt?`, `rotatedAt?`, `userAgent?`, `createdAt`.
  - `Rating`: `userId`, `pool` enum, `rating`, `rd`, `volatility`, `games`, `updatedAt`; unique `(userId, pool)`.
  - `RatingEvent`: `id`, `userId`, `pool`, `rating`, `rd`, `gameId?`, `createdAt`.
  - `Game`: `id`, `userId?`, `clientGameId?`, `whiteName`, `blackName`, `whiteUserId?`, `blackUserId?`, `botId?`, `userColor?`, `pgn`, `startFen?`, `result`, `termination`, `timeControl?`, `pool?`, `rated`, `plies`, `reviewKey`, `playedAt`; unique `(userId, clientGameId)`.
  - `ReviewReport`: `key` + `depth` (unique together), `report Json`, `createdAt`.

**Tests:**

- The migration applies to an empty PGlite.
- Every model can be created and read.
- Unique constraints throw P2002 (duplicate email; duplicate `(userId, clientGameId)`).
- `reset()` empties the tables.
- A slow test (`describe.runIf(process.env.PRISMA_DEPLOY_TEST)`) runs the real `prisma migrate deploy` against PGlite through async `exec`.

### Task 3: Email + password auth with rotating sessions

**Files:**

- Create:
  - `src/auth/{password,tokens,sessions,routes,middleware}.ts`, `src/http/rateLimit.ts`
  - `test/auth.test.ts`, `test/rate-limit.test.ts`

**Interfaces:**

- Produces:
  - `hashPassword(pw): Promise<string>` (`scrypt$N$r$p$salt$hash`) and `verifyPassword(pw, stored): Promise<boolean>`.
  - `signAccess({userId, sessionId}, secret): Promise<string>` and `verifyAccess(token, secret): Promise<{userId, sessionId}>`.
  - `createSession(prisma, userId, ua?)`, which returns `{ session, refreshToken }`.
  - `rotateSession(prisma, refreshToken): Promise<{ session, refreshToken } | 'invalid' | 'reused'>`.
  - `requireAuth`, which sets `req.user = {id, sessionId}`.
  - `rateLimit({ redis, key: (req) => string, limit, windowSec })`.
- Routes:
  - `POST /api/auth/signup {email, password(8..128), username}` → 201 `{user}` + cookies.
  - `POST /api/auth/login {email, password}` → 200 `{user}` + cookies, or 401 `{error:'Wrong email or password'}`. The message is the same for an unknown email.
  - `POST /api/auth/refresh` (cookie, or body `{refreshToken}` for mobile) → 200 + new cookies.
  - `POST /api/auth/logout` → 204 and the session revoked.
  - `GET /api/me` → 200 `{user}` or 401.

**Tests:**

- Hash and verify, plus a wrong password.
- The token expires (fake clock via jose `currentDate`).
- Sign-up:
  - creates five rating rows at 1500/350/0.06;
  - Review Focus 2: `' Me@X.com '` after `'me@x.com'` → 409 `Email already registered`;
  - username rules give 400, and a taken username → 409.
- Login sets both cookies with the right flags.
- Refresh rotates, and Review Focus 1 holds.
- Reuse of an old token (more than 10s, fake time) revokes the family.
- Logout revokes the session.
- `/api/me` works with a Bearer token.
- The login rate limit is 10 per 15 minutes per IP+email → 429.
- No response body contains `passwordHash`.

### Task 4: Google sign-in (OIDC + PKCE)

**Files:**

- Create: `src/auth/google.ts`, `test/google.test.ts`.

**Interfaces:**

- Consumes: `createSession`.
- Produces:
  - `googleRoutes({ config, prisma, fetchFn, jwks })`.
  - `GET /api/auth/google/start` → 302 to `accounts.google.com/o/oauth2/v2/auth`, with `state`, `code_challenge` (S256) and a signed short-lived `chess_oauth` cookie holding `{state, verifier}`.
  - `GET /api/auth/google/callback?code&state` → exchanges the code at `oauth2.googleapis.com/token` and verifies the `id_token` (issuer `https://accounts.google.com` or `accounts.google.com`, aud = client id, `email_verified`). It finds or creates the user by `googleSub`, else links by verified email, then 302s to `webOrigin + /` with session cookies.

**Tests (local JWKS from `jose.generateKeyPair` and a fake token endpoint):**

- start → 302 with S256 challenge;
- a callback with a mismatched state → 400;
- a valid callback creates the user and sets cookies;
- a second login reuses the user;
- an unverified email → 403;
- an expired id_token → 401;
- not configured → 404.

### Task 5: Profiles and settings

**Files:**

- Create: `src/users/routes.ts`, `test/users.test.ts`.

**Interfaces:**

- `PATCH /api/me {displayName?(1..40), username?, country?(ISO 3166 alpha-2), bio?(≤200), avatar?(preset id), settings?{boardTheme, sound, coachLang, pieceSet}}` → 200 `{user}`.
- `GET /api/users/:username` → `{ username, displayName, country, bio, avatar, createdAt, ratings: {pool: {rating, rd, games}} }`, or 404.

**Tests:**

- each field validates (400 with a per-field message);
- a username change that collides → 409;
- the public profile has no email;
- settings merge rather than replace.

### Task 6: Game archive, stats and rating history

**Files:**

- Create: `src/games/{service,routes}.ts`, `test/games.test.ts`.

**Interfaces:**

- Consumes: `parsePgn` (chess-core), `reviewKey` from Task 7's `src/reviews/key.ts` (created here first, Task 7 reuses it).
- Produces:
  - `POST /api/games {pgn, clientGameId, botId?, userColor, termination}` → 201 `{game}`, or 200 `{game}` when `clientGameId` already exists (Review Focus 5). The server replays the PGN (400 on an illegal move, with the SAN), derives the result, and sets `rated=false` for bot games.
  - `GET /api/users/:username/games?cursor&limit(≤50)` → newest first plus `nextCursor`.
  - `GET /api/games/:id`.
  - `GET /api/users/:username/stats` → `{ total, wins, draws, losses, byBot: {botId: {wins, draws, losses}} }`.
  - `GET /api/users/:username/ratings/:pool` → `RatingEvent[]` oldest first, starting with the initial 1500.

**Tests:**

- saving and reading a game;
- an illegal PGN → 400;
- a result mismatch is corrected from the final position (a checkmate PGN headed `*` is saved as `1-0`);
- an idempotent save;
- cursor pagination over 7 games with limit 3;
- stats per bot;
- rating history starts at 1500;
- another user cannot read your unlisted games (all games public in Phase 4 → test public read).

### Task 7: Review queue, worker and cached reports

**Files:**

- Create:
  - `packages/engine/src/transports/process.ts` (+ export from `./node`)
  - `src/reviews/{key,queue,processor,routes}.ts`, `src/worker.ts`
  - `test/reviews.test.ts`, `packages/engine/test/process-transport.test.ts`

**Interfaces:**

- Produces:
  - `createProcessTransport(command, args): UciTransport`.
  - `reviewKey(pgn): { key, startFen?, sans }`.
  - `createReviewQueue(redis, { prefix })` and `startReviewWorker({ redis, prisma, engineFactory, concurrency: 1, stalledInterval? })`.
  - `POST /api/reviews {pgn, depth: 14|18}` (auth) → 200 `{status:'done', id, report}` from cache, or 202 `{status:'queued'|'active', id, progress}`.
  - `GET /api/reviews/:id` → `{status, progress, report?, error?}`, where `id = key + ':' + depth`.

**Tests:**

- the same moves with different headers give the same key;
- the worker turns a 4-ply game into a stored report (real Stockfish WASM at depth 6);
- a second POST returns 200 from cache;
- Review Focus 3: two parallel POSTs → one job (`getJobCounts`) and the same id;
- Review Focus 4: a job whose worker is killed mid-run is picked up by a new worker (stalledInterval 500ms) and completes;
- unauthenticated POST → 401;
- the 11th POST in an hour → 429;
- `createProcessTransport` drives `node <stockfish bin>` to `uciok` and a bestmove.

### Task 8: Explorer proxy package and server route

**Files:**

- Create:
  - `packages/explorer-proxy/{package.json,tsconfig.json,src/index.ts,src/redisCache.ts,test/*.test.ts}`
  - `apps/server/src/explorer/routes.ts`, `test/explorer.test.ts`
- Modify: `apps/web/app/api/opening-explorer/[source]/route.ts` and `apps/web/lib/explorer/proxy.ts` (replaced by the package), `apps/web/test/explorer-proxy.test.ts`.

**Interfaces:**

- Produces:
  - `handleExplorerRequest(source, url, deps)`, with an async `ExplorerCache { get(key): Promise<CacheEntry|null>; set(key, entry): Promise<void> }`, `CacheEntry = { body, fetchedAt }`, stale-while-revalidate, single-flight and the 429 back-off.
  - `createMemoryCache(opts)` and `createRedisCache(redis, { prefix, maxAgeSec: 86400 })`.

**Tests:**

- every Phase 3 proxy test still passes;
- a fresh hit is served without fetching;
- a stale hit is served and refreshed once, even with 5 parallel requests;
- after a 429, requests within 60s don't reach upstream;
- the Redis cache round-trips with a TTL set;
- the server route returns `X-Cache` and never echoes the token.

### Task 9: Web integration (auth UI, archive, server reviews)

**Files:**

- Create:
  - `apps/web/lib/api/{client,session}.ts`
  - `app/{login,signup}/page.tsx`, `components/auth/AuthForm.tsx`, `components/auth/UserMenu.tsx`
  - `app/profile/[username]/page.tsx`, `components/profile/{ProfileView,GameArchive}.tsx`
  - tests `apps/web/test/{api-client,auth-ui,profile,save-game,server-review}.test.tsx`
- Modify:
  - `next.config.ts` (rewrites when `SERVER_URL` is set), `components/SiteHeader.tsx` (UserMenu)
  - `components/play/BotGame.tsx` (auto-save once on game over when signed in, with a "Saved to your archive" link)
  - `lib/review/reviewStore.ts` + `GameReview.tsx` ("Deeper review" goes to the server when signed in; a cached server report loads instantly)

**Interfaces:**

- `api(path, init)`: fetches `/api/v1${path}` with `credentials: 'same-origin'`, retries once after `POST /auth/refresh` on 401, and throws `ApiError(status, message)`.
- `useSession()` → `{ status: 'loading'|'signed-in'|'signed-out', user, refresh(), signOut() }`.

**Tests:**

- the client refreshes once and then gives up;
- signup and login forms show server errors next to fields and redirect on success;
- the header shows the username when signed in;
- a finished game posts once with a stable `clientGameId` (rerender does not repost);
- the profile renders stats and archive links to `/review?pgn=`;
- Deeper review polls the server job and swaps in its report.

### Task 10: CI, run scripts and full-stack E2E

**Files:**

- Modify: `.github/workflows/ci.yml` (redis + postgres services; migrate the CI database; run server tests), root `package.json` (`dev:server`, `dev:worker`), `README.md` (how to run the stack).
- Create: `apps/web/e2e/accounts.spec.ts`, `apps/web/e2e/stack.ts` (starts redis-server, server, worker for E2E).

**E2E (real Redis, real server, PGlite or Supabase `chess_e2e` schema, real Stockfish worker):**

1. Sign up, then see the username in the header.
2. Play Pip, resign, and see "Saved to your archive".
3. On the profile, the archive lists the game and the stats show 1 loss.
4. Open the review, press Deeper review, and the server job completes.
5. Reload: the cached report appears without a job.
6. Log out and in again.

## Self-review notes

- Spec coverage: every roadmap Phase 4 bullet maps to a task:
  - the bootstrap and health checks → Task 1;
  - auth, email + Google → Tasks 3 and 4;
  - profiles, settings and avatars → Task 5;
  - the Prisma schema → Task 2 (R1);
  - the archive, stats and rating history → Task 6;
  - the BullMQ queue and workers with the PGN-hash cache → Task 7;
  - the Redis explorer proxy → Task 8;
  - "users can sign up, games are saved, reviews cached" → Tasks 9 and 10.
- Names used across tasks: `reviewKey`, `createSession`, `rotateSession`, `requireAuth`, `createReviewQueue`, `startReviewWorker`, `handleExplorerRequest` and `startTestDb`. Each is defined in the task listed under its Interfaces.
