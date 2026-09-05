# FullCourt — Project Handoff

Written 2026-09-04; reconciled with source and Git during the approved clean-slate takeover on
2026-09-05. Product architecture is unchanged. Current source/tests and Git take precedence over
this summary; the full evidence and document-maintenance policy is in DECISIONS.md D-48.

**How to read the evidence markers.** Claims carry their source inline:
`path/to/file.ts` (read while writing this), `commit abc1234`, `PR #75`, or
**(conversation-only)** where the fact exists nowhere in the repo and came from prior working
sessions. Where a claim is reasoning rather than observation it is tagged `[Inferred]`;
where it could not be established it is tagged `[Unknown]`.

**Historical validation reported on 2026-09-04.** These are the previous handoff's results,
not a guarantee about a later checkout. Current commands are in `docs/TESTING_AND_CICD.md`.

| Check | Result |
| --- | --- |
| `pnpm test:run` | 67 files, **912 tests, all passing** |
| `pnpm typecheck` | clean (`tsc --noEmit --incremental false`) |
| `pnpm lint` | clean |
| `pnpm build` | succeeds; 20 page routes + 12 API routes emitted |
| `pnpm audit --prod` | **No known vulnerabilities found** |
| TODO/FIXME/HACK/XXX in `src/`, `scripts/`, `ml/`, `e2e/`, `drizzle/` | **zero** |

---

## 1. What this project is

FullCourt models how **NBA travel, rest, and schedule density** affect game outcomes, and
publishes the measurement — including the parts that came back null.

The core chain: each team in a matchup gets a **fatigue score** from a weighted-decay model;
the difference between the two is the **rest advantage**; a backtest over every regular-season
game since 1985-86 asks whether the more-rested team actually won.

Two framing rules control every published number and are the most load-bearing domain facts in
the project:

1. **`isCalledSide`** (`src/lib/rest-advantage-evidence.ts`, since 2026-08-02). The model only
   "calls" a game when the fresher team is **also at home**. Games where the rested team is the
   visitor are published as their own row and never pooled into the headline.
2. **Every rate is read against a venue baseline, not a coin flip** (since 2026-08-06). Home
   teams win ~59.9% of all games regardless of rest. A 61.2% headline plotted against 50%
   credited the model with ~10 points of home court it did not produce.
   `AnalysisResponse.venueBaseline` carries it; the season chart uses **each season's own**,
   because home court ran from 67.9% in 1987-88 to 54.3% in 2023-24. A 50% zero line must never
   be reintroduced.

The site is live at <https://fullcourt-nba.vercel.app>; repo <https://github.com/mhju0/fullcourt>.

**Editorial stance — a product decision, not a style note.** The project publishes negative
results. Several shipped surfaces exist specifically to say "we measured this and it is
nothing": the win-total market check (r = −0.016 across 884 team-seasons), the time-zone /
circadian test, the fitted-weights experiment. ADR 0009 makes this a rule — nulls live behind
the data rather than being deleted. An agent that "improves" a null into a positive claim is
damaging the product, not fixing it.

---

## 2. Stack and architecture

### 2.1 Runtime stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js 16.2.12**, App Router | `next.config.ts` |
| UI | **React 19.2.4**, TypeScript strict | |
| Styling | **Tailwind v4** + a `--term-*` CSS token system | `src/app/globals.css` |
| Package manager | **pnpm 11.8.0** | `packageManager` field in `package.json` |
| DB | **Supabase PostgreSQL** | Drizzle ORM + `postgres` (postgres-js) |
| Client data | **SWR** | |
| Charts | **Recharts** | |
| Motion | **GSAP** | five sanctioned motion moments, ADR 0010 |
| Command palette | **cmdk**, `next/dynamic` on first summon | + 16 transitive `@radix-ui/*` |
| Menus | **@base-ui/react** | the OTHER nav menu |
| Validation | **zod** | API response envelopes |
| Tests | **Vitest** (node env) + **Playwright** (chromium) | |

`package.json` declares `"license": "UNLICENSED"` — deliberate, per the owner's standing rule
that no repo gets a license unless explicitly asked for. Do not add a `LICENSE` file.

**`shadcn` is a build input, not just a CLI.** `src/app/globals.css` line 2 is
`@import "shadcn/tailwind.css"`. Removing the devDependency fails the build. This has been
tried and reverted once — see §9.

### 2.2 Repository layout

```
src/app/            20 page routes + 12 API routes (App Router)
src/components/     UI; ui/ holds the shared primitives (DataTable, StatTile, MessageCard…)
src/lib/            domain logic — fatigue model, queries, season helpers, formatters, facts
src/lib/db/         schema.ts, index.ts (lazy client), queries.ts (the big read layer)
scripts/            44 Python + 22 TypeScript ingest/analysis scripts
ml/                 the fatigue-weight harness + shot-quality models (isolated Python stack)
e2e/                18 Playwright specs
docs/               architecture, pipeline, API, frontend, testing, rollover, launch day, adr/
drizzle/            migration SQL kept for the record; NOT applied by tooling
```

Size: `src/` is **37,472 lines** of `.ts` / `.tsx` / `.css`. The three largest files are
`src/lib/db/queries.ts` (1,465), `src/components/analysis-content.tsx` (1,209) and
`src/lib/fatigue.ts` (1,141).

### 2.3 The nine product modules

All nine are **published**. `/referees` was the last one held back and went live 2026-08-22
(PR #49).

| Surface | Route | What it publishes |
| --- | --- | --- |
| Games board | `/games` | any season's slate with per-game rest advantage |
| Model Results | `/analysis` | the backtest — the headline rate against the venue baseline |
| Season Report | `/season` | one season's rest ledger + "what the schedule was worth" |
| Schedule Edge | `/schedule` | net rest edge per team; never ranked across eras |
| Playoff Rest | `/playoffs` | postseason rest + the series model |
| Player Shooting | `/shooting` | shooting splits by rest state |
| Shot Value | `/shot-quality` | xeFG% surface over a court grid |
| Availability Cost | `/availability` | what a missing best player costs (≈2.86 pts ≈ home court) |
| Referee Effect | `/referees` | whistle volume and home tilt per official |

Plus the front door `/` (marketing; the one deliberately **dark** surface) and
`/behind-the-data/*` — nine method pages carrying the caveats and the published nulls.

**New modules are built as additive, isolated slices** — their own scripts, tables, route and
page — so they cannot destabilize the rest-advantage flow. This is the project's main
architectural rule and it has held across five modules.

### 2.4 Data flow

```
ESPN site.api / hoopR (sportsdataverse) / basketball-reference (by hand)
   │
   ├─ scripts/*.py, scripts/*.ts   ingest + backfill
   ↓
Supabase PostgreSQL   teams, games, fatigue_scores, predictions,
   │                  playoff_series, playoff_series_predictions,
   │                  shot_grid, shot_value_surface (raw SQL only)
   ↓
src/lib/db/queries.ts   ← publishableGames() is the mandatory seam
   ↓
src/app/api/*/route.ts   jsonRoute() + zod → { data, error } envelope
   ↓
SWR → page components → DataTable / StatTile / Recharts
```

Three surfaces have **no API route at all** and read at build/render time: `/shooting`,
`/availability`, `/referees`. They use the "facts JSON" pattern (§2.6).

### 2.5 The `publishableGames()` seam — the easiest thing to get wrong

`publishableGames()` (`src/lib/db/queries.ts`) folds in **both** `game_type = 'regular'` **and**
the abnormal-stretch regime filter. Never hand-write either predicate. Four readers had already
quietly lost the regime filter by doing exactly that; `publishable-games.test.ts` now fails if a
second copy of the predicate appears anywhere.

### 2.6 The "facts JSON" pattern

Where a module's numbers come from an offline analysis rather than a live query, the project
commits a **generated artifact**, a **typed TS constants file** that reads it, and a **test that
pins the two together**. Instances: `availability-facts`, `playoff-rest-facts`, `referee-*`,
`win-total-benchmark`, `timezone-null`, `rest-split-facts`.

It exists to enforce one rule: **published figures are pinned to generated artifacts, never
typed into prose.** A number that cannot be pinned gets rewritten so it cannot age
("every season since 1985-86", not a count).

### 2.7 Database access

`src/lib/db/index.ts` exports a **lazy `Proxy`** over drizzle/postgres-js, cached on
`globalThis.__nbaRestAdvantageDb` so hot reload and serverless invocations share one pool.
`prepare: false` (required by Supabase's pooler), `connect_timeout: 5`,
`max: DB_POOL_MAX` — **1 on Vercel, 5 locally**.

Tables declared in `src/lib/db/schema.ts`: `teams`, `games`, `fatigue_scores`, `predictions`,
`playoff_series`, `playoff_series_predictions`.

`shot_grid` and `shot_value_surface` are **deliberately absent** from `schema.ts` *and* from
`drizzle.config.ts`'s `tablesFilter`. They are read via raw SQL. This is intentional, documented,
and must not be "fixed".

Two details worth knowing before reading query code:

- `playoff_series.priorGrindDiff` — **the sign is inverted relative to every other `*_diff`
  column**, on purpose, and the schema comment says so.
- `games.homeMoneyline` / `awayMoneyline` exist but are **populated by no tracked script**.

---

## 3. Project constraints and conventions

This section preserves project context, not a new agent instruction bundle. The minimal
session-level contract is `AGENTS.md`; significant decisions are recorded in DECISIONS.md.

1. **Never run `drizzle-kit push` or `drizzle-kit generate`.** `schema.ts` intentionally lags the
   live DB; reconciling it destroys the shot tables' deliberate absence. The former Claude
   permission-deny rule was not migrated; `AGENTS.md` records the schema boundary.
2. **All schema changes are manual SQL applied by the human**, in the Supabase SQL editor. An
   agent writes the `.sql` file, hands it over, and waits. Never applies it. Never assumes it was
   applied.
3. **Coefficient changes require an explicit owner decision.** Those coefficients were
   hand-set and **ratified before the backtest ran**; tuning them against the backtest would make
   the published result circular. Structural changes go through an ADR; number changes go through
   the owner. Exactly one constant has ever moved — §9.
4. **Never rename rest-advantage identifiers**: `restAdvantage`, `restAdvantageDifferential`,
   `rest_advantage_differential`, `RestAdvCell`, `formatRestAdvantageDisplay`, and the
   `REST ADVANTAGE` / `RA` UI labels. "FullCourt" is the *product*; "rest advantage" is the
   *metric*. Branding work must not touch the metric.
5. **Never reintroduce a 50% zero line** on any chart — §1.
6. **Two retired claims must not be restated**: *"rest alone never outweighs home court at any
   magnitude"* and *"no threshold rescues it"*. Both were absolutes resting on a pooled
   41-season rate, and both were measured and retired 2026-08-06.
   `src/lib/rest-split-facts.ts` and its test hold what replaced them.
7. **Dates are US/Eastern everywhere.** `games.date` is the ET calendar date of tip-off.
   App-side "today" uses `formatEasternDateKey()` — never the viewer's local date, never server
   UTC.
8. **Never hardcode a derived season label** — use `src/lib/nba-season.ts`.
9. **Never hand-roll a signed number** — `signedNumber()` (`src/lib/signed-number.ts`), U+2212,
   bare zero, units at the call site.
10. **Never hand-roll a failure card** — `MessageCard` (`src/components/ui/message-card.tsx`)
    carries `role="alert"` on the error tone; normalize thrown values with `errMsg`
    (`src/lib/fetcher.ts`).
11. **The app is light-only** ("Broadcast"). It went light → dark → light once. `/` is the single
    deliberately dark surface, scoped to itself via the `fc-chrome-front` class — never a global
    re-theme.
12. **Python:** no Alembic. New code uses `logging`, not `print()`. HTTP goes through stdlib
    `urllib`. **Do not add `httpx`** — it is not a dependency of this repo. (`requests` is present
    only because `nba_api` and `fetch_schedule.py` use it. The older pipeline scripts
    `daily_update.py` and `fetch_schedule.py` still `print()` to the Actions log and are
    deliberately left alone.)

---

## 4. Environment and setup

### 4.1 Environment variables

**Names only** — values live in `.env.local` and `scripts/.env` (both gitignored) and in the
Vercel / GitHub Actions secret stores. Descriptions are in the committed `.env.example`.

| Name | Used by |
| --- | --- |
| `DATABASE_URL` | Next app + every TS/Python script |
| `NEXT_PUBLIC_SUPABASE_URL` | client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client |
| `CRON_SECRET` | authorizes `/api/cron/update` |
| `DB_POOL_MAX` | postgres-js pool size (1 on Vercel, 5 local) |
| `NBA_SEED_SKIP_OT` | seeding scripts |
| `NBA_API_DELAY_SECONDS` | ingest politeness delay |
| `SCREENSHOT_BASE_URL` | screenshot tooling |

### 4.2 Python — three requirements files, and they are not interchangeable

| File | Purpose |
| --- | --- |
| `requirements.txt` (root) | pinned; the general local stack |
| `scripts/requirements.txt` | loose; what the **daily-update** workflow installs |
| `ml/requirements.txt` | scipy + scikit-learn; the ML harness, deliberately isolated from the pipeline pins |

`ci.yml` runs the stdlib-only schedule contracts and the playoff grind contracts. The latter
need only `psycopg2-binary` at import time, constrained by `ml/requirements.txt`; CI does not
install the full ML environment or connect to the database.

**Always run pipeline scripts from the project root.** `daily_update.py` and the backfills
resolve the repo root relative to the file, and the `tsx` scripts rely on the `@/*` alias.

### 4.3 Commands

```bash
pnpm dev            # next dev
pnpm build          # next build
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit --incremental false
pnpm test:run       # vitest run
pnpm test:e2e       # playwright   (NOT part of the commit gate)
```

**The commit gate is exactly four commands**: `pnpm test:run`, `pnpm typecheck`, `pnpm lint`,
`pnpm build`.

**Playwright is deliberately outside the gate and is not run in CI** — its specs need a running
server and a populated database. **Run `pnpm test:e2e` by hand whenever a route moves or header
copy changes.** Learned the hard way: two broken links shipped because `not-found.tsx` and
`error.tsx` are reachable by no routing at all, so link sweeps miss them. **(conversation-only)**

A useful trick from `docs/TESTING_AND_CICD.md` — prove the build works without a database:

```bash
mv .env.local .env.local.bak && pnpm build; mv .env.local.bak .env.local
```

### 4.4 The pnpm workspace quirk

`pnpm-workspace.yaml` exists (with an empty `packages:`), which makes the repo root a
**workspace root**. Adding a root dependency therefore requires `pnpm add -w <pkg>`, or pnpm
refuses.

That file is also the home of the dependency **overrides**. There are currently **five**, each
pinning out a CVE and each commented with its advisory: `@babel/core`, `browserslist@<4.28.7`,
`postcss@<8.5.23`, `sharp@<0.35.0`, `ws`. It also carries the pnpm-11 `allowBuilds:` map
(`esbuild: true`; `msw`, `sharp`, `unrs-resolver` false).

---

## 5. External services and data sources

### 5.1 Reachability matrix — hard-won, and easy to re-break

| Source | Status |
| --- | --- |
| **ESPN `site.api` scoreboard** | **works** — the live-score and schedule path |
| **hoopR / sportsdataverse** | **works** — box scores and shot data |
| **basketball-reference** | reachable, but **by hand only** — ToS §5(i)/(ii)/(j), ADR 0002 |
| **`cdn.nba.com`** | **403s everywhere** — Seoul and US CI runners alike |
| **`stats.nba.com`** | **times out** from Seoul **and** from US CI — a datacenter block, not a geo block |

Both NBA-owned sources were blocked at the 2026-08-18 probe. The daily run on 2026-09-05 again
logged a CDN 403 and used the calendar fallback; this does not re-verify Stats API reachability.
`.github/workflows/probe-data-sources.yml` re-measures this on manual dispatch;
`docs/LAUNCH_DAY.md` §6 records **which probe row to believe** about ESPN, because one of them
produces a false negative.

A gotcha that cost real time: **a Mozilla user-agent trips Akamai** on some of these endpoints.
**(conversation-only; the working headers are now in the ingest scripts)**

### 5.2 Deployment and scheduled jobs

| Thing | Config | Schedule |
| --- | --- | --- |
| Hosting | Vercel, region **`hnd1`**; `main` deploys directly to production | Branch previews and production auto-deployment verified in Vercel on 2026-09-05; no separate staging gate |
| Live-score cron | `vercel.json` → `/api/cron/update` | `0 7 * * *`, daily year-round |
| Nightly pipeline | `.github/workflows/daily-update.yml` → `scripts/daily_update.py` | `0 21 * * *` |
| CI | `.github/workflows/ci.yml` | on PR / push |
| Source probe | `.github/workflows/probe-data-sources.yml` | manual dispatch only |

The Vercel cron runs year-round with **no seasonal cadence switch**: `/api/cron/update`
early-returns before any ESPN fetch when neither ET date it checks (yesterday and today — it
fires at 2–3 AM ET) has a `scheduled|live` row, so an off-season run costs one indexed query.

The Actions season gate is different: `scripts/season_window.py` first fetches the NBA CDN
schedule, then uses an October–April fallback if that fails. Offseason runs avoid database
access and score ingestion, but do make that network request. Older comments saying "before
any API" are stale.

**A related trap, learned the expensive way:** moving a cron's clock invalidates any date it
derives from "now". `/api/cron/update` wrote nothing for four days after one such move.
**(conversation-only)**

**CI step order matters and was changed on purpose.** `ci.yml` runs: frozen install → lint →
typecheck → vitest → schedule contracts → playoff grind contracts → build →
**`pnpm audit --prod` last**. The audit moved from
first to last on 2026-09-02 (§9). `--prod` and not a bare audit: the dev tree carries ~55
advisories that never reach a user, **38 of them reachable only through `shadcn`**, and a noisy
gate is one everybody learns to skip.

---

## 6. What currently works

All nine product surfaces are published. The validation table above records the previous
handoff's checks; live-slate behavior and real-device observations remain unproven below.

- All **nine product modules**, plus the front door and nine `/behind-the-data` method pages.
- **916 unit tests** across 67 files; **17 Playwright specs** (249 checks) including
  `accessibility.spec.ts` (`@axe-core/playwright`) and `layout-integrity.spec.ts`, each walking
  all 20 routes at two viewports.
- The **2026-27 season is seeded** — 1,200 games from ESPN on 2026-08-18, keyed `espn-<eventId>`,
  cross-checked against Fox Sports, with **projected fatigue** so the season has real rest
  advantage before it starts. (Projected ≠ unplayed: opening night is measured.)
- The **nightly pipeline rewrite** (ESPN-based) is verified against historical data — zero writes
  needed over dates already correct, and a deliberately perturbed row correctly repaired.

## 7. What is partially implemented or unproven

| Item | State |
| --- | --- |
| **The nightly pipeline has never run on a live slate.** | Rewritten 2026-08-18 and verified historically, but it cannot be exercised for real until **2026-10-20**. `docs/LAUNCH_DAY.md` exists for this check and records that the Actions run *on* 10-20 fires before tip-off and correctly writes nothing — **the run to check is 2026-10-21's**. |
| **Shooting-by-Rest will carry no 2026-27 data until those rows are re-keyed.** | `scripts/analyze_player_shooting.py` filters `external_id LIKE '002%'` and joins hoopR box scores on that id; 2026-27 is keyed `espn-<eventId>`. The re-key script is built and waiting on played games. The approved cadence is monthly from January 2027, plus a final pass after the regular season ends, reviewing a dry run each time (DECISIONS.md D-37). |
| **Small-screen discoverability** | The nav edge-fade affordance shipped 2026-08-15; whether it aids discovery is **unmeasured**. Needs one hand check on a real device. |
| **iOS form-control zoom** | Fixed in code (16px floor at phone widths, pinch-zoom preserved) and asserted in e2e, but wants one hand check in real Safari. |
| **Front-door motion** | Never reviewed by eye on a real device. **(conversation-only)** |
| `games.homeMoneyline` / `awayMoneyline` | Columns exist; no tracked script populates them. |

## 8. What is broken

One thing, and it is broken on purpose:

- **The `seed-season` path in `daily-update.yml` is BROKEN.** The workflow comment says so
  explicitly — it is "kept only because it costs nothing to keep". This is a deliberate
  retention, not a bug awaiting a fix.

Nothing else is known-broken. There are **zero** TODO/FIXME/HACK/XXX comments in the entire
codebase.

---

## 9. Recent major development

Reverse-chronological. The full rationale for each is in [DECISIONS.md](DECISIONS.md); this is
the shape of the last few weeks.

- **2026-09-02 · the overnight browserslist advisory (PR #76).** A **docs-only** commit turned
  `main` red. The cause was `pnpm audit --prod` — the newly-added *last* CI step — picking up a
  `browserslist` advisory published overnight. Recipe: add an override, regenerate the lockfile.
  Durable lesson: **a red `main` on a docs-only commit is almost always the audit step, not the
  commit.**
- **2026-09-01 · the checkpoint audit (PR #75).** Six findings: five fixed, one measured and
  refused. Two were accessibility/layout defects the redesign round had shipped that **no gate
  could see**; two were the guards that would have caught them — and the guards landed **first,
  failing on the unfixed code**. Also closed here: `pnpm audit --prod` became a CI gate, the ⌘K
  palette moved to `next/dynamic`, and `/api/games/search` got a cache policy.
- **2026-08-28 → 29 · the UI redesign round.** Six stages built overnight; merge queue
  #69 → #70 → #71 → #72 → #73, rehearsed conflict-free.
- **2026-08-22 · `/referees` published** (PR #49), after being held back since 2026-07-30.
- **2026-08-18 · four things in one day** — the 2026-27 schedule ingest, the nightly pipeline
  rewrite, projected fatigue, and the time-zone null.
- **2026-08-09 → 24 · brand and design** — the "Front Office" direction, the Split Ink mark, the
  FULLCOURT optical-kerning table, the eight-step type scale, the two-rail alignment law.
- **2026-08-02 · the one ratified constant that moved.** `ALTITUDE_MULTIPLIER` 1.15 → 1.29 — the
  first ratified coefficient ever changed on measured evidence, approved by the owner, reasoned
  in the constant's own docblock and in ADR 0006. **It was fitted against final margin, not
  against the win rates the site publishes** — which is exactly what keeps it non-circular.
  `ALTITUDE_CARRYOVER_MULTIPLIER` was deliberately **not** moved with it.

### 9.1 The fatigue-weight harness — read this before proposing a model change

The coefficient ban was suspended **once**, deliberately, to find out whether fitted weights
would beat the ratified ones. **They do not, by enough to matter.** The initial conditional fit
gave travel, rest and workload zero or negative weights. ADR 0006's amendment retracts the
broader "travel carries no signal" interpretation: little independent information after
conditioning on correlated terms is not the same as no useful contribution to call selection.

Read [ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md) before
proposing either a refit or a new factor — it records what was already tried and measured.
Answer questions of this shape with the harness, **never with a database recompute**. It is
**three** steps and the middle one is not optional:

```
scripts/export_fatigue_features.ts   →  ml/data/fatigue_features.csv
ml/prepare_fatigue_dataset.py        →  ml/data/fatigue_model_table.csv
ml/fit_fatigue_weights.py            →  reads fatigue_model_table.csv
```

**Skipping `prepare` fails silently.** `fatigue_model_table.csv` is already on disk from the
2026-08-02 run, so the fit succeeds against a stale table and reports numbers that look valid.

---

## 10. Git state at takeover

Snapshot independently checked on 2026-09-05, before publishing the takeover work:

| | |
| --- | --- |
| Checked-out branch | **`docs/roadmap-pr76-note`** @ **`51588c4`** |
| Working tree | **Modified ROADMAP.md; untracked PROJECT_HANDOFF.md, DECISIONS.md and CLAUDE_ENV_INVENTORY.md; AGENTS.md ignored.** The earlier clean-tree claim was stale. |
| Local `main` | **`df87e41`** — behind origin |
| `origin/main` | **`f93c9e0`** |
| Commits on `origin/main` | **603**; the old checkout's count was 604 |
| Open GitHub issues | **0** — all 12 ever filed are closed |
| Pull requests | **64, all merged**; the prior count of 67 was wrong. No closed-unmerged PRs or releases. |

**Resolved by the approved takeover:** local `main` was fast-forwarded to `f93c9e0`, and the
documentation was preserved on `chore/codex-takeover`, based on that commit. The owner chose to
abandon reviewer-only `51588c4`; its predecessor's roadmap note was already squash-merged as
PR #77. No product implementation was left behind.

**Maintenance follow-up, 2026-09-05:** PR #78 completed the takeover on `main`. The remaining
old branches were checked against merged PR heads and current patches, then archived outside
the repository and retired. No unshipped product implementation or open PR/issue queue remained.

**On git history:** the repository was rewritten with `filter-branch` on 2026-07-27 to strip
`Co-Authored-By: Claude` trailers. The mechanism remains **conversation-only**; the associated
attribution preference is historical, not inherited (DECISIONS.md D-07, D-48).

---

## 11. Technical debt and temporary hacks

Ranked by how likely each is to bite.

1. **`schema.ts` deliberately lags the live DB.** Two tables are absent on purpose. Any tool or
   agent that "syncs" the schema breaks this. `AGENTS.md` records the constraint; the former
   Claude permission-deny configuration was not migrated.
2. **Five CVE overrides in `pnpm-workspace.yaml`** are a standing maintenance surface — each pin
   must be revisited when upstream ships a fixed release.
3. **The `seed-season` path in `daily-update.yml` is knowingly broken** and retained.
4. **A float boundary in RA thresholds.** Published `RA ≥ N` counts sit about one game below what
   a naive SQL check returns, because `2.76 − 0.76 = 1.9999999999999998`. Site-wide,
   **deliberately not fixed**, and it does **not** break the `/analysis` ↔ `/season` invariant.
   **(conversation-only)**
5. **`priorGrindDiff`'s inverted sign** is correct, but it is a trap for anyone reading `*_diff`
   columns uniformly.
6. **Inline `style` outranks `hover:` utility classes**, so a hover state silently never paints.
   This shipped twice (PRs #33, #38). A sweep script exists; its false-positive rate was 7 of 11.
   **(conversation-only)**

---

## 12. Important unresolved questions

- **Will the nightly pipeline work on a live slate?** Unknown until 2026-10-21. This is the
  single largest open risk in the project.
- **Does the small-screen nav fade actually aid discovery?** Unmeasured; needs a real device.
- **Should the month/day chip rows on `/games` get the same edge fade?** Explicitly deferred
  until the nav's fade proves itself.
- **`docs/PLAYOFF_PREDICTOR_DESIGN.md` §7 lists seven "open questions"** — seed source of truth,
  play-in row tagging, series-format flag precision, lockout/COVID normalization, test-set size,
  prediction timing/UX, headline feature variant. **Most were answered by the build itself and
  the section was never updated.** Treat it as design history, not a live backlog. This is the
  most likely place for a new agent to resurrect settled questions.

## 13. Current development focus

The project is **feature-complete and in pre-launch maintenance**. The tracker is empty and the
last audit's findings are all closed. Between now and **2026-10-20** the only committed work is
operational readiness: the launch-day check, the January re-key, and keeping dependencies and
the audit gate green.

The clean-slate takeover is approved (DECISIONS.md D-48). Project context is preserved without
inheriting the old harness. Model evaluations still follow the pre-registration protocols in
ADRs 0006 and 0007.

---

## 14. Where to read next

| Question | File |
| --- | --- |
| Why is it like this? | [DECISIONS.md](DECISIONS.md) and [adr/](adr/) |
| What's next? | [ROADMAP.md](ROADMAP.md) |
| End-to-end data flow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Tables, indexes, RLS | [DATABASE.md](DATABASE.md) |
| Every script + the full fatigue math | [DATA_PIPELINE.md](DATA_PIPELINE.md) |
| Every API route | [API.md](API.md) |
| Pages, components, design tokens | [FRONTEND.md](FRONTEND.md) |
| **Building a new page** — start here | [ADDING_A_SURFACE.md](ADDING_A_SURFACE.md) |
| UI/UX conventions: adopted, open, refused | [UIUX_CHECKLIST.md](UIUX_CHECKLIST.md) |
| Tests and CI | [TESTING_AND_CICD.md](TESTING_AND_CICD.md) |
| Domain language | [GLOSSARY.md](GLOSSARY.md) |
| Season rollover runbook | [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md) |
| **The first live slate (2026-10-20)** | [LAUNCH_DAY.md](LAUNCH_DAY.md) |
| Brand direction | [design/BRAND_GRAMMAR.md](design/BRAND_GRAMMAR.md) |
| Playoff Predictor design record | [PLAYOFF_PREDICTOR_DESIGN.md](PLAYOFF_PREDICTOR_DESIGN.md) |
| Shot Quality design record | [SHOT_QUALITY_DESIGN.md](SHOT_QUALITY_DESIGN.md) |
| What the Claude harness used to be | [CLAUDE_ENV_INVENTORY.md](CLAUDE_ENV_INVENTORY.md) |
