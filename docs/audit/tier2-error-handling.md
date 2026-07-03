# Tier 2 — Resilience & Error-Handling Audit (DIAGNOSIS ONLY)

**Scope:** read-only code audit of FullCourt's DB client, API error path, and health
visibility, following the stale-`DATABASE_URL` pooler outage (`tenant/user not found`,
XX000 FATAL). **No source/config was modified. No git was run.** This report is the only
file written.

**Evidence tags:** `[Verified file:line]` = read literally from the file · `[Inferred]` =
reasoned from code, not directly observable · `[Unknown]` = could not confirm.
All numeric values were read with the Read tool from the literal source line (never from
grep/piped stdout).

---

## 1. Route inventory

Enumerated on disk via `find src/app/api -name route.ts` — **9 route handlers** (the docs'
"8 routes" is stale; `playoffs` and `shot-quality` both exist). `[Verified]` (directory listing)

| # | Route file | Validation → status | DB-error catch → status / `error` string | Envelope |
|---|-----------|---------------------|------------------------------------------|----------|
| 1 | `src/app/api/analysis/route.ts` | `seasonMinRA` clamped, no 400 | `try/catch` → **500**, `error = getPublicApiErrorMessage(err)`, `data = null` | `{data,error}` `[Verified analysis/route.ts:175-184]` |
| 2 | `src/app/api/cron/update/route.ts` | auth: 503 (no secret) / 401 (bad bearer); NBA CDN: 502 | `try/catch` → **500**, `error = getPublicApiErrorMessage(err)`, `data = {gamesUpdated:0}` | `{data,error,meta}` `[Verified cron/update/route.ts:143-152]` |
| 3 | `src/app/api/game/[id]/route.ts` | zod → **400** `"Invalid game id"` | `try/catch` → **404** `"Game not found"` / **500** sanitized, `data = null` | `{data,error}` `[Verified game/[id]/route.ts:17-36]` |
| 4 | `src/app/api/games/[date]/route.ts` | zod → **400** (regex msg) | `try/catch` → **500** sanitized, `data = []` | `{data,error}` `[Verified games/[date]/route.ts:15-32]` |
| 5 | `src/app/api/games/dates/route.ts` | zod → **400** | `try/catch` → **500** sanitized, `data = []` | `{data,error}` `[Verified games/dates/route.ts:28-44]` |
| 6 | `src/app/api/games/search/route.ts` | **manual** parse, no zod, no 400 | `try/catch` → **500** sanitized, `data = {games:[],total:0,...}` | `{data,error}` `[Verified games/search/route.ts:82-91]` |
| 7 | `src/app/api/games/upcoming/route.ts` | clamps, no 400 | `try/catch` → **500** sanitized, `data = []` | `{data,error}` `[Verified games/upcoming/route.ts:19-25]` |
| 8 | `src/app/api/playoffs/route.ts` | zod season → **400** | `try/catch` → **500** sanitized, `data = null` | `{data,error}` `[Verified playoffs/route.ts:102-111]` |
| 9 | `src/app/api/shot-quality/route.ts` | zod → **400** | `try/catch` → **500** sanitized, `data = null` | `{data,error}` `[Verified shot-quality/route.ts:63-72]` |

**Consistency:** every route wraps its DB work in `try/catch`, returns HTTP **500** on a
thrown DB error, and routes the message through `getPublicApiErrorMessage`. `[Verified — all 9 files]`

**Divergences (minor):**
- `cron/update` auth failures return `{ error: "..." }` with **no `data` key** — not the full
  envelope. `[Verified cron/update/route.ts:38-48]`
- `cron/update` 502 uses a **hardcoded** prod/dev string (`"Live score feed unavailable"`),
  bypassing the sanitizer. `[Verified cron/update/route.ts:88-98]`
- `games/search` is the only route parsing query params by hand instead of zod. `[Verified games/search/route.ts:15-23]`

**Query layer** (`src/lib/db/queries.ts`): **no `try/catch` anywhere** — every helper does
`await db…` and lets errors propagate to the route. A FATAL connection error is **not**
swallowed at this layer. `getShotQualityGrid` uses raw SQL via `db.execute(sql\`…\`)` against
`shot_grid` / `shot_value_surface` (absent from `schema.ts` by design); it throws the same way
on a dead connection. `[Verified db/queries.ts:1092-1123]` `[Inferred]` (propagation behaviour)

---

## 2. DB client findings — `src/lib/db/index.ts`

**`prepare: false` is global**, set on the connection-options object passed to
`postgres(url, {…})`, so it applies to **all** queries/routes (required for the Supabase
transaction pooler). Not per-call. `[Verified db/index.ts:38-43]` (literal `prepare: false,` on line 39)

**Pool size** — `dbPoolMax()`: if `process.env.DB_POOL_MAX` parses to a finite integer `> 0`,
use it; otherwise **`process.env.VERCEL ? 1 : 5`** (1 on Vercel, 5 locally). `[Verified db/index.ts:22-28]`
(literal `return process.env.VERCEL ? 1 : 5;` on line 28)

**Timeouts / retry:**
- `idle_timeout: 20` `[Verified db/index.ts:41]`
- `connect_timeout: 10` `[Verified db/index.ts:42]`
- **No `max_lifetime`.** `[Verified db/index.ts:38-43]` (only 4 options present)
- **No retry, no backoff, no circuit breaker** anywhere in the client. `[Verified db/index.ts:31-47]`

**Error propagation & caching (the Proxy singleton):** `db` is a `Proxy` whose `get` trap
calls `getOrCreateDb()` on every property access. `[Verified db/index.ts:53-57]` `getOrCreateDb()`
caches `sqlClient`/`dbInstance` on `globalThis.__nbaRestAdvantageDb` and only builds them when
`!state.dbInstance`. `[Verified db/index.ts:31-47]`

- `postgres(url, {…})` is **lazy** — it constructs a client without opening/validating a
  connection, so a bad host/tenant does **not** throw here; the (broken) `dbInstance` is
  cached on first use regardless. `[Inferred]` (postgres-js lazy-connect semantics)
- The FATAL therefore surfaces **at query time**: the first `await db.select…`/`db.execute`
  throws, which the route's `try/catch` converts to a 500. `[Inferred]` (matches the incident)
- **Caching does not create a poisoned client that outlives a fix:** postgres-js re-attempts a
  connection per query, so once the DB/pooler is reachable again the same cached instance
  recovers **without** a redeploy. `[Inferred]` The stale-`DATABASE_URL` case still required a
  redeploy only because the URL string was captured into the client at construction and the env
  fix changes that string — not because the cache was stuck. `[Inferred]`
- **But there is no fast-fail:** with `connect_timeout: 10` and no breaker, each request during
  an unreachable-DB window can block up to ~10s before throwing; on Vercel with `max = 1` this
  serializes and can saturate the single connection under load. `[Verified db/index.ts:42]` +
  `[Inferred]` (impact)

---

## 3. Error-path findings — sanitizer, fetcher, per-page UI

### `getPublicApiErrorMessage` (`src/lib/api-errors.ts`)
`[Verified api-errors.ts:5-23]`
- Non-production: returns `err.message` verbatim. `[Verified api-errors.ts:9-11]`
- Production: returns `err.message` **only if** the lowercased message **contains the substring**
  `"invalid"`, `"validation"`, or `"not found"`; otherwise the generic
  `"Something went wrong. Please try again later."` `[Verified api-errors.ts:12-22]`
- It does **not** branch on error *type* or `.code` (e.g. postgres-js `PostgresError.code`
  `XX000`, or Node `err.code` `ENOTFOUND`). Sanitization is a **substring allow-list on the
  message text**, so it treats a connection FATAL and a validation error identically — by
  whatever words happen to be in the string. `[Verified api-errors.ts:12-19]`

**Consequence for this incident (important, and it cuts both ways):**
- Supabase Supavisor rejects with the literal text **"Tenant or user not found"**, whose
  lowercase **contains `"not found"`** → the allow-list would **return that raw internal message
  to the browser**, *not* hide it. So the premise "the sanitizer hid the cause" only holds if the
  error that actually reached the top of the stack was a **connection-level** error (e.g.
  `getaddrinfo ENOTFOUND …` / `CONNECT_TIMEOUT`) whose text lacks those substrings. `[Inferred]`
  (which of the two fired at runtime is not observable from the code) · substring logic itself is
  `[Verified api-errors.ts:12-19]`
- Either way the behaviour is **incidental, not designed**: it can *leak* raw DB/driver text that
  happens to contain a magic word, and it *flattens* genuine connection failures (that don't
  match) into a generic string with **no code/category** the client or an operator-without-log-
  access can act on. `[Verified api-errors.ts:12-22]` + `[Inferred]` (leak/over-hide framing)

### `apiFetcher` (`src/lib/fetcher.ts`)
`[Verified fetcher.ts:7-12]`
- Does `await fetch(url)` then `await res.json()` and **throws `new Error(json.error)` when
  `json.error` is non-null** — SWR then exposes it as `error`. `[Verified fetcher.ts:8-11]`
- **Ignores `res.status`/`res.ok` entirely** — it trusts the body's `error` field. For the 9
  in-app routes this is fine (they always set `error` on failure). But an **infrastructure** 500
  (gateway/HTML body, no JSON) makes `res.json()` throw a `SyntaxError`, which surfaces to the
  user as a JSON-parse message rather than a DB message. `[Verified fetcher.ts:8-9]` + `[Inferred]`
- The message the user's error UI renders is exactly whatever the route put in `error`, i.e. the
  sanitizer output. `[Inferred]`

### Per-page user-visible state when the whole DB is down
(Message shown = sanitizer output — see §3 sanitizer note for whether that is the generic string
or a leaked FATAL text.)

- **`/` (Today's Games):** uses raw `fetch` (not `apiFetcher`) in two effects. The dates fetch
  reads `.json()`, sees `error`, throws → `errorDates` set → renders an inline **red `role="alert"`
  line** under the month tabs; `selectedDateKey` stays null so the games effect no-ops and the
  Matchups section renders empty; the `/api/analysis` SWR stat card shows **`"—"`**. Shell
  (nav/ticker/footer) intact. `[Verified page.tsx:275-317, 493-496, 564-565, 227-230]`
- **`/analysis`:** SWR `error || !data` → full **red "FAILED TO LOAD ANALYSIS"** card + sanitizer
  text. `[Verified analysis-content.tsx:657-673]`
- **`/upcoming` (PICKS):** SWR error → **red bordered card** with the sanitizer text. (The
  off-season empty state only renders on a *successful* empty result, not on error.)
  `[Verified upcoming-content.tsx:116-121, 166-188]`
- **`/playoffs`:** SWR `error || !data` → season selector + **red "FAILED TO LOAD PLAYOFF
  PREDICTIONS"** card. `[Verified playoffs-content.tsx:402-430]`
- **`/shot-quality`:** SWR `error || !data` → controls + `MessageCard tone="error"` **"FAILED TO
  LOAD SHOT DATA"** + sanitizer text. `[Verified shot-quality-content.tsx:413-481]`

Every page fails **soft** (isolated error card, shell/nav/footer stay up) — good UX, but every
page also shows the **same undifferentiated message**, so a user cannot tell a total DB outage
from a one-off blip, and there is no client-visible signal that the *whole* backend is down.
`[Inferred]`

### Error boundaries / server surfaces
- **No `error.tsx`, `global-error.tsx`, `not-found.tsx`, or `loading.tsx`** anywhere in
  `src/app`. `[Verified]` (find returned none)
- **No `middleware.ts`, no `instrumentation.ts`.** `[Verified]` (find returned none)
- All five pages are client components that fetch via SWR/`fetch`, so no **server** component
  throws at render during a DB outage — the failure is contained to the client SWR state, which
  is why the shells render. `[Inferred]`

---

## 4. Fake-health finding — footer "PIPELINE OK"

`src/app/layout.tsx` computes `lastUpdated` from **`new Date().toISOString()`** at render and
prints the literal string **`LAST UPDATED: {lastUpdated} · PIPELINE OK`**. `[Verified layout.tsx:34, 57]`

- `"PIPELINE OK"` is a **static string literal** — **no DB, pipeline, or liveness check** is
  behind it. It stays green while the DB is 100% down. `[Verified layout.tsx:57]`
- `LAST UPDATED` is the **render wall-clock**, not the last successful data-pipeline run, so it
  updates on every page load regardless of backend state. `[Verified layout.tsx:34]`
- Reinforcing cosmetic: the nav **ticker is fully hardcoded** (`TICKER_ITEMS` static, `HAS_LIVE_
  GAMES = false`) and reads no data — another shell element that looks "healthy" during an
  outage. `[Verified nav-bar.tsx:15-26]`

---

## 5. Prioritized weakness list (problem statements only — NO fixes)

**HIGH**
1. **Sanitizer keys on message substrings, not error type/code** (`api-errors.ts:12-19`). It can
   *leak* raw internal DB/driver text that incidentally contains `"invalid"`/`"not found"` (e.g.
   Supavisor's "Tenant or user not found") **and** *over-hide* genuine connection failures (that
   don't match) as a generic string with no code/category — the worst of both, and the direct
   reason the incident's true cause was invisible in the browser / unclassifiable server-side.
2. **No health/liveness endpoint and no DB-liveness probe** anywhere (9 routes, none is a health
   check; no `middleware`/`instrumentation`). There is no way to detect "DB down" except by
   hitting a data route and reading a Vercel `[cause]` log line — exactly the blind spot the
   outage exposed.

**MEDIUM**
3. **No retry / backoff / circuit breaker + `connect_timeout: 10`** (`db/index.ts:42`): during an
   unreachable-DB window every request can block ~10s before failing; on Vercel (`max = 1`,
   `db/index.ts:28`) this serializes and can saturate the single pooled connection.
4. **"PIPELINE OK" is a hardcoded string** (`layout.tsx:57`) with no liveness behind it — it
   actively misleads an operator into thinking the pipeline is healthy during a full outage
   (`LAST UPDATED` is render time, not last successful run — `layout.tsx:34`).
5. **Uniform, undifferentiated failure UI across all 5 pages** — no page can distinguish a total
   backend outage from a transient per-request error, and there is no app-level "backend down"
   signal for the user. (`page.tsx:493`, `analysis-content.tsx:665`, `upcoming-content.tsx:176`,
   `playoffs-content.tsx:421`, `shot-quality-content.tsx:479`)

**LOW**
6. **`apiFetcher` ignores `res.status`** (`fetcher.ts:8-9`): relies solely on the JSON body's
   `error`; a non-JSON infra 500 surfaces to the user as a JSON-parse error, not a backend
   message.
7. **No Next.js error boundaries** (`error.tsx`/`global-error.tsx`) — tolerable today because the
   pages fetch on the client, but any unexpected client-render throw falls back to Next's default
   overlay/blank rather than a branded state.
8. **Envelope divergence in `cron/update`** (`cron/update/route.ts:38-48`): auth failures return
   `{ error }` with no `data` key, unlike every other route's `{ data, error }`.
9. **Broken client is cached on `globalThis` with no invalidation** (`db/index.ts:31-47,53-57`):
   not a poisoning bug (postgres-js reconnects per query and self-heals once the DB is reachable),
   but there is no explicit fast-fail/reset path and no visibility into repeated connect failures.
