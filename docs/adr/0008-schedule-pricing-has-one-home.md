# The per-team schedule pricing has one home, and the two pages keep their identities

Status: accepted (2026-08-23)

## Context

`/season` (Season Report) and `/schedule` (Schedule Edge) overlapped, and the overlap was
audited before anything was decided (the roadmap item was scoped "audit first, no direction
pre-chosen"). The audit found the overlap real but narrower than it felt:

- `/season`'s `WHAT THE SCHEDULE WAS WORTH` table was a **strict subset** of `/schedule`'s full
  breakdown — its only two data columns (net edge games, worth-in-wins) both sat inside the
  nine-column table, over the same population, at the same values.
- The **pricing** was already shared (`src/lib/schedule-value.ts`), but the **classification**
  feeding it was implemented twice — the same 0.5 boundary and the same advantage-to-state
  mapping hand-rolled in `season-report.ts` and `schedule-disparity.ts`, kept identical by
  comments ("the two must never disagree for a team") rather than by any test.
- The rest-vs-home-court scale paragraph existed in three hand-written copies across the two
  pages, and B2B/3-in-4 appeared on both as different facts sharing a name — raw counts played
  on one page, opponent-relative edges on the other — with neither page telling the reader the
  other existed.
- Eleven blocks were unique to one page and untouched by any outcome.

Two candidate outcomes were weighed at the gate: give each fact one home and sharpen the two
pages' identities, or merge into one route and give back a nav tab. The decision was made on a
user-perspective walk of the live pages — a casual fan's reading and an NBA junkie's — not on
code aesthetics.

## Decision

**One home per fact. Both pages stay. The merge was rejected.**

1. **The per-team pricing table's one home is `/schedule`**, beside the edge counts it is
   priced from and the method page that documents the conversion. `/season` keeps the scale
   callout and its season-extremes line — the two sentences its own e2e guards — and links to
   Schedule Edge for the table. This also fixes the worst reading-order cost the audit found:
   the 30-row table of ±0.4 wins sat *above* `/season`'s unique content, pushing the loudest
   calls and the conversion table five screens deep, where a casual reader met a wall of
   near-zeros before anything story-shaped.
2. **The classification collapsed into one implementation.** Both reducers now classify through
   `classifyRestAdvantage` and map through `restStatePair()` (`schedule-value.ts`), and
   `rest-state-agreement.test.ts` runs both over one fixture and fails naming the team if they
   ever file a game differently. The two-files-must-agree comments retired into that test.
3. **The headers carry the identity pair.** `/season` is the season **as played**; `/schedule`
   is **the hand each team was dealt**. Both pages answer "was my team's schedule unfair", so
   the identity words are what let a reader pick the right tab before clicking.
4. **B2B/3-in-4 counts and edges name each other.** Each page states which fact it holds and
   links the other — a distinction to surface, not a duplication to collapse: 17 back-to-backs
   played can coexist with a positive B2B edge.

## Why not the merge

A merged route would have run ten-plus screens serving two different questions with different
reading modes — a ranking scanned once versus a report revisited through the season. It would
have had to reconcile two deliberately different season policies (`/season` explains 2019-20;
`/schedule` is the one surface that withholds it, per ADR 0004) inside a single selector. And
the reclaimed nav tab solved no problem: six direct tabs was not crowding anything. The casual
reader's scroll cost went up under the merge and down under one-home-per-fact; the junkie kept
crisp, deep-linkable destinations.

## What the enforcement caught immediately

Writing the agreement test — before any refactor — surfaced a real divergence the comments had
not prevented: `/schedule` nulled `scheduleValueWins` on `fatiguePairs > 0`, the **opener-gated**
count, while the figure is priced from `restStates`, which deliberately includes each side's
opener. A team whose only scored fatigue game was an opener read "not measured" on one page and
a priced value on the other. The null gate now reads its own population (six zero counts still
price to null, never to a confident 0.00). This is the argument for the whole decision in
miniature: agreement kept in prose drifts; agreement kept in a test names the team.

## Consequences

- `SeasonReportTeam.netEdgeGames` stays in the API payload (the response shape is unchanged and
  the extremes line still reads `scheduleValueWins`), but no longer renders on `/season`.
- `e2e/season.spec.ts` pins the table's **absence** and the crosslink as deliberately as it used
  to pin the table's 30 rows — restoring the table to `/season` is the regression now, the same
  inversion CLAUDE.md records for `/referees`.
- The alignment-law content-sizing check retargeted from the removed table to the schedule-tax
  table; the regression it pins (`w-full` beside the numeric cap) is a property of the shared
  table module, not of any one table.
- The scale paragraph still renders on both pages (each page's wins figures must carry it — the
  standing rule from 2026-08-07), but the hand-written copies fell from three to two — one per
  page, `/schedule`'s column guide now deferring to the sentence above its table — plus the
  method page, and every number in them interpolates the shared constants.
