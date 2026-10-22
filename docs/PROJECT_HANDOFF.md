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

D-64–D-78, Git and dated reviews retain the methods, shell, launch and phone deliveries.
Keep built CSS checks (D-72) and separate full DB-backed e2e. D-117 supersedes old launch
gating: v1.0.0 is October 19; actual completed-slate checks remain open.

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

D-78–D-119 and Git retain Games hierarchy/lifecycle, accessibility/motion and dependency
deliveries. Evidence: [remediation](reports/2026-10-11-remediation/index.html),
[accessibility audit](reports/2026-10-14-accessibility-usability.html), [plans](../plans/README.md).
D-127 restores homepage history. Antislop applies throughout; odds feeds remain excluded.
Filter sharing, extra chart actions and configurable Schedule columns remain deferred.

D-117 pins official v1.0.0 to October 19 (`114617d`); subsequent releases use incremented
versions and immutable tags. D-118/D-119 retain publication-aware Shooting and honest
historical comparisons. Launch no longer requires a completed slate; observation remains open.

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

v1.0.3–v1.0.8 corrected inputs, pooling and publications (D-123–D-132; #182, #184–#189),
preserving coefficients and graded/playoff history. The [arena ledger](research/2026-10-20-arena-shooting/AUDIT_LEDGER.md#v108-production-acceptance-and-v11-remediation-completed--2026-10-20)
retains exact acceptance and V11 remediation. Writers/SSO were restored; ten non-home/four-logo checks remained same-source.

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

The independent audit found no wrong published figure; docs/copy/provenance fixes shipped
separately. Removed worktrees and unique evidence are retained in the local archive above.

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

## Condensed 2026-10-21 releases and full review — 2026-10-21

v1.1.0 (#200) shipped the approved D01–D10 mobile UX with the Behind the Data method-page
rewrite (ten pages, formula lines at most 40 characters, rule in FRONTEND.md). v1.1.1 (#202)
made Explore cards fit their content on phones (D-134), and v1.1.2 (#204) made upcoming rest
edges equal-width rows (D-135). The [release verification](reports/2026-10-21-mobile-release-security.html)
and Git tags retain the evidence.

A full-repository review shipped as v1.1.3 in three PRs:
- #205 put the correction suites in CI, isolated per-row score-sync failures, made fatigue
  backfill per-game and split the officiating refresh into collect and propose.
- #206 fixed the season verdict band edge, body-clock DST (ADR 0011 amendment), blank ESPN
  finals, the Schedule Edge average and impossible ids or dates reaching the database.
- #207 split the `/officiating` payload, lazy-loaded supabase-js, served 72px logos and compiled
  out unused Sentry code.

A Sentry US outage failed every build at source-map upload. The guard was kept and the builds
were retried once Sentry recovered. `drizzle/0013`
(anon reads `games` only) and `drizzle/0014` (`games (season, date)` index: a 487 ms
sequential scan became a 65 ms index scan) were applied through Chrome at the owner's request
(#208). The fatigue features were re-exported from `main` with valid receipts. The officiating
workflow ran for 2026-27 (nothing published yet) and 2025-26 (metadata-only, branch deleted).
Merged worktrees and branches were removed. Unmerged branches, stashes and the 2026-10-21
report drafts are in `../fullcourt-local-archive/` (`branch-archive-2026-10-21`,
`reports-2026-10-21`). PR #199 closed as superseded by #204; #203 bumps certifi.

Open from these entries:
- Live score updates under the anon `games`-only grant are unchecked during a live game.
- The owner must tick "Allow GitHub Actions to create and approve pull requests" for the
  officiating workflow to open its own PRs; until then an update arrives as a branch.
- Unpinned hand-typed figures remain in data-and-limits prose (88, 971, 179, 135, 44 games)
  and "twenty points" on the rest-advantage method page.
- Owner decisions deferred from the review: e2e gating, real-SQL coverage of `queries.ts`,
  `noUncheckedIndexedAccess` (751 errors), type-aware lint. Not done in the performance pass:
  the `/games` dates→slate waterfall, `public/data` browser caching, script-side round trips.
- Physical iPhone/Safari/VoiceOver behavior remains unverified.

## Season-list rollover note — 2026-10-21

- Owner decision: `NBA_SEASONS` stays computed at module load. `docs/SEASON_ROLLOVER.md` now
  says to deploy once on or after October 1 and check that the new season appears.
- Owner decision: the daily season gate (`scripts/season_window.py`) now reads ESPN's
  regular-season dates (`seasons/{year}/types/2`) instead of cdn.nba.com, which returned 403
  for every user agent. The window runs three days either side; on any ESPN failure it falls
  back to October through April. ESPN days start at 03:00 ET, so the 06:59Z end belongs to
  the previous date. 2020-21 (December to May) is covered by a test.
- The probe workflow now fails if the gate falls back, which is how runner reachability of
  `sports.core.api.espn.com` is checked.

## 2026-10-22 — 전체 코드·성능 리뷰, v1.1.5

PR #210: Games URL/deadline/취소 상태, Officiating 즉시 필터, 일정 갱신 오류 복구와 시더 안전 계약 8건 수정.
ADR 0016: 모호한 매칭 거절, 기존 결과 불변, 과거 시더의 잠금·원자적 insert-only/no-op. 운영 시더 실행 없음.
검증: unit 1,524, browser 580, Python 152, Node 26, correction 115 통과; 실제 PostgreSQL과 독립 frozen-commit 리뷰 통과.
[전체 보고서](reports/2026-10-22-comprehensive-review.md)는 성능 측정·반증·한계를, [릴리스](https://github.com/mhju0/fullcourt/releases/tag/v1.1.5)는 merge/deployment·운영 확인을 기록한다.
이전 미해결 운영·물리 기기 항목은 유지한다. 다음 단계는 해당 관측과 owner가 보류한 과제이며 자동 시더 실행은 포함하지 않는다.

## 2026-10-23 — 폰 Games 화살표를 하루 단위로

Owner 요청: 폰 날짜 화살표가 일주일이 아니라 하루씩 이동. `DAY_SHIFTED`로 바꾸고 `WEEK_SHIFTED` 제거, 주간 스트립(일–토)은 선택 날짜를 따라간다(D-78 amendment).
검증: unit 1,522, e2e season-navigation·motion-accessibility·release-smoke 해당 케이스 통과. 다음 단계: PR preview를 폰에서 확인 후 merge.
