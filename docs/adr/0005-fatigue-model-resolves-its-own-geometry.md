# The fatigue model resolves its own geometry

Status: accepted (2026-08-01)

`calculateFatigue` took nine positional parameters. Four of them were adjacent bare `number`s —
the subject team's home arena, then tonight's venue — and the two pairs mean entirely different
things. Transposing them typechecked cleanly and silently inverted both the travel and the
time-zone terms. The test file's own calls are the evidence that this was hard to read: eight
local wrappers existed to hide the argument list, and several calls were formatted onto one line
as `false, LA_LAT, LA_LON, LA_LAT, LA_LON, true`.

Both were symptoms of the same thing. The two production callers each assembled that geometry
themselves, and had drifted apart:

- `scripts/backfill_fatigue.ts` ran both teams through `eraCoordinates`, so a 1995 Sonics home
  game geolocates in Seattle rather than Oklahoma City.
- `src/lib/daily-refresh.ts` read `team.latitude` raw. Its `DailyRefreshTeam` type carried no
  `abbreviation`, so it structurally *could not* call `eraCoordinates` — even though
  `run-daily.ts` passes whole team rows and the field was there at runtime.

Nothing failed, because the daily path only ever refreshes a fortnight forward, where era
coordinates are a no-op. Nothing asserted the two agreed either.

## Decision

**Two exports, at two seams.**

`calculateFatigue(input: FatigueInput)` takes one named object and scores **one side** of one
game, given geometry the caller has already resolved. It stays exported because it is the term
level: 55 of the 56 existing calls want exactly this — one side, an arbitrary (arena, venue)
pair, and no opponent at all. It is where the decay, travel, altitude and circadian terms are
tested, and it is where the ADR-0001 rest-day pinning test reaches.

`scoreGameFatigue({ game, homeTeam, awayTeam, homeRecentGames, awayRecentGames })` scores **both
sides** and resolves the geometry itself — era coordinates, neutral venue, altitude, the
home/venue pairing, and the fact that at a neutral site the nominal host is also on the road. It
is what production calls. There is now no way for a second caller to resolve those differently,
because there is no second place that resolves them.

This is why `fatigue.ts` imports `team-era-coordinates` and `neutral-venues`. Both are pure and
depend on nothing; the direction of that dependency is deliberate, not incidental.

## Consequences

- **The daily path gains era-correct coordinates it never had.** Harmless in practice for the
  window it runs over, and now true regardless of the window. `src/lib/__tests__/fatigue.test.ts`
  asserts a 1995 visitor to OKC flies ~960 miles to Seattle, not ~1,180 to Oklahoma City; the
  assertion fails against the old daily-refresh geometry.
- **Coordinates are parsed strictly.** Backfill previously used bare `parseFloat`, so a malformed
  row would have produced a NaN score rather than a failure. Both callers already catch per game,
  so throwing is the safe unification.
- **`RecentGame` lost `teamId`, `opponentTeamId` and `opponentAltitudeFlag`.** All three were
  required, dutifully populated by `rowToRecentGame` and by every test fixture, and read by
  nothing. `opponentAltitudeFlag` in particular looked like the altitude input but had been
  superseded by `venueAltitude`, which is the *venue's* altitude — the distinction that makes a
  Mexico City game score correctly.
- **`DailyRefreshTeam` is now an alias of `FatigueTeam`** and requires `abbreviation`. That is the
  field whose absence caused the fork.
- **Two exports where a purist would want one.** `scoreGameFatigue` cannot replace
  `calculateFatigue` — it would force every term-level test to invent an opponent, a neutral flag
  and a second recent-games list to assert one multiplier. The seam is where the callers are, and
  there are genuinely two kinds of caller.

## Considered and rejected

- **Keep the positional signature and add a lint rule.** No rule can see that argument four should
  have been argument six; they are all `number`.
- **Only add the wrapper, leave `calculateFatigue` positional.** Closes the fork but leaves the
  transposition hazard in place for every test and any future caller, which is most of the reason
  the wrapper's inputs were assembled inconsistently to begin with.
- **Move the assembly into `fatigue-recent-games.ts`.** That module builds the *prior* games list,
  which already applies era coordinates on both paths. Tonight's game is a different question, and
  putting it there would make one module answer two.
- **Have `scoreGameFatigue` load its own recent games.** It would need a database handle, which
  would make the model untestable without one and reverse the dependency that lets
  `daily-refresh.ts` inject a port.

## Related

- `docs/adr/0001-derive-rest-days-from-games.md` — the pinning test that must keep reaching
  `calculateFatigue` directly.
- `docs/adr/0003-fatigue-inputs-limited-to-espn-era.md` — the era gating that is still invisible in
  the type. `overtimePeriods` remains non-optional, so a pre-2002 game reads `0` where the ADR says
  the honest value is *unknown*. A named interface is where that distinction could finally be
  expressed; this ADR does not spend it.
