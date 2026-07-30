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
The regular-season evaluation of whether the team favored by rest advantage won. It excludes the 2019–20 Orlando bubble because that setting removes normal travel conditions.
_Avoid_: prediction accuracy test

**Playoff Predictor**:
The series-level model that estimates a playoff series winner from pre-series evidence. It is separate from the regular-season historical backtest.
_Avoid_: playoff rest-advantage model

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

**Provisional season**:
A season containing any game that is not final. Its figures carry an as-of date and may revise as the schedule fills in.
_Avoid_: incomplete season, partial season

## Nav labels

The tabs are the product's public vocabulary; the terms above are its internal one. A nav
label is written for a casual fan reading at a glance, so it must be a plain noun phrase with
no time word — and it must not borrow a mainstream term that means something else on other
sports sites, which misroutes a confident click worse than jargon stalls an uncertain one.

Five tabs sit directly in the bar (`DIRECT_NAV_ITEMS`); SHOT VALUE sits behind the OTHER menu
(`OTHER_NAV_ITEMS`). That grouping keeps the bar short as the set of smaller reference surfaces
grows — it does not rank those surfaces below the direct tabs.

| Tab | Route | Page `<h1>` | Not called |
|---|---|---|---|
| GAMES | `/` | Games | Today's Games — the season selector reaches 1985-86, so no time word stays true |
| SCHEDULE EDGE | `/schedule` | Schedule Disparity | Schedule — that means a game list everywhere else, which is GAMES |
| MODEL RESULTS | `/analysis` | Rest Advantage Analysis | Analysis (every page is analysis); Historical Data (GAMES already browses history, and "data" promises a dump) |
| PLAYOFF PREDICTIONS | `/playoffs` | Series Predictions | Playoff Odds — mainstream that means *making* the playoffs, not winning a series |
| PLAYER SHOOTING | `/shooting` | Shooting by Rest | Shooting — on Basketball-Reference and NBA.com that means shot *location*, which is SHOT VALUE; Player Rest / Rest Splits — the rest tab is SCHEDULE EDGE, and an internal collision misroutes worse than an external one; Splits — ESPN's word for exactly this page, but jargon for a casual fan and silent about the measure |
| SHOT VALUE *(OTHER)* | `/shot-quality` | Expected Shot Value | Shot Charts — mainstream that means a player's makes/misses by spot |
| REFEREE EFFECT *(OTHER)* | `/referees` | Coming soon | Referee Bias — the page was named for the question, not a conclusion; it is a placeholder since 2026-07-30 because the home-whistle finding sat inside noise |
| ABOUT *(Reference)* | `/about` | Rest is a stat | — not a tab: it explains the product rather than being a surface of it |
| BEHIND THE DATA *(Reference)* | `/behind-the-data` | Behind the data | Methodology — that word promises a paper; this is read by people deciding whether to trust a number they just saw |

Module names are unaffected: the code, tables, scripts and design records still say Playoff
Predictor, Shot Quality and Schedule Disparity.

`/about` is **not** a tab and has no label in this table. It explains what the product
measures rather than serving data, so it lives in the status bar and the footer. The five-link
count is asserted in `e2e/navigation.spec.ts` and again in `e2e/about.spec.ts`.
