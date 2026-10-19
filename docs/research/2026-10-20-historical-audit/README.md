# All-season schedule and travel audit

Audit date: October 20, 2026. Scope: every game currently stored, 1985-86 through the assigned 2026-27 schedule. This is a read-only research audit. Production data, coefficients, generated analytics and application behavior are unchanged.

The calendar and recorded-distance arithmetic passes across the entire stored history. The important work now is correcting or qualifying the inputs and the homecoming rule. The pooled rest finding survives the homecoming-only diagnostic with a small rate change; that does not settle the separate effects of missing overtime or inaccurate historical venues.

## Evidence and scope

The frozen PostgreSQL snapshot contains 51,695 games, 103,390 latest team scores and 30 franchise identities across 42 season labels. Of those games, 50,495 are final and 1,200 are scheduled. The snapshot was captured in one `REPEATABLE READ READ ONLY` transaction. There are no duplicate game identities, duplicate score-side rows or tied latest-score timestamps in this snapshot. See [snapshot manifest](numeric/snapshot-manifest.json) for capture time and hashes.

The application source under audit is `f7a20dac58a52b1f4be50d562bdc327ea5bcf4c4`; the research snapshot was taken from research HEAD `08ade6c385670c9d33eef5cd15ff14995b392cfd`, whose later changes are documentation only.

Three checks answer different questions:

1. Current-engine replay asks whether stored scores reproduce the code. It retains actual historical overtime, final margins, tip times and physical prior games across season and game-type boundaries.
2. An independent calendar/geography implementation checks arithmetic and the stated meaning of streak fields. Its geometry follows the recorded model assumptions; that does not validate those assumptions against real journeys.
3. External schedule and venue comparisons inspect the underlying facts. Coverage varies by season and field. A missing value, provider error or blocked source remains unverified.

Actual flights, transport mode, hotels and intermediate home returns cannot be established for every historical game from public schedules. Arena-to-arena distance remains an estimate. The owner's visible label remains **Mileage**, with its method explained in Behind the Data (D-120).

## Confirmed calculation findings

All 103,390 stored team scores reproduce the current engine, with zero mismatches across the score and 16 stored components/flags. The independent oracle agrees on density flags, rest dates, recent workload and rolling Mileage. [Replay summary](numeric/replay-summary.json), [oracle summary](numeric/oracle-summary.json), and [season counts](numeric/season-counts.csv) retain the exact scope and results.

The shared streak helper carries the previous venue streak into a game at the opposite venue:

- 25,046 true home appearances retain a preceding away streak rather than zero.
- 25,095 away appearances retain the preceding home-stand feature. This exported feature is not itself a current scoring term.

The homecoming behavior is longstanding and reproduces the stored model. It conflicts with the current-away-streak field contract, but the scoring intent still requires a deliberate decision: whether a completed trip should contribute road-load fatigue after the team has returned home. No coefficient change is implied by resolving that question.

## Homecoming sensitivity, one change at a time

This diagnostic zeros only the carried-over away-streak load on true home games. It preserves all other terms, multipliers, final clamping, JavaScript rounding and currently recorded venue inputs. It does not apply new venue, overtime or schedule corrections.

The published comparison includes final, eligible regular-season games outside the bubble and excludes neutral venues. Prior physical workload remains broader than this publication population. It reproduces the existing 47,112-game baseline exactly.

| Measure | Current model | Homecoming diagnostic |
|---|---:|---:|
| Rested team at home, wins / games | 16,778 / 27,420 | 17,212 / 28,151 |
| Rested team at home, win rate | 61.1889% | 61.1417% |
| Home venue baseline | 59.9295% | 59.9295% |
| Rested team on the road, wins / games | 4,867 / 11,494 | 4,522 / 10,648 |
| Rested team on the road, win rate | 42.3438% | 42.4681% |
| Road venue baseline | 40.0705% | 40.0705% |

The diagnostic reduces 6,125 published home-side scores. It changes the more-rested-side/no-call classification in 1,484 games and the size category in 2,201 games; these groups overlap. The pooled home rate moves only 0.0472 percentage points downward, while individual games and season-level samples can move more. A changed selected sample does not establish improved prediction or a causal rest effect. Scheduled games contribute no outcome evidence.

See [all season/scenario outcomes](numeric/season-outcomes.csv) for denominators, wins, each season's venue baseline, small/medium/large bins and cumulative 3+/5+ thresholds.

For large gaps of 5+, the all-history home sample moves from 2,452 wins in 3,756 games (65.2822%) to 2,537 in 3,887 (65.2688%). For the latest ten completed seasons, 2016-17 through 2025-26, the headline moves from 3,720 / 6,386 (58.2524%) to 3,840 / 6,605 (58.1378%), against the unchanged 56.2195% home baseline. The recent-ten-season 5+ comparison moves from 340 / 555 (61.2613%) to 356 / 582 (61.1684%).

All existing home calls remain selected in this diagnostic, with 731 added across history and 219 added in the latest ten completed seasons. The largest individual season's headline change is 1992-93: 62.6154% to 61.9403%, a decrease of 0.6751 percentage points. [Period outcomes](numeric/period-outcomes.csv) and [selection transitions](numeric/selection-transitions.csv) retain the exact counts.

## External schedule findings and remaining coverage

External observations cover date/identity comparisons for 46,131 of 51,695 stored games and score comparisons for 44,931 of 50,495 final games. Earlier seasons have substantial gaps. A source-field comparison does not itself certify the provider's value: the audit found erroneous dates, scores and arenas in provider records too.

The source audit identifies 783 completed games with observed overtime but a stored zero: 157 from 1985-86 through 1987-88, 194 from the added 1993-94 through 1995-96 archive, and 432 from 1996-97 through 2001-02. These are concrete backfill candidates. Another 5,815 completed games remain unverified for overtime; scheduled games have no overtime outcome yet. No assumption that missing overtime cancels out is warranted.

All 3,228 stored postseason rows were checked against the official NBA finalist pairs and series lengths for the 41 completed seasons. There are 109 incorrect sublabels: 98 ordinary playoff games labeled Finals and 11 Finals games labeled ordinary playoffs. The playoff-model builder already pools both labels and derives rounds independently, so this defect does not establish incorrect published playoff rounds.

Seventeen games have unresolved provider score disagreements. No database result correction is established by those disagreements. Historical ESPN timestamps also expose 7,544 potential fills where the stored tip is null; these are research candidates, not confirmed tip times to ingest automatically. Provider neutral-site false values, particularly before 2013, cannot verify the actual arena.

The [core external source review](sources/README.md) preserves the initial pass and its 589 overtime cases. The [bulk-archive supplement](sources/supplement/README.md) adds 194 cases and contains the combined 42-season, per-field coverage matrix used above. Original files remain frozen so the two passes can be reproduced independently. [Finals authority: NBA history](https://www.nba.com/news/history-nba-champions).

## Historical venue findings

The bounded venue register identifies 167 stored games whose modeled city differs from the documented physical location. Of these, 156 have primary event/history or whole-season support; the remaining 11 Austin fixtures have provider support with only partial primary checking by date. Whole-season histories establish an era, rather than individually confirming every gamebook.

The register includes Toronto's 36 Tampa homes, Golden State's 41 San Jose homes, Seattle's 43 Tacoma homes, 11 minority Katrina-era venues, 15 early international games, three recently missed genuine neutral games, 11 Austin fixtures and seven corroborated Anaheim/Hartford/Baltimore games. Another 1,415 Detroit home fixtures are separately marked as historical-arena inferences requiring alternate-site reconciliation; they are not added to the 167.

The three recently missed genuine neutral games are MIA at SAS in Mexico City on December 17, 2022, and IND at MIL plus NOP at LAL in Las Vegas on December 7, 2023. Their stored neutral flag is false. These can affect baseline eligibility as well as travel. The later 2024 and 2025 semifinals already have recognized neutral records. [Official Mexico announcement](https://pr.nba.com/nba-mexico-city-game-to-return-with-regular-season-matchup-featuring-san-antonio-spurs-and-miami-heat-on-dec-17/), [IND–MIL gamebook](https://statsdmz.nba.com/pdfs/20231207/20231207_INDMIL_book.pdf), [NOP–LAL gamebook](https://statsdmz.nba.com/pdfs/20231207/20231207_NOPLAL_book.pdf).

The wider 3,049 provider/model city disagreements are an unverified candidate queue, not an error count. They include metro approximations, correctly located modern venues, bubble games and provider mistakes. The [venue review](venues/README.md) retains exact IDs, sources, confidence, adjacent-game contexts and every-season coverage. No combined venue-corrected outcome or Mileage total has been calculated in this audit.

## Recommended decisions

I recommend making current-away streak zero at true home games, while preserving the existing inbound-distance, recent-workload and overtime terms. If post-trip fatigue is to persist separately, it needs its own explicit definition and evaluation; an ambiguous current-streak field should not silently supply it.

I also recommend a dated physical-venue representation that can describe temporary team bases and alternate home arenas without pretending every such game is neutral. Backfill the confirmed overtime and venue facts in a controlled candidate, and evaluate their combined impact before replacing published history. Keep **Mileage** as the label and explain venue-distance assumptions behind it. Do not introduce a geography-based intermediate-home-stop classifier or team airport substitution from the present evidence.

## Correction sequence and affected outputs

The audit does not authorize a historical rescore. A controlled correction should proceed in this order:

1. Decide the homecoming rule and physical-venue representation. Keep nominal home-court status separate from the actual venue location; Austin cannot be corrected by casually marking it neutral.
2. Adjudicate source disagreements and identify exactly which date, tip, result, overtime and venue fields are confirmed. Preserve unknown fields as unknown rather than treating defaults as observations.
3. Prepare a reversible correction with a frozen backup, explicit affected rows and dependent-game windows. Any destructive production mass replacement requires immediate owner approval before execution.
4. Replay the corrected candidate and regenerate dependent artifacts together. Include predictions, caches and generated outputs in the consistency plan; decide how to preserve resolved historical prediction records rather than blindly rewriting them. Review and verify an exact frozen candidate before production writes.

Live Games, Model Results, Home-court Advantage, Season Report and Schedule Edge consume scored games and can change after a rescore. Static rest findings are separately pinned: `scripts/measure_uncalled_half.ts` produces `ml/rest_split_facts.json`, with `src/lib/rest-split-facts.ts` and its tests maintaining alignment. `src/lib/schedule-value.ts` derives Schedule Edge's Worth scale from those counts; updating live scores alone would leave its calibration stale.

The fatigue fitting pipeline must preserve its three-step export → prepare → fit protocol (ADR 0006). The home-stand feature issue can affect research exports even though it does not directly alter current scores. Player Shooting derives a player's own rest from appearances and game dates; a scorer-only change does not automatically change that study. Officiating's cached foul analysis and the separate playoff model also require their own input-dependency review rather than an indiscriminate rebuild.

## Limits that remain

Pre-2002 stored overtime zeroes and null tips are known missing-input defaults. Earlier neutral-site flags are incomplete. Historical arena names can be retroactively renamed by providers, and some provider venue records are wrong. Airport preference evidence is usually dated and does not establish a team's airport for every journey.

ADR 0003's historical assertion that missing inputs can only dilute the measured effect is not established by this audit. Neither missingness nor score reproducibility determines the error's direction. Its assertion of complete availability for all other terms also exceeds the verified historical venue coverage. Retain that ADR as a historical decision record; do not reuse those assertions as validated findings.

The model's 30-day prior-history reset and a once-counted season Mileage itinerary are different contracts. A distance difference caused by that distinction is not automatically an arithmetic defect. Historical civil-time accuracy also has limits: the geographic time-zone helper approximates pre-1987 US daylight saving and uses US transition dates for European locations. Replaying the same helper cannot independently validate those civil times.

The upcoming-season findings from the [full assigned-season audit](../2026-10-20-full-season-audit/FULL_SEASON_AUDIT.md) remain open: three Austin locations, two confirmed stale tips, future Cup assignments and championship workload context. Completion of this audit does not close those production follow-ups.

## Reproduction and review

The numeric, source and venue subdirectories contain their own commands, scope notes and SHA-256 manifests. Raw database/provider captures remain local under `docs/audit/2026-10-20-historical-audit/`; a fresh checkout has the tracked findings and scripts but not that raw corpus. Do not recapture over this snapshot when reproducing it.

`python3 docs/research/2026-10-20-historical-audit/build_report.py` rebuilds the [HTML report](../../reports/2026-10-20-historical-schedule-travel-audit.html) from the notes and season inventory. The local report builder uses the Python Markdown package; it adds no application dependency. The HTML reuses the existing report's typography and sky-blue surfaces.

The full application test suite passed: 108 files, 1,279 tests. Numeric-script ESLint and the full TypeScript check passed. Read-only independent review separately reproduced all score and homecoming calculations from the frozen raw evidence. No deployment is part of this research delivery.
