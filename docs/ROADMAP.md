# FullCourt — Roadmap

Restructured 2026-09-04; takeover decisions applied 2026-09-05. **Only items with a real commitment behind them
appear in NOW / NEXT / LATER.** Ideas that were discussed and never committed to are in
*Considered but not committed*; things that were decided against are in *Explicitly rejected*,
with the reason, so they are not re-proposed.

The narrative history this file used to carry — the dated sections for the fatigue overhaul, the
fitted-weights search, the surfaces log, the 2026-09-01 checkpoint audit, the 2026-09-02 review
round — has moved to [DECISIONS.md](DECISIONS.md), which is built to hold it. The pre-rewrite text
is available in full at `git show f93c9e0:docs/ROADMAP.md`.

**Two sources that look like backlogs and are not:**

- `docs/PLAYOFF_PREDICTOR_DESIGN.md` §7 "Open questions" — most were answered by the build itself
  and the section was never updated. **Design history, not a live backlog.**
- The dated sections in DECISIONS.md — a record of what happened, not a queue.

**Project state in one line:** feature-complete, tracker empty, in pre-launch maintenance until
the first live slate on **2026-10-20**.

---

## NOW

Active this week.

- **Keep the CI audit gate green.** `pnpm audit --prod` runs last and can go red overnight on a
  new advisory even with no code change. The recipe is an override in `pnpm-workspace.yaml` plus a
  lockfile regeneration (PR #76 is the worked example).

## NEXT

Committed, with a known trigger.

- **2026-10-20 → 21 · the first live slate.** Follow [LAUNCH_DAY.md](LAUNCH_DAY.md) **before**
  opening night, not during. The nightly pipeline was rewritten onto ESPN on 2026-08-18 and has
  **never run against a real slate**; this is the largest open risk in the project. The runbook
  records that the Actions run *on* 10-20 fires before tip-off and correctly writes nothing — so
  **the run to check by hand is 2026-10-21's** — and it names the three greens that are not green
  and which ESPN probe row to believe.
- **Re-run the schedule/date integrity audit** after the season's first ingestion.
- **Hand-measure the phone chrome on a real device.** The single open row in
  [UIUX_CHECKLIST.md](UIUX_CHECKLIST.md) (owner: Michael). One session closes four unmeasured
  things at once:
  - whether the nav's edge fade actually aids discovery of the `OTHER` menu (the affordance
    shipped 2026-08-15; the outcome is unmeasured);
  - real-Safari behavior of the 16px form-control floor;
  - the front-door motion, which has never been reviewed by eye on a device;
  - whether the `/games` month/day chip rows need the same fade.

## LATER

Committed in principle, not yet scheduled.

- **Monthly from January 2027, plus a final pass after the regular season ends · run
  `scripts/rekey_season_from_hoopr.ts`.** Refresh the cache and review a dry run before every
  application. It converts 2026-27's `espn-<eventId>` rows to hoopR's canonical `002…` ids, which
  is what Shooting-by-Rest joins on. Built and validated against 2025-26 (1,230 rows, 1,230
  correct, 0 wrong, 0 collisions). It can only convert **played** games, which is why it waits.
  Procedure: [SEASON_ROLLOVER.md §9](SEASON_ROLLOVER.md).
- **Revisit each of the five CVE overrides** in `pnpm-workspace.yaml` as upstream ships fixed
  releases. Each is a pin, not a permanent state.
- **2027-28 season rollover**, per [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md).

## BLOCKED

Not startable, with what unblocks each.

| Item | Blocked on |
| --- | --- |
| Verifying the nightly pipeline against a live slate | Games being played — **2026-10-21** |
| The 2026-27 id re-key | Games being played — **January 2027** |
| Shooting-by-Rest carrying 2026-27 data | The re-key above |
| Every real-device measurement in NEXT | A physical device + the owner's time |
| Anything requiring a schema change | Manual SQL applied by the human in the Supabase SQL editor. An agent writes the `.sql` and waits — it never applies it and never assumes it was applied. |

## CONSIDERED BUT NOT COMMITTED

Discussed, plausible, **not scheduled**. Listing them here is not a commitment.

- **Make altitude additive.** The multiplier shape is *knowingly wrong*: it makes thin air cost a
  busy team more than a rested one, where the measurement says the effect is flat. Fixing it means
  a model rewrite, which ADR 0006 declined on its own evidence. Documented in the constant's own
  docblock so it is not mistaken for an oversight.
- **Reopen the `games(season)` query cost** — but at the two `latestFatigueSubquery` joins that
  dedupe all of `fatigue_scores`, not at the scan on `games`. The `latestFatigueLateral` shape
  beside it is the other half of that trade (`src/lib/db/queries.ts:84-108`).
- **The `/games` month/day chip fade** — conditional on the nav fade proving itself first.
- **The badge-height revert** noted during the 2026-08-11 alignment-law pass and not taken.
- **Populating `games.homeMoneyline` / `awayMoneyline`.** The columns exist; no tracked script
  writes them. There is no committed use for them.
- **Brand direction C, "THE REST"**, as an umbrella name — the standing answer *if* branding is
  ever reopened. It is not open.

## EXPLICITLY REJECTED

Each was decided against with a reason. Re-proposing one without new evidence is a regression, not
an idea.

**Model and data integrity**

- **Refitting the fatigue coefficients, or adding a new factor, without reading ADR 0006 first.**
  The ban was suspended once; fitted weights do not beat the ratified ones by enough to matter,
  and the amendment explicitly retracts the blanket "travel carries no signal" conclusion:
  little independent signal does not mean no useful contribution to call selection.
  Use the three-step harness, never a database
  recompute — and never skip `ml/prepare_fatigue_dataset.py`, which fails *silently* against the
  stale table left on disk.
- **A 50% zero line** on any chart. It credits the model with ~10 points of home court it did not
  produce. Every rate reads against `venueBaseline`.
- **Restating either retired absolute** — *"rest alone never outweighs home court at any
  magnitude"* or *"no threshold rescues it"*. Both were measured and retired 2026-08-06.
- **Deleting a published null.** They are results (ADR 0009).
- **`drizzle-kit push` / `generate`, or reconciling `schema.ts` with the live DB.** The lag is
  deliberate.
- **An agent applying schema SQL.**
- **The `002…`-id ingest path for 2026-27.** Both NBA-owned sources are blocked from outside the
  US *and* from CI; the nightly path matches on (ET date, away, home) instead.
- **The "actual" and "difference" columns** on the schedule-value table — they would read as
  attribution the data cannot support, and the swing column already carries a venue confound.

**UI, brand and product**

- **Restoring the `/referees` in-progress card.** It is published; restoring the card is now the
  mistake, and the `inProgress` flag was deleted with it.
- **A dark token set, or a global re-theme.** The app went light → dark → light once. `/` is the
  one dark surface and the header joins it there only, via `fc-chrome-front`.
- **The front-door pin + scrubbed scroll animation.** Shipped 2026-08-14 (PR #44), retired
  2026-08-20 (PR #48). It shipped six invisible cards via `gsap.from` and broke reduced motion.
- **Next's experimental view-transition flag.** The route cross-fade is a deliberate manual
  `document.startViewTransition` wrapper (`src/lib/route-transition.ts`).
- **The hollow-U wordmark** from brand direction A1. Shipped (PR #51), withdrawn the next day
  (revert PR #52). The wordmark is plain full-color W4 on purpose.
- **A brand kit**, and **a "GPT-taste" dark restyle.** Both declined by the owner, 2026-07-28.
- **`maximum-scale` on the viewport.** ESPN, NBA, Naver and KBL all preserve pinch-zoom; the 16px
  form-control floor solves the iOS zoom without disabling it.
- **A VoiceOver walkthrough.** Refused 2026-08-30 with an explicit *"do not silently reopen this
  row"*.
- **Renaming any rest-advantage identifier.** The product is "FullCourt"; the metric is "rest
  advantage". Branding work does not touch the metric.

**Tooling and dependencies**

- **Dropping `shadcn` to `pnpm dlx`.** Tried and reverted: it ships a stylesheet that
  `globals.css` imports on line 2. *A grep that skips `*.css` will call a build input unused.*
- **An index on `games(season)`.** Measured: the scan costs 8.418 ms fully cached inside a 113 ms
  query, and the slow query has no season predicate for an index to use.
- **A bare `pnpm audit` as the CI gate.** The dev tree carries ~55 advisories that never reach a
  user, 38 only through `shadcn`. A noisy gate is one everybody learns to skip. `--prod` only.
- **Playwright in CI, or in the commit gate.** Its specs need a running server and a populated
  database. Run `pnpm test:e2e` by hand when a route or header copy moves.
- **`httpx`** (not a dependency of this repo — stdlib `urllib`), and **Alembic**.
- **A `LICENSE` file** or a `license` field change. `"license": "UNLICENSED"` is deliberate.

## COMPLETED RECENTLY

**2026-09-05 — verified maintenance pass.** Concurrent reads now share the same stamped-cache
load, with retry and stale-completion guards. A four-request cold-cache benchmark against the
real database reduced full loads from four to one with identical output. Removed forwarding
wrappers and a redundant source assertion; the assertion-free alignment report now runs only
via `pnpm audit:alignment`. Browser checks support explicit production/preview URLs and isolated
ports. The empty PR/issue queue and old branches were audited; already-landed branch history
was archived before retirement. No stuck product implementation remained to recover.

**2026-09-05 — clean-slate takeover.** Minimal `AGENTS.md` and corrected handoff documents are
tracked; the Claude inventory remains archival and no harness configuration was migrated.
Local `main` was fast-forwarded to `f93c9e0`; reviewer-only commit `51588c4` was abandoned.
The existing 14 playoff grind tests now run in CI without database credentials or the full ML
stack. Re-keying cadence is monthly from January, with a final pass after the regular season (D-37, D-48,
D-49 in [DECISIONS.md](DECISIONS.md)).

**2026-09-02 — PR #76.** A `browserslist` advisory published overnight turned `main` red on a
docs-only commit. Closed with an override plus a lockfile regeneration. The audit step had already
been moved from first to last in CI precisely so this failure mode would be legible.

**2026-09-01 — the checkpoint audit, PR #75.** Six findings and three notes, **all closed**; five
fixed, one measured and refused.

| | |
| --- | --- |
| P0 | `/shooting`'s rank rider rendered at **1.8:1** — an `opacity: 0.4` rule written for the effect *bar* caught a new 10px `aria-hidden` text span. Fixed by giving the bar its own class. |
| P0 | `/season` and `/shooting` scrolled sideways on a phone — a `.sr-only` absolute span with no positioned ancestor **inside** the scroll container. Measured 447/437 against a 390 viewport; fixed by wrapping the badge in a `position: relative` span. |
| P1 | Every horizontally scrolling region is keyboard-reachable — `tabIndex={0}` on `ui/data-table.tsx` and `behind-the-data-parts.tsx`'s `Formula`. Was 35 nodes across 12 routes. |
| P1 | The a11y pass became a **guard** — `e2e/accessibility.spec.ts` + `e2e/layout-integrity.spec.ts`, 20 routes × 2 viewports, 80 tests. Both ran red on the unfixed code first. |
| note | `pnpm audit --prod` gates CI. |
| note | The ⌘K palette is `next/dynamic` — 48,507 B raw / 16,325 B gzipped, off the cold `/games` path. |
| note | `/api/games/search` cached at `inSeason` (the first answer, `historical`, was wrong). |
| refused | No index on `games(season)` — measured, and it would not have helped. |
| refused | `shadcn` → `pnpm dlx` — tried, and it breaks the build. |

**2026-08-28 → 29 — the UI redesign round.** Six stages, merge queue #69 → #70 → #71 → #72 → #73.

**2026-08-30 — the social preview** was uploaded and verified; the live `og:image` resolves to a
PNG byte-identical to the committed file.

**2026-08-22 — `/referees` published** (PR #49), the last held-back module. **The time-zone null
published** at `/behind-the-data/time-zones`.

**2026-08-18 — four in one day.** 2026-27 seeded (1,200 games from ESPN, cross-checked against Fox
Sports); the nightly pipeline rewritten onto ESPN after being dead for the back half of 2025-26
while showing green; projected fatigue, so 2026-27 has real rest advantage pre-season; the
maskable icon pair completing PWA support.

**2026-08-15 — the UI/UX field survey** → four adoptions + [UIUX_CHECKLIST.md](UIUX_CHECKLIST.md)
(PR #45), plus the iOS form-control zoom fix and the PWA manifest.

**Earlier, and closed:** `/season` can no longer serve a stale empty rollover (it is keyed on
`getSeasonGamesStamp` and renders a real page on the `"schedule"` basis when nothing is final);
the analysis-page claims are derived and tested (PR #21); the page-header pattern and the
`/` ↔ `/games` front-door swap (PRs #22–#24); the cache-policy audit (PR #43); the alignment law;
the type scale; the Split Ink mark and the FULLCOURT kerning table (PR #64).

---

## Shipped modules

All nine product surfaces are published, plus the front door and nine method pages.

| Module | Route | Shipped |
| --- | --- | --- |
| Games board | `/games` | core |
| Model Results | `/analysis` | core |
| Season Report | `/season` | 2026-07-30 spec → built |
| Schedule Edge | `/schedule` | 2026-07-27 |
| Playoff Rest | `/playoffs` | 2026-08-01 |
| Player Shooting | `/shooting` | 2026-07-30 |
| Shot Value | `/shot-quality` | 2026-07-02 |
| Availability Cost | `/availability` | 2026-08-02 |
| Referee Effect | `/referees` | 2026-08-22 |
| Front door | `/` | 2026-08-12 (absorbed `/about`) |
| Method pages | `/behind-the-data/*` | 9 pages |

## Standing maintenance responsibilities

Recurring work, not roadmap items.

- Follow [SEASON_ROLLOVER.md](SEASON_ROLLOVER.md) before each new NBA season, and
  [LAUNCH_DAY.md](LAUNCH_DAY.md) on the first live slate of one.
- The Vercel live-score cron runs **daily, year-round** — there is no seasonal cadence to switch.
  `/api/cron/update` early-returns before any ESPN fetch when neither ET date it checks (yesterday
  and today; it fires at 2–3 AM ET) has a `scheduled|live` row, so an off-season run costs one
  indexed query. **Moving a cron's clock invalidates any date it derives from "now"** — this cost
  four days of silent no-writes once.
- Keep GitHub Actions, Vercel, Supabase environment variables, and dependency security patches
  current.
- Re-run the documented schedule/date integrity audit after each new season's ingestion.
- Preserve the isolation of each analytics module and the rest-advantage naming contract.
- Run `pnpm test:e2e` by hand whenever a route moves or header copy changes — it is deliberately
  outside the commit gate and out of CI.
