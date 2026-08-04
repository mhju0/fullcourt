# FullCourt

FullCourt models how NBA schedule conditions affect game outcomes and presents the resulting evidence and predictions without overstating model performance.

## Language

**Fatigue score**:
A multi-factor estimate of a team's accumulated schedule load for a game. Higher values mean greater estimated fatigue.
_Avoid_: tiredness rating, exhaustion score

**Rest advantage**:
The matchup differential `away fatigue score − home fatigue score`. A positive value favors the home team; a negative value favors the away team.
_Avoid_: fatigue advantage, rest score

**Neutral/no-call**:
A matchup whose absolute rest advantage is below `0.5`, so neither team receives a prediction from this metric. An absolute value of exactly `0.5` is a call, not neutral.
_Avoid_: tie

**Historical backtest**:
The regular-season evaluation of whether the team favored by rest advantage won. It excludes the **2019-20 Orlando bubble** — the 88 games played at a single site from 30 July to 11 October 2020 — and nothing else of that season; its 971 pre-suspension games are in. 2020-21 and both lockout seasons are included: short is fine, interrupted is not. Withholding a *whole* season is a separate rule belonging to Schedule Edge alone (see **Truncated season**).
_Avoid_: prediction accuracy test

**Playoff Predictor**:
The series-level model that estimates the probability a playoff series goes the home-court team's way, from pre-series evidence. It is separate from the regular-season historical backtest, and separate from the fatigue model: it shares no code path, and `win_pct_diff` outweighs its prior-round-grind feature 2.53 to 1 (standardized coefficients). Its edge is **calibration** — ~13% better log loss, ~15% better Brier than the base rate — not pooled accuracy, which ties the base rate inside the noise; split by round it beats "always pick the home-court team" in rounds 2+ (73.3% vs 69.5%, n=210) and loses in Round 1 (77.1% vs 78.8%, n=240).
_Avoid_: playoff rest-advantage model; playoff fatigue model; "the fatigue model applied to playoffs" — this guidance predates the surface copy that violated it, which was corrected 2026-07-30. Also avoid quoting pooled accuracy alone as a headline result — the round split is real but conditional on round.

**Expected Shot Value**:
The location-based expected effective field-goal percentage for a court cell. It does not represent defender-aware or shot-clock-aware shot quality.
_Avoid_: complete shot quality

**Net rest edge**:
A team's season total of `own rest days − opponent rest days`, each side capped at 5 days, season openers excluded. Positive means the schedule favored the team. Season-level and team-oriented, unlike rest advantage.
_Avoid_: rest advantage, rest differential

**Net fatigue edge**:
The same comparison as net rest edge but in fatigue-score units rather than days, so it also
carries travel and schedule density. Reported **per game**: the season sum turns per-game
differences too small to call into figures that look decisive.
_Avoid_: rest advantage, season fatigue

**Availability cost**:
What a team loses in points of final margin when a rotation player does not play. Absence is inferred from the rotation a team has actually been using — a player who appeared in the last five games at 15+ minutes and is not in tonight's box score — because a long-term-injured player may not be listed at all. **Retrospective by construction:** who sat is known only because the game was played, so it measures what an absence cost and never forecasts availability. Figures live in `src/lib/availability-facts.ts`, pinned by a test against `ml/availability_facts.json`.
_Avoid_: injury report, injury impact, player availability model — all three imply a forward-looking feed this module does not have

**Provisional season**:
A season containing any game that is not final. Its figures carry an as-of date and may revise as the schedule fills in.
_Avoid_: incomplete season, partial season

**Abnormal stretch**:
A range of dates within one season whose games were not reached by travelling to them, so no model on the site may read them. The list lives in `src/lib/season-regime.ts` and currently holds one entry: the 2019-20 Orlando bubble, 30 July to 11 October 2020. Every reader that publishes a game row applies it through `publishableGames()` in `src/lib/db/queries.ts`, which folds it in with the regular-season predicate; the two schedule-density helpers stay outside it on purpose, because they count physical schedule load rather than publishable rows. This is about **how the games were played**, and it excludes dates, never a season.
_Avoid_: excluded season, COVID season, bubble season

**Truncated season**:
A season whose teams did not play comparable numbers of games, so they cannot be ranked against each other. Withheld from **Schedule Edge only**, and offered everywhere else. 2019-20 is the sole member: it was suspended with teams having played 63 to 67 games, a spread of four against a limit of two, where every other season sits within one. This is about **how many games there are**, which is a different objection from an abnormal stretch and does not travel with it.
_Avoid_: short season (1998-99 and 2011-12 are short and are ranked normally), incomplete season

## Nav labels

The tabs are the product's public vocabulary; the terms above are its internal one. A nav
label is written for a casual fan reading at a glance, so it must be a plain noun phrase with
no time word — and it must not borrow a mainstream term that means something else on other
sports sites, which misroutes a confident click worse than jargon stalls an uncertain one.

Six tabs sit directly in the bar (`DIRECT_NAV_ITEMS`); SHOT VALUE, AVAILABILITY COST and REFEREE
EFFECT sit behind the OTHER menu (`OTHER_NAV_ITEMS`). That grouping keeps the bar short as the set
of smaller reference surfaces grows — it does not rank those surfaces below the direct tabs.

| Tab | Route | Page `<h1>` | Not called |
|---|---|---|---|
| GAMES | `/` | Games | Today's Games — the season selector reaches 1985-86, so no time word stays true |
| SEASON REPORT | `/season` | Season Report | Season Review — review implies the season has ended, and this page runs live from October; bare Season — GAMES already browses any season's slate and SCHEDULE EDGE already ranks teams inside one |
| SCHEDULE EDGE | `/schedule` | Schedule Disparity | Schedule — that means a game list everywhere else, which is GAMES |
| MODEL RESULTS | `/analysis` | Rest Advantage Analysis | Analysis (every page is analysis); Historical Data (GAMES already browses history, and "data" promises a dump) |
| PLAYOFF REST | `/playoffs` | The round before decides the round after | Playoff Odds — mainstream that means *making* the playoffs, not winning a series; PLAYOFF EDGE — `edge` is the qualifier that makes SCHEDULE EDGE legible as something other than a game list, and a second EDGE tab stops it qualifying |
| PLAYER SHOOTING | `/shooting` | Shooting by Rest | Shooting — on Basketball-Reference and NBA.com that means shot *location*, which is SHOT VALUE; Player Rest / Rest Splits — the rest tab is SCHEDULE EDGE, and an internal collision misroutes worse than an external one; Splits — ESPN's word for exactly this page, but jargon for a casual fan and silent about the measure |
| SHOT VALUE *(OTHER)* | `/shot-quality` | Expected Shot Value | Shot Charts — mainstream that means a player's makes/misses by spot |
| AVAILABILITY COST *(OTHER)* | `/availability` | What a missing player is worth | Availability — everywhere else in basketball that heads an injury report, meaning who is out tonight; this page is the opposite tense, a finished measurement of what an absence cost, with no live lineup data at all. `Cost` blocks the wrong click the way `Edge` does for SCHEDULE EDGE |
| REFEREE EFFECT *(OTHER)* | `/referees` | What each official calls *(in progress — the page shows an in-progress card, not the table)* | Referee Bias — the page was named for the question, not a conclusion, and the question came back inside noise. The subject is now foul *style*, which is explicitly not a fairness claim — but the framing that makes that legible is unfinished, so the surface is deliberately held back |
| ABOUT *(Reference)* | `/about` | Rest is a stat | — not a tab: it explains the product rather than being a surface of it |
| BEHIND THE DATA *(Reference)* | `/behind-the-data` | Behind the data | Methodology — that word promises a paper; this is read by people deciding whether to trust a number they just saw |

Module names are unaffected: the code, tables, scripts and design records still say Playoff
Predictor, Shot Quality and Schedule Disparity.

`/about` and `/behind-the-data` are **not** tabs. They explain the product rather than being
surfaces of it, so they sit in a separate right-aligned `Reference` landmark in the same nav row —
the same size and weight as a tab, with the gap saying "not one of the six". They were moved there
on 2026-07-30 from the top status strip, which proved too quiet to be found; `/about` is also
reached from the footer. Because the two landmarks are separate, the six-link count of
`Main navigation` still holds, and it is asserted in `e2e/navigation.spec.ts` and again in
`e2e/about.spec.ts`.
