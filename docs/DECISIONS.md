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
*Evidence:* `docs/archive/SHOT_QUALITY_DESIGN.md`; **(conversation-only)** for the SQ-4 loss.

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

### D-13 · The RA threshold float boundary is left unfixed — **SUPERSEDED by D-87**
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
**three officials work every game** and the data credits all three, so a per-official figure cannot
isolate one official's effect. (Amended 2026-10-15, D-91: the earlier "about a third of the effect"
had no derivation anywhere in the repo.)
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
`docs/archive/CLAUDE_ENV_INVENTORY.md` is an archive. Do not inherit or migrate Claude global instructions,
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

### D-51 · Season comparison owns its request lifecycle — **ACTIVE**
**2026-09-06.** Following the owner's instruction to implement architecture-review candidate 1,
Model Results keeps threshold selection, filtered acquisition, admission and chart state inside
`SeasonComparison`. The page passes its canonical backtest; the comparison reads maturity from
that unfiltered population. A failed filtered request shows a local failure and explicit retry,
never an empty-measurement claim. Threshold changes remain available while a read fails.
Existing venue baselines, maturity threshold and publication rules are preserved.
*Evidence:* `src/components/analysis-content.tsx`,
`e2e/analysis-season-comparison.spec.ts`.

### D-52 · Missing fatigue measurements are unranked — **ACTIVE**
**Approved 2026-09-06.** In a mixed season, Schedule Edge places unmeasured teams below all
measured teams with no ordinal or bar and a dash for the ranking value. Measured zero is a
real result and remains ranked. A wholly unmeasured season still ranks by net rest edge.
`rankScheduleTeams` owns basis, ordering, values and extremes for the reducer and display;
team-id tie ordering and opener-inclusive schedule value remain unchanged.
*Evidence:* owner's approval of architecture-review candidate 2; `src/lib/schedule-ranking.ts`,
`src/lib/__tests__/schedule-ranking.test.ts`, `e2e/architecture-contracts.spec.ts`.

### D-53 · Same-path navigation skips the cross-fade — **ACTIVE**
**Approved 2026-09-06.** Selecting the current pathname, including query-only or hash-only
changes, navigates normally. Different pathnames retain chrome-only cross-fades and the
one-second fail-open guard. The route-transition module owns pending navigation and observes
completion from the persistent root layout, independently of the navigation display.
Replacement releases the old transition; unrelated or late completion cannot settle a new
one. Reduced motion and unsupported browsers retain normal navigation.
*Evidence:* owner's approval of architecture-review candidate 3; `src/lib/route-transition.ts`,
`src/lib/__tests__/route-transition.test.ts`, `e2e/architecture-contracts.spec.ts`.

---

### D-54 · Antislop setup and shared interaction floors · ACTIVE

Date: 2026-09-06.

The owner requested an audit followed by fixes and installation of all five antislop skills.
The project-local core and companions live in `anti-slop/`, routed by the appended `AGENTS.md`
block. Existing owner decisions and the Front Office brand direction take precedence over
generic skill defaults. This installs no Claude harness configuration.

The audit found keyboard focus resets and mobile targets smaller than 44px despite passing
axe and document-overflow checks. Keep the shared focus indicator outside CSS layers so
component utilities cannot erase it; apply the touch target floor below the mobile navigation
breakpoint. The new browser checks measure the actual focused controls and target boxes.
See `34b8961:anti-slop/audit-001-2026-09-06.md` and `e2e/control-accessibility.spec.ts`.

---

### D-55 · Explanations state the scope of the evidence · ACTIVE

Date: 2026-09-06.

The owner requested an antislop audit and revisions across GitHub description, README, and
all explanations, especially Behind the Data. Existing prose is in scope for this pass.

Use plain descriptions of the measured population and comparison. Distinguish associations
from causal estimates, held-out predictions from in-sample fit, and null tests from proof of
zero effect. Crew records do not identify individual calls or imply an exact one-third effect.
The ablation's 5,994 travel-dependent calls include losses; they are not 5,994 winning predictions.

The public copy, metadata, glossary, and brand voice examples are synchronized. Historical
ADRs, pre-registrations, analysis reports, and design explorations remain records of their
original decisions. This clarification governs current explanations without changing model
coefficients, thresholds, generated analytics, or publication eligibility.

Evidence: `34b8961:anti-slop/audit-002-2026-09-06.md`, `src/app/behind-the-data/`,
`src/components/referee-effect-content.tsx`, `ml/ablate_fatigue_terms.py`.

---

### D-56 · Matchup comparisons explain the venue baseline · SUPERSEDED BY D-57

Date: 2026-09-06.

At the owner's request, expanded Games matchups show two labelled historical win rates:
the rested group and all teams at the same venue. A short explanation states why home or
road is the comparison. Cumulative home thresholds use plain `7+` wording; road rates
continue to pool all rest gaps. These are historical group records, not matchup probabilities.
Sample counts remain in the evidence data and reference analysis, with a method link replacing
inline `n = …`. This supersedes the earlier requirement to print a denominator on every card.
Threshold selection, rate calculations, and model coefficients are unchanged.

---

### D-57 · Historical win rates belong in Model Results · ACTIVE

Date: 2026-09-06.

The owner requested removing matchup win-rate comparisons entirely because repeating them
and their method links cluttered the Games page. Expanded matchups retain the fatigue
breakdown without a replacement footnote. Rest advantage and schedule context remain visible;
the page-level method link remains available. Games no longer requests the historical backtest.
Model Results retains win rates, venue baselines, and sample sizes; Behind the Data retains
methodology and limitations. This supersedes D-56 without changing any analytics calculations.

---

### D-58 · Investigate seasonal officiating data before choosing highlights · ACTIVE

Date: 2026-09-06.

The owner authorized data-first research across the referee questions identified in Reddit
research, prioritizing a cumulative season view of NBA Last Two Minute reports. Start with
2025–26 as the completed-season baseline. Collect and calculate before deciding which few
findings deserve presentation; this does not commit to six sections, a dedicated referee page,
or a production ingestion schedule. Visualization discussion follows the evidence.

Record the study scope before calculations in `ml/l2m_season_preregistration.md`. Separate
regular season, play-in and playoffs, preserve source revisions and denominators, and distinguish
errors in games an official worked from mistakes personally attributed to that official.
League points of emphasis require official sources; observed differences do not establish intent.

Evidence and reproducible research outputs live in `docs/research/`; raw snapshots remain in
ignored `ml/data/l2m-research/`. Existing published analytics and product UI are unchanged.

The owner subsequently requested the same study for 2024–25 and 2023–24 before making major
decisions. `ml/l2m_three_season_extension.md` fixes that extension before collection; the
three-season comparison and validation are in `docs/research/2026-09-06-l2m-three-season-study.md`.
This expands the evidence base without committing to a product presentation.

---

### D-59 · Officiating presentation — ACTIVE

Owner approved the games-first L2M explorer, a league-wide missed-call-share hero, directly
labeled blue/gray split, subordinate season comparison, and source verdicts inside each game.
The claim is share of identified errors, never whistle accuracy. Filters do not alter the
league-wide hero. Team-only filters retain clean games; error-category filters select matching
errors. Future seasons need real data, not invented bar heights. No new animation.

### D-60 · Officiating publication and research archive — ACTIVE

The implementation publishes validated regular-season source snapshots and loads individual
reports on expansion. Failed or incomplete collection cannot replace published data. Previous
referee studies remain at `/behind-the-data/referees/archive`; `/referees` redirects to
`/officiating`. Review a preview before publication. Actions prepares a comparison link when
repository policy blocks bot-created PRs. See [Officiating operations](OFFICIATING.md).

### D-61 · Rest-focused homepage and distinct page ownership — ACTIVE

Homepage findings concern rest/fatigue/schedule; brand story lives at About and secondary
studies at Explore. Games owns matchups, Season Report completed outcomes, Schedule Edge
schedule demands and advantages, and Model Results historical evaluation. Desktop and mobile
share Games / Season Report / Schedule Edge / Explore. The page palette remains in the footer
and keyboard shortcut. There are no accounts or stored personal preferences; URLs retain
exploration context.

Shooting uses dense comparison rows with attempt counts and option A's signed red/green tint
in difference cells only, capped visually at ±10 percentage points. Uncertain differences
stay muted. The homepage has one 450ms CSS hero entrance; other content needs no scroll reveal.
Keyboard and repeated interactions are immediate. The full numbered owner decisions are in
[the design record](design/fullcourt-decision-record.md).

These decisions shipped in PR #84 (`776683e`), followed by the verified source refresh in
PR #85 (`34b8961`). [Release review](design/redesign-release-review.md) records validation.
Original exploration and intermediate checkpoints remain in Git snapshot `34b8961`.

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
| **The legacy `seed-season` path in `daily-update.yml`** | RETAINED | Depends on NBA API reachability; historical failures are not proof of present reachability. Prefer the documented hoopR/ESPN paths and verify the chosen provider before writing. |
| **`docs/archive/PLAYOFF_PREDICTOR_DESIGN.md` §7's seven "open questions"** | UNKNOWN | Most were answered by the build and the section was never updated. Design history, not a backlog — do not promote into the roadmap. |



### D-62 · Current documentation has one home — ACTIVE

Owner requested a repository-wide cleanup after deployment on 2026-09-08. Current references
are updated in place; roadmaps contain remaining work, handoffs summarize present state, and
this ledger preserves rationale. Research artifacts and ADR amendments remain reproducible.
Superseded UI mockups, completed task plans, intermediate audits, and duplicate screenshots
are removed from the working tree and remain in Git. Historical model/harness designs live in
`docs/archive/` with explicit status labels. `.gitignore` separates local caches and credentials
from reproducibility inputs and published data. The unused GSAP dependency is removed; runtime
behavior and ratified coefficients do not change.

The redesign shipped via PR #84 (`776683e`), followed by the verified Officiating refresh in
PR #85 (`34b8961`). Current scope: [Frontend](FRONTEND.md); release evidence:
[redesign review](design/redesign-release-review.md).

### D-63 · Explore uses large navigation tiles — ACTIVE

Owner selected option A on 2026-09-08: six equally weighted study links in two columns on
desktop and one on mobile. The whole tile is a link, with a visible arrow, descriptive action
and immediate interaction feedback. Research and the referee archive remain compact links
below. Implementation uses the existing type and spacing scales. This pattern serves topic
navigation; it does not replace analytical tables or the rest-focused homepage hierarchy.

The [Behind the Data audit](../anti-slop/audit-001-2026-09-08.md) was subsequently approved in full; see D-64.


### D-64 · Methods start with the explanation — ACTIVE

Owner approved the full design and humanizer audit on 2026-09-08. Behind the Data uses seven
compact topic tiles, a coverage link, four visible qualified null findings, and compact archive
links. Each of the ten articles has a current-topic disclosure, local contents, a visible scope
limit, and sentence-case headings. Technical evidence remains in native disclosures, with
expand/collapse controls, hash-link opening, and print expansion. Formulas, research tables,
source links, and stable section anchors remain available. Definitions use compact tables
where comparison is easier than prose. The referee archive retains its dense research table.

The shell is server-rendered; a small client enhancement handles deep links and printing.
No motion, accounts, analytical coefficient changes, or generated-data edits are introduced.


### D-65 · First-use clarity and an inspectable engineering story — APPROVED

Owner accepted the independent whole-service audit on 2026-09-08 and requested implementation
with a before/after review. The homepage demonstrates one real completed matchup, selected by
largest rest gap with the rested team at home. Games exposes exact four-night density and
separates altitude carryover from the current venue; gap labels describe magnitude, not win
confidence. These are read-path and presentation corrections, not coefficient changes.

Mobile Games originally kept date stepping visible and placed the calendar in a disclosure.
D-66 supersedes that calendar presentation with visible Season → Month → Date controls. Shooting keeps its primary comparison visible earlier, with optional
filtering, definitions and coverage below a short interpretation key. Study introductions name
their question, units and scope; causal and intentional-rest implications are removed where the
data only establishes association. Explore adds artifact-derived previews. Officiating initially
shows the common categories while keeping every category and shared rare-category selection
available.

About explains the purpose and author; `/how-it-was-built` provides a source-linked engineering
walkthrough. It describes verified system behavior without inventing adoption, personal ownership
boundaries or collaboration claims. A single footer makes Methods, About, the walkthrough and
source discoverable. No new motion is introduced. First-time participant and physical-device
validation remain open. See [implementation review](design/usability-audit-review.md).


### D-66 · Visible season navigation and complete public L2M season coverage — ACTIVE

Owner requested Season → Month → Date as the Games hierarchy on 2026-09-09. These controls
remain visible, restore from URLs, and scroll their selected month/date into the horizontal
viewport without moving the page vertically. Previous/next day actions remain available.
Season controls share one labeled component, sizing and typography across analytical pages;
page-specific all-season and career choices remain available.

Deep Dive uses the full desktop content width; supplementary content follows the table. At
narrower widths the table scrolls horizontally in a keyboard-focusable region. No columns are
silently cut off. The compact mobile rows retain their expansion behavior.

Playoff Rest replaces the equal-calendar-rest headline with “An early finish can mean more days off.”
The 2,545/2,545 post-Game-1 equality count was verified from the producing read query, but it
mostly described the shared series schedule. The underlying evidence and coefficients are unchanged.

Officiating adds all nine earlier seasons linked in the NBA's regular-season archive, yielding
12 seasons and 4,546 reports. The first season is partial; review criteria and grading changed
across eras. PDF extraction preserves source URLs/hashes and passes an independent IC/INC
column census. Ambiguous historical grades stay unclassified; missing text, video and crew
information is labeled. See the [archive evidence](research/2026-09-09-l2m-archive.md) and
[interface review](design/season-navigation-review.md). No motion was added.


### D-67 · A quieter homepage introduction — ACTIVE

On September 9, 2026 the owner chose to remove the complete hero matchup example rather than
select one of the three explored alternatives. Keep “Rest is a stat” and the existing description
exactly: “Understand the schedule behind an NBA game. Compare rest and travel, then check what happened.”
The description grows to 24px on desktop and 20px on mobile, with a readable line length. The hero
uses a single content column and intentional whitespace; the primary action and aggregate findings
remain. This supersedes D-65's homepage example decision. The example-only report and game reads
are removed from the homepage loader. No new motion is introduced.


### D-68 · Consistent controls and visible report sections — ACTIVE

On September 10, 2026 the owner requested consistent boxed controls across tabs and stronger
separation in text-heavy reports. Shared filters use 44px minimum height and 16px text. Analysis
uses equal-width labeled filters with season first; standalone actions and day/pagination arrows
use 44px targets. Dense desktop sort labels and multiline destination cards retain their distinct
roles. Season Report separates the result and interpretation with a rule and contrasting surfaces,
then frames team records and notable games as separate sections. About, engineering and Playoff
Rest use chapter dividers. Existing semantic data colors and motion policy remain unchanged.
See the [control and section audit](design/control-and-section-audit.md).


### D-69 · Publication-aware defaults and inspectable data status — ACTIVE

On September 11, 2026 the owner approved all seven findings in the
[recruiter and user audit](research/2026-09-11-recruiter-user-polish-audit.md).
Playoff Rest and Expected Shot Value default to their latest usable publication, while explicit
season selections remain authoritative. URL state preserves research selections and map controls;
copy actions include interpretive context. Loading or failed requests cannot display the previous
season's results under a new label.

The human-readable data-status page distinguishes database connectivity, data coverage and known
refresh evidence. Unknown refresh times stay unknown. The homepage historical date follows the
analysis evidence rather than the latest ingested score. The machine health endpoint is unchanged.

Games places its offseason notice with date controls on mobile, gives matchup controls distinct
accessible names, and reveals selected date controls after container resizing without moving
focus. Games has a specific page title, and player-count labels use the correct singular/plural.
The existing homepage hero and model outputs remain unchanged. See the
[implementation and verification record](design/seven-polish-fixes-review.md).

### D-70 · Home win-rate history and season context — ACTIVE

The owner approved a Home-court advantage study reached through Explore and a visible
home-baseline comparison in Season Report. Home win rate names the observed percentage;
home-court advantage names the broader topic. Neither the raw rested-home rate nor its gap
above baseline isolates a causal rest effect.

The study shows annual home and rested-home win rates together, with straight segments and
no fitted trend or smoothing. Exact counts, rates and gaps are available through season
inspection and an expandable newest-first table linking to Season Report. An unfinished
season is marked season to date; historical summaries use completed seasons only.

Season Report keeps its selected-season focus: home win rate, rested-home win rate and gap,
plus a study link, without repeating the historical chart. Home win rate appears from the
first eligible completed result. Rested-home rate and gap retain the 100-game display threshold
across both surfaces; historical measurement places that threshold roughly four weeks into
the season. No-results, insufficient-data and unavailable states remain distinct.

Use the existing Front Office design system and apply antislop during implementation. This
extends the venue-baseline reasoning in D-22 without changing the fatigue model or database
schema. The owner approved implementation after the publishing discussion; see
[research and agreed behavior](research/2026-09-11-home-advantage-trend.md).

### D-71 · Release-readiness pass before opening night — ACTIVE

The owner approved all thirteen decisions of the 2026-10-03 pre-launch audit at their
recommended options.

Next.js moves to 16.3.8 for GHSA-vcvr-r3jv-pc5j, in its own change. The Officiating collector
exits with a distinct status when the league has not yet published a season's first reports
and that season has never been published; the workflow ends cleanly. Any other failure, and a
missing index for a season already published, still fails the run.

Games renders nothing derived from today's date until the URL is read, because the page is
prerendered and the build's date is not the visitor's. A failed load retries once, then shows
one error with a TRY AGAIN control. Season Report opens on the latest season with completed
games and says so; an explicit `?season=` is always honoured.

Descriptions wrap with `text-wrap: pretty` and headings balance; headings carry no closing
period. Words are set in the body face and figures in tabular numerals; stat-tile qualifiers
follow that rule. Controls, sortable headers, text links and table rows gain hover and press
feedback. ADR 0010 is amended for one homepage bar draw; a motion library is deferred until
after launch.

`robots.txt` and `sitemap.xml` are generated from the route list, and every primary page has
its own description. Stat-tile unification and table column widths are deferred until after
launch. Playoff Rest keeps its section order. The public announcement waits for a verified
live pipeline run on 2026-10-20 or 21.

### D-72 · Turbopack build cache is off for production builds — ACTIVE

After PR #99 merged on 2026-10-03, production served a global stylesheet that matched the
previous `globals.css`: the new heading balance, description wrap and hover rules were absent,
while the page markup and the CSS modules from the same commit were live. A clean local build
of that commit emitted the rules, and building old then new over one local cache did not
reproduce the fault. `experimental.turbopackFileSystemCacheForBuild` is `false` so every deploy
compiles from source.

The build logs were read later the same day. The stale deploy (`afeb463`) restored the build
cache of the deploy before it (`71b0da7`, whose `globals.css` was the old one) and compiled in
12.7s. The first deploy with the flag off (`5058e98`) compiled in 17.7s and served the correct
stylesheet. That fits a stale cache entry; why Turbopack kept it for a changed file is not
known. Vercel still restores and uploads its own cache; only Turbopack's part is unused. The agent-rules block
`next dev` appends to `AGENTS.md` is committed, as the block itself advises.

### D-73 · Reading pages are structured, and the topic list is an overlay — ACTIVE

The owner found About and the engineering walkthrough too plain: paragraphs of one text colour.
Both now carry their content in structure, with no new claim added: numbered
chapters, a lead sentence, tinted scope notes, labelled rows and the Explore study card. The
walkthrough has a section rail that follows the reader. There is no hover decoration on prose.
The ten method articles keep their layout.

The method topic list used to open in the flow and push the article down. It now opens over the
page. `/data-status` has a loading state, because it reads the database on every request and a
press on its footer link showed nothing until the reads returned. Links that appeared twice on
one page were reduced to one: the index entry inside the topic list, the second link to the
archived referee methods, the second archive link, and the second link back to all methods.

The footer keeps `Find a page`. It is the only visible door to the page finder.

### D-74 · Public-launch notices: privacy page, non-affiliation notice, contact address — ACTIVE

Decided by the owner on 2026-10-05, ahead of the first public promotion.

- `/privacy` states what a visit records. The site has no sign-in, sets no cookies and writes
  nothing to browser storage; page views are counted by Vercel Web Analytics. The page names the
  three outside services a browser contacts: Vercel, Supabase (the live-score connection on Games)
  and ESPN (team logos). A change that adds a cookie, browser storage, a tracker or another outside
  host must update this page in the same PR.
- Team logos stay hotlinked from ESPN. The footer on every page says FullCourt is independent and
  not affiliated with or endorsed by the NBA or its teams.
- The public contact address lives in `src/lib/contact.ts`. The footer carries a `Report an error`
  mail link and a `Privacy` link.
- The database stays on the Supabase Free plan through opening night. Size on 2026-10-05: 318 MB of
  500 MB, of which `shot_grid` is 227 MB.

### D-75 · The database reconnect wait is capped at two seconds — ACTIVE

Approved by the owner on 2026-10-05. A rehearsal with the database unreachable showed every page
still opening and each failed read reaching its error card, but the driver's reconnect wait climbs
to 20 seconds, so from the seventh failed request each error took 6–18 seconds to appear.
`src/lib/db/reconnect.ts` caps the wait at 2 seconds. The same rehearsal after the change: every
request answers within 2 seconds.
### D-76 · Errors are reported to Sentry — ACTIVE

Set up with the owner on 2026-10-06. `@sentry/nextjs` reports errors only: no tracing, no session
replay, `sendDefaultPii` off. Settings live in `src/lib/sentry-options.ts`. The SDK is on only in a
production build with `NEXT_PUBLIC_SENTRY_DSN` set, so CI and an unconfigured clone send nothing.

- Browser errors: `src/instrumentation-client.ts`, plus `error.tsx`.
- Server errors: `src/instrumentation.ts`. API routes catch their own failures and log them with
  `console.error` before answering 500, so the server reports `console.error` lines; a thrown
  render error arrives through `onRequestError`.
- At setup, source maps were not uploaded. **2026-10-18 amendment:** PR #171 wraps shipping
  builds with `withSentryConfig`, uploads private maps and deletes public browser maps. A new
  bundled-event symbolication check is a separate acceptance gate; see TESTING_AND_CICD.md.
- The CSP `connect-src` names `https://*.ingest.us.sentry.io`. `/privacy` lists Sentry as a fourth
  outside service, which supersedes the count of three in D-74.
- Installing the SDK brought `brace-expansion` 5.0.5 through its build plugin; an override pins 5.0.12.

Measured cost: `.next/static/chunks` grew from 2,120 KB to 2,384 KB on disk, uncompressed.

### D-77 · The site's address is fullcourt.fyi — ACTIVE

The owner bought `fullcourt.fyi` on 2026-10-06 and it is attached to the Vercel project as a
Production domain, without the `www` redirect, so the bare name is the address. `SITE_URL` in
`src/lib/site-url.ts` now names it, which moves the canonical metadata, robots and the sitemap.
`fullcourt-nba.vercel.app` stays attached and keeps serving the site; it does not redirect.
Names containing "NBA" were set aside because a league mark in a domain invites a dispute.

Amended 2026-10-06: `fullcourt-nba.vercel.app`, `nba-rest-advantage.vercel.app` and
`www.fullcourt.fyi` now answer 308 to `fullcourt.fyi` with the path kept. The owner wants one
address; the redirects stay so links already shared keep working.

### D-78 · Phones and tablets get their own Games controls, and a scroller says it scrolls — ACTIVE

The owner tested on a phone on 2026-10-06 and named four faults: the Games month and date rows
scrolled sideways, the slate summary sat below the whole matchup list, wide tables gave no sign
that they scroll, and a mark painted over the pinned team column (fixed in PR #111). The owner
asked for a survey of other data sites, then approved every recommendation in it.

Measured at 390px before the change: the October date row was 808px of content in 309px, the
Schedule breakdown 778px in 343px, and the summary tiles began 2,571px down an eleven-game slate.

What changed:

- **Games dates.** Below `sm` the page shows one week of seven cells, steps by week, and keeps
  the month buttons and a month grid behind a Calendar button. From `sm` the month and date
  rows wrap instead of scrolling. Wrapping was not in the survey; it follows from the same
  measurement, because a full month is thirty chips and no desktop holds them in one row.
- **Slate summary.** One line of three figures above the matchups wherever the rail is absent.
  This amends row 30 of the design record, which had put the summary below the list on mobile.
- **Scroll cue.** `ScrollCue` fades the edge that hides content and a hint follows a table
  wider than its box. It replaces a 16px surface gradient that sat behind the cells.
- **Schedule breakdown.** Below `lg` it drops the rank and bar columns, which the chart above
  already draws, and fits a tablet outright.
- **Tablet.** The summary rail starts at `lg` (1024px) instead of `xl` (1280px).

Two departures from what the survey proposed, both on measurement:

- The rail starts at 1024px, not 768px. Beside a 260px rail the matchup table has 428px at
  768px and it needs about 600px.
- The Schedule table kept sideways scrolling with a cue on phones (the survey's C2). Letting
  the reader pick the number column (C1) was offered for after launch and is not built.

Not covered: Season Report, Analysis, Playoff Rest and Officiating were not gone through table
by table. Their `DataTable`s inherit the cue; their own layouts are unchanged. The survey of
other sites was at phone width only.

### D-79 · One Games layout, tip-off order, and blocks that read as blocks — ACTIVE

The owner reviewed the site on a phone on 2026-10-07, left nine comments, and ruled on the
five open choices after seeing each one before and after.

- **No Skim/Deep Dive.** On a phone the toggle added one badge; on a desktop it changed the
  page frame. It is removed at every width. Desktop always shows the rest-days, fatigue and
  gap-size columns; a phone shows the compact row and keeps the rest under expansion. The
  summary rail goes with it: the one-line summary sits above the matchups and Edges Ahead
  below. This reverses decision 5 (C5, the density dial) of ADR 0010 and the Deep Dive
  paragraph of D-66, and it supersedes the rail breakpoint in D-78. A `view` parameter in an
  old link is ignored.
- **Games order.** Matchups were ordered by away team id, which read as random. They are now
  ordered by tip-off time, then by the source event id. The tie-break was read from one ESPN
  scoreboard day (2026-10-21) and matched it; it is an inference, not a documented ESPN rule.
  How ESPN reorders live and finished games was not examined, and FullCourt does not reorder.
  Games before about 2002 have no stored tip-off and fall back to the id.
- **Dividers.** `--term-border` and `--term-hairline` were about 1.2:1 against the page ground
  and are a step darker. A page made of unlike text blocks gives each block a border and a
  tinted title band: the owner chose option D of four for Officiating plays on a phone, and
  the nearest equivalent for desktop, which is the same block at full width. This amends the
  hairlines-without-cards rule in FRONTEND.md rather than replacing it.
- **Season Report.** Team logos in the records table and the widest-gap rows, section title
  bands, a boxed caveat above the table, and an outcome label that is teal when the rested
  team won and gray when it lost (the owner's "try coloured").
- **Fatigue calendar.** It stays on Schedule Edge; placement was not the fault. It is renamed
  League fatigue by week and says what a bar is, with a dated axis and a week readout.
- **Column guide.** WHAT THESE COLUMNS MEAN is inside Show full breakdown.
- **Name.** Shooting by Rest is Player Shooting by Rest, chosen from the phrases offered. ADRs
  and earlier decision entries keep the old name as history. The route is unchanged.
- **Officiating filter row.** The chips, the All call types button and the team select share
  one centre line. The select still reads All teams.

Not covered: the band and table treatment also reach Home Court, which uses the same section
class and was checked only by screenshot. None of this has been seen on a physical phone.

### D-80 · Change freeze from 2026-10-17 until the first slate is verified — WITHDRAWN 2026-10-16 (D-97)

The owner asked on 2026-10-10 for a freeze date before the first game of 2026-27. The first
game is BOS at DET on 2026-10-20 at 3:00 PM ET; the stored schedule and ESPN agree.

The freeze starts 2026-10-17 at 00:00 ET, three days before that tip, so a late change has two
full days to show a fault before anyone depends on the site. It ends when the first completed
slate has passed the [live-season checklist](LAUNCH_DAY.md), no earlier than 2026-10-21.

During the freeze, `main` takes only: a fix for something broken on the live site, a repair to
the data pipeline, and a dependency pin for a security advisory. Each still needs the owner's
approval to merge. Layout, copy, naming and new features wait. Scheduled workflows keep running.

Nothing enforces this; branch protection cannot read a date. It is a rule for the owner and for
any agent working in the repo.

## D-81 — No in-game score; LIVE is read from the clock (2026-10-10)

The site does not show a score while a game is being played. Live scores are not what the
product is for, and the score writers cannot keep one current.

What was measured: GitHub starts both scheduled workflows two and a half to five hours after
their configured time (the last ten daily-update runs began between 23:38 and 01:41 UTC against
a 21:00 schedule). The daily job therefore lands in the middle of the evening games, and it
used to write an in-progress game as `live` with the score at that moment. On that timing
roughly half of the 1,200 games of 2026-27 would have shown a frozen score until the overnight
run.

Decided by the owner:

- The writers store finished games only. `reconcileScores` skips a game ESPN reports as in
  progress, for the daily job and the Vercel route alike.
- A row reads LIVE from its tip time for three hours, then PENDING until the score
  is stored, and returns to its plain tip time if no score arrives within twelve hours
  (`src/lib/game-phase.ts`). The labels come from the stored tip instant and the viewer's
  clock, so they are the same in every time zone.
- The status cell keeps one pattern: the top line is the state in capitals (LIVE, PENDING,
  FINAL) and the bottom line is the data (tip time or score). PENDING matches the word Playoff
  Rest already uses, and FINAL only ever sits over a score. LIVE is a label with a still dot
  and no row tint: most of an evening slate is live at once, so a pulse or a tint would cover
  the table and the large-gap accent edge would stop standing out. The row button's name
  carries the state and score for screen readers.
- Final scores are written about hourly. Vercel Hobby allows 100 cron entries, each once a
  day, each fired inside its hour, so `vercel.json` lists twelve, 21:00 to 08:00 UTC, on the
  existing route. A GitHub schedule cannot do this job.
- The Games board holds a game day until 6 AM ET (`slateDateKey`), because 182 games on 107
  dates are still being played at midnight ET.
- EDGES AHEAD drops a game once its tip time has passed.

Known limits: a postponed game reads LIVE for three hours, since nothing stored says it did not
start; a listed tip time is a few minutes before the real one; none of this has been seen
against a real slate.

## D-82 — Upcoming fatigue counts scheduled games; season travel is summed by leg (2026-10-11)

A read-only audit of 2026-27 found the schedule correct against ESPN and basketball-reference
(1,200 of 1,200 games) and three faults in what the site showed for games still ahead.

- **The nightly job scored upcoming games against finished games only.** `run-daily.ts`
  rewrites the next 14 days, and a prior game that was not `final` was dropped. Before opening
  night that overwrote projections with zeros, one more date each night (26 rows on 22 and 23
  October when measured). In season, the row shown on game day is written the evening before,
  while that evening's games are still being played, so a back-to-back was not counted until
  the next evening's run: about 330 to 365 of 1,197 game days in a replay of the season. The
  job now reads prior games from the schedule, the same basis `project_fatigue.ts` uses. No
  coefficient or scoring term changed.
- **3-in-4, 4-in-6 and the 30-day game count were recounted from finished games at request
  time**, so every date still ahead showed none beside a score that had charged for them.
  They now count prior games whether or not they have been played.
- **Season Report travel miles added up the stored 7-day rolling figure**, which counts each
  flight once for every game in the following week, about four times over (SAS read 217,826
  miles for 2026-27; leg by leg it is 54,043). `src/lib/season-travel.ts` charges each flight
  once, to the game it arrives at, using the fatigue model's own leg rule. This changes the
  column for every season. The stored `travel_distance_miles` and the fatigue score are
  untouched.

Known limit: a row shown on game day is still written the evening before, so the previous
night's overtime or blowout reaches it only at that evening's run. Rest days, back-to-backs,
density and travel are right from the start.

## D-83 — The score route rescores each finalized team's next game; method-page rates are pinned (2026-10-11)

D-82 left one limit: a game-day fatigue row is written the evening before, so the previous
night's overtime and margin reached it only at that evening's run, after most games had tipped.
`/api/cron/update` now closes it. After it stores a night's finals it rescores the next game of
each team that has just gone final, when that game is today or tomorrow (ET) and has not tipped
off (`gamesToRescoreAfterFinals`). It uses `refreshDailyGames` and the same database port as
`run-daily.ts` (`createDailyRefreshPort`), so both paths read prior games on one basis. The
rescore runs after the score writes and inside its own guard: a failure is logged, reported as
`meta.fatigueRescored: null`, and costs no final. The nightly job is unchanged and still
rewrites the following fortnight.

A game that has tipped off is never rescored, so a row does not change under a game in
progress. Not exercised against a real slate; the selector is unit-tested and the scoring path
is the one the nightly job already uses.

The three home win rates on the rest-advantage method page (both teams travelled in, home flew
farther, home ended a road trip on a back-to-back) were typed prose, and one went stale after
the 2026-10-04 corrections. `scripts/measure_home_rest_confound.ts` now writes
`ml/home_rest_confound_facts.json`, mirrored in `src/lib/home-rest-confound-facts.ts`, printed
by the page and pinned by `home-rest-confound-facts.test.ts`.

## D-84 — Audit remediation uses prospective transaction-bound refresh and bounded freshness (2026-10-11)

Michael approved implementing the proposed audit report changes on 2026-10-11. This decision
supersedes D-83's event-only recovery and the daily script's all-status refresh selection.
Deployment remains pending an explicit owner yes to merge; no production data repair is implied.

- Automated cron, nightly and projection writers pass a game ID to one transaction boundary.
  It acquires the parent game lock before reading a fresh single-statement input snapshot,
  computes unchanged fatigue coefficients, and replaces both fatigue rows and open prediction
  atomically. A resolved prediction is retained without introducing another open pick.
- Automated refresh is prospective only: scheduled with a known future tip. Unknown tips are
  skipped conservatively. Actual database-clock checks protect the write and roll back if tip
  passes during it. This is not an exact guarantee about the instant a commit becomes visible.
  Historical repair remains a distinct manually scoped operation; it must not overlap regular
  writers. No schema migration is part of this decision.
- Cron recovery runs independently of this call's new finals or feed success. It finds each
  team's current next eligible game today/tomorrow ET when a prior final is in the model window.
  Completed score writes survive refresh failure. Failures and budget deferrals are explicit;
  oldest refreshed targets receive priority. The 08–21 UTC cron gap remains a recovery limit.
- Score-sync date fetch failures produce a degraded nonzero result. The daily parent may run
  safe downstream steps against retained stored data while keeping its final failure status.
- Held analytics have absolute loader-start age limits: five minutes for current/upcoming
  season data and one hour for historical data, with bounded single-flight waiting. CDN
  freshness is separate (current: 60 seconds plus 60 seconds SWR; historical: one hour plus
  five minutes SWR). This bounds previously indefinite cache reuse, not every dependency's
  immediate invalidation or freshness while providers fail.
- Games invalidates and refetches a complete slate instead of permanently overlaying score
  changes on old fatigue. Visible online refresh has a one-minute fallback. Client check time
  means successful page fetch, not pipeline success. Edges Ahead also filters on its local
  clock and requests a small ranked reserve; the default full upcoming API remains compatible.
- UI polish keeps the existing brand, evidence baselines and information hierarchy: named
  method links, schedule-derived opener explanation, readable Shot Value guidance, explicit
  Pick/Hindsight interpretation and discoverable Model section links. Generated values stay
  unchanged. Conditional performance redesigns require measurements before changing architecture.

Verification and remaining limits are recorded in the remediation report and the three focused
implementation notes. Actual opening-night checks and all owner-only launch items remain open.

## D-85 — Generated publication uses observed coverage, exact identities and monotonic source time (2026-10-12)

Michael approved the three generator safeguards after the item24 source differences were
reported. This is source-code protection; it does not authorize publication of new figures
or production data writes. A separate owner yes remains required for this PR's main merge.

- Referee whistle coverage comes from collected games; foul-style coverage comes from its
  own eligible regulation/full-stream population. Configured input seasons do not establish
  observed coverage. Empty populations and collected counts below each existing published
  population stop generation before corpus or product output writes. Existing incomplete
  summaries remain distinct from provider failures and unmatched identities.
- Four corrected 2019–20 dates have an explicit NBA-game-to-ESPN-event crosswalk, checked
  against stored date/season/teams/final scores and authentic summary identity. NBA source
  evidence is retained in the generator verification record. Ordinary matching keeps its
  same-date rule; no generic adjacent-day fallback is introduced. Known exceptions whose
  required identity cannot be verified stop generation. Scoring/aggregation terms stay intact.
- Officiating snapshots require timezone-aware finished_at. Existing published refreshedAt
  must also be valid. Compare instants, reject older input, and permit equal-time retries only
  for the same index hash and report ID/hash/source sets. Crew normalization is separate from
  source time. The whole CLI batch validates before writing, including repeated seasons
  compared with preceding staged results. Existing ID/hash/grade validation remains required.
- A count floor is a loss guard, not proof of complete corpus membership continuity or fresh
  provider accuracy. The latest 2025–26 Officiating snapshot and full upstream Legends
  regeneration remain unavailable; item24 stays partial. Published JSON remains unchanged.

[Verification record](research/2026-10-12-generator-publication-guards.md) distinguishes local
regeneration, regression tests, independent review and any later deployment.

## Selected motion audit fixes — 2026-10-14

The owner selected all five corrective findings: immediate Analysis tooltips, shared Games
control feedback, reduced-motion-safe threshold drill scrolling, immediate fatigue fills,
and reduced-motion-safe Schedule guide rotation. These align repeated reading and
accessibility with the existing Motion contract; no new motion moment or dependency is added.
Homepage entrances, bar drawing, route crossfades, record expansion, analytics and model
semantics remain unchanged. The numbered [plans](../plans/README.md) record baseline and
verification. Local completion does not authorize deployment: credential rotation is pending,
and each main merge still requires explicit owner yes.

## CI/CD hardening — 2026-10-15

The owner approved F1–F7 in the CI/CD audit. Keep the existing required `verify` name but make
it an always-run aggregate of correctness/build, deterministic rendered browser and disposable
PostgreSQL contracts; reject any non-success prerequisite. PR jobs stay secret-free and use
reviewed Action commit pins. Full dependency findings are monitored separately from the
required production audit. Use the mature shadcn parent release with a compatible patched MCP
SDK and a narrow proxy-addr security pin; do not relax package release-age policy.

Daily work uses 21:17 UTC, non-cancelling GitHub concurrency, a bounded job deadline and safe
per-stage summaries. Partial optional context is degraded; critical failures propagate after
useful downstream work. Known blocked manual sources fail before secret access. Provider
probes explicitly distinguish expected blocks from actionable failures. A six-hour due-run
monitor detects execution problems but is not independent of GitHub or database-freshness proof.
Scoped fatigue ages are estimates because stored timestamps lack timezone metadata.

Main base freshness and administrator enforcement are enabled, preserving `verify` and bans
on force-push/deletion. Vercel imports GitHub `verify` as a blocking Production promotion check;
no new token or privilege is granted. It gates domain assignment, not builds or owner approval.
CodeQL stays active and reviewed separately; a second human approval is not required for the
solo owner. Exact-SHA preview and owner-approved main merge remain necessary after credential
rotation is confirmed. Actual failed-promotion behavior and subsequent schedules cannot be
claimed from local tests or saved settings.

The new browser gate reproduced Escape and rapid-reopen focus loss in the existing command
palette. A narrow focus-restoration correction preserves navigation and avoids focus theft
from a reopened dialog. Broad UI audit suggestions remain separate. No fatigue coefficient,
published analytical figure, application schema or production data is changed.

## D-86 — `daysRest` means full days off; the storyline names teams (2026-10-15)

The Games board printed the fatigue model's `daysSinceLastGame` as days rest, so a
back-to-back read 1D. `FatigueInfo.daysRest` is now full days off (`daysOffBeforeGame`,
`src/lib/days-off.ts`): a back-to-back is 0, written "0 days" in the expansion. The model
keeps `daysSinceLastGame` because its ratified terms are written against that count; no
score, rest advantage or published rate moves. The storyline names each team by the
nickname it played under that season (`getTeamBranding`), and every clause carries its own
verb ("playing a 4th game in 6 nights") so a nickname reads as a sentence. Owner chose
"76ers" over "Sixers". The player-shooting rested bucket (days since >= 3) is relabelled
"2+ days off" rather than moved: a 3+ days off cut halves the effect and splits the age
bands, most likely injury returns. Schedule Edge's rest-day cap still says "days off" over
a days-since count — left for the owner's site-wide audit.

## D-87 — The rest gap is compared and shown at two decimals (2026-10-15; display revised by D-98)

Reverses D-13. Fatigue scores are stored to two decimals, but the gap was a bare float
subtraction, so 69 games whose stored gap sat exactly on a threshold computed just below it
(`4.35 − 3.85 = 0.49999999999999956`). Measured on 2026-10-15: 5 games out of the headline,
17 out of RA ≥ 2, and 1,862 Games-board rows whose one-decimal figure contradicted their
badge ("EVEN 0.5" beside NEUTRAL, "2.0" outside GAPS OF 2+). `restAdvantageDifferential()`
now rounds the gap to two decimals before any comparison, and the board, Edges Ahead and the
explorer print the gap and the two scores at two decimals, so every row agrees with itself
and with the published statistics. The headline goes 27,404 → 27,409 games (61.2% unchanged),
RA ≥ 2 61.9% → 61.8%; `ml/rest_split_facts.json`, the home-advantage research files and the
ablation table were regenerated by their scripts. Five past called games have no prediction
row; `scripts/backfill_predictions.ts` inserts them (owner-run DB write).
`src/data/win-total-benchmark.json` was regenerated afterwards, once the script had
reproduced the committed file at the pre-D-87 commit: r −0.0150 → −0.0149, every bucket
unchanged, and the page prints −0.01 either way.

## D-88 — The availability rotation window resets each season (2026-10-15)

`ml/availability_facts.py`, `availability_quality.py` and `availability_cost.py` kept one
rotation window per team across seasons, so in games 1–4 of every season last spring's
departed players counted as missing (3.9 missing rotation players per opener against 0.8 from
game 6 on). The window is now keyed by team-season, and a team is measured once it has five
games of that season: the published definition applied literally. Best player out moves
2.86 → 2.97 points, home court 2.82 → 2.85, the sample 35,458 → 33,166 games; every schedule
term still moves under 8% when absence is controlled. "Similar in size to home court" still
holds (0.12 points apart, inside either standard error). The page now says a long absence
counts for its first four games only, and that the rotation average is per appearance.

## D-89 — The shooting rested arm is 2–29 days off (2026-10-15)

The /shooting rested arm (days since ≥ 3) also held every season opener and every return
from a long absence: together 97,993 of its 1,551,764 attempts (6.3%). Neither is rest
between games. The arm is now 3–30 days since the player's previous game, written "2–29 days
off"; the ceiling removes every opener (the shortest opener gap is months) and every absence of
a month or more, and the tighter ceilings measured beside it (≤ 14, ≤ 7)
were not taken, since choosing among them by the effect they leave is choosing by the result.
Rested attempts 1,551,764 → 1,453,771; the pooled league difference +0.57 → +0.69 points and
the career mean +0.26 → +0.36. No career estimate flips beyond its own standard error. The
site prints no league figure, so the change reaches readers through every player row.

## D-90 — The time-zone null keeps its definition and publishes a sensitivity check (2026-10-15)

The pre-registration says short rest is "≤ 1 day of rest"; the test counts it as the visitor
playing the previous night (days since ≤ 1), which matches the repo's units when it was
written, while a code comment described the wider reading. The pre-registered definition
stands. The wider one (at most one day off) is now run in the same script and published
beside it: the four candidates are worth +0.00005 instead of −0.00003 and the primary term is
still zero in every fold, so the null holds under both. `ml/timezone_test.py` now writes
`src/data/timezone-null.json` itself instead of the figures being transcribed. The overlap
figure the page printed as "86.4% are ALSO back-to-backs" measured the model's
back-to-back difference term; every short-rest visitor is on a back-to-back, and the page now
shows both.

## D-91 — Labels follow the computation; the 2026-10-15 audit's copy decisions (2026-10-15)

The label-and-data audit (`docs/audit/2026-10-15-labels-and-data/`, local) found the data clean
and about ten labels that said something the code does not. Owner decisions, each measured first:

- **Schedule Edge 2026-27 is labelled PROJECTED**, not restricted to played games. Projection vs
  the final ranking back-tested at Spearman 0.956 / 0.978; restricting would empty the page on
  opening night. The API carries `league.projectedGames`.
- **The rest-day cap is relabelled, not moved**: `REST_DAYS_CAP = 5` is days since, four days
  off. The stated reason ("rest stops helping after three days") was false, since the model's
  freshness credit starts after day 3 and keeps growing; the All-Star break is the real reason
  and is now the one given.
- **Edges Ahead stays home-only** (called games), headed RESTED TEAM AT HOME, with PROJECTED marked
  per row rather than over the whole strip. Rested visitors win 42.4%, so listing them would read
  as a pick the site declines.
- **Referee copy keeps "credits all three, cannot isolate one"**; the "about a third" rule is
  struck from AGENTS.md, `referee-legends.ts` and D-33.
- **Games board**: a neutral-site host reads NEUTRAL, not HOME, and keeps its road streak (the
  model scores it as a road team); TIME ZONES shows for either team; the board city is the
  brand's place name; historical abbreviations are used in the explorer and recent results; AVG
  REST GAP counts exact-zero games; flag chips fit the strip by width.

Altitude carryover (code applies it to the next game at any gap; every written source says the
next night) is not decided here: it changes a ratified term and needs a production recompute, so
it goes through its own ADR after the D-80 freeze.

## D-92 — A neutral-site game has no home court, so it is never called and never sets a venue baseline (2026-10-15)

`isCalledSide()` used to call the listed host of a neutral-site game (London, Paris, Mexico City,
the NBA Cup final) as though it were at home, and every venue baseline counted the host's result
as a home win or loss. The fatigue model already scores that host as a road team (D-91), so the
backtest was crediting a home court the model said was absent. Owner decision: exclude.

- `isCalledSide(advantageTeam, neutralSite)` takes the venue as a required argument, so the
  compiler finds every caller. A neutral game is never called: not in the headline, the
  thresholds, the home/away breakdown, the venue baseline (overall and per season), the Season
  Report home rate, or the daily writer's predictions. It still advances `latestEvidenceDate`.
- Producers re-run after reproducing their committed baselines byte for byte:
  `scripts/measure_uncalled_half.ts` (`ml/rest_split_facts.json`),
  `scripts/measure_home_rest_confound.ts` (`ml/home_rest_confound_facts.json`) and
  `ml/ablate_fatigue_terms.py`. Research scripts with dated outputs were made to compile with the
  same rule and were not re-run.
- Measured impact (31 neutral scored games): headline 27,409 → 27,400 games, still 61.2%; venue
  baseline 47,143 → 47,112, still 59.9 / 40.1; rested visitors 42.4% of 11,548 → 42.3% of 11,537
  (lift over the road baseline 2.3 → 2.2 pp); the travel ablation row 5,986 at 59.07% →
  5,985 at 59.06% (+0.35 → +0.36 pp). No verdict on the site changes.
- The 9 graded neutral rows in `predictions` are deleted with the owner's approval at merge, so
  `verify_predictions` stays clean.

## D-93 — The /home-court gap is the difference of the two rates printed beside it (2026-10-16)

`restedHomeGap()` computed the gap from raw counts, so in 9 of 41 seasons it read 0.1 away from
the subtraction a reader can do on the row. Twice that put a +0.1 gap beside two identical
rates (1987-88 at 67.9 / 67.9, 1997-98 at 59.5 / 59.5). Owner decision: print the difference of
the printed rates via `liftOverBaseline()`, as `/behind-the-data/rest-advantage` already does.
The value can sit up to 0.1 from the exact figure, which is the precision the rates carry.

## D-94 — The officiating splits credit the working crew, as the foul tables already do (2026-10-16)

`scripts/analyze_officials_splits.ts` credited every name in ESPN's officials array, so a name
listed twice or a standby at order 4 was counted as a game worked. `fetch_officials.ts` has used
the working-crew rule (sorted by `order`, deduplicated, first three) since 2026-08-24; the
splits script now uses the same rule. This is a correction to how games are attributed, not a
new axis under ADR 0007. `src/data/referee-timing.json` was regenerated after the unchanged
script reproduced it: 12,403 games and every headline count unchanged; four published rows lose
one to four games (Tyler Ford 611 → 607, shift −1.45 → −1.46), and no row crosses the bar.

## D-95 — The Games table drops its days-rest column and shows up to four flags per line (2026-10-16)

The owner judged the REST (DAYS) column not worth its width: the fatigue score already carries
rest, and the column left a gap between the matchup and the fatigue score. Days rest stays in
each game's expansion. Its width went to the flag strip, which now shows up to four chips
(200px) instead of two. Over every regular-season team-game since 1985-86, 3.6% carry four or
more flags and 0.4% carry five or more, so the old limit of two put a `+N` on about one line in six; the
new one leaves it on the 0.4%. The columns were rebalanced so the space between matchup,
fatigue score, rest advantage and gap size is even (about 94 / 112 / 101px at desktop width).

## D-96 — The Games board marks only a big rest edge, and its guide quotes the rate without the baseline (2026-10-16)

The gap-size column's four badges (NEUTRAL under 0.5, SMALL to 1, MEDIUM to 2, LARGE at 2+)
implied a ladder the results do not show. Measured ad hoc on 2026-10-16 over the called games
(rested team at home), the rested home team won 60.7% at 0.5–1, 60.0% at 1–2 and 59.5% at 2–3,
which is home court, then 61.8% at 3–5 and 65.3% at 5+. A rested visitor won 42.1% at 0.5–3 and
43.8% at 3+, so a LARGE badge on a rested visitor marked a team that usually loses. The 1.0 line
was left over from an older card. The owner chose one mark: a purple BIG REST EDGE badge, and the
row's accent edge, only when the rested team is at home, off a neutral site, by 3 or more. That is
exactly the backtest's 3+ bucket (`isBigRestEdge`, and a test pins 3 to `BACKTEST_THRESHOLDS`), so
the board marks the games the published rate is about. Every other row is blank, the column
is headed EDGE, and the slate summary's GAPS OF 2+ tile became BIG EDGES, counting the same games. 5+ was considered and refused as too rare: 49 such games in the 2026-27 schedule
against 192 at 3+.

A closed "How to read the board" toggle explains the three columns. Its BIG REST EDGE line reads
the 3+ rate and game count from `/api/analysis`, never typed. The owner decided it leaves out the
home-team baseline ("home teams win about 60% anyway"): the line is a reading key, not a claim, and
the venue comparison stays where the backtest itself is published. This is a deliberate exception to reading
every published rate against the venue baseline, scoped to this legend.

The refresh link became the owner's mock C: "Updated" with the receipt time beside a 32px outline
icon button in the heading row, which also absorbed the "View fetched at … (your time)" line under
the table.

## D-97 — The launch change freeze is withdrawn (2026-10-16)

The owner withdrew D-80 the day before it would have started: there is still work to ship before
and during opening week, and a freeze would hold all of it. `main` takes changes as before,
through the `verify` check and the owner's approval of each merge. The live-season checklist in
`LAUNCH_DAY.md` still applies to the first completed slate; it is a verification, no longer the
end of a freeze. Dependabot #131 and #128, held for the freeze, can be merged on their own checks.

## D-98 — Fatigue scores and rest gaps print at one decimal, cut rather than rounded (2026-10-16)

Revises the display half of D-87; the comparison half stands. The owner wanted a smaller, cleaner
figure ("X.Y, not X.YZ") with the calculation left alone. Nothing in the calculation changes: the
model rounds each score to two decimals when it computes it (`src/lib/fatigue.ts`), the gap is
rounded to two decimals only to remove float error (D-87), and every threshold, badge, backtest
bucket and published rate reads those values. Only the printed figure changes, through
`cutToTenths()` in `src/lib/rest-advantage-display.ts`, on every page that prints a fatigue score
or a rest gap.

Cut, not rounded, because each line the site draws (EVEN under 0.5, BIG REST EDGE at 3) is a tenth,
and a value is at or above a tenth exactly when its cut is. Measured on 2026-10-16 over 48,431
regular-season games: cutting puts no figure on the wrong side of a label; rounding puts 983 there
(749 "EVEN 0.5" rows and 234 rested-home rows printing 3.0 with no BIG REST EDGE), the D-87 problem
again. The cost the owner accepted: because the two scores and the gap are cut separately, the
printed scores differ from the printed gap by 0.1 in 20,889 of those games (rounding: 11,647), and
a cut figure reads up to 0.09 low. The slate's AVG REST GAP tile, which was rounded, is cut too, so
the board has one rule. Other statistics (correlations, expected wins, percentages) keep their own
precision.

## D-99 — Games gets a BY TEAM view, and the day arrows move onto the DATE label's line (2026-10-17)

The owner asked for one team's season with a simple rest advantage, after looking at a team
schedule page that listed date, opponent and time. Games now has two views behind BY DATE / BY
TEAM tabs (`GamesViewTabs`): the slate, and `/games/team?team=HOU&season=…`, read through
`GET /api/games/team`. The route is static with query parameters because the page-contract test
walks literal routes. The table is G · DATE · TIME (ET, or the result once final) · OPPONENT (full
branded name) · REST ADVANTAGE. The gap is turned to the selected team's side: +X.Y in the
rested color when the team is fresher, −X.Y in the fatigued color when the opponent is, EVEN under
0.5, and BIG when the board's own rule (`isBigRestEdge`) marks the game, whichever side it
favors. No flags, by owner choice. A phone drops G, the weekday and the time. The reader is the
board's own (`publishableGames()` plus the same fatigue pair), so a game shows the same gap on
both views; an e2e test compares the sign against `/api/games/[date]`.

On the board, the desktop day arrows sat at the ends of the date-text row, so they moved as
the weekday's length changed. They now sit at the right of the DATE label's line, clear of its
rule, and the long date moved into the Matchups heading. The phone keeps its week strip and
week arrows.

Amended the same day. Mid-season, a final shows its result where the time was ("W 116–89"),
as ESPN does, and a game that has tipped reads LIVE then PENDING on the board's clock. A phone,
which has no TIME column, puts the result under the date. The league released 80 games per team
for 2026-27 and leaves two open until the NBA Cup group stage ends, with no dates announced
(only the gap between the Dec 4–5 quarterfinals and the Dec 11 final). Those show as two rows
reading NBA CUP GAME · TBD, dated "Early Dec", with no opponent, time or gap, placed after the
team's last game on or before the quarterfinals and counted in the game numbers. They disappear
once ingest adds the real games.

## D-100 — The altitude carryover (ALT TRIP) is removed from the model (2026-10-17)

Settles the question D-91 left open. The owner chose removal over fixing the gap rule or hiding
the flag. The term charged 1.06 on the game after a road game at altitude, at any gap, while the
copy said the next night; ADR 0006 had measured it at 0.003 points. Removing it moves no published
rate at one decimal (headline 61.2%, baseline 59.9%, 3+ bucket 63.1%); the figures and the reasoning
are in the ADR 0006 amendment of the same date. A term that kept moving scores with its flag
hidden would be harder to explain than either keeping or removing it.

Changed with it: `fatigue.ts` charges altitude only for tonight's venue; the board shows ALT only
for a visitor at altitude (or either team at an elevated neutral site), and the matchup line no
longer says "after an altitude trip". The altitude flag now also requires tonight's venue to be at
altitude, so a row stored with the old 1.06 cannot raise it. The stored final and projected rows
that carried the term are recomputed, and `ml/rest_split_facts.json` is regenerated from them.


## D-101 — The Games board marks two sizes of rest edge, medium and large, and "big" leaves the board (2026-10-17)

Amends D-96. The site used "big" for three different gaps: 3 on the Games board, 1.5 on
/schedule and 7 on the home page. Measured on 2026-10-17 from the local feature export over the
called games, the rested home team won 60.0% at 0.5–3 (home court, 59.9%), 61.9% at 3–5 (6,707
games) and 65.3% at 5+ (3,756 games). A rested visitor won 42.0%, 43.8% and 44.7% over the same
sizes, below an even game at every size. The owner chose one vocabulary for every tab: EVEN under
0.5, small 0.5–3, medium 3–5, large 5+, with "3+ edges" for a combined count.

On the Games tabs the BIG REST EDGE badge becomes MEDIUM REST EDGE (outlined) or LARGE REST EDGE
(filled), still only for the rested team at home off a neutral site (`restEdgeSize`,
`src/components/matchup-parts.tsx`; a test pins 3 and 5 to `BACKTEST_THRESHOLDS`). A small gap
earns no mark, because it is home court and nothing more. The row's accent edge marks both sizes.
The slate summary's BIG EDGES tile becomes 3+ EDGES and BY TEAM's BIG REST EDGES count becomes
3+ REST EDGES, counting the same games as before; BY TEAM's row marker reads MEDIUM or LARGE. The
board guide quotes each size's rate and game count, large from the 3+ … 5+ cumulative buckets
`/api/analysis` already ships and medium as the 3+ bucket less the 5+ one (`restEdgeRates`), still
without the venue baseline under D-96's exception. The board's last column minimum grew from 120
to 160px so MEDIUM REST EDGE fits beside the chevron at the table's minimum width. D-96's refusal
of a 5+ mark as too rare is reversed: it now marks the larger of two sizes rather than standing
alone. The other tabs (/analysis, home page, /schedule, Behind the Data, /season) move to the same
vocabulary in their own changes.

## D-102 — /analysis reads the rested-home rate by three disjoint gap sizes and by era (2026-10-17)

Follows D-101. The page charted cumulative thresholds (RA ≥ 2 … ≥ 7), where every bucket repeated
the games of the ones above it, so a click on RA ≥ 2 opened the 5+ games as well and "is a bigger
gap worth more" compared mostly the same games. Its season chart split 41 seasons, about 90
large-gap games in an average season (3,756 over 41), with whiskers too wide to read one season.

The owner approved, on 2026-10-17: the ranges small 0.5–3, medium 3–5 and large 5+, each game in
one (`GAP_RANGES`, `src/lib/rest-advantage-evidence.ts`; a test pins the bounds to the board's
MEDIUM and LARGE lines). The "ANY GAP" tile becomes HOME TEAM MORE RESTED with "GAP 0.5 OR MORE"
on its detail line, because "any gap" read as every game. The gap-size chart plots each range
against the venue baseline with a 95% whisker, and a bar click opens that range's games. The
season chart is replaced by five-season eras (`groupSeasonsIntoEras`, complete seasons only), each
range read against the era's own home rate, beside a line of home court by season so the drift in
the baseline is visible on its own. The reading paragraph names all three ranges, calls a lift
inside 1.96 standard errors "within the noise", and says the gain sits in the bigger gaps only when
large clears small by more than their combined standard error (`buildAnalysisClaims`).

The explorer replaces its minimum-gap filter with Rest gap (all, small, medium, large) and Rested
team (home, visitor, either), defaults to the rested team at home so its rows match the rates
above, and leaves out neutral-site games. `/api/games/search` takes `gap` and `side`; `minRA` stays
for other callers. `/api/analysis` keeps `thresholds` (the Games board reads them, D-101) and its
`seasonMinRA` parameter, which no page sends now.

## D-103 — Schedule Edge's big edge starts at 3, the medium gap size (2026-10-17)

Follows D-101 and D-102. Schedule Edge counted a fatigue gap of 1.5 or more as a big edge, so a
1.5 gap was big on /schedule and small on Games and Model Results. The owner approved, on
2026-10-17, moving the line to 3: `BIG_EDGE_FATIGUE_THRESHOLD` now reads the medium range's floor
from `GAP_RANGES`, so a big edge is a medium or large rest edge on every tab, and the page copy
reads the constant instead of typing 1.5. The 0.5 call line, net edge games and the Worth column
are unchanged; only the big-edge counts shrink. The constant lives in `schedule-disparity.ts`, not
`fatigue.ts`, so it is not a ratified coefficient.

## D-104 — The home page's widest-gap finding reads the large gap size, 5+ (2026-10-17)

Follows D-101 and D-102. The home page's rest finding compared the venue baseline with the
rested home team at a gap of 7 or more, a cutoff no other tab used. The owner approved the gap
sizes on 2026-10-17, and the finding now reads the large range's floor from `GAP_RANGES`
(`historicalHomeFinding`, `src/lib/home-findings.ts`), so it counts the same 5+ games that
/analysis calls large. `/api/analysis` already ships a cumulative 5+ bucket, so no query or
artifact changes. The copy names the size instead of the superlative: "Large rest gaps", "a large
rest gap (a rest-advantage gap of 5 or more)", with the number read from the same constant, and
the bar reads "Rested home team · large gap".

## D-105 — Season Report's per-season tier reads the medium gap size, 3+ (2026-10-17)

Follows D-101, D-102 and D-103. `/api/season-report` returned one gap tier beside the overall
rested-home rate, the called games at a gap of 2 or more (`atLeastTwo`). The page never rendered
it, so no copy changes, but 2 is not a line in the site's vocabulary and the field was the last
tier on the season path that disagreed with it. `THREE_PLUS_THRESHOLD` in `season-report.ts` now
reads the medium range's floor from `GAP_RANGES`, and the field is renamed `threePlus`: the called
games at a gap of 3 or more, the same "3+ edges" the Games board and Schedule Edge count. The
comparison runs on the two-decimal gap (D-87), so 2.99 is out and 3.00 is in. The overall rate,
team records, widest-gap list and weekly curve do not read the tier and are unchanged. A separate
large (5+) tier is not added: one season holds too few large-gap games to read.

## D-106 — Behind the Data's rest-advantage tables read the three gap sizes (2026-10-18)

Follows D-101 and D-102 and finishes the move. `/behind-the-data/rest-advantage` printed the
rested road team by cumulative rungs (≥ 2 … ≥ 7) and named each era's best rung, so every rung
repeated the games of the ones above it, as on /analysis before D-102. `scripts/measure_uncalled_half.ts`
now writes `ranges` (small 0.5–3, medium 3–5, large 5+, from `GAP_RANGES`, each game in one) in
place of `ladder` for both venue rows and every era, and the page's tables and notes read them.
It was re-run against the database on 2026-10-18 after the owner moved Supabase to Pro: every
total matched the previous run, and each range equals the old rungs subtracted. The note that
quoted the last ten seasons' ≥ 4 rung (52.4%, 229 games) now quotes the last five seasons'
medium size (52.1%, 240 games), the group above even on a sample of 200 or more, so "no threshold
rescues it" stays retired. Pooled over every season, no road size reaches even. The test that
pinned the home row flattening between gaps 5 and 7 is removed, because the large size no longer
splits above 5.

## D-107 — BY TEAM rows open their game on the board, and the columns share the width (2026-10-18)

Amends D-99. The owner found the team schedule's columns uneven: G, DATE, TIME and REST
ADVANTAGE shrank to their content, so OPPONENT took 892 of 1,232px at 1440px and the gap sat
stranded at the far right. From the small breakpoint up the columns now take shares (6%, 18%,
18%, the rest, 20%); a phone keeps them sized to content. The owner also asked for a way from a
row to that game's detail, and chose the board over an inline expansion: each row links to
`/games?season=…&date=…&game=<id>#game-<id>`, which the board already opens and scrolls to, the
pattern Season Report's loudest calls use. An inline expansion would have duplicated the board's
detail panel and needed the fatigue breakdown in `/api/games/team`. The OPPONENT name is the real
link; a click elsewhere on the row follows it, and a chevron marks the row except on a phone,
where the gap column has no room. The link is a client navigation and the board replaces rather
than pushes its first URL, so Back returns to the team's season at the same scroll position.

## D-108 — "3+ rest edge" on every tab, the venue said beside it, and "gap" kept for the fatigue gap (2026-10-18)

From the 2026-10-18 full-service audit, on the owner's direction. Three labels counted the same
medium-plus-large gaps under different names: the Games slate's "3+ EDGES", BY TEAM's "3+ REST
EDGES" and Schedule Edge's "big edge" / "big (3+)". They now all read "3+ rest edge(s)"; "big edge"
is retired from the UI (the `BIG_EDGE_FATIGUE_THRESHOLD` constant keeps its name). The label
names the gap only, and which games are counted is said beside it: the Games and BY TEAM tiles
count only games where the rested team is at home (`restEdgeSize`) and say so beside the figure
(`SummaryItem.note`): AT HOME on the Games slate, where a longer note would push the first game
under the phone dock, and RESTED TEAM AT HOME on BY TEAM, where "at home" alone could read as that
team's home games. Schedule Edge counts either venue and its column definition says so.
The league field `gamesWithLargeEdge` is renamed `gamesWithThreePlusEdge`, since "large" means 5+
since D-101.

"Gap" means the fatigue-score difference everywhere since D-101, but Season Report's "Gap from
home rate" and Home-Court Advantage's "Gap" column were percentage points from the home baseline.
They now read "Vs home rate" and "Vs baseline", as /analysis and Behind the Data already did.

Removed as unused in the same pass: the cumulative 2+ and 7+ backtest buckets (`BACKTEST_THRESHOLDS`
is now 3 and 5, the two the board guide and home page read); Season Report's `netEdgeGames`, which
no page rendered and which counted opener games that Schedule Edge's field of the same name
leaves out, so four teams in 2024-25 differed by one; the per-team rest-days edge counters in
`schedule-disparity.ts`, which never left the module; and `buildRestAdvantageEvidence` /
`toEvidenceSource`, which had no caller. The Games badge thresholds now read the gap sizes'
floors. `src/data/win-total-benchmark.json` was regenerated after D-100: r −0.0149 → −0.0114 on
the same 884 team-seasons, still no relationship, displayed as −0.01 as before.

## D-109 — One name for the called group: "rested team at home" (2026-10-18)

From the 2026-10-18 audit. The same games, the more-rested team playing at home off a neutral
site (`isCalledSide`), were named five ways: HOME TEAM MORE RESTED on /analysis, "Rested home
team" on the home page, "Rested-at-home" on /season, "Rested-home" on /home-court and "Rested
team at home" on Behind the Data. The owner chose "rested team at home" for prose, tiles,
headings and chart labels, the glossary's existing preference and the pair of "rested team on
the road", and "Rested at home" for a narrow table column or tile. The home page heading now
reads "Large rest gaps / for the rested team at home". Identifiers and the rest-advantage metric
names are unchanged.


## D-110 — Closeout scope and timing (2026-10-18)

The owner selected antislop throughout implementation and the confirmed accessibility, loading
and layout defects from audit-002. Shareable Model Results filters, extra chart keyboard actions
and the configurable Schedule column remain deferred; existing native filters remain available.
The footer notice stays 12px by the owner's Oct 17 choice, and Find a page keeps its visible
footer entry. The earlier off-Mac backup and phone-push refusals and odds-feed scope exclusion
remain settled decisions, not renewed requests.

The owner kept GitHub Actions plus the existing maintenance monitor. The daily schedule is
21:17 UTC, not 21:00; the Oct 17 run 39077701963 began at 23:06:12 UTC, 1h49m12s late.
Hourly Vercel score/recovery runs remain separate. This records the accepted timing limitation,
not a guarantee of punctual daily execution or completed-game verification.

The owner requested explicit postponed/cancelled support. Read-only live catalog inspection
found games.status is unconstrained varchar with no CHECK; no migration is required.
Implementation and independent persistence review must precede release. Source status, future
derived-score invalidation and recovery must be verified together; a label alone does not close it.

## D-111 — Independent audit recommendations and sky-tinted neutrals (2026-10-18)

After reading the October 18 independent HTML audit, the owner approved all nine findings,
the Schedule team-name shortcut, the explicit homepage gap unit, and the applicable Studio
Illicit recommendations. The scope is clearer data meaning, native interaction semantics,
conditional-state recovery, and deliberate neutral colors. Calculations, coefficients,
publication filters, the scheduler and previously deferred features keep their existing scope.

The owner requested a very subtle sky-blue tint in the whites. Page, panel and secondary
surfaces use `#F3F8FC`, `#FBFDFF` and `#EAF2F8`; rules use `#C8D5E0` and `#BDCDD9`.
The dark homepage's off-white becomes `#F2F8FD`. Indigo remains the interface accent;
rose/teal retain data semantics. Browser/PWA theme colors follow the page ground.

Studio Illicit's advice is applied through visible action feedback, local recovery controls,
clearer hierarchy and consistent surfaces. Repeated data exploration and keyboard actions
remain immediate; the existing brief Home entrance and bars retain reduced-motion guards.
No new motion library, decorative loops, animated numbers or scroll-revealed research is needed.
Design dials: ENERGY 1, RHYTHM 2, MOTION 1, within the existing Front Office direction.

## D-112 — Homepage compares the latest ten completed seasons (2026-10-18)

The owner approved replacing the homepage's whole-history comparison with the latest ten
completed regular seasons. Both the all-home baseline and the large-rest-gap group use the
same season list, chosen from the baseline's completion metadata. The large-gap definition
remains 5+ fatigue-score points; neutral sites and existing publication exclusions remain unchanged.

Sum wins and game counts before calculating rates and their percentage-point difference.
Do not average rounded annual rates or subtract the two rounded display percentages. State the
period, actual season count, sample sizes and rounding basis beside the finding. A season with
zero large-gap games still contributes its home baseline; an ongoing season contributes to neither
group. Fewer than ten available completed seasons receive an honest count. The evidence date
comes from the selected window. The reason is relevance to the recent NBA, not a larger result.

A homepage-specific stamped cache reads the eligible game population once, then the completion
set, and uses the canonical backtest builder for both series. It reuses existing stamp readers and
maximum age. The shared Analysis API and Home-court study keep their historical populations.

## D-113 — Team schedule headers and review-only visual options (2026-10-18)

The owner requested Game for the column that shows either a tip-off time or a completed result.
Eastern Time (ET) moves to a table note; all column headings stay on one line. The number heading
uses #, and the narrow rest-advantage heading uses RA with an explicit key. Under the existing
phone layout, result/state remains below the date. Alternative column structures are prototypes
for owner review, not approved production layout changes.

The owner also requested a visual preview of a third Home-court series for large rest gaps.
That exploration stays on a throwaway prototype branch. It does not change the published
100-game display policy or add a live chart series before a product decision.

## D-114 — Optional large-gap history and team schedule A (2026-10-19)

The owner selected table A: number, date, opponent, Game, rest gap. Phones hide the number
but retain Game, so tip-off times and completed results have their own column. Eastern Time
and the rest-advantage unit remain in a nearby key; headers remain on one line. Existing
selected-team signs, game links, lifecycle states and Cup placeholder numbering are preserved.

The Home-court chart keeps its original two series initially. An accessible toggle adds the
raw annual record for the rested home team with a rest gap of 5+ fatigue-score points. This
explicit exploration mode may show fewer than 100 games; wins, sample counts and a visible
small-sample warning accompany those observations. It does not relax the existing 100-game
gate for the ordinary rested-home series (0.5+), change the homepage window, or alter the model.
Missing/zero-game seasons interrupt the optional line instead of becoming 0% observations.
The chart scale includes enabled observations, including legitimate 0% and 100% outcomes.

A dedicated home-court response derives both annual groups from the same canonical eligible
game rows and completion metadata. It avoids joining differently refreshed responses and
keeps the toggle a local view change. Existing annual displayed-rate subtraction (D-93) and
homepage raw pooled-rate subtraction (D-112) remain separate rules. Chart headings receive
space above the title as well as beside it; the nested title in this chart previously missed
the padding applied to direct report headings.

### D-114 amendment — Filled markers and paired seasonal comparisons (2026-10-19)

After reviewing the stacked-inspection mock (`0358ade` on the prototype branch), the owner
approved filled circles for all three chart series and one general sample-size statement.
Remove open/closed sample-size encodings and individual below-100 warnings. Keep the actual
wins and denominators, ordinary 0.5+ presentation gate, raw 5+ observations and missing-data
semantics. A general statement explains that seasonal sample sizes vary, these are observed
records rather than precise estimates, and the overlapping groups do not establish causation.

Season and Home remain together on the left of the inspection panel. The right stacks the
0.5+ and optional 5+ records, each with its own difference from that season's home rate.
Both use displayed-rate subtraction (D-93); a missing record has no percentage-point value.
Use threshold labels, since 0.5+ includes the 5+ group. The toggle starts off, preserves the
selected season and reveals the second comparison row when enabled. A guide and filled
selected points replace the hollow selection ring. The owner also authorized PR merge and
ordinary application deployment after verification.

## D-115 — Quiet season availability guidance (2026-10-19)

The owner chose a simple inline “Awaiting season data” guide, with the previous usable
publication and the current schedule as the useful next actions. The all-teams-ten-final-games
condition is an internal availability rule for current-season result views, not a public
milestone, progress counter, statistical-significance claim, or reason to withhold schedules.
Historical research windows and the existing ordinary 100-eligible-game win-rate rule remain
unchanged. Games continues to publish individual results as they arrive.

Readiness counts score-bearing final regular-season appearances for all expected franchises,
including neutral fixtures and teams with zero recorded games. It is deliberately independent
of fatigue availability and the analytical abnormal-stretch exclusions. This operational
population is an explicit exception to the published-game-row filter: it publishes availability
metadata, not analytical game rows. Readiness never blanks the shared Season Report workload
API consumed by Schedule Edge.

A date is a schedule-derived estimate: use the latest tenth usable fixture date across all
expected teams, only when each team has enough scheduled coverage. Say “Expected after the
November 11 games (ET)” when that is what the schedule supports, not “available by” before
those games finish. Remove an expired estimate while data remains unavailable. Missing
readiness is unknown/error, not zero games. Explicit season selection and browser history
remain authoritative while responses resolve.

Publication coverage remains a separate requirement. Shooting, Officiating, Expected Shot
Value and Playoff Rest must not promise publication on a regular-season checkpoint. Their
latest published season stays available, and each missing edition has an honest guide.
Availability Cost remains a historical study. The Shooting exporter checks the same internal
availability rule before replacing its artifact when current/upcoming-season input exists;
this also prevents early results entering pooled career estimates and expanded histories.
The Python/TypeScript franchise sets are pinned together by a contract test. Broader recent-ten-season comparison changes
are deferred. The homepage's existing recent-ten-season period moves below its finding
explanation; values, cohorts and baseline remain unchanged.

## D-116 — Upcoming large rest edges (2026-10-19)

The owner selected “Upcoming large rest edges.” Keep the compact wrapping strip on Games,
rested-team-at-home scope, the 5+ fatigue-score-point floor, projected labels and date-jump
behavior. Select the earliest three qualifying games across the full upcoming population,
not the strongest three across the season or a re-sort of a strongest-only reserve.
Filter before limiting; order by Eastern game date, actual tip-off within a date, then stable
game ID. Unknown tip times follow known times on the same date. A small chronological reserve
allows the strip to replace games after tip-off without showing already-started games.


## D-117 — Official v1.0.0 release and version baseline (2026-10-19)

The owner designated October 19, 2026 as FullCourt's official release date and the
current website as v1.0.0. This supersedes the earlier requirement to delay the
announcement and v1.0.0 tag until a verified completed slate. That operational
verification remains outstanding; it is no longer a release-designation gate.

`package.json`, the root CHANGELOG.md, immutable version tags, and GitHub releases
record subsequent versions. Increment the version for each production release;
patch for fixes, minor for compatible features, major for breaking changes.
The shipped production baseline is `114617dc91927382c804a40aff0a54d81461476a`;
the release tag includes its version/documentation record without product changes.


## D-118 — Shooting current-season awaiting view (2026-10-19)

The owner requested the same clear separation as Season Report: the current season
shows “Awaiting results” without an automatically substituted previous-season table.
Default Shooting to the current season, including when absent from the export; keep
the selector and a link to the actual prior publication. Explicit historical views
remain usable and do not show a current-season notice. Preserve publication and
readiness as separate requirements, career-pooling safeguards, URL/Back behavior,
and recoverable errors. This is the v1.0.1 patch following the v1.0.0 baseline.


## D-119 — Clear chart, playoff and team-record comparisons (2026-10-19)

The owner approved the recommendations from prototype `0719987` on the local
`prototype/team-records-legend` branch: chart controls B, trend A, playoff labels A,
and team records A. This is the v1.0.2 release scope.

Home-court history removes the duplicate season selector while keeping hover, tap,
and keyboard inspection, the optional 5+ series, filled markers, paired baseline
readouts and the general sample-size caveat. The ordinary inference gate remains.

Model Results replaces the flat all-history home rate with a dashed five-season
average beside annual observations. Pool home wins and games over exactly five
completed consecutive seasons; leave missing windows empty rather than bridge gaps
or include ongoing seasons. Existing eligible pre-bubble 2019–20 data remains. Use
the existing unfiltered analytical response; no coefficient fit, forecast, new
request or publication-population change is implied. Explain the calculation in
plain terms with additional method detail available separately.

Playoffs leads with the named team's series win chance from the model trained only
on earlier seasons. This is a historical replay, not proof of a forecast published
before the series, an accuracy percentage or rest's isolated effect. Keep the
full-sample fit in “Fit using known results” details and explain that it includes
known results. If no earlier-history pick exists, the primary summary stays
unavailable; do not use the full-sample fit for its correctness badge or card color.

Team records retain the table and compare rested-at-home with tired-on-road
records. A subtle amber/neutral/teal key and explicit labels use the selected
season's league home/rest gap as midpoint, never zero or a fatigue-management
ranking. Color describes the gap, not causality, confidence or a zero-days-rest
effect. Missing rates or league comparison remain untinted/unavailable. Preserve
counts, nulls and sample labels. Calculate each team's percentage-point difference
from unrounded win fractions, then round once; the league reference already does
this from aggregate counts. No model coefficient, schema or generated figure changes.

## D-120 — Mileage label and itinerary research scope (2026-10-20)

The owner chose **Mileage** as the visible term and wants the estimation method
explained in Behind the Data rather than adding “estimated” to each label.
Retain rolling-window or period context so a per-game seven-day value cannot be
mistaken for a season total. This records the approved wording direction; no
production label change is claimed by the research-only audit.

The owner requested a full 2026-27 schedule audit and deeper research into
geography-dependent returns home between consecutive away games. This does not
approve an automatic gap-based or geography-based home-return rule, airport
substitution, coefficient change, or rescore. Document observed itineraries and
hypothetical detours separately. The initial October–December report remains a
dated snapshot; the full-season report extends its scope.

## D-121 — Correct historical inputs and recalculate the full evidence (2026-10-20)

The owner accepted the all-season audit recommendations and requested continued
implementation, all-season recalculation and regenerated winning percentages.
ADR 0011 records the accepted physical-venue, homecoming and clock semantics.
Use confirmed overtime, postseason sublabels, neutral status and revised tips;
retain unknown results/tips, unverified venue candidates and actual itineraries
as unknown. Later primary corroboration closes the eight completed Austin cases;
the original audit remains an immutable earlier evidence snapshot.

Keep the ratified coefficient values and the existing evaluation protocol. Apply
actual arena endpoints to every travel leg and keep Mileage as the visible label.
Regenerate affected live and static statistics together, preserving denominators,
venue baselines, separate visitor results and historical resolved predictions.
No airport replacement or automatic geography-based home stop is approved.

The next patch is prepared as v1.0.3. Completion requires a restored-database
rehearsal, independent review of the exact candidate, and observed UI/API results.
Production replacement still requires immediate approval under the operating
policy; this instruction authorizes preparation and local recalculation rather
than bypassing that final data-write boundary. Use a short maintenance cutover
and verify canonical cache freshness before resuming writers. Do not mark this
patch released merely because local implementation or tests pass.


D-121 implementation clarification (2026-10-20): include the three completed Cup finals and
2020 play-in as explicit nonregular workload fixtures, preserving regular publication cohorts.
Correct the bounded restart's known Disney-campus geography and neutral status without
claiming exact court coordinates or validating the normal-travel model for the bubble.
The existing bubble exclusion and all ratified scoring terms remain. Completed-analysis
cache keys must follow the actual selected game/fatigue inputs, including deleted or restored
score sides, rather than only final-result counts.

## D-122 — Preserve playoff model history while correcting stale inputs (2026-10-20)

The full rebuild confirmed eleven stale playoff feature values from primary records.
Within the owner's all-data correction request, repair these values and regenerate both
walk-forward and known-results outputs under `logistic_grind_v2_r20261020` (ADR 0012).
Keep existing v1/v2 prediction rows unchanged, select the new revision explicitly, and
retain the same model features and evaluation protocol. Extend the atomic correction,
backup/CAS and conditional rollback to both playoff tables. This is preparation; the
production mass-update approval boundary still applies.
