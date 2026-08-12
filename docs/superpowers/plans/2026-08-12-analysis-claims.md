# Analysis Claims — implementation plan

**Date:** 2026-08-12 · **Status:** In review — [PR #21](https://github.com/mhju0/fullcourt/pull/21) ·
**Branch:** `refactor/analysis-claims`

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. Tick a box only after its
> verification line passes. This file is the progress record — if a session ends mid-plan, the
> unticked boxes are what remains. Design rationale is inline below rather than in a separate
> `specs/` document, deliberately: the change is one module plus one component, and a second
> file would only be a second thing to keep in sync.

**Goal:** Move the claims the `/analysis` page makes about the historical backtest out of JSX
and behind a tested interface, so the rules that govern them run inside the commit gate.

**Origin:** Candidate 04 of the 2026-08-11 architecture review
(`architecture-review-20260811-211332.html`, OS temp dir — not committed). Candidates 01–03
shipped (`c9d2589`, `1983e5e`, `4942fce`); 05 was marked `SPECULATIVE`/"not recommended" and is
partly obsolete since 03 deleted `matchup-card.tsx`. Design settled by a grilling session on
2026-08-12.

---

## Why — the evidence

The review's own two motivating defects were **already fixed** on 2026-08-11
(`analysis-content.tsx:761-767`, `:795-800`), so they no longer make the case. What does:

| # | Claim | Line | Guarded by |
|---|---|---|---|
| 1 | Header: population + baseline | `:751` | `page-headers.spec.ts` — line *count*, not content |
| 2 | Two hero tiles | `:774-793` | `analysis.spec.ts:15-16,20` (e2e) |
| 3 | NOT COUNTED band | `:812-835` | `analysis.spec.ts:26-28` (e2e) |
| 4 | Threshold legend: zero = baseline | `:900-902` | `analysis.spec.ts:38` (e2e) |
| 5 | Season legend: zero = season's own | `:953` | `analysis.spec.ts:39` (e2e) |
| 6 | READING THESE NUMBERS | `:976-1003` | **nothing** |

Three findings drive the design:

1. **The guards run nowhere automatic.** Per `CLAUDE.md`, the commit gate is `test:run` /
   `typecheck` / `lint` / `build`; e2e "is deliberately not part of it" and Playwright is not run
   in CI. So claims 1–5 are guarded only by a suite nobody runs on the way to a commit.
2. **Claim #6 asserts a comparison in prose over live numbers.** `:997-1000` reads "RA ≥ 7 sits
   at `{ra7.winPct}%` … **which is the same gain, not a larger one**." If those figures ever
   diverged, the page would render true numbers under a false sentence and nothing would notice.
   `:972-975` records that this same claim has already been wrong twice.
3. **"Exactly two tiles" is not enforced by the code.** `:783` and `:957` are both
   `{ra5 && …}` — a missing bucket silently yields one tile and drops the callout entirely.

**The precedent already exists in this repo.** `src/lib/rest-advantage-display.ts`'s
`buildRestAdvantageEvidence` is a pure function from live data to a claim, whose tests assert
editorial house rules, not math — `rest-advantage-display.test.ts:270` "refuses to make a claim
with no denominator at all", `:311` "states the denominator, and no coin flip, in every
sentence". `analysis-content.tsx` **already imports that module**. This plan applies the page's
own existing pattern one level up. It is not a new pattern.

---

## Design decisions

| # | Decision | Why |
|---|---|---|
| Q5 | The defect is *where the guard runs*, not untestable code | e2e is a fine guard; it just never runs before a commit |
| Q7 | One builder returning the **set** | A validator leaves JSX as source of truth and creates a second home for the rules — the failure `rest-advantage-evidence.ts:58` names. Per-claim functions cannot express "exactly two" |
| Q8 | `/analysis` only; do **not** generalise the return type yet | `season-report-content` / `player-rest-content` make different claims; a shared shape from one example is a guess |
| Q9 | Builder owns every **text** claim (#1–#6), stopping where Recharts begins | Boundary: *does it assert something about the data, or decide how a mark is drawn?* Chart math is already covered by `analysis-deviation.test.ts` |
| Q10 | Returns `null` when nothing honest can be said; else a set of whatever earned a place | Matches `buildRestAdvantageEvidence`'s contract; makes cardinality a tested property |
| Q11 | `analysis-claims.ts` / `buildAnalysisClaims` / `AnalysisClaims` | Six artifacts already name this surface `analysis-`. The nav table rejects "Analysis" as a *tab label*, which does not bind an identifier |
| Q12 | The six e2e assertions **stay, unchanged** | They assert the browser renders what the builder produced — a different guarantee. Deleting them trades a real check for a weaker one |
| Q13 | Rule clauses → test names; history clauses → prose, moved beside the builder | Tests carry rules; only prose carries *why it was wrong before*, which is what stops recurrence. `rest-advantage-evidence.ts:29-66` is the model |

---

## Global constraints

- **No renaming of rest-advantage identifiers.** Hard ban in `CLAUDE.md`.
- **No new dependencies.**
- **No `Co-Authored-By: Claude` trailers.**
- **Do not touch `/referees`.** Its in-progress state is deliberate.
- **Do not touch `e2e/`.** Q12 — the assertions stay exactly as they are.
- **No figure retyped into prose.** Every number stays derived from `AnalysisResponse`.
- **Verification gate, every task touching TS/TSX:**
  `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build` all clean.

---

## Tasks

### Task 1: The plan and its pointer
- [x] **Step 1:** Write this file.
- [x] **Step 2:** Add a memory entry pointing at it, so a new session finds it unprompted.

### Task 2: `src/lib/analysis-claims.ts`
**Files:** create `src/lib/analysis-claims.ts`
**Produces:** `AnalysisClaims`, `buildAnalysisClaims(data: AnalysisResponse): AnalysisClaims | null`,
`toDeviation`, `WIDER_GAP_CLAUSE`, `BEYOND_CLAUSE`
**Consumes:** `AnalysisResponse`, `homeWinRateWhenVisitorRested`, `signedNumber`

- [x] **Step 1:** Define `AnalysisClaims` — header sentence, tile set, declined-half figures, two legend zero-labels, the reading-these-numbers figures incl. the RA5/RA7 relation.
- [x] **Step 2:** Implement `buildAnalysisClaims`, returning `null` with no baseline or no games.
- [x] **Step 3:** Move the rule + history docblocks from `analysis-content.tsx:755-773`, `:795-811`, `:972-975`.

### Task 3: `src/lib/__tests__/analysis-claims.test.ts`
- [x] **Step 1:** Rule-shaped test names, matching `rest-advantage-display.test.ts`.
- [x] **Step 2:** Cover — exactly two tiles; neither named "overall"; every rate carries a
      denominator and a lift; the declined half is always stated; no coin flip anywhere; the
      RA5/RA7 comparison matches the figures; `null` on an empty/baseline-less response.
- [x] **Step 3:** `pnpm test:run` green — 26 cases, suite 621 → 647.

### Task 4: Refactor `analysis-content.tsx`
- [x] **Step 1:** Consume `buildAnalysisClaims`; render from the returned set.
- [x] **Step 2:** Remove the orphaned locals the change leaves behind (`ra5`, `ra7`,
      `notCalledHomeRate`, the `homeWinRateWhenVisitorRested` import).
- [x] **Step 3:** Full gate green; `e2e/` untouched.

### Task 5: Glossary and close-out
- [x] **Step 1:** Add the **Claim** term to `docs/GLOSSARY.md`.
- [x] **Step 2:** Full gate green, then update this file's status.

### Remaining — needs a human
- [ ] **Run `pnpm test:e2e`.** Not run here: it needs a running server and a populated database.
      The rendered strings were held byte-identical for live data, and the six assertions in
      `e2e/analysis.spec.ts` were deliberately left untouched, so this is a confirmation rather
      than an expected failure.
- [ ] **Ratify or change `SAME_GAIN_TOLERANCE_PP`** (`src/lib/analysis-claims.ts`) — the one
      invented number here. See the implementation-decisions section below.

---

## Deferred — recorded, not fixed

Out of scope by decision (Q6), so they read as decisions rather than oversights:

1. **The `0.5` boundary claims unreachable precision.** `GLOSSARY.md:16` and
   `docs/agents/domain.md:59-60` say exactly `0.5` is a call.
   Measured: `4.35 − 3.85 = 0.49999999999999956` → classified neutral and dropped from the
   evidence. Same float class as the RA≥N boundary left alone deliberately, but this one changes
   whether a game is counted at all. `rest-advantage-display.test.ts:243` asserts the rule and
   passes, because it tests clean literals. Under the settled authority rule (code wins,
   behavioural claims), the **glossary sentence** is what should change — not the code.
2. **"Neutral" is overloaded.** `GLOSSARY.md:15-17` = a rest-advantage band;
   `src/lib/neutral-venues.ts:12-28` = a game site (five cities). Neither entry acknowledges the
   other.
3. **`back-to-back` (20 source files, 5 identifiers) and `altitude` (18 files) have no glossary
   entry** — altitude being the one ratified constant ever changed (ADR 0006).
4. **`decidable` is an unnamed third narrowing** (5 files), distinct from *called*
   (`isCalledSide`) and *publishable* (`publishableGames()`). The glossary names one of three.

Also noted, no action taken: `docs/agents/domain.md:25` says six ADRs; there are seven.

---

## Progress log

- **2026-08-12** — Branch `refactor/analysis-claims` cut from `main` at `bc4cbda`. Design
  settled by grilling; plan written (`79be9e0`).
- **2026-08-12** — Module, tests and component refactor landed (`56d3d33`). Gate: lint clean,
  typecheck clean, 647 tests pass, build exit 0.

## Decisions taken during implementation, beyond the settled design

Both are judgment calls made while the work was in hand, and both are reversible:

1. **The callout's *first* comparison was folded in too.** The plan scoped the RA≥7 relation.
   In the file, "A bigger gap is worth more" turned out to be the same defect one clause
   earlier — fixed prose comparing RA ≥ 5's lift with the any-gap lift. Fixing one and leaving
   its neighbour would have been the inconsistency the work exists to remove, so
   `ra5.relationToAnyGap` exists alongside `beyond.relation`.
2. **`SAME_GAIN_TOLERANCE_PP = 1` is invented, and is the one number here nobody ratified.**
   It decides only which *sentence* renders, never which games are counted, and it is not a
   significance test. One point, because the page states lifts to one decimal and RA ≥ 7 is its
   thinnest slice (~1,100 games, where a rate near 65% carries a standard error of about 1.4
   points). Raising it makes the page quieter, never wronger. Worth a second opinion.

`ClaimTile` also carries finished `value` / `detail` strings rather than parts alone, matching
`buildRestAdvantageEvidence`, which returns finished sentences and pins "renders the denominator
with thousands separators" as a test (`rest-advantage-display.test.ts:305`). Leaving the string
in JSX would have left "no rate without its count" unasserted.
