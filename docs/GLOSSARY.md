# FullCourt

FullCourt models how NBA schedule conditions affect game outcomes and presents the resulting evidence and predictions without overstating model performance.

## Language

**Fatigue score**:
A multi-factor estimate of a team's accumulated schedule load for a game. Higher values mean greater estimated fatigue.
_Avoid_: tiredness rating, exhaustion score

**Back-to-back**:
A game played the night after another one. Weighted by the **real hours between tip-offs** rather
than by the calendar, so a late finish followed by an early start costs more than the date pair
alone implies. With **altitude**, one of the two largest effects in the fatigue score — worth
about 5.0 points of win probability when the weights were fitted, and the same sign in all 16
folds. The turnaround-hours term itself was unstable under that fit (cv 1.09) even though the
back-to-back flag was not. See
[ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md).
_Avoid_: b2b in user-facing copy, second night, consecutive games — the last is ambiguous between
"back-to-back" and "in a row"

**Altitude**:
The thin-air term in the fatigue score, applied to Denver, Utah and Mexico City — and to the night
after, which is a separate multiplier. Carried by `teams.altitude_flag`, and at a neutral site by
that venue's own flag (`src/lib/neutral-venues.ts`), because the nominal home team's flag is false
for a game played somewhere else. The largest single effect in the model when the weights were
fitted, worth about 5.8 points of win probability, and its multiplier is **the one ratified
constant ever changed**: 1.15 → 1.29 on 2026-08-02, fitted against final margin rather than against
the win rates the site publishes, which is what kept it non-circular. The **carryover** multiplier
was deliberately not moved with it — that term wanted to go backwards under the fit. See
[ADR 0006](adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md).
_Avoid_: elevation, thin air, the Denver effect — the term covers three venues, not one

**Rest advantage**:
The matchup differential `away fatigue score − home fatigue score`. A positive value favors the home team; a negative value favors the away team.
_Avoid_: fatigue advantage, rest score

**Neutral/no-call**:
A matchup whose absolute rest advantage is below `0.5`, so neither team receives a prediction from
this metric. The rule in code is `Math.abs(differential) < 0.5`
(`src/lib/rest-advantage-evidence.ts`), so `0.5` and above is a call.

**The boundary is not exactly locatable, and this entry used to claim it was.** The differential is
a floating-point subtraction of two fatigue scores, and a gap that reads as `0.50` in decimal can
compute just under it — measured, `4.35 − 3.85 = 0.49999999999999956`, which lands on the neutral
side and drops the game from the evidence entirely. So a matchup sitting exactly on the line may
fall either way, and no wording can promise otherwise. Left in place rather than fixed, the same
call as the RA ≥ N threshold boundary: rounding at the comparison would move a handful of games
across every published denominator to buy precision the metric does not have. Say "about 0.5",
never "exactly 0.5 is a call".

This is a **rest-advantage band**, and has nothing to do with a **neutral site** below.
_Avoid_: tie; and do not write "neutral" unqualified where a venue could be meant

**Neutral site**:
A game played at neither team's arena — six cities in the data (Mexico City, London, Las Vegas,
Paris, Berlin, and Manchester, added with the 2026-27 schedule for NOP–SAS at Co-op Live on
2027-01-17), each with its own coordinates and altitude flag in `src/lib/neutral-venues.ts`.
Distance and thin air are computed from the venue rather than from the listed home team's arena,
which is the whole reason the map exists. Entirely unrelated to **neutral/no-call** above: that is
a band of rest advantage, this is a place.
_Avoid_: neutral game (reads as no-call), international game (Las Vegas is not)

**Decidable**:
A game the rest metric can express an opinion about at all — the rest advantage clears the
neutral band, so one side is the more rested. One of **three separate narrowings** the site
applies, of which this glossary named only `called` for a long time:

- **decidable** — not a no-call. One side is more rested. (`decidable` in
  `src/lib/rest-advantage-evidence.ts`)
- **called** — decidable *and* the more-rested team is at home. Every headline rate is measured
  on this row alone. (`isCalledSide`; see **Rested team at home**)
- **publishable** — the game is admissible at all: regular season, and outside an **abnormal
  stretch**. (`publishableGames()` in `src/lib/db/queries.ts`)

Only the first two nest: every called game is decidable, and the rested-on-the-road row is
decidable and *not* called, which is exactly why it can be published as its own row. Publishable
is a separate axis about admissibility, not about rest, so it is never a synonym for either.
_Avoid_: valid game, usable game, qualified game — the first two suggest the excluded games are
bad data rather than games the metric declines to speak about

**Rested team at home**:
Games where the more-rested team is also the home team. The site's published rest-advantage rate is measured on these and on nothing else. In code the predicate is `isCalledSide` (`src/lib/rest-advantage-evidence.ts`), which keeps its name on purpose — the vocabulary here is user-facing only, and a doc-currency pass must not "fix" the code to match the copy.
_Avoid_: called games, the call, qualified games

**Rested team on the road**:
Games where the more-rested team is the visitor. Counted and published as their own row against a road baseline, never pooled into the published rate. Not a filter on the evidence: both rows appear on `/analysis` and on the method page.
_Avoid_: rested visitor, declined games, the half this model declines

**Baseline**:
How often a side wins from that venue regardless of rest — 59.9% at home, 40.1% on the road, over every published game. Every rest-advantage rate is stated against it rather than against a coin flip, because every game the site publishes a rate for is a home game. Not a constant across time: the per-season figure runs from 67.9% in 1987-88 to 54.3% in 2023-24, which is why the season chart uses each season's own.
_Avoid_: home-court advantage — that is the ~20-point spread between the two baselines, not either one of them

**Claim**:
A statement the site publishes about measured data — a rate, a comparison between two rates, or
the sentence carrying them. Every claim states its denominator and is read against a
**baseline**, never against a coin flip, and one that can do neither is not published at all. A
claim that compares two figures is **derived** from them rather than written around them, so the
wording moves when the data does: `src/lib/rest-advantage-display.ts` for a single matchup,
`src/lib/analysis-claims.ts` for the `/analysis` page. Prose asserting a comparison over live
numbers is the defect both modules exist to prevent — the `/analysis` reading-these-numbers
paragraph carried one twice before 2026-08-12.
_Avoid_: finding, insight, takeaway — the first two overstate what a measured rate is, and
"takeaway" invites a conclusion this site frequently declines to draw

**Historical backtest**:
The regular-season evaluation of whether the team favored by rest advantage won, **on the games where that team was also at home** — every headline figure on the site is measured on that row alone, and read against the **baseline** rather than against 50%. It excludes the **2019-20 Orlando bubble** — the 88 games played at a single site from 30 July to 11 October 2020 — and nothing else of that season; its 971 pre-suspension games are in. 2020-21 and both lockout seasons are included: short is fine, interrupted is not. Withholding a *whole* season is a separate rule belonging to Schedule Edge alone (see **Truncated season**).
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

**Schedule value**:
What a season's rest edges were worth to a team, in **wins** — each game priced at the win
probability its rest state is measured to carry against that venue's own baseline, then summed.
Published on both `/season` and `/schedule` from one conversion (`src/lib/schedule-value.ts`), over
one population: every scored game a team played, at the venue it played it. Reads no score, so a
64-win team and a 17-win team handed the same schedule get the same number, and the league total
is zero by construction. It is small for every team — no season's schedule has reached half a win
either way — and that is a fact about the **calendar**, not about fatigue: the league distributes
edges evenly enough that a real per-game effect never accumulates. Quote it only alongside the
per-game effect it is derived from (a rest edge ≈ 18% of home court), or the size of the number
gets taken for the size of the effect.
_Avoid_: expected wins, wins added, rest value — the first two invite an actual-versus-expected
reading the site deliberately does not publish

**Swing**:
On the Season Report's rest-edge conversion table, a team's win rate as the fresher side minus its
win rate as the tireder one. **Its zero line is not zero.** The site calls a rest edge only when
the rested team is also at home, so the rested arm is entirely home games and the tired arm
entirely road games — a team with no rest-conversion skill whatsoever still posts about **+10**.
The page states that baseline (`SeasonReport.swingBaseline`) above the table and diverges the
column's colour around it. Each season carries its own, because home-court advantage has fallen
from 67.9% in 1987-88 to 54.3% in 2023-24.
_Avoid_: rest skill, conversion rate — a swing at or below the baseline is not a deficiency, and
across four recent seasons the spread of team swings is at or below what coin-flipping predicts

**Availability cost**:
What a team loses in points of final margin when a rotation player does not play. Absence is inferred from the rotation a team has actually been using — a player who appeared in the last five games at 15+ minutes and is not in tonight's box score — because a long-term-injured player may not be listed at all. **Retrospective by construction:** who sat is known only because the game was played, so it measures what an absence cost and never forecasts availability. Figures live in `src/lib/availability-facts.ts`, pinned by a test against `ml/availability_facts.json`.
_Avoid_: injury report, injury impact, player availability model — all three imply a forward-looking feed this module does not have

**Official**:
The unit of every referee measurement on this site — one named person, never the three-person
group they worked a game with. **There is no such thing as a crew here:** 11,981 games produced
10,450 distinct trios, 87.3% of which appear exactly once, and the most-repeated trio in ten
seasons appears five times. Personnel rotate almost every game, which is what makes co-official
contamination noise rather than bias, and which is why a "crew tendency" cannot be measured at
all. Crew *chief* is a real NBA role, but the role label is only reliable in this data from
2024-25 onward, at ~9× fewer games per person — a filter or a label, never the unit a claim
rests on. See [ADR 0007](adr/0007-referee-analysis-axes-are-pre-registered.md).
_Avoid_: crew, referee crew, crew tendencies, crew foul rate — and never "referee bias", which
is the question the surface was named for and not a conclusion it reached

**Provisional season**:
A season containing any game that is not final. Its figures carry an as-of date and may revise as the schedule fills in.
_Avoid_: incomplete season, partial season

**Abnormal stretch**:
A range of dates within one season whose games were not reached by travelling to them, so no model on the site may read them. The list lives in `src/lib/season-regime.ts` and currently holds one entry: the 2019-20 Orlando bubble, 30 July to 11 October 2020. Every reader that publishes a game row applies it through `publishableGames()` in `src/lib/db/queries.ts`, which folds it in with the regular-season predicate; the two schedule-density helpers stay outside it on purpose, because they count physical schedule load rather than publishable rows. This is about **how the games were played**, and it excludes dates, never a season.
_Avoid_: excluded season, COVID season, bubble season

**Truncated season**:
A season whose teams did not play comparable numbers of games, so they cannot be ranked against each other. Withheld from **Schedule Edge only**, and offered everywhere else. 2019-20 is the sole member: it was suspended with teams having played 63 to 67 games, a spread of four against a limit of two, where every other season sits within one. This is about **how many games there are**, which is a different objection from an abnormal stretch and does not travel with it.
_Avoid_: short season (1998-99 and 2011-12 are short and are ranked normally), incomplete season

## Page headers

Every surface opens with the same four things in the same order — **eyebrow, title, description,
method link** — and nothing else. The point is not that the pages look alike; it is that a reader
learns once where the unit lives and where the summary lives, and from the second page onward
stops reading the header and starts scanning it.

- **Eyebrow: `SUBJECT · UNIT`.** It locates the reader and names what they are about to read in
  numbers — `SHOOTING BY REST · eFG%`, `SCHEDULE DISPARITY · NET EDGE GAMES`. Where a surface has
  no single unit, the second half is a scope instead: `ONE SEASON · WIN RATE AND WINS`. Never a
  tagline, and never a bare repeat of the tab, which spends a line saying nothing. The reference
  section runs the same form one level up: `BEHIND THE DATA · SHOT VALUE`. **Keep it to 35
  characters** — that is the longest the design has ever carried, and the nav bar is already
  known to clip at 360px, so an eyebrow is not the place to spend width.
- **Title: a plain label**, ideally the tab you clicked. The header's job is orientation, not
  argument — a claim in the largest type makes the reader work out whether it is the page's name
  or its finding.
- **Description: the claim, first sentence.** This is where a retired claim-title goes, and it is
  where the interesting sentence belongs once the title is boring.
- **Height follows content.** Two lines is a ceiling, not a target; `e2e/page-headers.spec.ts`
  enforces it. A fixed-height block would force padding onto pages with less to say, and padding
  reads as an empty slot.

There is no exception. `/` is the marketing page and sets its own hero type rather than using
`PageHeader`, so it is outside this pattern rather than an exception to it.

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
| GAMES | `/games` | Games | Today's Games — the season selector reaches 1985-86, so no time word stays true. The h1 was a claim from 2026-08-11 until the front-door swap on 2026-08-12: that was correct while this page *was* the front door, and wrong once it became an interior page. The reasoning for both directions is in `src/app/games/page.tsx` |
| SEASON REPORT | `/season` | Season Report | Season Review — review implies the season has ended, and this page runs live from October; bare Season — GAMES already browses any season's slate and SCHEDULE EDGE already ranks teams inside one |
| SCHEDULE EDGE | `/schedule` | Schedule Edge | Schedule — that means a game list everywhere else, which is GAMES. The h1 matches the tab; the *module* is still named Schedule Disparity in code, tables and design docs |
| MODEL RESULTS | `/analysis` | Model Results | Analysis (every page is analysis); Historical Data (GAMES already browses history, and "data" promises a dump). The h1 matches the tab — the rest-advantage metric is unchanged and still labels the RA columns, thresholds and filter on that page |
| PLAYOFF REST | `/playoffs` | Playoff Rest | Playoff Odds — mainstream that means *making* the playoffs, not winning a series; PLAYOFF EDGE — `edge` is the qualifier that makes SCHEDULE EDGE legible as something other than a game list, and a second EDGE tab stops it qualifying |
| PLAYER SHOOTING | `/shooting` | Shooting by Rest | Shooting — on Basketball-Reference and NBA.com that means shot *location*, which is SHOT VALUE; Player Rest / Rest Splits — the rest tab is SCHEDULE EDGE, and an internal collision misroutes worse than an external one; Splits — ESPN's word for exactly this page, but jargon for a casual fan and silent about the measure |
| SHOT VALUE *(OTHER)* | `/shot-quality` | Expected Shot Value | Shot Charts — mainstream that means a player's makes/misses by spot |
| AVAILABILITY COST *(OTHER)* | `/availability` | Availability Cost | Availability — everywhere else in basketball that heads an injury report, meaning who is out tonight; this page is the opposite tense, a finished measurement of what an absence cost, with no live lineup data at all. `Cost` blocks the wrong click the way `Edge` does for SCHEDULE EDGE |
| REFEREE EFFECT *(OTHER)* | `/referees` | What each official calls | Referee Bias — the page was named for the question, not a conclusion, and the first version of the question came back inside noise. The subject is the foul *mix*, when the whistle arrives, and what eleven seasons say about the claims attached to named officials — explicitly not a fairness claim. Held back from 2026-07-30 until the framing existed; published 2026-08-22 |
| *(front door — no tab)* | `/` | Rest is a stat | — reached by the wordmark and the footer, not by a tab: it explains the product rather than being a surface of it. It lived at `/about` until 2026-08-12, which still redirects here |
| BEHIND THE DATA *(Reference)* | `/behind-the-data` | Behind the data | Methodology — that word promises a paper; this is read by people deciding whether to trust a number they just saw |

Module names are unaffected: the code, tables, scripts and design records still say Playoff
Predictor, Shot Quality and Schedule Disparity.

`/behind-the-data` is **not** a tab. It explains the product rather than being a surface of it, so
it sits in a separate right-aligned `Reference` landmark in the same nav row — the same size and
weight as a tab, with the gap saying "not one of the six". It was moved there on 2026-07-30 from
the top status strip, which proved too quiet to be found. Because the two landmarks are separate,
the six-link count of `Main navigation` still holds, and it is asserted in
`e2e/navigation.spec.ts` and again in `e2e/home.spec.ts`.

**The front door is `/` and has no tab at all** (2026-08-12). It was `/about`, sharing the
Reference landmark, and the swap made a link from the chrome to the root redundant with the
wordmark — which is where a visitor already reflexively clicks. So `Reference` now holds one
link. The rule the swap follows: **no tab points at `/`**, which `e2e/navigation.spec.ts`
asserts by requiring zero `aria-current` tabs there.
