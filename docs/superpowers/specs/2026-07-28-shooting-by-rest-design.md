# Shooting by Rest — design

**Date:** 2026-07-28
**Status:** **Superseded 2026-07-30 — kept as the design record for a phase that was not built.**
**Module:** Shooting by Rest

> Phase 1's *team-grain* report was never produced, and none of §8's deliverable paths exist
> (`scripts/fetch_team_shooting.py`, `scripts/analyze_shooting_by_rest.mts`,
> `drizzle/draft/000X_team_game_shooting.sql`, `docs/audit/shooting-by-rest-2026-07-28.md`).
> The module shipped instead at the **player** grain — §9's Phase 2 — as **`/shooting`**, a direct
> nav tab labelled `PLAYER SHOOTING`, served from the committed `public/data/player-rest.json`
> and built by `scripts/fetch_shooting_data.py` → `scripts/analyze_player_shooting.py` →
> `scripts/export_player_rest.py`. See
> [the filters spec](2026-07-30-shooting-filters-design.md) and
> [ADR 0002](../../adr/0002-shooting-source-hoopr.md).
>
> §9's "the five-tab nav is deliberately not expanded on speculation" is also historical: the bar
> is now six direct tabs plus a three-item OTHER menu.

## 1. What this answers

Does a team shoot worse when the schedule has worn it down?

Every existing FullCourt surface answers *"what did the schedule do to this team's chances."*
None answers *"what did it do to the shot."* This module is the first that connects the rest
thesis to what actually happens on the floor, and it exists partly because Shot Value —
location-based expected efficiency — sits oddly on a site otherwise about rest.

It is **not** the Shot Value module rebuilt. Shot Value stays as it is. This is separate.

## 2. Scope of Phase 1

**In scope.** Regular-season games, 1996-97 through 2025-26, at **team-game** grain. The outcome
is eFG%. The split axes are days of rest and the composite fatigue score.

**Out of scope in Phase 1, deliberately.**

- **Publication.** Phase 1 produces a report in `docs/audit/`, not a page. See §7 for why it
  cannot be published as a claim.
- **Player-level analysis.** Phase 2. See §7.
- **Distance buckets** (at-rim / mid-range / three). Phase 3, gated at 2000-01 per ADR 0002.
- **Any database write.** No table, no migration applied. The DDL is drafted (§8) and left
  unapplied.

## 3. The measurement

### 3.1 Outcome: eFG%

`eFG% = (FGM + 0.5 × 3PM) / FGA`.

Chosen over the alternatives for specific reasons:

- **Raw FG%** is shot-mix contaminated. A team taking more threes shows a lower FG% at identical
  efficiency. Fatigue plausibly changes the mix — fewer rim attacks — so FG% would move for
  reasons that are not accuracy. That measures shot selection and calls it shooting.
- **TS%** folds in free throws, which are unguarded and self-paced, and therefore the least
  fatigue-sensitive shot in the game. Worse, FTA rate carries a referee/home-court bias, which is
  one of the confounds this design exists to strip out. Reported as a secondary column, never the
  headline.
- **3P%** has roughly 30 attempts per team-game; binomial SD alone is 8–9pp. It is the most
  likely number here to produce a striking result that means nothing.

### 3.2 Comparison: within-team-season delta

The headline is not a level. For each `(team, season)` we compare that team to **itself** in the
same season, then aggregate the deltas.

This neutralises three confounds by construction rather than by adjustment:

- **Era.** League eFG% rose from the high .480s to the mid .530s across the window. A
  within-season comparison never compares 1997 to 2025.
- **Team quality.** Better teams earn more rest through seeding, so a pooled comparison partly
  measures "good teams are good."
- **Roster identity.** The comparison never crosses rosters within a season.

### 3.3 The pre-registered family

Five contrasts are fixed **before the query runs**, and only these may be stated as findings:

| # | Contrast |
|---|---|
| 1 | 0 vs 2 days rest, overall |
| 2 | 0 vs 2 days rest, home only |
| 3 | 0 vs 2 days rest, road only |
| 4 | 3-in-4 vs not |
| 5 | 4-in-6 vs not |

Multiplicity is handled with **Holm–Bonferroni** across the five. This costs almost nothing here:
team-game eFG% has SD ≈ 5.5–6pp, so with ~21,663 back-to-back team-games the standard error of a
difference is ≈ 0.05pp, and the minimum detectable effect stays around 0.15pp even after
correction.

Everything else computed — fatigue-score buckets, opponent-rest splits, by-season trend,
prior-game overtime — is **exploratory**: shown with confidence intervals and sample sizes, never
described as significant.

The reason for the discipline: 4 rest buckets × 2 venues × 2 density flags × opponent rest × 2
metrics × 30 seasons is on the order of a hundred implicit tests. At p<0.05 roughly five clear by
chance, and they are precisely the ones a writer would find interesting.

### 3.4 Reported as a decomposition

A single adjusted number hides where the effect went. The report shows the naive gap shrinking as
each control is applied:

```
naive 0-vs-2 gap                   −X.XX pp
  + within team-season             −X.XX pp
  + venue split                    −X.XX pp
  + opponent rest matched          −X.XX pp
  + opponent quality               −X.XX pp
  + garbage-time trim              −X.XX pp   <- the honest number
```

Each row states its own n and CI.

## 4. Controls

Available from data already in the database, no new ingest:

| Control | Source |
|---|---|
| Venue | `games.home_team_id` |
| **Opponent rest** | the opponent's own `fatigue_scores` row for the same game |
| Opponent quality | opponent season eFG% allowed, derived from the same shooting data |
| Garbage time | final margin from `games.home_score` / `away_score` |
| Prior-game overtime | `fatigue_scores.is_overtime_penalty` |

**Opponent rest deserves emphasis.** "We are on zero days rest" is meaningless without "and they
are on two." A share of back-to-back games are against opponents also on short rest, where the
contrast is null by construction and dilutes any true effect toward zero.

**Pace is deliberately not controlled.** Back-to-back teams play slower, which means fewer
transition possessions, which means fewer rim attempts, which lowers eFG%. That is part of the
causal path, not a confound. Controlling for it would subtract part of the effect being measured.

## 5. Data source

Per ADR 0002: hoopR primary, ESPN cross-check on a sample, Basketball-Reference manual only.

Ingest is `nba_stats_team_boxscores` season files, 1996–2025, to a gitignored local cache. Join
key is `game_id` → `games.external_id`, verified at 100% of games carrying a stats id.

## 6. Expected effect, and the benchmark

The literature suggests a real but small effect:

- **Entine & Small, JQAS 2008** — the most rigorously controlled number available. A visiting
  team on a back-to-back is **1.77 points worse** than a rested visitor, and rest accounts for
  only **0.31 of the 3.24-point** home-court advantage. This is the benchmark to sanity-check
  against.
- **Green & Gold Analytics, 2015** — offensive efficiency 97.9 → 96.0 per 100 on back-to-backs, a
  net swing of −2.21; win rate .444 vs .517.

Neither publishes an eFG% delta with a CI, which is the gap this fills.

## 7. Known limitation: star rest-DNPs

**The treatment selects the roster.** In 22–24% of back-to-back sets a star plays one leg and not
the other, up 87% since 2017-18. When a team shoots worse on the second night, team-level data
cannot distinguish *"the players were tired"* from *"the best shooter did not play."*

This is not a confound to be adjusted away with team box scores. It is the reason **Phase 1
cannot be published as a claim**, and the reason Phase 2 is player-level: comparing the same
player to himself across rest states removes it structurally.

The report states this in its own section. It is not a footnote.

## 8. Deliverables

| Artefact | Path |
|---|---|
| Ingest | `scripts/fetch_team_shooting.py` |
| Analysis | `scripts/analyze_shooting_by_rest.mts` |
| Cross-check | folded into the ingest, `--verify` |
| Drafted DDL, **not applied** | `drizzle/draft/000X_team_game_shooting.sql` |
| Report | `docs/audit/shooting-by-rest-2026-07-28.md` |
| ADR | `docs/adr/0002-shooting-source-hoopr.md` |

Local cache lives at `ml/data/shooting/`, already covered by the `ml/data/` gitignore rule.

## 9. What happens after Phase 1

The report is read, and one of three things follows.

1. **A real, adjusted effect (≥ ~0.5pp).** Proceed to Phase 2 (player-level), then a page.
2. **A small effect (0.3–0.5pp).** Proceed, but the headline leads with the size, not the
   direction.
3. **Effectively nothing (< 0.3pp, or the CI crosses zero).** The pre-committed headline is:

   > **Rest barely touches the shot.** Teams on a back-to-back shoot [naive] pp worse than rested
   > teams. Almost all of that is the schedule, not the legs: back-to-backs are mostly road games
   > against defenses you would shoot worse against anyway. Strip venue and opponent out and the
   > gap shrinks to [X] pp. The schedule costs teams games; it does not appear to cost them the
   > shot.

   That is a publishable finding, not a failure — and writing it now, before the numbers exist,
   is what stops it being rewritten into something more exciting later.

No route, nav entry or page is designed until this decision is made. The five-tab nav is
deliberately not expanded on speculation.
