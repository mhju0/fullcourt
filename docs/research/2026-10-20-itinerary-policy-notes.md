# Mileage and itinerary policy notes

Owner preference, October 20, 2026: keep the visible term **Mileage**. Put the estimation method and uncertainty in Behind the Data. This records the requested direction; it does not claim a production label change.

## Geography changes the plausibility of a home stop

Using the 30 arena coordinates captured in the opening-quarter audit and its independent haversine formula:

| Team / hypothetical consecutive away venues | Direct venue miles | Miles via the team's home arena | Extra miles |
| --- | ---: | ---: | ---: |
| Knicks: Boston → LA Lakers | 2,592.2 | 2,635.8 | 43.6 |
| Knicks: Boston → LA Clippers | 2,598.8 | 2,642.2 | 43.4 |
| Knicks: Chicago → Milwaukee | 81.4 | 1,446.0 | 1,364.6 |
| Sixers: Boston → Utah | 2,093.7 | 2,194.5 | 100.9 |

These are hypothetical arena-distance comparisons, not observed flights or probabilities. They use the same venue proxy as the website, so airport/ground routes may differ. The first three rows illustrate the owner's examples; they do not assert those exact sequences are in the 2026-27 Knicks schedule.

A home stop near the route can add little distance while changing nights at home, practice access, departure timing and rest assumptions. Conversely, a large detour makes return less economical but cannot exclude it. The traveling team's home city matters: a Bulls Chicago–Milwaukee sequence and a Knicks sequence involving those same cities have different home-stop implications.

## What the schedule alone cannot tell us

There is no established return-home probability or universally observed geography-plus-days rule in this audit. Off dates can involve practice, media work, travel, or a genuine day off. An All-Star break may split the roster across multiple destinations. A road streak counts consecutive scheduled away games, not nights spent continuously in hotels.

The [current CBA linked by the NBPA](https://nbpa.com/cba), Article XX section 9, explicitly permits qualifying Days Off outside a team's home city. Thus a game-free date does not establish a home return. The agreement does not provide a team-specific itinerary predictor.

## Proposed method for a follow-up implementation

1. Keep the reproducible direct-venue itinerary as the default while actual routing is unknown. Retain once-counted inbound Mileage separately from seven-day rolling Mileage.
2. Store confirmed exceptions with the team, from/to game IDs, actual stop, event date, source, publication date, verification date, and whether the report covers the whole traveling party. Preserve the original assumption for comparison.
3. For unresolved pairs, calculate direct distance, via-home distance, absolute and relative detour, gap calendar days, tip-to-tip hours, local/same-metro status, and Cup/All-Star/holiday context. Use these fields to prioritize research, not automatically insert a home stop.
4. Show a clearly named scenario comparison in research artifacts. Neither an arbitrary distance cutoff nor a newly invented probability should feed the fatigue score without an explicit owner decision and validation.
5. Separate physical venue location from home-court designation. Austin's Spurs games illustrate why a home-designated fixture can still require travel.

Suggested Behind the Data wording: “Mileage uses straight-line distances between scheduled game venues. We assume direct travel between consecutive games unless a documented itinerary says otherwise. Actual airports, routes, ground travel and intermediate stops can differ.” The exception sentence describes a proposed future policy; current v1.0.2 does not yet apply documented itinerary overrides.
