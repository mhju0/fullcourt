# ADR 0013: Derive player rest before selecting shooting outcomes

Date: 2026-10-20
Status: accepted for v1.0.4

## Problem

The shooting producer filtered out nonregular games and zero-shot rows before deriving a
player's previous appearance and seven-day workload. Its public description said it followed
the player's own appearances. A real played game with no shot attempt could therefore turn
the following night's shooting into a rested observation.

Official NBA box scores independently confirm the Dean Wade example: February 25, 2024
(`0022300820`), February 27 (`0022300832`, 9:15 played with zero FGA), and February 28
(`0022300846`). The next-day appearance follows February 27, rather than the last game
with a shot on February 25. This defect is separate from the v1.0.3 team-fatigue correction.

## Decision

Derive personal rest, appearance count and minutes from confirmed competitive NBA player
appearances before selecting shooting outcomes. Keep stable player IDs across trades and
seasons and use authoritative Eastern calendar dates.

- Positive minutes establish an appearance even without a shot. A recorded field-goal or
  free-throw attempt also establishes participation. Explicit DNP, DND or inactive records
  do not. Conflicting participation fields require case-specific primary adjudication or
  remain unknown; a generic play-by-play mention is not proof of an on-court appearance.
- Rounded `0:00` with no clear participation state and malformed or missing minutes must
  not silently become known participation or absence. Resolve relevant cases from source
  evidence; otherwise withhold any rest/load classification they could change. Confirmed
  participation with unknown duration can establish rest without inventing minutes.
  Normalize the cache's exact sixty-second carry (`3:60` to `4:00`) as elapsed duration,
  preserving raw clocks and rejecting larger or malformed overflow.
- Covered playoff, play-in and NBA Cup appearances may supply history. Bubble games may
  supply context but remain excluded from regular-season shooting outcomes. Preseason,
  All-Star and exhibition games are outside the supported history.
- Actual player participation is required. A team's fixture or roster alone does not prove
  an individual's appearance. Supplemental Cup participation is tied to official NBA
  player IDs, box scores and primary gamebook corroboration.
- Missing history can be proved noncontributing: for each omitted fixture, show no eligible
  regular shooting target anywhere lies from its date through thirty days later, inclusive.
  This covers both the thirty-day rest ceiling and seven-day workload window. It does not
  establish that a player was absent or that the source history is complete.

The raw shooting outcome `(player, game)` set remains regular-season, nonbubble and FGA>0.
Preserve its shot totals and comparison protocol: next calendar day versus three through
thirty days since an appearance, excluding exactly one full day off and long absences.
Retain the season-opener exclusion. Recompute arm totals, unchanged attempt-floor eligibility
and empirical-Bayes career estimates; the final published player-season set can legitimately
change when corrected assignments cross the existing floors.

## Verification and publication

Authenticate a real zero-shot next-day example, supplemental Cup participants and relevant
zero-clock cases. Test DNP, genuine short appearances, duplicates, trades, Eastern ordering,
bubble history and unaltered target shot totals. Bind generated player files and research
outputs to the repaired producers. Independently review the frozen candidate and verify its
published player splits before deployment. Record unresolved source cases and held-out
classifications explicitly. No fatigue coefficient or production database mutation is implied.
