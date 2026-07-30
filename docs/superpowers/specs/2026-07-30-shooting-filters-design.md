# Shooting by Rest — Team, Position and Evidence Filters

**Date:** 2026-07-30 · **Status:** Approved

## Goal

Let a visitor narrow the /shooting table to one team's players — the request that started
this — plus the two other filters worth their place: position, and an evidence toggle.
Researched against NBA.com/stats (Team, Position G/F/C, Experience, Draft Year, Season
Segment), Basketball-Reference's season finder (team, position, age, qualification) and
Cleaning the Glass (five position buckets, minutes threshold). Team and Position are the
industry's first two filters; the evidence toggle is native to this page's own ethos.

**Not building:** months/segments, opponent, home/away (each needs game-level data that
would bloat the static JSON for splits this page is not about); minimum minutes (the FGA
volume filter already qualifies a shooting table); experience/rookie (data starts in
1996-97, so a ten-year veteran's 1996 row would masquerade as a rookie season); age band
and active-only (offered, declined — the sortable Age column and season selector cover
them well enough).

## 1 · Data — one new array in the export

`scripts/export_player_rest.py` adds `pos` to the payload: one of `"G" | "F" | "C" | ""`
per player, parallel to `names`.

- Source: the `position` column of the cached hoopR player box scores, which is filled
  **only for starters**. A player's position is his modal position across games he
  started; ties break toward the position he started most recently.
- Coverage: 86% of players ever started and get a position. Among players clearing the
  default 300-FGA volume cut, all but one (Kira Lewis Jr.).
- The export prints the coverage split so a future re-export that loses the column fails
  loudly, not silently.
- One re-export of `public/data/player-rest.json`. The component reads `payload.pos`
  with an optional-chain so a CDN-cached old file renders (position filter matches nothing when set) rather
  than crashes.

## 2 · Filter logic — pure, in `src/lib/player-rest.ts`

`BuildOptions` gains:

| Option | Type | Meaning |
|---|---|---|
| `team` | `string \| null` | Franchise tricode; `null` = all teams |
| `pos` | `"G" \| "F" \| "C" \| null` | Modal position; `null` = all positions |
| `evidencedOnly` | `boolean` | Drop rows where `underEvidenced` — the rows already dimmed |

**Franchise folding.** Historical tricodes map to their current franchise the way
Basketball-Reference and the NBA's own franchise histories do:
`SEA→OKC, VAN→MEM, NJN→BKN, NOH→NOP, NOK→NOP, CHH→CHA`. The dropdown offers 30
franchises, not 36 tricodes.

**Matching.** A season row matches a franchise when its team label contains any of the
franchise's tricodes (labels look like `ATL`, `LAL/CLE`, `LAL/CLE+`). Career view
matches a player when any of his seasons match.

**Accepted limitation.** 104 of 14,493 player-seasons (0.7%) involved 3+ teams and the
label carries only the two he played most for — the third team cannot find him that
season. Documented, not fixed: the fix would widen every label for a 0.7% tail.

**Position matching.** Selecting a position returns players *known* to play it; the
unknown-position 14% appear only under "All positions". A filter that answers "Guards"
with players who might not be guards is worse than one that misses a deep bench player.

## 3 · UI — `src/components/player-rest-content.tsx`

Three controls join the existing filter row, in the existing terminal styles:

- **Team** select: "All teams" + 30 franchises, labeled `OKC · SEA` where history was
  folded in.
- **Position** select: All positions / Guards / Forwards / Centers.
- **Hide noisy rows** checkbox: applies `evidencedOnly`.

No URL sync for filters, matching Season and Volume today (`?player=` stays the only
synced state). The row-count readout continues to reflect whatever the filters leave.

## 4 · Error handling

- Old cached JSON without `pos`: position filter matches nothing when set, page renders
  normally otherwise (optional-chain, no crash).
- A tricode in the data claimed by no franchise would silently vanish from the dropdown;
  a unit drift-check asserts every payload tricode is claimed by exactly one franchise,
  so a future relocation breaks the build, not the filter.

## 5 · Tests

- Unit tests on `buildRows` for `team` (season + career + folded-franchise cases),
  `pos` (match, unknown-position exclusion), `evidencedOnly` — each proven to fail on
  unfixed code before the fix lands, per the standing regression-test rule.
- The franchise-coverage drift check above, run against the real payload's team labels.
- Export: coverage line printed; assertion that `len(pos) == len(names)`.
- e2e: extend the shooting spec with one team-pick assertion (pick a franchise, expect
  the row count to drop and every visible team cell to belong to it).
