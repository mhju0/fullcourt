# Season Report — one season, deep

**Date:** 2026-07-30 · **Status:** Approved

## Goal

A sixth tab, `/season`, that takes a single NBA season and reports it through FullCourt's
own lens: how the rest-advantage call scored, which teams converted a rest edge and which
squandered one, the season's loudest calls, what the schedule actually cost each team, and
when the league was most cooked. Defaults to the current season, browsable back to 1985-86
by the same `SeasonSelector` every other surface uses.

This replaces the destination of the off-season banner on `/`, which pointed at the
41-season backtest. The reasoning: a visitor arriving during the season cares about the
season being played, not the all-time aggregate. The aggregate keeps its home on
`/analysis`, which this page links to.

**Not building:** general season overview material — standings, pace, scoring trends, best
players by production. That data is not in this database, it is what every other NBA site
already does well, and it is not what this site is about. Nor per-season routes
(`/season/2025-26`); a single `/season` with a selector is the same section logic and the
route can be added later without touching it.

## 0 · Facts that shaped the design

Measured against the live database before writing this, not assumed.

**Per-season sample sizes** (2025-26 / 2024-25 / 2015-16 — 1,230 games each):

| | decidable | RA≥2 | RA≥5 | RA≥7 |
|---|---|---|---|---|
| 2025-26 | 940 | 403 | 46 | 9 |
| 2024-25 | 969 | 439 | 55 | 12 |
| 2015-16 | 1,021 | 514 | 90 | 12 |

So a season's overall rate carries ±3.2pp and RA≥2 ±4.9pp, while **RA≥5 is ±14pp and RA≥7
is nine games**. The consequence is section 2's rule: the per-season threshold view stops
at RA≥2. The four-tier table on `/analysis` is an all-seasons artifact and does not
transfer to one season.

**2025-26 scored 52.0% (489/940)**, against a 55.6% all-season baseline — below it, and
outside the band. The first season this page displays is one where the effect did not show
up. The page is therefore built to state that plainly rather than to flatter the model.

**Raw win% when rested is a standings table.** OKC won 83% of its rested games, UTA 20% —
but OKC also won 70% of its *tired* games. Team quality dominates. The metric that answers
"who blows their rest edge" is the **within-team swing**: win% when the fresher side minus
win% when the tireder side, each team its own control. 2025-26 extremes: SAC +28, PHX +28,
WAS +24 at the top; PHI −14, TOR −14, UTA −13 at the bottom. Negative means the team plays
worse when fresh. SE ≈ 12pp on ~30+30 games, so this ships as a record table, never a
ranking with a crowned winner.

**A single-season player rest-effect leaderboard cannot be shipped honestly.** At ≥50
attempts per arm the 2025-26 extremes are Javon Small −30.6pp and Anthony Davis −23.5pp on
54 no-rest attempts. At ≥150 per arm only 58 players qualify and the tails are still
noise. The `shrunk` career column in `player-rest.json` exists because this view does not
work. Section 7 therefore reports **zero-rest workload** — a usage fact needing no
significance claim — and links to `/shooting` for the career estimates that are defensible.

**Margin and rest gap are uncorrelated.** Ranking "correct blowouts" by margin surfaces
games at RA ≈ 1.0 (BKN@DET +53 at RA 1.57; PHX@OKC +49 at RA 1.01) — a trophy the model
did not earn. Section 4 ranks by conviction instead and shows the result, so hits and
misses sit in one table.

## 1 · Architecture — mirrors `schedule-disparity`

No new patterns. The existing chain, seven files:

| File | Job |
|---|---|
| `src/lib/db/queries.ts` → `getSeasonReportRows(season)` | One query, ~1,230 rows: game, both sides' fatigue rows, scores, and per-side travel miles / B2B / 3-in-4 / jet-lag / days rest |
| `src/lib/season-report.ts` | Pure `buildSeasonReport(rows)` — all seven sections in one pass. No DB, no React |
| `src/lib/season-report-server.ts` | Cache keyed by season, invalidated on `getCompletedGamesStamp()` (the `rest-advantage-evidence-server.ts` trick) |
| `src/app/api/season-report/route.ts` | `jsonRoute` + season param |
| `src/components/season-report-content.tsx` | The page |
| `src/components/season-report-lazy.tsx` | Skeleton |
| `src/app/season/page.tsx` | Server shell + `SeasonSelector` |

Reused, not rebuilt: `classifyRestAdvantage` for the ±0.5 rule, `SeasonSelector`,
`PageHeader`, `termCardStyle`, `lazyContent`, recharts. The all-season norm comes from
`/api/analysis`'s existing `seasonWinRates` — no second aggregate query and no second
definition of the statistic.

**One sign rule**, stated at the top of `season-report.ts` and nowhere else:

> `restEdge = opponentFatigue − teamFatigue`. Positive means *this* team is the fresher side.

That matches `classifyRestAdvantage`'s existing orientation (`differential = away − home`,
positive ⇒ home advantaged), so no view flips a sign and no two views can disagree.

## 2 · The honesty rule governing every section

**Inference sections gate on sample size. Fact sections never gate.**

- **Gated** at n ≥ 100 decidable games — the RA win-rate tile, the RA≥2 tile, the verdict
  line. Below it: `TOO EARLY — 47 OF ~940 DECIDABLE GAMES`.
- **Never gated** — loudest calls, schedule tax, fatigue calendar. True from game one.
- **Per-row gated** — edge-conversion rows dim below 10 games in either arm.
- **Not published per season at all** — RA≥5 and RA≥7.

Band is a Wald interval, `1.96 × √(p(1−p)/n)`, one small helper in `season-report.ts`.

Verdict line, exactly three states. No "biggest since" superlative — that is a
noise-driven claim dressed as a finding.

```
TOO EARLY TO CALL — 47 OF ~940 DECIDABLE GAMES
IN LINE WITH THE ALL-SEASON NORM
BELOW THE NORM — 52.0% ±3.2 VS 55.7%
```

The norm **excludes the displayed season**, recomputed from `seasonWinRates` in three
lines. Otherwise the page compares a season against a baseline containing itself. This is
why the example above reads 55.7% rather than the 55.6% published on `/analysis`: dropping
2025-26, a below-average season, lifts the remaining baseline slightly. The two numbers
differing is correct, not a typo.

## 3 · Copy rule

Every label takes the season as data. No hardcoded "this season" (wrong the moment the
selector moves to 1994-95) and **no season count in this page's copy** — "41" ages. The
section reads `2025-26 VS HISTORY`, rendering `1994-95 VS HISTORY` when switched.
`NBA_SEASONS.length` stays where it is on `/analysis` and `opengraph-image.tsx`, where it
is computed and therefore stays true.

## 4 · The seven sections

1. **Tiles** — RA win rate ±band · RA≥2 ±band · season progress (`312 of 1230 · 25%`).
2. **`<season> VS HISTORY`** — season sparkline with the displayed season highlighted,
   verdict line beneath, link to `/analysis` for the full proof.
3. **REST EDGE CONVERSION** — 30 rows: rested W-L, tired W-L, swing, both n. Sorted by
   swing. Header states these are records, not rankings; nothing is crowned.
4. **LOUDEST CALLS** — top 10 by |RA|, each tagged `HIT`/`MISS` with the final margin.
   Rows open `ExploreGameDetailModal`, which takes `{gameId, open, onOpenChange}` and
   nothing page-specific, so it reuses as-is.
5. **SCHEDULE TAX** — per team: miles flown, B2Bs, 3-in-4s, jet-lag games. Extremes in a
   caption. 2025-26: ORL 219k miles vs PHI 144k; POR 27 jet-lag games vs CHI 2; the single
   most brutal team-game was MIA at 11.85.
6. **FATIGUE CALENDAR** — league average fatigue by week, recharts bars, peak week
   annotated. The section no other site publishes.
7. **ZERO-REST WORKLOAD** — most shots taken on no rest, from `player-rest.json`. Lazy
   loaded on scroll, stamped with the payload's `generated` date, linking to `/shooting`.

## 5 · Known limitation, stated not hidden

`player-rest.json` (782 KB) is generated by `scripts/export_player_rest.py` — Python, run
by hand. The Vercel cron is a Next.js route and cannot invoke it. So **section 7 drifts
stale during a live season while sections 1–6 update daily** off `/api/cron/update`.

Not fixed here: it is a pipeline project, not a page project. The page ships the
`generated` stamp so the staleness is visible to the reader, plus a `ponytail:` comment
naming the upgrade path. Section 7 is also the reason for the on-scroll lazy load — 782 KB
is too much to spend on the seventh section for a visitor who never reaches it.

## 6 · Verification

`src/lib/__tests__/season-report.test.ts`:

- sign-rule orientation (a team fresher than its opponent gets a positive edge)
- swing metric arithmetic, including the both-arms-empty team
- band math against hand-computed values
- all three gate states
- empty season (a season with no completed games renders, does not throw)

**The drift test that matters:** assert `buildSeasonReport(rows)`'s decidable count and
rest win rate equal `buildHistoricalBacktest(rows).seasonWinRates` for the same season on
the same rows. Two surfaces publishing one statistic is precisely where drift happens;
this makes divergence a build failure rather than a discrepancy someone notices later.

`e2e/season.spec.ts` — page loads, selector switches season.

`e2e/about.spec.ts` — the nav count assertion moves 5 → 6. Onboarding copy must not state
a count; it renders all of `PRIMARY_NAV_ITEMS`.

## 7 · Games page cleanup

`OffSeasonBanner` (`src/app/page.tsx:167`) keeps its shape, repoints to `/season`, and
drops the count:

```
2025-26 SEASON COMPLETE — SHOWING FINAL SLATE    SEE THE FULL SEASON REPORT →
```

## 8 · Nav

`DIRECT_NAV_ITEMS` gains a sixth entry: label `SEASON REPORT`, href `/season`.

"REPORT" not "REVIEW" — review implies finished, and this runs live from October. The
label stays clear of `GAMES` (browses a slate) and `SCHEDULE EDGE` (ranks a season's
schedule difficulty) per the nav's existing collision discipline.
