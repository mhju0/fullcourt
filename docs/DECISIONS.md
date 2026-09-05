# FullCourt — Decision Ledger

Chronological. Each entry records **what was decided, what it replaced, why, what changed
afterwards, and where the state is now.**

This file exists because the most expensive knowledge in this project is not what the code does —
Git shows that — but **why it does it, and what was tried and undone.** Several decisions here
were reversed, and a reader who only sees the current code will re-propose the reversed version.

**Status vocabulary**

| Status | Meaning |
| --- | --- |
| **ACTIVE** | in force now |
| **REVERSED** | shipped, then deliberately undone |
| **SUPERSEDED** | replaced by a later decision |
| **DEFERRED** | decided to postpone, with a condition for revisiting |
| **EXPERIMENTAL** | run to learn; result kept, change not shipped |
| **ABANDONED** | tried, found wrong, dropped |
| **UNKNOWN** | the record does not settle it |

**Evidence markers.** `path/file.ts`, `PR #n`, `ADR 000n`, or **(conversation-only)** where the
rationale exists nowhere in the repo. The formal ADRs in [`adr/`](adr/) carry detailed rationale
for the ten decisions they cover; this file places them in sequence and carries everything that
never got an ADR. Current source/tests and Git take precedence when establishing implementation
state (D-48).

---

## June – July 2026 · foundations

### D-01 · Rest days are computed from `games`, not stored or sourced separately — **ACTIVE**
The alternative was a separate rest/travel feed. Rejected because `games` already carries the ET
date and the venue, so any second source is a synchronization liability with no new information.
*Evidence:* ADR 0001.

### D-02 · hoopR over basketball-reference and `stats.nba.com` — **ACTIVE**
**Previous approach:** scraping basketball-reference directly.
**Why changed:** B-Ref's ToS §5(i)/(ii)/(j) forbids automated bulk access; `stats.nba.com` times
out from every datacenter tried. hoopR/sportsdataverse is a licensed redistribution that is
reachable and stable.
**Current:** B-Ref is used **by hand only**, never by a script.
*Evidence:* ADR 0002.

### D-03 · Fatigue inputs are limited to the ESPN era — **ACTIVE**
Earlier seasons lack tip-off times, so a back-to-back's *turnaround* cannot be measured. Rather
than silently degrade, the model bounds its own inputs.
*Evidence:* ADR 0003.

### D-04 · The playoff ingest gates on the `004` id prefix — **ACTIVE**
Playoff rows were arriving tagged `regular`. Fixed 2026-06-29; verified at **0 tag mismatches**.
The durable lesson: **validate ingest isolation on `002`-prefix counts**, not on totals.
*Evidence:* `scripts/fetch_playoffs.py`; **(conversation-only)** for the validation method.

### D-05 · Play-in games have their own row type — **ACTIVE**
The original conversation-only entry claimed tagging was deferred. The takeover audit found
that claim contradicted by both source and Git history: `scripts/fetch_play_in.py` ingests
`005`-prefix games with `game_type='play_in'`. They provide the previous-game context for
playoff entry rest; they are not series-model targets.
*Evidence:* `scripts/fetch_play_in.py`, `ml/compute_series_features.py`, commit `05c5b23`.

### D-06 · Shot Quality: plain logistic regression → gradient boosting — **SUPERSEDED**
**Decided (SQ-4):** an xeFG% logit over shot features.
**Result:** it **lost to the zone baseline** — an honest negative, recorded rather than buried.
**Superseded (SQ-4b):** a GBM beat the zone baseline by 0.81% log-loss and became the shipped
model.
*Evidence:* `docs/SHOT_QUALITY_DESIGN.md`; **(conversation-only)** for the SQ-4 loss.

### D-07 · Git history was reportedly rewritten to strip Claude trailers — **SUPERSEDED**
The historical record describes a `filter-branch` rewrite on 2026-07-27. The procedure itself
is **conversation-only**. Its accompanying commit-attribution preference is not inherited by
the clean-slate takeover (D-48).

---

## Late July 2026 · the model gets its rules, and four modules ship

### D-08 · The fatigue coefficients are ratified and frozen — **ACTIVE**
**Decided 2026-07-29.** Eight rules, hand-set coefficients, ratified **before** the backtest ran.
**Why:** tuning the coefficients against the backtest the site publishes would make the published
result circular. This is the single most important integrity rule in the project.
**What changed since:** exactly one constant has moved — D-19. The file's *interface* is not
frozen (ADR 0005 reshaped it deliberately); only the numbers are.
*Evidence:* `src/lib/fatigue.ts`, ADR 0005, `CLAUDE.md`.

### D-09 · Season exclusions belong to the module that objects, not to ingest — **ACTIVE**
**Previous approach:** one global exclusion window applied at ingest — 2019-20 (the COVID bubble)
was simply not ingested.
**Why changed:** different modules have different tolerances, and ingest deleting data forecloses
every module's choice. **Ingest records what was played.**
**Current:** 2019-20 is in `NBA_SEASONS` (admitted 2026-07-30); each module decides what it may
read. Three rules replaced the one window.
*Evidence:* ADR 0004 + two follow-ups.

### D-10 · The win-total market check is published as a NULL, on purpose — **ACTIVE**
Backtest across 884 team-seasons returned **r = −0.016**. It shipped anyway, as a result rather
than a failure. This is the first instance of what later became ADR 0009.
*Evidence:* `scripts/fetch_win_totals.ts`, `/behind-the-data`.

### D-11 · Referee Effect was built, then held back from publishing — **REVERSED**
**Decided 2026-07-30:** the module was complete but `/referees` was stubbed with an "in progress"
card, and `CLAUDE.md` carried a hard ban on publishing it.
**Why:** an editorial gate, not an engineering one — the per-official figures needed a caveat
frame before they could be quoted.
**Reversed 2026-08-22** (D-33). The `inProgress` nav flag and the IN PROGRESS tag existed only
for this one entry and were **deleted with it** rather than left unused.
**Current:** `/referees` is live. **Restoring the in-progress card is now the mistake.**
*Evidence:* PR #49, `src/lib/primary-navigation.ts`.

### D-12 · Schedule Disparity ships as the fourth module, and never ranks across eras — **ACTIVE**
`/schedule` publishes net rest edge with **two season lists** and no cross-era ranking, because
schedule structure changed too much for a 1987 team and a 2024 team to share a leaderboard. The
NBA Cup makes it 80-of-82 for affected teams.
*Evidence:* `/schedule`, ADR 0008.

### D-13 · The RA threshold float boundary is left unfixed — **ACTIVE (accepted debt)**
Published `RA ≥ N` counts sit about one game below a naive SQL check, because
`2.76 − 0.76 = 1.9999999999999998`. Site-wide. **Deliberately not fixed**, and it does **not**
break the `/analysis` ↔ `/season` invariant.
*Evidence:* **(conversation-only)**.

### D-14 · A brand kit and a "GPT-taste" dark restyle were both declined — **ABANDONED**
Proposed during the 2026-07-28 nav/design pass; the owner declined both. Not a deferral.
*Evidence:* **(conversation-only)**.

### D-15 · `pnpm-workspace.yaml` is the home for dependency overrides — **ACTIVE**
Settled by the 2026-07-30 security audit. All CVE pins live there, each commented with its
advisory.
*Evidence:* `pnpm-workspace.yaml`.

### D-16 · The `/season` spec was approved and pushed before being implemented — **SUPERSEDED**
Approved 2026-07-30 (commit `8c23161`) as a spec only. Three findings shaped it: per-season RA ≥ 5
is only ~46 games; "win% when rested" is a standings table; single-season player rest splits are
noise. Implemented later; the page now exists.
*Evidence:* `/season`, **(conversation-only)** for the three findings.

---

## August 2026 · the measurement decisions

### D-17 · Light → dark → light — **REVERSED**
The app was light, went dark, and came back to light ("Broadcast"). **Do not reintroduce a dark
token set** without reading `docs/FRONTEND.md`. The single exception is `/`, and since 2026-08-28
the header joins that dark **on `/` only**, via the scoped `fc-chrome-front` class — never a
global re-theme.
*Evidence:* `docs/FRONTEND.md`, `src/app/globals.css`.

### D-18 · `isCalledSide` — the model only calls a game when the fresher team is home — **ACTIVE**
**Previous approach:** every game where one team was fresher counted toward the headline,
including games where the rested team was the *visitor*.
**Why changed:** those are a different bet, and pooling them mixed two populations.
**Effect on the headline:** 55.5% → 61.2%.
**Current:** rested-visitor games are published as their own row, in full, never pooled.
*Evidence:* `src/lib/rest-advantage-evidence.ts` (2026-08-02).

### D-19 · `ALTITUDE_MULTIPLIER` 1.15 → 1.29 — the one ratified constant that moved — **ACTIVE**
**Decided 2026-08-02**, approved by the owner. The first ratified coefficient ever changed on
measured evidence.
**Why:** the absolute scale of a fatigue score is arbitrary — only ratios between terms carry
meaning. Measured on **final margin** across 35,458 games, altitude is 1.358 points and a
back-to-back 1.759, a ratio of 0.772; in the model the ratio was 0.405. Altitude was charging
about half what it should.
**What keeps it non-circular:** it was fitted against **final margin**, not against the win rates
the site publishes.
**Deliberately not moved with it:** `ALTITUDE_CARRYOVER_MULTIPLIER`, measured at 0.003.
**Knowingly still wrong:** the *shape*. A multiplier means thin air costs a busy team more than a
rested one, where the measurement says the effect is flat. Fixing that means making altitude
additive — the model rewrite ADR 0006 declined on its own evidence.
*Evidence:* `src/lib/fatigue.ts` (the constant's own docblock), ADR 0006.

### D-20 · Fitted fatigue weights — measured, and the model was **not** changed — **EXPERIMENTAL**
**Decided 2026-08-02:** suspend the coefficient ban once, deliberately, to find out whether
fitted weights beat the ratified ones.
**Result:** **they do not, by enough to matter.** The initial conditional fit gave travel,
rest and workload zero or negative weights; that was not evidence that those terms contributed
nothing to the shipped model's call selection.
**What shipped:** nothing. The harness was kept; the model was left alone.
**Later correction:** the 2026-08-02 amendment to ADR 0006 **retracted** the initial
"travel carries nothing" reading: travel adds little independent information once correlated
terms are known, but contributes useful calls. The ratified model remains in place.
**How to use this:** answer questions of this shape with the harness, never a database recompute.
The middle step (`ml/prepare_fatigue_dataset.py`) is **not optional** — skipping it fails
*silently* against a stale `fatigue_model_table.csv` left on disk from this very run.
*Evidence:* ADR 0006, `ml/`.

### D-21 · Availability Cost ships with no database table — **ACTIVE**
`/availability` (2026-08-02) established the **"facts JSON" pattern**: a committed generated
artifact + typed TS constants + a test pinning the two together. Headline: a missing best player
costs **2.86 points ≈ home court**.
*Evidence:* `src/lib/availability-facts.ts` and its test.

### D-22 · Every published rate is read against a venue baseline — **ACTIVE**
**Previous approach:** rates plotted against a **50% coin-flip zero line**.
**Why changed:** home teams win ~59.9% of all games regardless of rest, so a 61.2% headline
against 50% credited the model with roughly **ten points of home court it did not produce**.
**Current:** `AnalysisResponse.venueBaseline` carries it, and the season chart uses **each
season's own**, because home court ran from 67.9% (1987-88) to 54.3% (2023-24).
**Never reintroduce a 50% zero line.**
*Evidence:* 2026-08-06; `src/lib/rest-split-facts.ts`.

### D-23 · Two published absolutes were retired — **REVERSED**
*"Rest alone never outweighs home court at any magnitude"* and *"no threshold rescues it"* were
both published claims. Measured and **retired 2026-08-06**: each was an absolute resting on a
pooled 41-season rate. **Do not restate either.** `src/lib/rest-split-facts.ts` and its test hold
what replaced them.

### D-24 · "What the schedule was worth" ships; the actual/difference columns were refused — **ACTIVE**
Added to `/season` and `/schedule` on 2026-08-07. The **swing column carries a venue confound**,
and the proposed "actual" and "difference" columns were **refused** because they would have read
as attribution the data cannot support.
*Evidence:* **(conversation-only)** for the refusal.

### D-25 · The "Front Office" design direction — **ACTIVE**
Adopted 2026-08-09 from a set of mocked directions: light, professional, data-focused. **The
playful direction was rejected.** Established the poles-vs-chrome color grammar (rose/teal poles
with a second **text-grade** cut for AA contrast).
*Evidence:* `docs/design/BRAND_GRAMMAR.md`, `docs/FRONTEND.md`.

### D-26 · The first-visit onboarding guide was removed — **REVERSED**
Removed 2026-08-11. Two things went with it rather than being left orphaned: the
`guideDescription` sentences on every nav entry, and Playwright's `storageState` fixture (which
existed only to dismiss the modal).
*Evidence:* `src/lib/primary-navigation.ts`, `playwright.config.ts`.

### D-27 · The two-rail / one-scale alignment law — **ACTIVE**
Shipped 2026-08-11 into `docs/FRONTEND.md`. A badge-height revert candidate was noted and not
taken.
*Evidence:* `docs/FRONTEND.md`.

### D-28 · `/` becomes the marketing front door; `/about` is absorbed; `/games` is the board — **ACTIVE**
**Previous approach:** `/` was the games board and `/about` was a separate page.
**Why changed:** the front door and the daily tool are different jobs with different audiences.
**Current:** `/about → /` and `/upcoming → /games` are **307** redirects in `next.config.ts`; the
first nav tab is `/games`, not `/`, so a returning visitor typing the bare domain reaches the
board in one click. The h1 inversion trap here bit twice.
*Evidence:* PRs #22–#24, `next.config.ts`, `src/lib/primary-navigation.ts`.

### D-29 · Unused exports were measured and deliberately left undeleted — **ACTIVE (deliberate non-action)**
Scanned 2026-08-12. Deleting them was judged not worth the churn. Recorded so the scan is not
repeated as if it were new.
*Evidence:* **(conversation-only)**.

### D-30 · Docs ship in the same PR as the code — **ACTIVE**
**Why:** the rule was violated across **all six PRs of 2026-08-13** (fixed retroactively in #42)
and again by the redesign round (ROADMAP.md, caught 2026-08-30). `FRONTEND.md` and
`TESTING_AND_CICD.md` are the two that get missed.
*Evidence:* PR #42; **(conversation-only)**.

### D-31 · The front-door scroll animation shipped, then was retired — **REVERSED**
**Shipped 2026-08-14** (PR #44, issue #29): a GSAP pin with scrubbed scroll animation.
**Two bugs it shipped with:** `gsap.from` left **six cards invisible**, and the inline resting
state broke `prefers-reduced-motion`.
**Retired 2026-08-20** (PR #48) in favour of "front door calm" — the pin and the scrubs are gone.
The process that produced the replacement (grill → prototype → implement) is itself worth
reusing, and it produced the **hairlines-below-text** rule.
**Current:** motion is limited to five sanctioned moments (ADR 0010) and a route cross-fade via a
**manual `document.startViewTransition` wrapper** (`src/lib/route-transition.ts`) — deliberately
*not* Next's experimental flag.
*Evidence:* PRs #44, #48; ADR 0010.

### D-32 · The UI/UX checklist replaces re-surveying — **ACTIVE**
A field survey of major US/KR sports properties (2026-08-15) produced four adoptions and
`docs/UIUX_CHECKLIST.md` (PR #45). **The rule is: extend the checklist, do not re-survey.**
Refusals are recorded with reasons — notably `maximum-scale` on the viewport (refused; ESPN, NBA,
Naver and KBL all preserve pinch-zoom), and a VoiceOver walkthrough refused 2026-08-30 with an
explicit *"do not silently reopen this row"*.
*Evidence:* `docs/UIUX_CHECKLIST.md`.

### D-33 · `/referees` is published — **ACTIVE (reverses D-11)**
**Decided 2026-08-22**, on the owner's explicit instruction, after being held back since
2026-07-30. Publishing or unpublishing a route is a deliberate product act, **never a side effect
of a docs change** — if a stale doc says otherwise, the doc is wrong.
**The caveat that made publication possible, and which must travel with every figure:** quote a
per-official number only beside the count chance produces at the same bar, and keep the note that
**three officials work every game**, so each figure is about a third of the effect it names.
Enforced by `referee-legends.test.ts` and `referee-timing.test.ts`.
*Evidence:* PR #49.

### D-34 · The referee pre-registration was overturned by its own addendum — **SUPERSEDED**
ADR 0007 pre-registered the referee axes and initially reported axis A as null. The **2026-08-22
addendum overturns that null.** Read the addendum, not just the ADR body.
*Evidence:* ADR 0007.

### D-35 · The time-zone / circadian test came back null and was published — **ACTIVE**
Pre-registered, returned null, and **published at `/behind-the-data/time-zones`** on 2026-08-22.
**The large raw east/west split is a strength confound, not a circadian effect** — that is the
finding, and it is the reason the page exists.
*Evidence:* `src/lib/timezone-null.ts`, ADR 0009.

### D-36 · The nightly pipeline was dead for half a season while showing green — **ACTIVE (fix unproven)**
**What happened:** `daily_update.py`'s first network call was to `cdn.nba.com`, which 403s. It
raised before updating a score, reading overtime, or recomputing fatigue. **Every in-season run
from at least 2026-05-11 failed there**, while the offseason runs either side showed green
because the season gate short-circuited first.
**Fix (2026-08-18):** rewritten onto ESPN, matching on **(ET date, away, home)** rather than on
ids. Verified historically — 0 writes over already-correct dates, and a perturbed row correctly
repaired.
**Still unproven:** it has never run on a live slate. `docs/LAUNCH_DAY.md` was written 2026-08-27
for exactly this check.
**A second, related trap:** moving a cron's clock invalidates any date it derives from "now" —
`/api/cron/update` wrote nothing for four days after one such move.
*Evidence:* `scripts/daily_update.py`, `docs/LAUNCH_DAY.md`; **(conversation-only)** for the cron
trap.

### D-37 · 2026-27 is seeded from ESPN with `espn-` ids, and the `002…` path was abandoned — **ACTIVE**
1,200 games ingested 2026-08-18 and cross-checked against Fox Sports. Both NBA-owned sources were
re-probed the same day and are still blocked from outside the US **and** from CI runners, so the
`002…`-id ingest path **was not taken and is no longer needed**.
**The known consequence, accepted:** Shooting-by-Rest joins hoopR box scores on `external_id LIKE
'002%'` and will carry no 2026-27 data until those rows are re-keyed —
`scripts/rekey_season_from_hoopr.ts`, built and validated, **waiting on games**.
**Cadence approved 2026-09-05:** monthly from January 2027, plus a final pass after the regular
season ends. Refresh the cache and review a dry run before each application; see
`docs/SEASON_ROLLOVER.md` §9.
**A discovery worth keeping:** a Mozilla user-agent trips Akamai on these endpoints.
*Evidence:* `docs/SEASON_ROLLOVER.md` §9.

### D-38 · Projected fatigue: 2026-27 gets real rest advantage before it is played — **ACTIVE**
**Projected ≠ unplayed** — opening night is *measured*, not projected. The distinction drives the
season-report basis, which reports on a `"schedule"` basis when no game is final yet.
*Evidence:* 2026-08-18; `/season`.

### D-39 · The REST/"Second Key" brand direction shipped, then was withdrawn the next day — **REVERSED**
**Shipped:** direction A1 (PR #51), from a five-direction study.
**Withdrawn the next day:** revert PR #52.
**Current:** the wordmark is **plain full-color W4, on purpose.** **Never re-add the hollow U**
from the direction artifacts.
Of the five directions, C ("THE REST") remains the umbrella answer if the question is ever
reopened; A kept FULLCOURT.
*Evidence:* PRs #51, #52; **(conversation-only)** for the study.

### D-40 · The Split Ink mark and the FULLCOURT optical kerning table — **ACTIVE**
Mark shipped 2026-08-19 (S2/W4/C1/P-D chain, **one geometry source**). Optical kerning adopted
2026-08-24 (PR #64) as **one table in `wordmark-kern.ts` feeding three renderers**. The bench
record notes a C·O variable-font trap. The social-preview upload landed 2026-08-30 and is
verified.
*Evidence:* PR #64, `docs/design/BRAND_GRAMMAR.md`.

### D-41 · The UI redesign was decided at the bench, not in review — **ACTIVE**
Six stages built overnight 2026-08-28→29, merged as a rehearsed queue #69 → #70 → #71 → #72
(a ruling) → #73, with two union-only e2e breaks healed during the rehearsal.
*Evidence:* ADR 0010, PRs #69–#73.

---

## September 2026 · the checkpoint audit and after

### D-42 · An accessibility guard now exists, because three defects shipped without one — **ACTIVE**
**Previous approach:** the 2026-08-24 accessibility pass was a **one-off local script**;
`axe-core` was **not a dependency**, and its report lived in the gitignored `docs/audit/`. The
checklist's "all 20 routes, zero violations" was true when written and stopped being true four
days later with nothing able to say so.
**What it missed:** `design-contrast.test.ts` pins **token** ratios and cannot see a **composited**
one — which is exactly the gap an `opacity: 0.4` rule fell through.
**Current (PR #75):** `e2e/accessibility.spec.ts` (`@axe-core/playwright`, now a devDependency)
and `e2e/layout-integrity.spec.ts`, each walking **all 20 routes at two viewports** — 80 of the
suite's ~250 tests. **Both ran red on the unfixed code first**, by exactly the amounts the audit
measured.
**The durable rule, now in FRONTEND.md:** *a selector that says "any hidden span" is one that is
waiting for the next one.*
*Evidence:* PR #75.

### D-43 · `/api/games/search` is cached at `inSeason` — after the first answer was wrong — **ACTIVE**
**First decision:** `CACHE.historical`, reasoning that it reads the same settled backtest
population `/api/analysis` does.
**Why that was wrong:** `/api/analysis` returns a 41-season aggregate where last night is
invisible among ~39,000 games; this route is `orderBy(desc(games.date))` and paginated, so **page
1 is last night**, and `seasonParam` admits the season in progress as soon as it has one final
game. A day of `stale-while-revalidate` would open the explorer on a list missing the most recent
slate.
**The rule that generalizes:** **the population does not pick the cache policy; the ordering
does.**
*Evidence:* PR #75, `docs/API.md`.

### D-44 · Dropping `shadcn` to `pnpm dlx` — tried, and it is wrong — **ABANDONED**
The audit recommended it to take 38 dev-tree advisories out, on the reading that a scaffolding CLI
ships nothing. **It ships a stylesheet:** `globals.css` line 2 is `@import "shadcn/tailwind.css"`,
so removing the package fails the build with `Can't resolve 'shadcn/tailwind.css'`. Measured,
reverted, and **recorded rather than deleted, because the recommendation reads as sound and the
next person will have the same idea.**
**The generalizable trap: a grep that skips `*.css` will call a build input unused.**
*Evidence:* PR #75.

### D-45 · No index on `games(season)` — measured, and declined — **ABANDONED**
The audit recommended one; the measurement retired the recommendation. A season-scoped scan of all
51,695 rows costs **8.418 ms with `Buffers: shared hit=1123`** — every page already cached, no
disk read to save — inside a `searchRegularSeasonGames({season})` that runs **113 ms**. The index
targets 7% of the *fastest* case. The **slow** case is the unfiltered search (38,955 rows,
~600 ms) and it has **no season predicate for an index to use**.
**The rule: an index on the selective filter cannot speed up the query that omits it.**
If reopened, the cost is the two `latestFatigueSubquery` joins that dedupe all of
`fatigue_scores`, not the scan on `games` (`queries.ts:84-108`).
**Declining is a result, not a deferral** — and a schema change is manual SQL applied by the
human, never by an agent, which is why the measurement had to come before the handoff.
*Evidence:* PR #75.

### D-46 · The ⌘K palette is fetched on first summon — **ACTIVE**
`cmdk` plus the sixteen `@radix-ui/*` packages behind `@radix-ui/react-dialog` were in the chunk
loading on **all twenty routes**, rendering nothing until a key was pressed.
`command-palette-mount.tsx` is the ~1KB doorbell that stays; the palette is a `next/dynamic`
import. Measured on a production build: **48,507 bytes raw / 16,325 gzipped**, absent from the 23
JS files a cold `/games` loads, arriving on ⌘K.
*Evidence:* PR #75.

### D-47 · `pnpm audit --prod` gates CI, and runs **last** — **ACTIVE**
**Decided:** `--prod`, not a bare audit — the dev tree carries ~55 advisories that never reach a
user, 38 of them only through `shadcn`, and **a noisy gate is one everybody learns to skip**.
Production has been at zero since the 2026-08-13 postcss fix, so a red step here is a regression,
not a backlog.
**Changed 2026-09-02:** moved from **first** to **last**. When it ran first it masked real
failures.
**The consequence to recognize on sight:** an overnight advisory can turn `main` red on a
**docs-only** commit — which is exactly what happened with `browserslist` (PR #76). The recipe is
an override in `pnpm-workspace.yaml` plus a lockfile regeneration. **A red `main` on a docs-only
commit is almost always this step.**
*Evidence:* `.github/workflows/ci.yml`, PR #76.

---

### D-48 · Clean-slate Codex takeover — **ACTIVE**
**Approved 2026-09-05.** The evidence hierarchy is current source/tests → current Git
state/history → this ledger → ROADMAP.md → PROJECT_HANDOFF.md → historical Claude material
when additional context is needed. Formal ADRs retain detailed rationale, interpreted against
current source, tests and Git evidence.

Track a minimal root `AGENTS.md` and the handoff documents. `CLAUDE.md` is historical evidence;
`CLAUDE_ENV_INVENTORY.md` is an archive. Do not inherit or migrate Claude global instructions,
skills, MCP servers, hooks, subagents or preferences without an explicit owner request. The
reviewer-only commit `51588c4` is abandoned; takeover work starts from `origin/main` on a fresh
branch, preserving the local documentation.

Prefer native model capabilities. Only repeated, demonstrated limitations justify proposing
persistent configuration: AGENTS.md for a project-wide instruction, a skill for a reusable
specialized workflow, MCP for an external connection, or Codex config for client/runtime
settings. Update this ledger for significant decisions or reversals, ROADMAP.md for material
roadmap changes, and PROJECT_HANDOFF.md for material high-level state/architecture changes;
routine implementation details do not belong in these documents.
*Evidence:* owner's takeover approval, 2026-09-05.

**Completed 2026-09-05:** pre-existing local skill ports and the reviewer configuration were
archived outside agent discovery; no replacement harness was installed.

### D-49 · Existing playoff grind contracts run in CI — **ACTIVE**
**Approved 2026-09-05.** Retain `ml/tests/test_compute_prior_grind.py` and run it in a separate
unittest discovery step. The previous assumption that it required the full modeling stack was
wrong: only `psycopg2-binary` is imported eagerly. CI constrains that dependency using
`ml/requirements.txt`; the tests use pure functions without database credentials or writes.
*Evidence:* `.github/workflows/ci.yml`, `ml/tests/test_compute_prior_grind.py`.

### D-50 · Verified agent merges — **ACTIVE**
**Approved 2026-09-05.** The owner authorized maintenance audits, fixes, branch cleanup and
verified merges. Vercel deploys `main` directly to production; there is no separate staging gate.
For this flow, check CI and the PR preview before merging, then verify the production deployment.
This does not change the manual schema boundary or authorize model coefficient changes.
*Evidence:* owner's six-part maintenance request; Vercel production and preview deployments
inspected on 2026-09-05.

---

## Standing decisions with no single date

| Decision | Status | Note |
| --- | --- | --- |
| **`schema.ts` intentionally lags the live DB** | ACTIVE | `shot_grid` / `shot_value_surface` are raw-SQL-only and absent from `schema.ts` *and* `drizzle.config.ts`'s `tablesFilter`. Never reconcile. `drizzle-kit push`/`generate` are banned. |
| **All schema changes are manual SQL applied by the human** | ACTIVE | An agent writes the `.sql`, hands it over, waits. |
| **Rest-advantage identifiers are frozen** | ACTIVE | Product = "FullCourt"; metric = "rest advantage". Branding must not touch the metric. |
| **New modules are additive, isolated slices** | ACTIVE | Own scripts, tables, route, page. Has held across five modules. |
| **`publishableGames()` is the only place the regime filter lives** | ACTIVE | Four readers had already lost it by hand-writing the predicate; `publishable-games.test.ts` fails if a second copy appears. |
| **Published figures pin to generated artifacts** | ACTIVE | Never typed into prose. A number that cannot be pinned is rewritten so it cannot age. |
| **Nulls are published, not deleted** | ACTIVE | ADR 0009. |
| **Playwright stays outside the commit gate and out of CI** | ACTIVE | Needs a server and a populated DB. Run by hand when a route or header copy moves. |
| **No LICENSE file; `"license": "UNLICENSED"`** | ACTIVE | Owner's standing rule. Do not raise licensing unprompted. |
| **Month/day chip fade on `/games`** | DEFERRED | Adopt only if the nav's edge fade proves itself on a real device. |
| **The `seed-season` path in `daily-update.yml`** | ABANDONED (retained) | Known broken; kept because it costs nothing. |
| **`docs/PLAYOFF_PREDICTOR_DESIGN.md` §7's seven "open questions"** | UNKNOWN | Most were answered by the build and the section was never updated. Design history, not a backlog — do not promote into the roadmap. |
