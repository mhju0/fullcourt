# FullCourt — Product/UX Audit (2026-07-10)

Read-only audit. Personas: Recruiter · NBA Fan · Product Manager · Senior Engineer · Blunt Operator.
Method: CLAUDE.md + docs/ read first, then every claim re-verified against code at HEAD
(`855e1a4`, local main == origin/main) and against the **live site** (fullcourt-nba.vercel.app,
probed 2026-07-10 ~13:18–13:35 UTC). Evidence tags: `[Verified …]` / `[Inferred]` / `[Unknown]`.

---

## Executive summary (bluntest version)

1. **The live site intermittently 500s on the first hit after idle** — observed live today on
   `/api/playoffs` and `/api/shot-quality`; identical URLs returned full data minutes later. In the
   offseason *every* recruiter visit is a cold hit, and the landing page's fetches have **no retry**.
2. **The landing page lies about what it shows**: "Today's Matchups / GAMES TODAY" renders the last
   April slate, under a fake hardcoded ticker and a "2025-26 SEASON" label, with zero offseason
   acknowledgment.
3. **The site never links to the repo or the author.** The engineering story — the actual product —
   is unreachable from the thing recruiters will see first.
4. The prompt's known-issues list is ~70% stale: glassmorphism, duplicate h1, dead accuracy route,
   TeamRow, hardcoded win rate, stale e2e — all already fixed and verified. Remaining: ticker, CI,
   README screenshot.
5. One NEW real interaction bug on the flagship page: after clicking a chart bar, the Explore RA
   filter is permanently stuck (dropdown and CLEAR FILTERS silently revert).
6. Two time-bombs detonate ~Oct 1 2026 (mid-application-season): `/upcoming` hardcodes season
   2025-26 → will show "no games" while real games exist; nav label goes stale.
7. Strengths to double down on: `/analysis` is genuinely excellent, honest, and interactive; a11y is
   strong; tests are green (78/78); live numbers match README claims exactly.

---

## Findings table

Severity: **P0** = first-impression killer · **P1** = fix before applications · **P2** = nice · **P3** = ignore.
Status: **[NEW]** found by this audit · **[KNOWN]** from the given list / ROADMAP · **[RESOLVED]** known issue verified already fixed.

| ID | Persona | Sev | Status | Evidence | User impact (one line) |
|----|---------|-----|--------|----------|------------------------|
| F-01 | Recruiter | **P0** | [NEW] | [Verified live 500s + `src/app/page.tsx:275,342`] | First visitor after idle can land on unrecoverable error states on the landing page. |
| F-02 | Recruiter/PM | **P0** | [NEW] (subsumes 3 KNOWNs) | [Verified `page.tsx:421,77` + `nav-bar.tsx:15-26` + live fetch] | In July, `/` claims "Today's Matchups" while silently showing April games under a fake ticker. |
| F-03 | Recruiter | **P0** | [NEW] | [Verified: grep `github` in src → 0 hits; `layout.tsx:69-71`] | No path from the live site to the repo or author — the portfolio can't sell itself. |
| F-04 | NBA Fan | **P1** | [NEW] | [Verified `analysis-content.tsx:323-326,639-649`; `api/analysis/route.ts:18`] | After clicking a chart bar, the Explore RA filter is stuck; dropdown + CLEAR FILTERS silently revert. |
| F-05 | PM | **P1** | [NEW] | [Verified `upcoming-content.tsx:98`, `api/games/upcoming/route.ts:14`, `nav-bar.tsx:24`] | On Oct 1 2026 `/upcoming` shows "NO SCHEDULED GAMES" while real games exist; nav season label stays 2025-26. |
| F-06 | PM | **P1** | [KNOWN] | [Verified `nav-bar.tsx:15-22,26`] | Fake ticker values (and dormant LIVE flag) look like live data on every page; ROADMAP leaves it open. |
| F-07 | Recruiter | **P1** | [KNOWN·ROADMAP A-4] | [Verified `README.md:17-19`] | Visual product, text-only README — recruiters skim GitHub for 30 seconds and see no product. |
| F-08 | Sr. Engineer | **P1** | [KNOWN·ROADMAP A-3] | [Verified `.github/workflows/` = daily-update.yml only] | No test/lint CI: "Tested" claim has no green check an evaluator can see. |
| F-09 | PM | **P1** | [NEW] | [Verified `page.tsx:79,227-230` + `api/analysis/route.ts` semantics] | Home stat labeled "SEASON WIN RATE" is actually the ~40-season all-time rate — mislabel undermines trust. |
| F-10 | Recruiter | **P1** | [NEW] | [Verified `layout.tsx:20-27`; no openGraph/twitter in src] | Link shared in LinkedIn/KakaoTalk/Slack renders with no preview card; favicon likely default [Unknown]. |
| F-11 | NBA Fan | **P1** | [NEW] | [Verified `matchup-card.tsx:386-394`; 5 routes only] | RA, B2B, 3IN4, 4IN6, ALT, COAST, HIGH CONF are never explained on `/`; no glossary/about anywhere. |
| F-12 | NBA Fan | **P2** | [NEW] | [Verified `page.tsx:25-30` vs comment `page.tsx:370-375`] | Month tab click selects the *last* day of the month; code comment says first — minor UX + comment drift. |
| F-13 | Sr. Engineer | **P2** | [NEW] | [Verified `fetcher.ts:7-12`] | `apiFetcher` ignores `res.ok`; a non-JSON 500 surfaces as a raw "Unexpected token" parse error in the UI. |
| F-14 | Sr. Engineer | **P2** | [NEW] | [Verified `public/` listing] | Default Next.js starter SVGs (next.svg, vercel.svg…) still committed — reads as scaffold not product. |
| F-15 | Sr. Engineer | **P2** | [NEW] | [Verified FRONTEND.md:15,49,65-66 vs `layout.tsx:61`, `upcoming/page.tsx`, `shot-quality/page.tsx:8-24`] | docs/FRONTEND.md describes a footer and headers that no longer exist — doc drift in a docs-heavy repo. |
| F-16 | Sr. Engineer | **P2** | [KNOWN, mostly fixed] | [Verified `README.md:99-114` vs `schema.ts` (no shot tables)] | README quickstart (`drizzle-kit push`) yields a DB without shot tables → fresh-clone `/shot-quality` 500s. |
| F-17 | NBA Fan | **P2** | [NEW] | [Verified `queries.ts:63-66,590,632,796` + `nba-season.ts:49-52`] | Hardcoded Oct-1→Apr-30 window silently drops May regular-season games (2020-21, 1998-99) from browse *and* backtest. |
| F-18 | PM | **P2** | [NEW] | [Verified `playoffs-content.tsx:394`, `shot-quality-content.tsx:404` + `nba-season.ts:106-110`] | After Oct 2026 rollover, `/playoffs` and `/shot-quality` default to season 2026-27 → empty page by default. |
| F-19 | Recruiter | **P2** | [NEW] | [Verified live footer "RENDERED: 2026-07-04" fetched 2026-07-10; `layout.tsx:37-38`] | Footer timestamp is frozen at build time; labeled honestly ("RENDERED") but reads stale after quiet weeks. |
| F-20 | — | — | [RESOLVED] | [Verified `upcoming-content.tsx`, `explore-game-detail-modal.tsx`: terminal styles, 0 glass classes; commit `0a1d40f`] | KNOWN "glassmorphism on /upcoming + modal" — already migrated. |
| F-21 | — | — | [RESOLVED] | [Verified `analysis/page.tsx:8-12` + single h1 `analysis-content.tsx:690`] | KNOWN "/analysis renders h1 twice" — already fixed. |
| F-22 | — | — | [RESOLVED] | [Verified e2e/*.spec.ts selectors match current markup; commits `7d61162`,`7f32535`] | KNOWN "stale e2e specs" — rewritten for terminal UI (still integration-style, not in CI → F-08). |
| F-23 | — | — | [RESOLVED] | [Verified no `api/analysis/accuracy` on disk; ROADMAP §Track-A-2] | KNOWN "unused accuracy endpoint" — removed 2026-06-29. |
| F-24 | — | — | [RESOLVED] | [Verified `page.tsx:227-230` live SWR fetch] | KNOWN "SEASON_WIN_RATE 53.5% hardcoded" — now live (label issue remains → F-09). |
| F-25 | — | — | [RESOLVED] | [Verified grep TeamRow/tracker → 0 hits] | KNOWN "TeamRow no-op export, /tracker references" — gone. |
| F-26 | — | — | [RESOLVED] | [Verified `.gitignore:12` + `git ls-files`] | KNOWN "mixed lockfiles": package-lock.json is gitignored — invisible on GitHub (local-disk nit only). |
| F-27 | — | P3 | [KNOWN] | [Unknown — needs live season] | Realtime live-score path unverifiable until October; manual checklist item. |

---

## Per-finding detail (P0/P1)

### F-01 — Cold-start 500s + no-retry landing fetches (P0, NEW)

**Observed live**: at ~13:18 UTC today, `GET /api/playoffs?season=2025-26` and
`GET /api/shot-quality?season=2025-26` both returned **HTTP 500**. `/api/health`
(`{"status":"ok","db":"up"}`) and `/api/analysis` succeeded moments later, and the *same two URLs*
(with a cache-busting param) returned **200 with complete 2025-26 data** — full playoff bracket
(NYK champion, 15 series, 66.7% accuracy both methods) and a populated shot surface. So the data is
fine; the failure is transient and correlated with the first burst of requests after idle.
[Verified live probes 2026-07-10]

**Mechanism** [Inferred, needs Vercel logs]: offseason idle → the season-gated GitHub cron exits
before touching the DB, the Vercel cron runs monthly → the DB/connection path is stone cold when a
visitor arrives; the first parallel lambda invocations fail to establish connections in time.
Root cause is [Unknown] from source alone — both route handlers and query mappers are null-safe and
would return 200-empty for missing data ([Verified `api/playoffs/route.ts:73-112`,
`queries.ts:990-1053,1121-1155`]).

**Why P0**: recruiters visit exactly during this idle window. Client behavior on failure:
- `/analysis`, `/playoffs`, `/shot-quality`, `/upcoming` use SWR → default error-retry eventually
  recovers, but the visitor stares at a red "FAILED TO LOAD" card first. [Verified swr usage]
- `/` (the landing page) uses **plain `fetch` in `useEffect` with no retry** for both
  `/api/games/dates` and `/api/games/{date}` — an error renders permanently until a manual reload.
  [Verified `page.tsx:261-326,328-361`]

### F-02 — Offseason landing page misrepresents itself (P0, NEW; subsumes KNOWN ticker/label/live-flag)

Trace for a July visitor [Verified `nba-season.ts:112-135` + `page.tsx:293-304`]:
`defaultNbaSeason()` → "2025-26"; the initial no-month dates fetch returns the whole season;
`pickDefaultGamesDate("2026-07-10", …)` falls through to `lastDate` → the **final day of the
2025-26 regular season (mid-April)**. The page then shows:

- h1 **"Today's Matchups"** + stat card **"GAMES TODAY: n"** — for April games ([Verified
  `page.tsx:421,77,404`]). The only honest signal is the small date line ("…APRIL …, 2026").
- Top bar **"2025-26 SEASON"** — a season that ended weeks ago ([Verified `nav-bar.tsx:24`, live]).
- A marquee **TICKER with six hardcoded fake RA values** styled exactly like live data
  ([Verified `nav-bar.tsx:15-22,138-148`]).
- Pre-hydration the stat row is `0 / 0.0 / — / 0` ([Verified live fetch of `/`]).

Nothing anywhere says "offseason". Contrast: `/upcoming` has a genuinely good
`OffSeasonEmptyState` ("REGULAR SEASON COMPLETE / See you next season / 2026-27 tips off in
October") ([Verified `upcoming-content.tsx:49-61`]) — the landing page has no equivalent.
A recruiter's 10-second read: *stale site with fake numbers*, when the truth is a live DB and an
honest backtest one click away.

### F-03 — No site → repo/author path (P0, NEW)

`grep -ri github src/` → zero hits; footer is unlinked text "BUILT BY MJ"
([Verified `layout.tsx:69-71`]). The README links site←repo, but the live site — the link most
likely to be shared — is a dead end for anyone wanting the code, the model math, or the author.
For a hiring evaluator this is the single cheapest, highest-leverage fix in the whole audit.

### F-04 — Explore Games RA filter gets stuck after a bar click (P1, NEW)

`ExploreGames` syncs prop→state during render:
`if (initialRaFilter !== raFilter && initialRaFilter !== 0) setRaFilter(initialRaFilter)`
([Verified `analysis-content.tsx:323-326`]). `initialRaFilter` comes from `drillRaFilter`, set
only by chart-bar clicks ([Verified :639-649,873]) and never reset (thresholds are `[2,3,5,7]` —
there is no 0 bar; [Verified `api/analysis/route.ts:18`]). Sequence: click "RA ≥ 3" bar → change
the dropdown to "RA ≥ 7" → render sync silently snaps it back to 3. **CLEAR FILTERS also cannot
clear it.** The flagship interactive flow ("click a bar to explore") breaks the page's own filter
UI for the rest of the session. Failure is silent — no error, the dropdown just "doesn't work".

### F-05 — Season hardcodes detonate Oct 1 2026 (P1, NEW)

`upcoming-content.tsx:98` pins `season = "2025-26"`. Offseason logic
(`today > 2025-26.to && today < 2026-27.from`) correctly shows the empty state **until Sep 30**.
From **Oct 1 2026**, `isOffSeason` goes false while the query still asks for 2025-26 scheduled
games ≥ today → permanently "NO SCHEDULED GAMES MATCH THIS FILTER" while the new season is in
full swing ([Verified logic trace `upcoming-content.tsx:98-104,172-181` +
`queries.ts:791-797`]). Server default duplicates the pin ([Verified
`api/games/upcoming/route.ts:14`]); nav `SEASON_LABEL` and playoffs `DEFAULT_SEASON` are siblings
([Verified `nav-bar.tsx:24`, `api/playoffs/route.ts:19`]). Applications will still be live in
October — this breaks the "PICKS" page during interviews.

### F-06 — Fake ticker (P1, KNOWN)

Six hardcoded team/RA pairs with up/down arrows in a marquee on **every** page
([Verified `nav-bar.tsx:15-22`]). ROADMAP Track A explicitly left it open. It is the most
prominent "is this thing real?" trigger on the site — and the answer, for that element, is no.

### F-07 — README has no screenshot (P1, KNOWN·ROADMAP A-4)

The placeholder comment sits exactly where the image should be ([Verified `README.md:17-19`]).
Everything else in the README now holds up: live numbers match (`overallWinRate` 54.8 / RA≥5 61.1
[Verified live `/api/analysis`] vs "~55% / ~61%" [Verified `README.md:13`]), stack claims match
package.json, honest ML framing is present.

### F-08 — No test/lint CI (P1, KNOWN·ROADMAP A-3)

Only `daily-update.yml` exists ([Verified `.github/workflows/`]). Local reality is good —
**78/78 Vitest tests pass in 11 files, eslint clean** ([Verified via scratchpad re-read of
`pnpm test:run` / `pnpm lint` output, 2026-07-10]) — but an evaluator can't see that.

### F-09 — "SEASON WIN RATE" mislabel (P1, NEW)

The home stat card fetches `/api/analysis` `overallWinRate`, which aggregates **all ~40 seasons**
(38,975 games live) ([Verified `page.tsx:227-230,79` + `api/analysis/route.ts:38-124`]). Calling
it "SEASON WIN RATE" is wrong in a way a stats-literate evaluator will catch. "ALL-TIME WIN RATE"
or "BACKTEST WIN RATE" is both honest and more impressive (40 seasons > 1 season).

### F-10 — No OpenGraph/social metadata (P1, NEW)

`layout.tsx` metadata has title/description only; zero `openGraph`/`twitter` fields in src
([Verified grep]). Shared links (the primary distribution channel for a portfolio) render bare.
Favicon exists at `src/app/favicon.ico` but whether it's custom or the Next default is
[Unknown — manual check].

### F-11 — Jargon without a decoder ring (P1, NEW)

MetaStrip chips `AWAY B2B / 3IN4 / 4IN6 / ALT / COAST / OT` have no tooltips or expansion
([Verified `matchup-card.tsx:386-394`]); `HIGH CONF / MED CONF` thresholds are never stated in the
UI; the fatigue score scale (0–10, `SCALE_MAX = 10`) is never explained. The expanded card decodes
B2B/3-in-4/4-in-6 but not ALT/COAST. `/analysis` and `/shot-quality` have good explanatory copy;
`/` (and the whole site) has no methodology/about/glossary destination. A recruiter who is not an
NBA-stats person cannot self-serve the impressive part — *why* this model exists.

---

## Notable positives (evidence-backed, keep as-is)

- `/analysis` is the portfolio centerpiece: honest coin-flip reference line, n= labels, clickable
  threshold bars, filterable 38k-game explorer, drill-down modal with history stack
  ([Verified `analysis-content.tsx` throughout]).
- Accessibility is far above portfolio norm: focus trap + focus restore + aria-modal in the modal,
  keyboard-expandable cards, aria-pressed month tabs, progressbar semantics on fatigue bars
  ([Verified `explore-game-detail-modal.tsx:267-302`, `matchup-card.tsx:615-620`, `fatigue-bar.tsx`]).
- Honest-framing culture: OOS-vs-in-sample header on `/playoffs`, methodology note on
  `/shot-quality`, "RENDERED" footer, "THIS DOES NOT READ STORED PREDICTION ROWS" descriptor
  ([Verified respective files]).
- `/upcoming` OffSeasonEmptyState is exactly the pattern `/` is missing.
- 2025-26 playoff data is complete and live (full bracket, champion, per-series predictions)
  [Verified live `/api/playoffs?season=2025-26`].

---

## Verdicts (Blunt Operator)

**What breaks first**: the first 60 seconds. Cold hit → possible unrecoverable error on `/` (F-01);
if it loads, the page claims "today" while showing April under a fake ticker (F-02); and if the
visitor is impressed anyway, there is no link to the code (F-03). Everything else is downstream.

**What the top 3% would do differently**: treat the offseason as a *feature* — an explicit
"SEASON COMPLETE — explore the 40-season backtest" landing state that funnels to `/analysis`;
a 15-second GIF at the top of the README; CI badges that prove the tests run; and one screen of
"how the model works" so the sophistication is legible without reading the code.

**The ONE page**: `/analysis`. It best demonstrates data volume, honesty, interactivity, and
engineering. The site currently does nothing to funnel visitors there — the offseason banner
(F-02 fix) should point at it.

**Cut (delete/hide, don't polish)**:
- The fake ticker (F-06) — delete the marquee or replace items with live top-RA values only if
  trivial; do not invest in it.
- Default Next.js starter SVGs in `public/` (F-14).
- `package-lock.json` on local disk (F-26) — already gitignored; delete the file, zero risk.

**Double down**:
- `/analysis` as the funnel target from `/` and from the README.
- The honest-ML framing (playoffs calibration win, shot-quality ~1% win) — it's a differentiator in
  interviews; make sure the README's "Engineering highlights" links to those pages.
- The a11y + empty-state discipline — extend the `/upcoming` empty-state pattern to `/`.

---

## DRAFT ROADMAP

Sizing: S ≤ ~1h · M = half-day · L = multi-day. Constraints honored: no `fatigue.ts` edits, no
RA-identifier renames, no `drizzle-kit push/generate`, schema changes only via manual SQL, NBA-only.

### NOW (before any link goes out) — total ≈ 1 day

| # | Item | Size | Rationale / notes |
|---|------|------|-------------------|
| 1 | Footer + nav link to GitHub repo and author (F-03) | **S** | Highest leverage-per-minute in the audit. |
| 2 | Offseason banner on `/`: "2025-26 SEASON COMPLETE — SHOWING FINAL SLATE (APR …). EXPLORE THE 40-SEASON BACKTEST →" linking `/analysis`; gate on the existing `regularSeasonDateBounds` logic already proven in `upcoming-content.tsx` (F-02) | **S** | Turns the worst first impression into a funnel to the best page. |
| 3 | Delete the fake ticker marquee, or reduce to a static tagline strip (F-06) | **S** | Cutting is fine; wiring it live is NOT worth it now. |
| 4 | Derive nav `SEASON_LABEL` from `nba-season.ts` helpers; derive `/upcoming` + `/api/games/upcoming` season the same way (F-05) | **S** | Defuses the Oct 1 time-bomb and the stale top bar in one pass. |
| 5 | Fix the Explore RA stuck-filter sync (lift to controlled prop or reset `drillRaFilter` after applying; remove render-time setState) (F-04) | **S** | Silent interaction bug on the centerpiece page. |
| 6 | Rename home stat to "ALL-TIME WIN RATE" (or "BACKTEST WIN RATE") (F-09) | **S** | One-string fix; removes a trust landmine. |

### BEFORE APPLICATIONS — total ≈ 2–3 days

| # | Item | Size | Rationale / notes |
|---|------|------|-------------------|
| 7 | Cold-start resilience: move `/` date/games fetches to SWR (retry for free, matches every other page) + `res.ok` check in `apiFetcher` (F-01, F-13) | **M** | Fixes the unrecoverable landing-page error path regardless of root cause. |
| 8 | Diagnose the idle-500s in Vercel/Supabase logs; if it's DB wake-up, consider a light daily `/api/health` warm-up cron (decision: owner — touches `vercel.json`) (F-01) | **M** | Root cause is [Unknown]; don't guess-fix infra, read the logs first. |
| 9 | README screenshot or 15s GIF at the placeholder (F-07, ROADMAP A-4) | **M** | Single highest-impact repo change; take it from `/analysis`, not the offseason `/`. |
| 10 | CI workflow: `pnpm lint` + `pnpm test:run` on push/PR + README badge (F-08, ROADMAP A-3) | **S** | Makes "tested" externally true. e2e stays local (needs seeded DB). |
| 11 | OpenGraph/Twitter metadata + confirm custom favicon (F-10) | **S** | Every shared link becomes a card with the product shot from #9. |
| 12 | Minimal glossary: `title=` tooltips on MetaStrip chips + a compact "METHODOLOGY" expandable (or footer link) explaining fatigue scale, RA, confidence thresholds (F-11) | **M** | Makes the model legible to non-NBA evaluators without a new page. |

### LATER (post-application polish)

| # | Item | Size | Rationale |
|---|------|------|-----------|
| 13 | Default `/playoffs` & `/shot-quality` season to latest-with-data instead of `defaultNbaSeason()` (F-18) | **S** | Prevents empty-by-default pages after October. |
| 14 | Month-tab default day: pick first day of month (align code with its own comment) (F-12) | **S** | Tiny; do alongside other `/` work. |
| 15 | Decide on May-tail games (2020-21, 1998-99): either widen the season calendar window or document the exclusion in `/analysis` copy (F-17) | **M** | Correctness/completeness call; document if not widening. |
| 16 | docs/FRONTEND.md sync pass (footer, page headers) (F-15) | **S** | Doc-drift cleanup; low urgency, repo-reader-facing only. |
| 17 | README "Getting started": note that `shot_grid`/`shot_value_surface` come from `drizzle/0008` manual SQL, not `drizzle-kit push` (F-16) | **S** | Saves a cloning engineer from a confusing 500. |
| 18 | e2e in CI against a seeded DB (ROADMAP Track B) | **L** | Only if time remains; not application-blocking. |
| 19 | In-season prep (October): Vercel cron to daily per CLAUDE.md, verify Realtime + `HAS_LIVE_GAMES` wiring (F-27) | **M** | Scheduled work, not now. |

### CUT

| Item | Why |
|------|-----|
| Wiring the ticker to live data | Delete instead (item 3); decorative infra is not portfolio signal. |
| `public/` starter SVGs (F-14) | Delete; 2 minutes. |
| Local `package-lock.json` (F-26) | Delete; already gitignored, invisible externally. |
| Any new analytics module before applications | Both models are complete; ROADMAP Track A is the chosen path — finish the wrap, don't widen scope. |

---

## Open [Unknown]s → see `audit/manual-browser-checklist-2026-07-10.md`

- Root cause of the idle 500s (Vercel function logs / Supabase project state).
- Whether the deployed build (footer: RENDERED 2026-07-04) includes HEAD `855e1a4`.
- Favicon appearance; mobile rendering of the fixed-width matchup-card row; NBA CDN logo loads;
  Realtime behavior (season-gated).
