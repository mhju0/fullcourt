# Project handoff

Reconciled 2026-09-11. Source/tests and Git take precedence. This is a current-state summary;
update these sections in place. Rationale belongs in [Decisions](DECISIONS.md).

## Product and release

FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.

The rest-focused redesign shipped in PR #84 (`776683e`). Its first verified Officiating refresh
and release record shipped in PR #85 (`34b8961`). Production: https://fullcourt-nba.vercel.app.
The [dated release review](design/redesign-release-review.md) records verification; use GitHub
and Vercel for subsequent deployment status.

Games now exposes Season → Month → Date controls, with shared season selectors across studies.
Deep Dive uses the full desktop width. Playoff Rest explains between-round recovery directly.
Officiating covers 12 regular seasons and 4,546 reports, including the partial 2014–15 season;
[archive evidence](research/2026-09-09-l2m-archive.md) records source checks and historical limits.

The homepage hero now contains only the headline, original description and primary action.
The one-game example and its supporting reads were removed under D-67. Next.js and its ESLint
config are pinned to 16.3.8 (raised from 16.3.4 on 2026-10-03 for GHSA-vcvr-r3jv-pc5j); the
lockfile resolves Sharp 0.35.4, clearing the production dependency audit. See [verification](design/home-hero-release-review.md).

Shared filters now use 44px targets and 16px text. Analysis uses equal-width filter columns;
Season Report uses bordered sections with a separate interpretation surface. The
[control and section audit](design/control-and-section-audit.md) records route coverage and rationale.

D-69 makes Playoff Rest and Expected Shot Value default to their latest usable publication.
Their selected views are shareable through URLs and copy actions. `/data-status` separates
coverage, refresh evidence and database connectivity; the homepage historical date comes from
the analysis population. Games moves offseason context beside mobile date controls, names
matchup controls distinctly, and restores selected-chip visibility after resizing. See the
[seven-fix review](design/seven-polish-fixes-review.md) for verification and release evidence.

D-70 adds `/home-court`, reached through Explore, for annual home and rested-home win-rate
history with an expandable count table. Season Report exposes the selected home baseline
alongside the rested-home result and gap. Both retain the 100-game rested-home display gate;
ongoing seasons are labeled explicitly and excluded from completed-history summaries.
The [research record](research/2026-09-11-home-advantage-trend.md) retains data, sources, and
owner decisions. See the [release review](design/home-court-study-review.md) and Git for verification and deployment status.

## Architecture and safeguards

- Next.js serves pages and API routes. Database reads use Drizzle/postgres-js against Supabase
  PostgreSQL. Offline Python analyses also publish committed artifacts.
- `src/lib/fatigue.ts` computes scores on the write path. The coefficients are ratified;
  changes require an owner decision and the protocol in ADR 0006.
- Game dates are America/New_York calendar dates. Published regular-season reads use
  `publishableGames()`; the headline counts `isCalledSide()` (rested home team) against a
  venue baseline. Rested visitors remain separate.
- The ORM schema is incomplete by design. `shot_grid` and `shot_value_surface` use raw SQL.
  Manual SQL records in `drizzle/` are not an automatic database bootstrap.
- Generated artifacts, their scripts, and pinning tests must change together. Missing data
  stays distinct from zero. Officiating covers selected late-game reviews, not whole-game accuracy.

## Operations

[Testing and CI/CD](TESTING_AND_CICD.md) owns checks and release steps;
[Data pipeline](DATA_PIPELINE.md) owns ingest;
[Officiating](OFFICIATING.md) owns L2M publication;
[Season rollover](SEASON_ROLLOVER.md) owns calendar transitions.

Officiating's first manual Actions run, `34179954451`, passed collection, source retention,
and publication contracts. Repository policy prevented the bot from opening a PR; the workflow
successfully left a review branch and comparison link. A human-authorized PR published that update.
Future refreshes still require preview verification before merging.

## Remaining verification and future scope

The redesign has automated desktop/mobile and accessibility coverage. Physical-device and human
screen-reader testing are not claimed. Exercise the daily pipeline against actual completed games
when the season resumes; an offseason skip is not evidence that the ingest path works.

[Roadmap](ROADMAP.md) contains the remaining maintenance work and deferred ideas. No coefficient
refit, database migration, accounts, or new analytics are implied by repository cleanup.


## Methodology presentation

Behind the Data now follows the approved design and writing audit (D-64): seven compact topic
tiles, visible null findings, shorter article openings and native technical disclosures across
all ten methods. Stable deep links and print expansion preserve access to evidence. The referee
archive remains a dense table with clearer return links. See FRONTEND.md for the shared shell
and reading controls; the audit retains the dated before-state evidence.


## Approved usability audit implementation

D-65 adds a real homepage matchup, earlier mobile game/player rows, accurate schedule-density
and altitude wording, clearer study scopes, common-first Officiating filters and an engineering
walkthrough. The owner approved the before/after implementation for publication on 2026-09-09.
CI and hosted-preview verification precede the production merge. [Implementation review](design/usability-audit-review.md)
records the scope and verification. The new walkthrough makes system decisions inspectable;
personal contribution and collaboration details require the owner's account.


## Release-readiness pass (2026-10-03)

D-71 records the approved pre-launch audit. Three local branches hold it: `fix/next-16.3.8`,
`fix/officiating-preseason-skip`, and `feat/release-polish` (stacked on the Next.js branch).
Games no longer renders date-derived content before the URL is read and offers TRY AGAIN after
one automatic retry. Season Report opens on the latest season with results. `robots.txt`,
`sitemap.xml` and per-page descriptions exist. Hover and press feedback and one homepage bar
draw are CSS only; ADR 0010 carries the amendment.

Open: the cause of one production API 500 seen during the audit is unknown (log access was
refused). Schedule Edge reserves its loading space (layout shift 0.123 → 0.016 desktop, 0.173 →
0.054 phone, measured locally); the remainder is the provisional-season note arriving with the
data. Thirteen e2e specs had gone stale on `main` after copy changes in PRs #81, #89 and #93;
e2e is outside CI, so nothing reported them. Twelve were spec updates. The thirteenth was a real
defect: Games wrote its URL after the season's dates arrived, which cancelled a tab press made
in the meantime. `route-transition.ts` now reports a navigation in flight and Games holds its
write until the destination commits. The full suite passes locally (393 specs). Stat-tile
unification and table column widths are deferred. `next dev` 16.3.8 appends an agent-rules
block to `AGENTS.md`; it is committed. Owner actions: tag `v1.0.0` at launch, and announce only
after a verified live pipeline run.

After the merge of #99, production served a stylesheet built from the older `globals.css`
(D-72). The Turbopack build cache is now off in `next.config.ts`. After any change to
`globals.css`, confirm a new rule is present in the stylesheet production serves.

## Reading pages and data audit (2026-10-04)

About and How it was built were rebuilt on `reading.module.css` with a section rail (D-73). The
method topic list is an overlay, `/data-status` has a loading state, and four duplicate links
were removed. A crawl of 139 pages on production found no broken link, no blank page and no
missing anchor.

Data audit, by independent SQL against the database: the Model Results totals, all four
thresholds, every one of the 41 season rows, and the 2025-26 Season Report figures match what
production serves. Two stored errors were found, and neither is fixed, because data writes belong
to the owner:

- Game `0021900894` (GSW at PHX) is dated 2020-03-01. It was played on 2020-02-29. ESPN carries
  the same wrong date. Stored fatigue for GSW and PHX in that game, and for GSW on 2020-03-01,
  misses two back-to-backs.
- Playoff series 18 (1986-87 West Finals, Lakers over the franchise now in Oklahoma City) is
  stored as 3-1 with no winner. The four stored games are a 4-0 sweep. It has no predictions.

Open: whether `Find a page` leaves the footer. Removing it leaves the page finder keyboard-only.

## Cross-source data audit (2026-10-04)

All 50,495 stored final games were matched by date and teams against basketball-reference
schedule pages for all 41 seasons, and every disagreement was read a third time on the nba.com
game page. Nothing is fixed; the SQL is with the owner.

- Four 2019-20 games are stored one day late; nba.com and basketball-reference agree on the
  earlier date: `0021900848` (2020-02-23), `0021900886` (2020-02-28), `0021900888` (2020-02-29),
  `0021900894` (2020-02-29). Stored back-to-back flags around them are wrong for POR, DET, LAC,
  DEN, ATL, PHX and GSW.
- Eight stored scores are wrong, both sources agreeing: `0048500304` home 98, `0028700066` home
  109, `0028800100` away 107 (the stored winner is wrong), `0028800140` home 113, `0028800234`
  away 104, `0028800269` away 91, `0049300052` home 98, `0029800661` away 93.
- `0029600070` (1996-11-10 CLE–DEN): the database and nba.com say 108–79, basketball-reference
  says 101–86. Unresolved; same winner.
- `0020200464` (2003-01-04) went to double overtime; stored as one.
- 2019-20 has no overtime stored: 75 games, 61 of them regular-season games before the
  suspension. The published coverage note covers only seasons before 2002.
- Not in the database by design: three NBA Cup finals and the 2020 play-in game.

Next step after the owner applies the SQL: `scripts/fetch_game_context.ts 2019-10-01 2020-10-31`,
then a fatigue recompute for 2019-20 and the neighbours of the corrected games.
