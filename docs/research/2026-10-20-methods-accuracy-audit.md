# Behind the Data accuracy audit — 2026-10-20

Scope: all twelve Behind the Data routes, including the overview, ten method topics,
and the referee research archive. Review covers headings, prose, formulas, tables,
statistics, cohort labels, uncertainty statements, source dates and shared navigation.
The homepage comparison is separately restored to all eligible completed seasons.

This is a source-and-presentation audit of published research, not a claim that every
provider record is correct or that every historical study was fetched or trained again.
Current generated artifacts, producing scripts and pinning tests take precedence over
old narrative reports. Existing fatigue coefficients, generated data, database state
and resolved predictions are unchanged by this patch.

## Findings and dispositions

| Route | Confirmed correction or verified boundary | Source of truth |
| --- | --- | --- |
| Overview | Time-zone finding describes modeled base-to-venue displacement. Referee card no longer incorrectly calls every home-away pattern a null. All four result cards retain their source links. | Method pages, `timezone-null.json`, `referee-timing.json`, `referee-legends.json` |
| Rest Advantage | Qualify the 47,094-game scored/non-neutral published cohort; distinguish estimated venue distance, prior venue appearances and tip-to-tip intervals from observed flights, nights or recovery. Generated split/ablation figures remain current. | `rest-advantage-evidence.ts`, `fatigue.ts`, `rest_split_facts.json`, `fatigue_ablation_facts.json`, `home_rest_confound_facts.json`, ADR 0006 amendments |
| Schedule Edge | Net edge excludes either-side openers and needs a scored pair. Worth has its own eligible population. Dense-schedule edges are differences, not raw counts. Rest-day capping does not cap fatigue points. Show the small market correlation with enough precision to preserve its sign/magnitude. | `schedule-disparity.ts`, `schedule-value.ts`, `win-total-benchmark.json` |
| Playoff Rest | Full-sample coefficient displays are not fold-specific weights. Corrected-input replay is not proof of a forecast published before a series. Round-split baseline loss uses an observed slice rate; pooled evaluation uses a training-only prior. Remove an unsupported current confidence-interval claim. | `train_series_model.py`, `playoff_round_split.json`, `playoff-model-metrics.ts`, ADR 0012 |
| Player Shooting | Define full days off precisely, including a 30-calendar-day gap as 29 full days off. Keep zero-shot competitive appearances in history. Distinguish season uncertainty approximation from career estimation, include ×100 in the percent equation, and explain publication cadence and excluded/unknown arms. | `player_appearance_history.py`, `analyze_player_shooting.py`, `export_player_rest.py`, `player-rest.ts` |
| Availability | Explain up-to-20/minimum-five appearance quality history and its carried-forward lag; a long absence remains countable for at most four games. Distinguish source coverage from the 25,435-game regression cohort. Explain missing quality, separate specifications and ordinary unclustered regression uncertainty. | `availability_inputs.py`, `availability_facts.py`, `availability_quality.py`, `availability_facts.json` |
| Expected Shot Value | Published surfaces use full-fit retrospective models; expanding prior-season windows belong to validation. Cell expected eFG uses the observed two-/three-point attempt mix. The difference layer compares GBM with the zone model, not actual team shooting with expectation. Same-value caveat is cell-and-season specific. Home input is fixed at 0.5, not an average of two tree-model predictions. | `sq4b_train_gbm.py`, `sq5_write_surface.py`, `sq4_train_shot_value.py`, retained original measurement reports |
| Officiating | Historical eligibility sentence explicitly covers regular-season games, avoiding the temporary 2017-playoff exception. Presentation changes are described without inventing changes to grading categories. Verdict, refresh/publication and source-retention explanations match the current pipeline. | NBA primary policy releases/FAQ, `collect_l2m_season.py`, `publish_officiating.py` |
| Archived referee methods | Describe season-bounded archive, not a current feed. Published-official count comes from the displayed style population. A sample-size illustration is conditional rather than absolute. Existing chance comparisons, drift figures and preregistration boundaries remain. | `fetch_officials.ts`, `analyze_officials_splits.ts`, referee JSON artifacts, ADR 0007 |
| Time Zones | Exposure is signed civil-clock displacement from a modeled team base to venue, not the last flight leg. Separate raw and held-out samples, loss-direction conventions, fitted research terms and retained operational multipliers. | `fatigue.ts`, `export_fatigue_features.ts`, `timezone_test.py`, `timezone-null.json`, ADR 0006 |
| Data and Limits | Remove obsolete claims that early overtime/neutral-site repairs were never done. Use generated source-cache coverage beginning 1996-97 rather than Availability's narrower 1997-98 regression floor. Avoid an unverified tip-time start-year claim. Qualify exclusions by module and remove the incorrect final 2019-20 games-played range. | `availability_facts.json.coverage`, `physical-venue.ts`, fixture venue register, historical correction record, module cohort helpers |
| Referee archive | Show the ending season as well as the beginning; latest-window wording refers to the published archive. Inclusive z threshold is described as reaching, not exceeding. Quarter-share counts are descriptive evidence, not proof of an individual official's causal effect. A 1/N minimum-p heuristic is no longer presented as a calibrated simulated null; dependent pair tests and simple count references are explicit. The 7 versus 6.9 comparison no longer incorrectly says the observed count is below expectation. | `referee-effect-content.tsx`, `referee-foul-style.ts`, referee timing/style/legends artifacts |

## Homepage population

Both bars now pool raw wins/games over the same complete eligible regular seasons.
The baseline continues to own the season population, including a season with no large-gap
games. Incomplete seasons, neutral-game rules and the 5+ fatigue-point threshold retain
their existing definitions. Counts/rates are calculated, not typed into the page.
The corrected reference is 2,544 / 3,899 large-gap rested-home wins (65.2%) versus
28,225 / 47,094 home wins (59.9%), a +5.3 percentage-point difference from unrounded rates.
(Dated v1.0.6 figure. The v1.0.7 and v1.0.8 corrections moved it; the current value comes from
`ml/rest_split_facts.json` and is rendered on the homepage.)
The period label remains below the explanation and reads “All completed regular seasons”.

## Freshness and reproduction

- v1.0.3 already regenerated rest split, ablation, confound, fit and time-zone research
  against the corrected prepared feature table. Repeating those fits was unnecessary.
- v1.0.4 regenerated Shooting and Availability. Their current generated figures and
  producer logic are the audit baseline. A stale local 33,166-game Availability report
  was rejected; the retained matching 25,435-game producer report was used instead.
- Referee studies use separate ESPN corpora, not the changed player-rest/fatigue table.
  Their differing sample sizes and original snapshot dates are intentional. The October 18
  full cached Legends reproduction remains valid. The October 16 working-crew fix included
  the updated timing artifact; it did not change the style producer. An old creation stamp
  is not a claim that every provider response was fetched that day.
- Shot Value validation numbers are dated measurements of the original protocol. The
  producer and retained reports were checked; this patch does not claim retraining or a
  fresh equality check of all production surface rows.

## Primary policy sources

- [NBA L2M FAQ](https://official.nba.com/nba-last-two-minute-reports-frequently-asked-questions/)
- [Original February 27, 2015 announcement](https://pr.nba.com/last-two-minutes-reports-officiating/)
- [2017–18 criteria change](https://www.nba.com/news/nba-changes-last-two-minute-reports-2017-18)
- [Temporary 2017 playoff expansion](https://official.nba.com/nba-to-expand-criteria-for-last-two-minutes-officiating-reports-during-2017-playoffs/)

## Verification and limits

Worker claim ledgers inspected each rendered section against producing code and current
artifacts. Focused arithmetic/contract tests, static rendering and lint passed during
implementation. Full integration passed 1,363 unit tests, 40 final referee tests and 74 homepage/methods
browser checks. Typecheck, production build, documentation links and dependency audit passed;
lint has no errors and two existing cron warnings. Preview, exact-candidate independent
review and canonical production acceptance are recorded in the release PR/tag evidence.

Uncertain early inputs, unpublished Cup fixtures and estimated itineraries remain explicit.
Research associations do not become causal conclusions or contemporaneous forecasts because
copy was updated. Actual opening-night ingestion and human/device checks remain separate.
