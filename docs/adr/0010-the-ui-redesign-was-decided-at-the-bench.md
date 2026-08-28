# The UI redesign was decided at the bench, and this is its ledger

Status: accepted (2026-08-28)

## Context

Michael pulled design and layout to the front of the roadmap on 2026-08-28. The stated
complaints: the light app header sat directly on the front door's dark hero with a hard seam;
"everything is just at the top — click a tab, go to the tab" felt static; and he floated a
vertical left rail as a possibly more modern shell. The Ringer's fantasy football site was named
as the reference for energy that stays instantly navigable.

Rather than restyling from taste, a five-lane research pass ran the same day — The Ringer
decomposed, navigation systems, boundary-pushing layouts, sports-data display, motion grammar —
with every cited site fetched live. The results were graded into a decision instrument (the
"Layout Bench": seven areas, thirty-one options, each with a mockup, reference screenshots, and
pros/cons), and the decisions were made by Michael across three grilling rounds plus a
conservatism audit he ordered ("I don't want conservatism here… a fresh restart, a fresh
design"). Two research findings framed everything: **no credible data-sports property runs a
left rail as primary navigation** (The Ringer's global nav is smaller than FullCourt's — its
energy is in-page: control cockpits, a density dial, semantic color), and **"modern" in 2026 is
motion between and within states, not relocated chrome** (View Transitions reached Baseline in
Oct 2025).

## Decision

All of the following were approved by Michael on 2026-08-28. This ADR is the committed record;
the session bench holds the mockups and full pros/cons.

1. **Shell (A1):** the two-tier global bar (52px brand + 44px tabs) merges into one slim bar on
   desktop; per-page control cockpits become the strong element. On phones the shell is a
   **docked bottom nav** (four routes + search) under a brand-only top bar. No hamburger, no
   left rail — the rail is revisited only if per-team/per-official destinations ever exist.
2. **Command palette (A4):** `cmdk`, opened by ⌘K and by a visible search box in the bar.
   v1 = the nine routes plus parametric jumps wherever a page's filters are already
   URL-addressable. Entities wait for entity pages.
3. **Front-door chrome (B1+U1):** on `/` — and only on `/` — the header re-resolves its tokens
   to the front door's dark values, transparent at the very top so the bar dissolves into the
   hero, solid dark once scrolled. The light-only law is untouched everywhere else. *(Shipped
   with this ADR — stage ①.)*
4. **The slate (C):** one matchup card everywhere — always two rows, visitor over home. The
   UPCOMING view's separate single-line table is **retired**; its extras fold into the card's
   expansion, and its cross-date job survives as an **EDGES AHEAD strip** (top three upcoming
   games by rest advantage). Columns gain tip-off time (ET) and per-team days rest. The board
   defaults to the next game day when today has no games.
5. **Density dial (C5):** Skim is the default ("games show up easily, as if on any other
   schedule-checking website" — the brief, verbatim); Deep Dive is one click away, remembered
   per viewer, URL-addressable. The storyline line (C4) renders in both densities, only when a
   game has a real story. C2's split bar stays held — the RA cell's meter already does that job.
6. **Tables (D1):** rank superscripts on key columns only, starting `/season`, `/schedule`,
   `/shooting`.
7. **Big numbers (E1):** every headline number carries a permanent "vs venue baseline" slot —
   the house tile, landing everywhere in one pass.
8. **Charts (F1/F2/F4):** built on the real `/analysis` charts on a branch and judged from a
   preview before any ruling — explicitly *not yet decided*.
9. **Motion (G):** three moments on shared tokens — route-level View Transitions, the existing
   cell-flash discipline (one 500ms flash per change), and the Skim↔Deep-Dive morph. No new
   scroll reveals; no header condense (a slim bar has nothing left to condense). The ~5-moment
   budget is law.
10. **The visual ground stays.** Front Office (light paper, Geist, indigo accent, rose/teal
    poles, the kerned wordmark) is 19 days old and Michael's own direction; the freshness is
    spent on interaction and layout, not a re-skin.

Build order: ① front-door chrome → ② slate unification + columns → ③ shell + palette →
④ table/number house rules → ⑤ chart prototypes for Michael's ruling → ⑥ motion. The
four-command gate stays green at every stage; the Oct 5 content freeze applies.

## Consequences

- The brand-bar/tab-row structure, `BAR_HEIGHT_PX`, and the header e2e suite all move at
  stage ③, in one PR, together with their docs.
- `/api/games/upcoming` survives (the strip reads it), but the by-date response must carry
  prediction fields for unplayed games so the unified card's expansion can show the edge.
- The 2026-08-04 lesson stands in reverse: options *not* taken here (left rail, hamburger,
  every-cell ranks, bento grids) were refused on evidence recorded at the bench — restoring one
  "because it looks modern" repeats the mistake this process exists to prevent.
