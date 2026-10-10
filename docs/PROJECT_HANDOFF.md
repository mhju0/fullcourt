# Project handoff

Reconciled 2026-09-11. Source/tests and Git take precedence. This is a current-state summary;
update these sections in place. Rationale belongs in [Decisions](DECISIONS.md).

## Product and release

FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.

The rest-focused redesign shipped in PR #84 (`776683e`). Its first verified Officiating refresh
and release record shipped in PR #85 (`34b8961`). Production: https://fullcourt.fyi.
The [dated release review](design/redesign-release-review.md) records verification; use GitHub
and Vercel for subsequent deployment status.

Games now exposes Season → Month → Date controls, with shared season selectors across studies.
Games has one layout at every width, in tip-off order (D-79). Playoff Rest explains between-round recovery directly.
Officiating covers 12 regular seasons and 4,546 reports, including the partial 2014–15 season;
[archive evidence](research/2026-09-09-l2m-archive.md) records source checks and historical limits.

The homepage hero now contains only the headline, original description and primary action.
The one-game example and its supporting reads were removed under D-67. Next.js and its ESLint
config are pinned to 16.3.8 (raised from 16.3.4 on 2026-10-03 for GHSA-vcvr-r3jv-pc5j); the
lockfile resolves Sharp 0.35.5 (pinned on 2026-10-07 for GHSA-wq5f-xc86-pv6w), clearing the production dependency audit. See [verification](design/home-hero-release-review.md).

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


## Summary of entries before 2026-10-05

Condensed on 2026-10-06 from five entries; DECISIONS.md holds the detail.

- **Methodology and usability (D-64, D-65).** Behind the Data follows the approved design and
  writing audit; the usability audit shipped on 2026-09-09. See FRONTEND.md and
  [the implementation review](design/usability-audit-review.md).
- **Release-readiness pass, 2026-10-03 (D-71, D-72).** Games holds its URL write while a
  navigation is in flight (`route-transition.ts`). The Turbopack build cache is off: after any
  change to `globals.css`, confirm the new rule is in the stylesheet production serves. e2e is
  outside CI, so stale specs are found only by running it.
- **Reading pages, 2026-10-04 (D-73).** About and How it was built use `reading.module.css`.
- **Data audits, 2026-10-04.** An SQL recompute matched what production serves. A comparison of
  all 50,495 final games against basketball-reference and nba.com led to corrections the owner
  applied: four 2019-20 dates, nine scores, one overtime count, 75 missing 2019-20 overtime
  games and playoff series 18. Fatigue and predictions were rebuilt for the affected games
  (PR #104). After any stored score or date fix, run the fidelity check in
  `scripts/export_fatigue_features.ts`: it lists every stale row.

Still open from those entries:

- The cause of one production API 500 seen during the 2026-10-03 audit is unknown.
- Stat-tile unification and table column widths are deferred.
- Whether `Find a page` leaves the footer; removing it leaves the page finder keyboard-only.
- Overtime before 2002-03 is not stored. Three NBA Cup finals and the 2020 play-in game are
  absent by design.
- Owner actions: tag `v1.0.0` at launch, and announce only after a verified live pipeline run.

## Summary of the launch-readiness entries, 2026-10-05 and 2026-10-06

Condensed on 2026-10-10 from two entries; DECISIONS.md D-74 to D-77 hold the detail.

- **Site.** Footer non-affiliation notice, `/privacy` and the `Report an error` mail link.
  Production is `https://fullcourt.fyi`; `www.fullcourt.fyi`, `fullcourt-nba.vercel.app` and
  `nba-rest-advantage.vercel.app` answer 308 to it. `src/lib/site-url.ts` holds the origin.
- **Monitoring.** Sentry project `javascript-nextjs` (org `michael-ju-46`) reads its DSN from
  `NEXT_PUBLIC_SENTRY_DSN`, set in Vercel; IP storage is off. UptimeRobot checks `/` and
  `/api/health` every five minutes.
- **Outside the repo.** A Vercel firewall rule limits `/api/` to 100 requests per 60 seconds
  per IP (Hobby allows one rule). A weekly backup runs on the owner's Mac
  (`~/Backups/fullcourt/backup.sh`, Sundays 11:00, newest eight kept); it needs `pg_dump` 18,
  and one test restore matched row counts.
- **Phone test inside Instagram.** Two fixes: the Schedule breakdown zero rule no longer paints
  over the pinned column, and the error-report subject is `FullCourt error or suggestion`.

Still open from those entries: Sentry source-map upload; the footer notice size (12px); the
GitHub social preview and outside links may still name the old address; the quota plan
from the ten-item list was not recorded as done.

## Phone and tablet layout (2026-10-07)

PR #111 merged. D-78 is built: on a phone Games shows one week and a Calendar button instead of
two sideways rows, the slate summary is one line above the matchups, sideways scrollers fade the
edge that hides content, the Schedule breakdown drops its duplicate columns on small screens,
and the summary rail started at 1024px (removed by D-79). Row 30 of the design record is amended. The survey behind
it is a private artifact the owner holds, not a file in the repo.

Dev served a stale stylesheet for the new rules (the D-72 behaviour); the work was verified
against `pnpm build` and `pnpm start`. Local `main` had one unpushed commit from 2026-09-19 whose
content origin already had; local `main` now matches origin and the backup branch is gone.

Open:

- Owner will do later, by their own choice: store `DATABASE_URL` in Vercel as Sensitive (rotate
  the database password in Supabase, save the new value as Sensitive, then update the GitHub
  secret, `.env.local` and `~/Backups/fullcourt/backup.sh`); and create a Sentry auth token for
  source-map upload, after which the build-side change can be written.
- A reader-picked number column for the Schedule breakdown (the survey's C1) is unbuilt.
- The new phone controls have not been used on a physical phone.
- DECISIONS.md and ADR 0006 quote the travel ablation as 5,994 calls, 59.14% and +0.32pp; the
  page has read 5,992, 59.1% and +0.34pp since the 2026-10-04 corrections. Whether those two
  records get a dated amendment is the owner's call.
- Sentry issue `JAVASCRIPT-NEXTJS-3`: a blocked `eval` on `/playoffs` from one iOS 15 client, with
  no first-party frame. Not reproduced.
- The footer notice size (12px) is not ruled on. A second backup copy off the Mac is not set up.

Later on 2026-10-07: every page was measured at 360 and 390px on a production build. No page
scrolls sideways and every table sits in a scroller. Four gaps were closed: the Home Court season
table and Officiating's season strip and call-type row now use `ScrollCue`, the Schedule
`WHAT THESE COLUMNS MEAN` disclosure is 44px tall, and the team label under a player on Shooting
is 10px, not 9.6px. The two stale `behind-the-data.spec.ts` assertions follow the page. Two e2e
tests (`games.spec.ts:294`, `navigation.spec.ts:54`) failed once in a full run and passed six of
six alone; treat them as load-sensitive. Season Report, Analysis and Playoff Rest needed no change.

Phone review round, 2026-10-07 (D-79): the Skim/Deep Dive toggle and the Games side rail are
gone, matchups are in tip-off order (`slateOrder()`), the two line tokens are darker, Season
Report and Officiating plays use bordered blocks with title bands, the fatigue chart is League
fatigue by week, the column guide sits inside the breakdown, and Shooting by Rest is Player
Shooting by Rest. Open: the ESPN tie-break is inferred from one day; Home Court inherits the
section band and was checked by screenshot only; nothing here has been seen on a physical phone.

Launch preparation, 2026-10-10 (D-80): the change freeze starts 2026-10-17 at 00:00 ET, three
days before the first game (BOS at DET, 2026-10-20, 3:00 PM ET). A mixed slate was rehearsed on
production with a mocked response (one final, one live, one upcoming): rows stayed one height
on desktop and iPhone WebKit, with no page errors. Seventeen pages were loaded in iPhone WebKit:
all 200, none scrolls sideways, no console errors.

Game status, 2026-10-10 (D-81): the stale-LIVE risk above was larger than first written. GitHub
starts the daily job two and a half to five hours late, so it lands mid-evening and would have
frozen a score on about half the season's games. Resolved by storing finals only: a row reads
LIVE from its tip time, then FINAL over "Pending", then the score. `vercel.json` now holds
twelve hourly cron entries (21:00 to 08:00 UTC) so finals land the same night, the Games board
holds a game day until 6 AM ET, and EDGES AHEAD drops a game once it tips.

Open: twelve cron entries on one path have not been deployed before; check the Vercel cron list
after the first deploy and on opening night. A postponed game reads LIVE for three hours;
recording postponements needs a new stored status. The daily job's lateness is unaddressed and
only delays the fatigue refresh. Every state was tested with a mocked clock, none against a
real slate.
