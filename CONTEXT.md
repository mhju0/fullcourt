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
