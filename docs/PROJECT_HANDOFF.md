# Project handoff
Reconciled 2026-10-21. Source/tests and Git take precedence. Rationale: [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
Production: https://fullcourt.fyi. Git, CHANGELOG.md and dated reviews retain releases. D-69/D-70 define publication-aware
defaults and venue baselines; D-79 defines Games navigation. Ordinary rested-home rates keep
the 100-game gate; Officiating archive limits remain documented.
## Architecture and safeguards
- Next.js serves pages and API routes. Database reads use Drizzle/node-postgres against Supabase
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

Automated desktop/mobile/accessibility coverage does not establish physical-device or human
screen-reader behavior. Observe actual completed-slate ingest; offseason skips are insufficient.

[Roadmap](ROADMAP.md) contains the remaining maintenance work and deferred ideas. No coefficient
refit, database migration, accounts, or new analytics are implied by repository cleanup.

## Condensed pre-2026-10-07 history — 2026-10-20

D-64–D-78, Git and dated reviews retain the Behind the Data, reading-page, launch and
phone-layout deliveries. Build/start CSS verification remains required (D-72); full
DB-backed e2e stays separate from CI. Shared tiles, footer page finder, privacy/non-affiliation,
report mail and canonical-domain redirects shipped. PR #104 corrected historical facts;
v1.0.3 later restored four workload fixtures and confirmed overtime. D-117 supersedes
old launch gating: v1.0.0 is officially October 19; actual completed-slate checks remain open.

Sentry IP storage is off; UptimeRobot checks home/health every five minutes. Eight weekly
Mac backups use `~/Backups/fullcourt/backup.sh` (Sunday 11:00, pg_dump 18); one restore
matched counts. Edge rate limiting and credential rotation shipped. PR #171 source maps
have verified client symbolication. Supabase Pro review remains November 5.

Unresolved/standing dispositions retained from these entries:

- The October 3 production API 500 has no established cause. October 7 Sentry timeout
  JAVASCRIPT-NEXTJS-4 remains monitored; issue 3 resolved. Server symbolication unobserved.
- Phone/calendar controls, native zoom and screen-reader behavior need physical-device use.
- Reader-picked Schedule column and broader table-width redesign remain deferred.
- Footer notice stays 12px by owner choice; off-Mac backup and phone push were declined.
- ADR 0006 keeps original ablation evidence plus the October 18 offline-fidelity amendment;
  no fatigue coefficients changed. Early overtime coverage was subsequently closed by v1.0.7.

## Condensed 2026-10-07 to 2026-10-19 record — 2026-10-20

D-78–D-119, Git and dated reports retain the Games hierarchy, status/rescore locking,
accessibility/motion, fatigue/date rounding, dependency and readability deliveries. The
[remediation](reports/2026-10-11-remediation/index.html), [accessibility audit](reports/2026-10-14-accessibility-usability.html)
and [plans](../plans/README.md) retain evidence. PR #174 shipped dependencies and explicit
postponed/cancelled states; #175 shipped the audit/sky-tinted neutrals; #176 shipped table A,
recent-ten homepage comparison and optional 5+ history; #177/#178 shipped quiet publication
guides, prior-season links and chronological upcoming rested-home edges. Later D-127 restores
the historical homepage period. Antislop applies throughout. Odds feeds remain excluded;
filter sharing, extra chart actions and configurable Schedule columns remain deferred.

October 19 is the owner's official v1.0.0 release date (D-117), baseline 114617d; subsequent
releases receive incremented versions and immutable tags. D-118 / v1.0.1 keeps current-season
Shooting in Awaiting results with explicit prior-season navigation. D-119 / v1.0.2 removes
the duplicate chart dropdown, adds a pooled five-season home-rate average, separates historical
picks from known-result playoff fits and adds a league-centered team gap key. The prior
completed-slate prerequisite is superseded; opening-night observation is still required.

Standing limits preserved from those entries:

- Observe a real slate, provider status/postponement events and the D-83 rescore in production;
  offseason/mocked-clock checks do not establish those outcomes. Equal-tip order is deterministic;
  ESPN equivalence remains an inference. The owner kept scheduler/monitor lateness (D-110).
- Physical iPhone/VoiceOver/native zoom, capacity and real Supabase delivery remain unverified.
  Previously load-sensitive Games and retracting-header cases passed targeted built checks.
- Officiating item 24: current source/reproduction checkpoint is in ROADMAP.md. Fresh NBA source
  reproduction and cached Legends rebuild closed prior provenance gaps. No coefficient change.
- Vercel connector access remains limited; authenticated browser/CLI are usable. Client Sentry
  symbolication is verified; server-event symbolication remains unobserved.
- Re-key ESPN-seeded current-season games to hoopR IDs once played games exist (SEASON_ROLLOVER.md).
  Future Cup/December assignments need rechecking; review Supabase Pro around November 5.
- The nine-item accessibility audit is historical; current defect acceptance/deferred scope is
  in ROADMAP.md. Schedule Edge net days-off subtraction remains equivalent to days-since arithmetic.

## Condensed schedule and correction staging — 2026-10-20

The [opening-quarter](research/2026-10-20-opening-quarter-travel-review.md),
[full-season](research/2026-10-20-full-season-travel-review.md) and
[all-season](research/2026-10-20-historical-audit/README.md) reports retain original findings.
D-120 keeps Mileage wording; D-121/ADR 0011 and D-122 prepared v1.0.3. Actual airports/home
stops, Cup assignments and physical-device/opening-night observation remain unresolved.

## Condensed v1.0.3–v1.0.9 acceptance — 2026-10-21

v1.0.3–v1.0.8 corrected arenas, appearances, serverless pooling, homepage history, overtime
and Shooting (D-123–D-132; #182, #184–#189). Canonical acceptance preserved coefficients,
graded/playoff history and approved production data. The [arena ledger](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md#v108-production-acceptance-and-v11-remediation-completed--2026-10-20)
retains full hashes, source reports and V11 homepage-rebuild remediation; earlier pending
records are chronology. v1.0.8 binds merge `6ddf73f4` and deployment `dpl_6doQr64bTQ9LzGcjes14ViUGSFzz`.
Writers/aliases were restored with SSO unchanged. Ten non-home/four-logo checks remained same-source.

v1.0.9 (#190, `c5e504e`, `dpl_HbmiLvRZLNtmcU33FzwVrvLTtmc6`) verified seven live requests
(3,440 values), homepage 390/1440 and real-API headline E2E. Local research inputs validated,
old/private evidence was preserved and PostgreSQL stopped. Receipt:
`docs/audit/repository-cleanup-20261020/release/release-acceptance.json`, SHA256
`f5c3843930f8e8583395a75ba72dc931343d91e24662a09fe2ec5ecb66d9621a`.
Private worktree evidence is archived outside the repo at `../fullcourt-local-archive`.
Carried forward: Section 7 report-only/2026-27 grading deferred; actual airports, Cup assignments,
physical devices and real-slate observation remained open. Later entries close the font-download,
secret-alert and documentation follow-ups; no further production-data change occurred here.

## Post-v1.0.9 accuracy audit and local cleanup — 2026-10-20

An independent audit of the repository, docs and live site against code, artifacts and a
read-only database recount found no wrong published figure. It found stale status and
method text, mislabelled copy and two provenance gaps; fixes ship as separate docs, copy
and artifact-provenance PRs. All per-task worktrees were removed; their unique evidence is
in the local archive named above, with branch SHAs in its README.

Outcome: docs #191, copy #192 (OG card printed 42 seasons from `NBA_SEASONS` after the
October rollover; now `BACKTEST_SEASON_COUNT`), provenance #193 (Availability input hash only;
the time-zone snapshot reproduced byte for byte). Not changed on purpose: no projected mark on
the board (owner, 2026-10-16) and Shooting's empty 2026-27 default (pinned). Open: secret
alert #1, unverified agent-reported terminology drift (TRAVEL MILES, JET-LAGGED, Home/rest
gap), and the kept local branches listed in the archive README.

## Post-v1.0.10 follow-up checks — 2026-10-20

Closed the open items above. Secret alert #1 (a third-party public Maps Embed key in a
research capture) was resolved as won't-fix: it is redacted on `main` and survives only in
closed PR #188's ref, which only GitHub Support can purge. PR #195 fixes the agent-reported
drift that held up (MILEAGE per D-120, TIME ZONES, "swept 4–0", Season Report's
other-seasons rate now beside its home baseline, Schedule Edge tile units, the referee
foul-share chance count, zero-rest GAMES as a season total); "Home/rest gap" and the other
reported items were checked and are accurate. The local archive now lives at
`../fullcourt-local-archive` and was slimmed to 2.7 GB (README lists what went). Open:
confirm the first live slate per docs/LAUNCH_DAY.md once finals land (after about 04:00 UTC
on 2026-10-21); a release bump if #195 merges.

Later the same day: v1.0.11 released (#195, #196). The full e2e suite had 19 deterministic
failures on `main`. They were stale specs (an empty 2026-27 Shooting default, copy replaced in
v1.0.6+), macOS overlay scrollbars, and five real figure wraps; the follow-up PR fixes all of
them except one. Open: at 390×844 the first /games card starts 57px behind the bottom dock
(`independent-audit.spec.ts` "mobile games keep season, month and date visible"). Making it
pass means trimming or reordering the mobile board above the slate, which is an owner design
call. A one-time cloud routine checks the opening-night slate at 2026-10-21 05:00 UTC.

## Behind the Data clarity pass — 2026-10-21

Branch `docs/behind-the-data-clarity`. Rewrote all ten method pages for plain, short copy and phone width: the rest-advantage page now repeats the combining equation and gives every term its own formula (altitude included), grouped as loads, multipliers and adjustments. Every formula line is at most 40 characters (`behind-the-data-formula-width.test.ts`), padded-text "tables" became real tables, and no method table overflows at 390px. Rule recorded in FRONTEND.md. No coefficient changed; `fatigue.ts` only names the existing per-window stress cap and exports it. Open: hand-typed figures in data-and-limits prose (88, 971, 179, 135, 44 games) and "twenty points" on rest-advantage predate this pass and are still unpinned.


## Approved mobile UX implementation and release preparation — 2026-10-21

Owner approved all D01–D10, then explicitly requested final security audit, main merge and
live deployment. Implemented current actual-publication defaults, explicit-current Awaiting,
compact Games/Schedule/Shooting reading order, linked chart readouts, one-court model
comparison, annual Availability selection and 15px explanatory text. The new read-only
`/api/season-report-publication` discovers report seasons; schedule API behavior is preserved.
Claude’s clarity commits are included, with three semantic copy regressions and 375px
formula/table overflow corrected. v1.1.0 carries these changes; final release evidence belongs to its immutable Git tag,
GitHub release and dated local acceptance receipt.

No schema, fatigue coefficient, published artifact or historical prediction was changed.
Physical iPhone/Safari/VoiceOver and actual opening-night ingestion remain unverified.

## v1.1.0 release and documentation refresh — 2026-10-21

v1.1.0 is published at merge `9c313de8f6e42ae3f7e89307b15a08225415339e`, canonical Ready
Vercel deployment `dpl_7APuWsqku5cEFWRKdPfRnYgFh9Gc`. The [release verification](reports/2026-10-21-mobile-release-security.html) reported
50/50 production cases (40 WebKit phone, 10 Chromium desktop), zero page overflow, alerts or
page errors; real-font, security-header and three source-map-404 checks also passed.
README/default-season/font descriptions now match source. Six [production screenshots](screenshots/README.md)
replace October 17 captures and show desktop plus 375/402px reading order; the local social
preview was re-fetched from the live OG endpoint and already matched. Capture provenance pins URLs, time and SHA.
Physical iPhone/Safari/VoiceOver and actual completed-slate ingestion remain unverified.
Next: observe those real-world paths; GitHub/portfolio publication has its own readback evidence.

## Explore compact-card follow-up — 2026-10-21

Owner selected Explore variant A. v1.1.1 prepares content-height cards below 640px, tighter
spacing, an unboxed arrow, a short introduction and four concise mobile descriptions.
Desktop composition/copy, seven study destinations/order, both research links and other
StudyLink consumers remain unchanged. D-134 records the bounded mobile exception.
Built-browser checks show3complete cards at375px and4at402/420/440px; desktop card
geometry and other StudyLink consumers are preserved. All9destinations, keyboard focus,
200%text, final-link clearance and main-content axe checks pass, with all1,488unit tests.
Next: preview verification and production release. Physical iPhone/Safari/VoiceOver
behavior remains unverified.
