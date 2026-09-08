# FullCourt glossary

FullCourt studies NBA schedule conditions and historical results. Use these terms consistently in product copy. Keep code identifiers unchanged when editing labels.

## Measures and populations

**Fatigue score**: A schedule-based estimate for one team before a game. Higher values represent greater estimated fatigue. The score does not observe sleep, injuries, or individual minutes. Source: `src/lib/fatigue.ts`.

**Back-to-back**: A game on the calendar day after the team's previous game. When tip-off times are available, the model adjusts its multiplier using the hours between them. That interval includes the previous game itself; it is not a direct measurement of recovery time. Use the full term in explanatory prose; compact tables may use B2B.

**Altitude**: The visiting-altitude multiplier for Denver, Utah, and Mexico City, plus a separate carryover multiplier the following night. Venue flags come from team or neutral-site records. The altitude multiplier changed from 1.15 to 1.29 on 2026-08-02 using final-margin evidence. The carryover multiplier did not change. A different fitting target does not make the shared historical sample independent. See [ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md).

**Rest advantage**: `away fatigue score − home fatigue score`. Positive favours the home team; negative favours the visitor. Avoid “fatigue advantage” and “rest score.”

**Neutral/no-call band**: An absolute rest advantage below `0.5`. The code compares the unrounded floating-point difference, so a displayed `0.50` can fall just below the boundary. Do not promise that every displayed gap of exactly 0.50 receives a call. This band is unrelated to a neutral-site venue.

**Decidable**: A gap outside the neutral band, identifying a more-rested side. This is separate from whether the game is called or publishable.

**Called**: A decidable game in which the more-rested team is at home, selected by `isCalledSide()` in `src/lib/rest-advantage-evidence.ts`. The headline backtest rate uses this group. In explanatory copy, prefer “rested team at home.”

**Publishable**: An admissible regular-season game outside an excluded abnormal stretch. `publishableGames()` in `src/lib/db/queries.ts` owns this filter. Publication eligibility is separate from the rest-gap classification.

**Rested team at home**: The more-rested team is also the home team. The headline counts this group, so its raw win rate includes home-court advantage.

**Rested team on the road**: The more-rested team is the visitor. Its results appear separately against a road baseline and are not pooled into the headline. “Rested visitor” is also clear in explanatory prose.

**Baseline**: The win rate for a venue side regardless of rest. Compare rested home teams with the home rate and rested visitors with the road rate. Season charts use that season's own baseline. The home-road difference is distinct from either baseline itself. Read current values from data rather than copying them into prose.

**Claim**: A statement about a result or comparison. State the population, denominator, reference, and material limitations. Derive comparisons over live figures using `rest-advantage-display.ts` or `analysis-claims.ts`. A rate above baseline is an association; it does not by itself measure a causal rest effect.

**Historical backtest**: Evaluation of the fixed regular-season rest rule on past games. The headline asks whether the rested home team won. It includes pre-suspension 2019-20 games, 2020-21, and both lockout seasons, but excludes the Orlando bubble. It is distinct from the playoff model's walk-forward evaluation.

**Playoff Predictor**: The separate series-level probability model. Its inputs are regular-season win percentage, a derived seed gap, prior-round grind, and head-to-head record. Walk-forward results improve probability-error metrics over a constant home-court base rate; pooled winner accuracy is close to baseline. Round-level results differ and require their own sample sizes. Do not call it a playoff version of the fatigue model. Sources: `playoff-model-metrics.ts`, `playoff-rest-facts.ts`.

**Expected Shot Value**: Expected effective field-goal percentage for a court location. Defender position, shot clock, and shooter skill are absent from the location model. Avoid presenting it as a complete measure of shot quality.

**Net rest edge**: A season total of `own rest days − opponent rest days`, capped at five days per side, excluding games without previous-game context for both sides. Positive favours the team. It is measured in days, unlike rest advantage.

**Net fatigue edge**: The corresponding fatigue-score difference, reported per game. It includes travel and density as well as rest. A sum can obscure the size of typical matchup gaps.

**Net edge games**: Favourable games minus unfavourable games, using the shared `0.5` fatigue-gap threshold. “Big edge” uses `1.5`. Both counts exclude games without previous-game context for both teams. Source: `schedule-disparity.ts`.

**Schedule value / Worth**: A win-equivalent conversion of historical rest-state rates relative to venue baselines, summed over scored games including openers. `schedule-value.ts` supplies both Schedule Edge's table and Season Report's extremes. The displayed team's results do not enter the calculation. This is not actual wins added or a causal estimate. Show the per-game scale alongside season totals.

**Swing**: On Season Report, a team's win rate as the fresher side minus its rate as the tireder side. The counted fresher arm is at home and the tireder arm is on the road. Compare each row with `SeasonReport.swingBaseline`, not zero. Small groups and venue differences prevent interpreting the table as a ranking of rest-management skill.

**Availability cost**: The retrospective association between missing rotation players and final margin. Rotation membership uses prior appearances and minute thresholds; missing players record no minutes in the target game. Long absences eventually leave the rolling rotation window. Game Score above the rotation median is a replacement-production proxy, not the actual substitute's contribution. Sources: `availability-facts.ts`, `ml/availability_facts.json`. Avoid “injury report” or wording that forecasts tonight's lineup.

**Official**: A named referee whose games are grouped for comparison. Three officials share each game's recorded fouls because the input does not identify who made a call. Changing crews does not establish random assignment, an exact one-third dilution, or freedom from confounding. Crew chief is a role label, not a separate unit of causal attribution. Avoid “referee bias” as a conclusion and do not claim to measure call accuracy. See [ADR 0007](adr/0007-referee-analysis-axes-are-pre-registered.md).

## Schedule scope

**Neutral site**: A venue outside either team's usual home arena. `neutral-venues.ts` supplies its coordinates and altitude flag. Do not confuse this with the neutral rest-gap band.

**Provisional season**: A season with games that are not final. Figures can change as games are played, added, corrected, or rescheduled.

**Abnormal stretch**: An excluded date range within a season. `season-regime.ts` currently identifies the Orlando bubble, 30 July to 11 October 2020. Published regular-season reads use `publishableGames()`; schedule-density context has explicitly documented exceptions. This exclusion concerns playing conditions rather than season length.

**Truncated season**: A season with unequal team game counts that make total-based rankings unsuitable. Schedule Edge withholds 2019-20, when teams stopped at 63 to 67 games. Other pages retain its pre-suspension games. A short but complete lockout season is not excluded for this reason.

## Page headers and navigation

Interior pages use `PageHeader`: eyebrow, plain title, concise description, then a method link where applicable. The eyebrow identifies subject and unit or scope. The description explains the comparison and any limitation needed to read it. Keep desktop descriptions within the tested two-line measure; let mobile text reflow. The front page uses its own hero.

| Navigation label | Route | Page title |
| --- | --- | --- |
| Games | `/games` | Games |
| Season Report | `/season` | Season Report |
| Schedule Edge | `/schedule` | Schedule Edge |
| Model Results | `/analysis` | Model Results |
| Playoff Rest | `/playoffs` | Playoff Rest |
| Player Shooting | `/shooting` | Shooting by Rest |
| Shot Value | `/shot-quality` | Expected Shot Value |
| Availability Cost | `/availability` | Availability Cost |
| Officiating | `/officiating` | Officiating |
| Explore | `/explore` | Explore |
| Behind the Data | `/behind-the-data` | Behind the data |

Games, Season Report, Schedule Edge, and Explore are the four primary destinations on desktop and mobile. Other analyses are reached through Explore. Behind the Data has a separate Reference landmark. The wordmark reaches `/`; `/about` contains the brand story. `/referees` redirects to Officiating; historical referee research remains in the methodology archive.

FullCourt is the product; rest advantage is the metric. Internal module names such as Playoff Predictor, Shot Quality, and Schedule Disparity remain unchanged.
