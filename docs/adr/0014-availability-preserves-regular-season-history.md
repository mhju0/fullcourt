# ADR 0014: Preserve complete regular-season windows in Availability

Date: 2026-10-20
Status: accepted for v1.0.4

## Problem

Availability's three producers joined NBA player box scores to canonical game IDs before
building prior histories. Five accepted historical regular fixtures have alternate source
IDs, so the join silently removed both those outcomes and their contribution to later
five-game rotation and twenty-appearance quality windows. The public method described
previous games without identifying that gap.

The Player Shooting source review also adjudicated conflicting participation and minutes
records used by these producers. Unknown participation cannot safely become a missing
rotation player, and unknown duration cannot safely become zero minutes.

## Decision

Apply the five source-validated NBA-to-canonical identity aliases before all three joins.
Check exact Eastern date, both teams and sides, a one-to-one fixture mapping, duplicate
player-game identities and plausible roster/box-score totals. Share only confirmed identity
and participation/minute corrections with the shooting source manifest, rather than its
rest-arm annotation engine.

Preserve the established estimator: previous five regular-season team games within the
same team-season, prior twenty regular-season personal appearances with positive recorded
minutes (which can cross summers), existing minimum observations, fifteen-minute rotation threshold, prior-only
quality shifts and regression specifications. Cup and playoff history are not added to
this regular-season estimator. Rest/fatigue coefficients remain unchanged.

Compare the supported canonical regular-final fixture sequence with observed box-score
fixtures before windowing. An unresolved gap must fail validation or invalidate the
histories it could change; it must not compress the sequence to available games. Source
uncertainty is handled separately for participation and minutes. Withhold a team-game
when uncertainty can alter rotation membership, absence or its quality weighting. A
regression game requires eligible measurements for both sides.

One additional primary correction assigns Sarunas Marciulionis's November 10, 1996
appearance (`0029600070`, person `36`) to Denver/away, rather than Cleveland/home. The
contemporaneous November 11 AP newspaper's full Denver box score records his 3/9 FG,
1/3 threes and seven points. Keep the paper's conflicting small headline in provenance;
its Denver total, quarter totals and AP roundup agree with the stored 101–86 score.
Apply only the exact expected old identity and preserve all player/game/shot/minute facts.
This also corrects Shooting's one season label without changing shooting/rest numbers.
No database score change is appropriate.

The five recovered eligible outcomes may re-enter Availability's cohort. This differs
from Shooting's fixed raw shooting cohort, and its cohort/estimate delta must be recorded.
Do not change thresholds or fit specifications to preserve previous published results.

## Verification

Exercise alias identity, chronology, missing intermediate games, duplicate inputs,
participation/minute uncertainty and prior-only windows. Rebuild all three producers,
quantify coverage and source holdouts, and reconcile published facts with their outputs.
The frozen candidate requires independent review and connected deployment verification.
No production database write or schema migration is implied.
