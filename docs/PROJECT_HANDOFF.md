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

## Launch-readiness program (2026-10-05)

The owner asked for ten pre-launch items. Done in this entry: the footer non-affiliation notice,
`/privacy`, and the `Report an error` mail link (D-74). The footer notice is 12px sans, below the
15px sentence rule, as fine print; the owner has not ruled on that size.

Open, in order: error monitoring, uptime and freshness monitor, scheduled database backup with one
test restore, a quota plan, a firewall rate limit, the phone and accessibility pass (including
Instagram's in-app browser), and the custom domain. The domain name is not chosen;
`src/lib/site-url.ts` is the one place the origin is written.

Later on 2026-10-05: PR #106 merged. A backup of the public schema was taken with `pg_dump` 18
(the server is 17.6; the Homebrew 16 client refuses it) to `~/Backups/fullcourt/` and restored into
a scratch database with matching row counts; the ten restore errors are Supabase `auth` policies.
The reconnect wait is capped (D-75). Still open: scheduled backups, Sentry, an uptime monitor, the
firewall rate limit, the phone pass and the domain.

2026-10-06: a Vercel firewall rule, `Rate limit API`, is live: paths starting `/api/`, 100 requests
per 60 seconds per IP, answered with 429. It was set in the dashboard, so it is not in the repo.
Checked from outside: 115 requests to `/api/health` returned 100 × 200 then 15 × 429, with pages
unaffected. Hobby allows one rate-limit rule. PR #108 pins `source-map-js` for an overnight advisory.

## Error monitoring (2026-10-06)

Sentry is wired in (D-76). A local production build sent one browser error and one server error
(`/api/analysis` with the database unreachable); both appeared in the Sentry project
`javascript-nextjs` under org `michael-ju-46`. The DSN is not in the repo: it is read from
`NEXT_PUBLIC_SENTRY_DSN`, which must be set in Vercel before the deploy that should report.
Open: source-map upload; the Sentry project's own setting that stops it storing IP addresses.

Later on 2026-10-06: PRs #107 and #108 merged. A weekly backup job is installed on the owner's Mac,
outside the repo: `~/Backups/fullcourt/backup.sh`, run by the LaunchAgent
`com.michaelju.fullcourt-backup` on Sundays at 11:00, keeping the newest eight dumps. Its first run
wrote a 17 MB dump. The owner chose `fullcourt.fyi`; it is not bought yet.

Later on 2026-10-06: PR #109 merged with `NEXT_PUBLIC_SENTRY_DSN` set in Vercel for Production and
Preview; the Sentry project has IP storage off. `fullcourt.fyi` is attached to the project (D-77).
The GitHub social preview and any external links may still name the old address.

Later on 2026-10-06: PR #110 merged and `https://fullcourt.fyi` is the production address. In the
Vercel dashboard, `www.fullcourt.fyi`, `fullcourt-nba.vercel.app` and
`nba-rest-advantage.vercel.app` each answer 308 to `fullcourt.fyi` with the path kept. UptimeRobot
checks `https://fullcourt.fyi/` and `https://fullcourt.fyi/api/health` every five minutes and
mails the owner. Sentry received a production event from `fullcourt.fyi`. PR #100 (urllib3) merged.

The owner tested on a phone inside Instagram. Two fixes followed: the Edge games zero rule no
longer paints over the pinned team column in the Schedule breakdown, and the error-report mail
subject is `FullCourt error or suggestion`.

Open:

- Phone layout. The owner asked for a survey of how data sites handle phones and tablets, and for
  layout options before any rebuild. Named problems: the Games month and date strips scroll
  sideways, the Games summary tiles sit below the matchups, and wide tables give no sign that
  they scroll.
- `DATABASE_URL` in Vercel is not stored as a Sensitive variable. Vercel suggests rotating the
  database password and saving it again as Sensitive; that also means updating the GitHub secret,
  `.env.local` and the backup script. Owner action.
- Sentry issue `JAVASCRIPT-NEXTJS-3`: a blocked `eval` on `/playoffs` from one iOS 15 client, with
  no first-party frame. Not reproduced.
- Source-map upload to Sentry needs an auth token the owner creates.
- The footer notice size (12px) is not ruled on. A second backup copy off the Mac is not set up.
