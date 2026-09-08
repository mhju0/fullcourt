# Project handoff

Reconciled 2026-09-09. Source/tests and Git take precedence. This is a current-state summary;
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
