# Project handoff
Reconciled 2026-10-21. Source/tests and Git take precedence. Rationale: [Decisions](DECISIONS.md).
## Product and release
FullCourt studies NBA rest, travel, schedule density, and outcomes. The homepage leads with
rest and schedule findings; Games, Season Report, Schedule Edge, and Explore are the primary
navigation. Explore contains the other basketball studies. There are no accounts or persisted
personal preferences; exploration state is shareable through URLs and browser history.
Production: https://fullcourt.fyi. Git, CHANGELOG.md and dated reviews retain releases. D-69/D-70 define publication-aware
defaults and venue baselines; D-79 defines Games navigation. D-137 publishes descriptive rates from the first eligible game; per-page publication rules
are in EARLY_SEASON_PUBLICATION.md. Officiating archive limits remain documented.
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
This remains the historical/manual archive path. D-137 uses the separate validated daily data branch; application changes still require preview verification.

## Remaining verification and future scope

Automated desktop/mobile/accessibility coverage does not establish physical-device or human
screen-reader behavior. Observe actual completed-slate ingest; offseason skips are insufficient.

[Roadmap](ROADMAP.md) contains the remaining maintenance work and deferred ideas. No coefficient
refit, database migration, accounts, or new analytics are implied by repository cleanup.

## Condensed history through 2026-10-22 — 2026-10-26

The complete dated record remains in [Git at v1.2.10](https://github.com/mhju0/fullcourt/blob/269b7effa100ace1c5d05ee67ce96adbc3546584/docs/PROJECT_HANDOFF.md).
Source, tags, ADRs and later entries take precedence over older preparation notes.

- v1.0.0 released October 19. Later releases retain immutable tags and CHANGELOG entries.
- v1.1.0–v1.1.2 shipped the approved mobile layout, method-page rewrite and Explore/Edges Ahead layouts.
- v1.1.3–v1.1.5 shipped correction contracts, per-row score recovery, fixed date/status handling,
  insert-only seed safety and pool/performance fixes. ADR 0016 preserves identity and transaction invariants.
- The fatigue feature provenance guard and overtime/arena corrections are shipped; ratified coefficients
  remain governed by ADR 0006. Owner kept module-load season calculation and the October 1 deploy check.
- The daily season gate uses ESPN regular-season dates, with a guarded October–April fallback.
  Real 2020-21 December–May coverage is tested. The source probe fails if it uses fallback.
- Local archives formerly beside this checkout were moved under `.local/archive/`; later entries name
  the current locations. Never remove unrelated branches, notes or ignored archives implicitly.

Carried-forward limits, unless a later entry explicitly closes them:

- The October 3 production API 500 has no established cause. Server Sentry symbolication and
  JAVASCRIPT-NEXTJS-4 remain separate from the verified client source maps.
- Observe a real live score transition and provider postponement/recovery; completed finals and
  clock/mocked tests do not prove live Realtime delivery. Keep the D-83 rescore observation separate.
- ESPN-to-hoopR current-season game re-keying, actual airports/home stops and Cup assignments remain
  operational follow-ups; no automatic seed or model refit is authorized by this handoff.
- Section 7 remains report-only for 2026-27. Reader-picked Schedule columns, filter sharing,
  extra chart actions, chart-wide redesign and configurable columns remain deferred.
- Owner-deferred engineering: e2e gating, real-SQL query coverage, `noUncheckedIndexedAccess`,
  type-aware lint, dates-to-slate waterfall, browser artifact caching and pipeline round trips.
- Physical iPhone/Safari/VoiceOver, real capacity and live Supabase delivery are not established by
  automated desktop/mobile tests. Later owner notes make physical-device checks optional.
- Footer text stays 12px by owner choice; off-Mac backup and phone push were declined.
- The hand-typed methodology counts, Games dock overlap, Actions PR permission, Supabase review and
  public Maps key cleanup have newer dispositions below; do not reopen old notes as current blockers.

## 2026-10-23 — 폰 Games 화살표를 하루 단위로

Owner 요청: 폰 날짜 화살표가 일주일이 아니라 하루씩 이동. `DAY_SHIFTED`로 바꾸고 `WEEK_SHIFTED` 제거, 주간 스트립(일–토)은 선택 날짜를 따라간다(D-78 amendment).
검증: unit 1,522, e2e season-navigation·motion-accessibility·release-smoke 해당 케이스 통과. 다음 단계: PR preview를 폰에서 확인 후 merge.

## 2026-10-23 — Officiating refresh 검증 복구

실패 run `39872249993`은 2026-27 원본 2건 수집·생성 후 테스트에서 중단됐다.
테스트의 상대 시즌 위치와 고정 stale 기준일이 새 시즌 추가로 깨졌다. fixture는 시즌명을 지정하고
stale 비교일은 입력보다 하루 뒤로 계산한다. 시즌 추가·재정렬 회귀 검증을 추가했다.
발행 코드·공개 JSON·모델은 변경하지 않았다. 실제 실패 원본을 임시 출력에 재생해 검증하며,
새 데이터의 공개는 기존대로 별도 데이터 PR의 preview 검토·merge 이후에만 진행한다.

## 2026-10-23 — 시즌 초 최초 관측 공개 (D-137)

Owner 승인으로 공통 10경기와 원시 승률 100경기 제한을 제거한다. Wilson 구간·eFG 제곱합,
0건/미수집 구분, 현재 ESPN 선수와 과거 NBA career ID 분리를 적용한다. 과거 raw 슈팅 집계는 유지한다.
일일 JSON은 main 배포 대신 해시 주소의 data-publications 브랜치로 발행하며 모듈별 실패는 정상본을 보존한다.
실제 16경기/330선수 관측과 NBA L2M 2건을 생성했고 ShotChartDetail은 아직 응답 실패로 새 자료를 만들지 않았다.
검증·배포 완료 증거는 v1.2.0 릴리스 기록으로 남긴다. 공급자 장애·물리 기기 확인은 별도 상태다.

2026-10-23 독립 검토 보완: manifest에 시즌별 해시 이력을 보존하고 API가 이를 병합한다.
미래 Shot 경기일은 ET 수집일과 대조하며 최종 발행 검증 실패도 모듈별로 격리한다.

## 2026-10-23 — Officiating 보고서 링크 복사 수정

현재 보고서의 “Link to game”은 같은 보고서 주소를 다시 열어 클릭 결과가 없었다.
공유 계약은 유지하고 “Copy report link”로 바꿨다. 절대 URL을 복사하고 성공을 알리며,
클립보드 거부 시 직접 선택할 URL을 제공한다. 시즌·팀·판정 유형·NBA 보고서 ID는 보존한다.
실서비스 현재 보고서 0022600090에서 기존 동작을 재현했고, 로컬 production build의
390/1440px에서 실제 복사·주소 재열기·실패 대체 UI를 확인했다. 전체 unit 1,628개,
typecheck, 변경 파일 ESLint, build와 Officiating browser 16개 통과. v1.2.1 준비 완료. 다음 단계: root 검토와 PR preview 확인 후 릴리스.

동일 보고서를 연 채 팀 필터를 바꾸면 기존 복사 성공/실패 안내가 남는 검토 지적을 보완했다.
복사 결과를 당시 URL과 묶고 현재 URL과 일치할 때만 안내·대체 URL을 표시한다.
390/1440px 실제 복사 후 같은 문서의 URL 팀 변경·재복사, 실패 대체 URL 갱신, 늦은 복사 완료를 browser 회귀 검증에 추가했다. 변경 검증 5개와 rebuild·typecheck·변경 ESLint 통과.

## 2026-10-23 — Shooting 여섯 열 비교표, v1.2.2 준비

Owner가 선택한 B 구분에 단일 헤더를 적용했다(D-138). 각 rest arm의 attempts/eFG%를
분리하고 count 정렬, 0 시도 표시, 시즌·career 공통 열과 폰 sticky 선수명을 제공한다.
메인은 “2+ days rest”, 정확한 범위와 gap 기반 장기 결장 제외는 Methods에 둔다.
산식·모집단·현재 ESPN/과거 NBA identity·career 추정 범위는 유지한다.
검증: unit 1,629개, targeted 60개, typecheck·변경 ESLint·build와 Shooting browser 28개 통과.
320/390/430/1440px 단일 줄 헤더·열 정렬·내부 스크롤·페이지 overflow 없음과 150px 폰 선수 열을 확인했다.
물리 iPhone/Safari/VoiceOver는 미검증. 다음 단계: root의 정확한 candidate 검토와 PR preview 확인 후 릴리스.
Root 최종 폰 검토 후 이 표의 양쪽 scroll fade를 제거했다. 끝쪽 숫자도 완전히 보이며,
기존 내부 스크롤과 안내는 유지한다. build·변경 ESLint와 해당 네 viewport 검증을 재통과했다.
추가 폰 검토로 첫 attempts 열은 145px, 선수 열은 320px 화면에서 120px·390px부터
150px로 조정했다. 초기 가로 이동 없이 첫 숫자의 textRange 전체가 내부 viewport에
들어오는지 320/390/430px에서 확인했고, 정렬 화살표를 포함한 단일 헤더·전체 열 정렬도 재통과했다.
CI의 design-scale 계약은 헤더의 inline letterSpacing:0 한 건을 거절했다. 시각적 간격이
동일한 표준값 normal로 교체했으며 page-contract·design-scale 110개를 테스트 변경 없이 재통과했다.

## 2026-10-24 — 전체 시각 요소 HTML 목록, 개선 논의 준비

Owner 요청으로 차트·표·그래픽을 소스와 실제 화면에서 조사했다. 서비스 코드는 변경하지 않았다.
[HTML 보고서](reports/2026-10-24-graphics-inventory/index.html)에 95개 시각 요소·구성군,
35개 경로·쿼리 조합의 캡처, 소스 위치·조건부 상태·검토 후보를 기록했다.
antislop은 owner 선택에 따라 사후 감사 기준으로 사용한다. Shooting의 폰 정보 순서와 행 밀도가
첫 논의 대상이며, 기존 D-138을 대체하는 설계는 아직 선택하지 않았다.
보고서 검증: 검색·종류 필터·이미지 확대/Escape·로컬 링크·소스 위치와 320/390/1440px overflow 확인 통과.
다음 단계: 보고서 검토 후 개선 방향·대상 승인. 실제 iPhone/Safari와 전수 접근성·수치 감사는 미수행.

## 2026-10-24 — 보고서 간소화와 전체 응답 저장

Owner 요청으로 같은 HTML 보고서의 접기/펼치기·숨김 필터를 제거하고 문구·상단 목차를 줄였다.
핵심 관찰 8건과 목록 95개 항목에 선택·메모를 추가했다. 전체 저장은 이미지와 응답을
하나의 HTML로 내려받으며 재열기·재저장이 가능하다. 임시 입력은 HTML snapshot에 묶어
이전 초안의 덮어쓰기를 막고, 저장 파일에서 수정한 최신 초안도 재열기 시 복원한다.
서비스 UI 개선안은 아직 선택 전이다. 실제 다운로드·한글/줄바꿈/특수문자·저장 실패·반응형을 검증했다.
다음 단계: owner가 보고서에 의견을 작성하고 전체 저장한 결과를 바탕으로 개선 범위를 결정한다.

## 2026-10-24 — 모든 의견 바로 옆에 대상 캡처

Owner 재요청으로 8개 논의점·95개 항목 각각에 관련 캡처를 직접 배치했다.
표·차트·수식·펼친 경기/선수 상태와 아이콘을 실제 서비스에서 102개 영역으로 새로 캡처했다.
여러 화면의 공통 의견에는 비교 캡처를 함께 붙였고, 공통 부품은 실제 사용 예로 표시한다.
데스크톱은 화면과 의견을 나란히, 폰은 캡처 바로 다음에 의견·응답칸을 배치한다.
분리 갤러리와 접기는 없으며 기존 선택·메모 키와 전체 HTML 저장·재열기·초안 복원은 유지한다.
검증: 103개 블록의 개별 캡처 연결·320/390/1440px 배치와 206개 응답의 저장·재열기 통과.
서비스 코드·모델·배포는 변경하지 않았다. 개선안 결정은 owner가 작성한 응답을 바탕으로 진행한다.

## 2026-10-25 — Chart interaction rollback baseline

Owner requested a recoverable baseline before chart navigation changes and cautioned against uniform controls across unlike charts. Saved current tracked + nonignored untracked files, including the October 24 graphics inventory/screenshots and existing dirty notes, at snapshot commit `cdcd1d5c75d6e54edb5fdbf772c52d4ede8b0d61` on `backup/chart-mechanics-2026-10-25_143428_KST`. Independent source archive, hashes and restore guide: `/Users/michaelju/Backups/fullcourt/charts/2026-10-25_143428_KST/`. Extracted and SHA-256 checked all 6,039 files. No interaction changes or deployment. Secrets, dependencies and live DB are excluded. Restore affected chart files selectively; preserve unrelated later work.

Owner direction: season jump menu only for charts with many seasons; tentative spatial arrow-key movement on shot maps; assess each chart individually. The preceding control in the dictated request was unclear, so confirmation was requested before implementing it. Next: resolve that control and review chart-specific changes against the saved mechanics.

## 2026-10-25 — d6 chart inspection shipped (v1.2.6, D-142)

The owner picked pattern A from the d6 bench: pick on the chart, show values in a fixed readout, and use ← → Home End on the focused chart. A season menu appears only on long series (Home Court, Availability), and shot maps use arrow keys in place of the slider. Per the owner, charts may differ beyond that, so the Schedule ‹ › buttons, the gap-size group buttons and Browse, and the model comparison panel stay. PR #221 squash-merged as `77bbb074`; tag/release v1.2.6; production checked. Each chart was its own commit on the branch, so one chart can be restored from v1.2.5 alone. The contract is in FRONTEND.md "Chart inspection".
Open: graphics review d7 (table formatting, owner: later) and d8 (Behind the Data, after product pages).

## 2026-10-25 — d7 table counts (PR #223, v1.2.7, D-143)

- Owner took the bench recommendations (https://claude.ai/artifact/2gXKv6kdfbRbqB1TNwyGpH): rate first, counts as `W / G`; Season Report and Home Court stack rate over count in one cell, Shooting keeps separate sortable columns; dashes plus a note line under the table; header case per table. Rule in FRONTEND.md "Counts and rates in tables".
- Open: merge #223, then tag and release v1.2.7. d8 (Behind the Data) is next.

## 2026-10-26 — everything local lives inside the repo folder

- d7 merged and released: #223 → main fd9a162f, tag v1.2.7.
- Owner rule (AGENTS.md): no folders beside `fullcourt/`. Worktrees go in `.local/worktrees/`, archives in `.local/archive/` (moved from `../fullcourt-local-archive`, 3.1 GB), scratch in `.local/`. `.local/` is gitignored and excluded from tsconfig and ESLint. Never `git clean -x`. Older entries and D-142 that say `../fullcourt-local-archive/...` now mean `.local/archive/...`.
- Shooting prototypes removed (worktrees, local branches, origin/prototype/shooting-columns). Both branches are in `.local/archive/prototype-bundles-2026-10-26/shooting-prototypes.bundle`.
- Next: d8 (Behind the Data).

## 2026-10-26 — open-item sweep

- Resolved: the hand-typed method figures (88, 971, 179, 135, 44, "twenty points") are derived or reworded (PR #225), and so is the 971 in the 2019-20 Season Report note. The 57px /games dock overlap no longer reproduces: `independent-audit.spec.ts` "mobile games keep season, month and date visible" passes against production. `withSentryConfig` and the 2026-10-04 data fixes were already done.
- Branches: all merged and stale branches deleted locally and on GitHub. Bundle in `.local/archive/branch-bundles-2026-10-26/old-branches.bundle`. `origin/data-publications` stays (workflow target).
- Still owner-only: the GitHub Actions PR-permission tick, the Supabase downgrade around 11-17, the #188 key purge via GitHub Support, physical iPhone/VoiceOver checks, and a live-game score check. Deferred owner decisions: e2e gating, real-SQL coverage of `queries.ts`, `noUncheckedIndexedAccess`, type-aware lint.
- Next: d8 (Behind the Data) bench.

## 2026-10-26 — d8 method pages (v1.2.9, D-144)

- Owner took all three bench recommendations (https://claude.ai/artifact/H9nnDoBxh3qZUs4SoDe6uJ): `W / G` under the rate where the data has wins (Rest Advantage's three tables, the Schedule Edge market check); green/red on clear comparisons (Rest Advantage gaps, the Playoff verdict and round split); referee archive left as published. Rule in FRONTEND.md "Method tables".
- `deviationFill`/`deviationText` moved to `src/lib/deviation-color.ts` so server pages can use them. `method-table-rules.test.ts` renders the pages and checks both rules.
- The graphics review (d1–d8) is complete once v1.2.9 is released.

## 2026-10-26 — owner items

- "Allow GitHub Actions to create and approve pull requests" was already on (`can_approve_pull_request_reviews: true`); the officiating workflow can open its own PRs. No longer open.
- #188 key: the leaked commit is reachable only through `refs/pull/188/head` (not main, any tag, or another PR). The owner filed a GitHub Support ticket to remove the ref and its three commits. The key is a third-party public Maps Embed key, so there is nothing to rotate.
- Supabase: the downgrade is on hold by owner decision. Egress was 4.4 GB nine days into the 10-17 → 11-17 Pro cycle, above the Free plan's 5 GB/month pace.
- Physical iPhone/VoiceOver checks are optional per the owner; axe runs on every route at phone width in `e2e/accessibility.spec.ts`.
- Still open: a live-game score check (first 2026-27 slate after this note: 10-26 7:00 PM ET).

## 2026-10-26 — Games 빈 날짜와 일정 사유, v1.2.10 준비

Owner가 고른 일반 빈 날짜·Cup 미정 문구와 추가 요청한 올스타·선거일 등 사유를 적용했다(D-145).
날짜 선택기는 공개 정규시즌 양끝 안의 모든 날짜를 표시하며 폰 주간 정렬과 양끝 화살표를 맞춘다.
확정 빈 날짜는 0/대시/대시, Cup 미정은 TBD이며 실제 경기가 우선한다. 그룹 경기 종료 후의
미수집과 지난 Cup 공백은 경기 없음으로 확정하지 않는다. 공식 근거와 과거 시즌 등록 범위는
[조사 기록](research/2026-10-26-games-empty-dates.md)에 남겼다. 계수·스키마·API 변경 없음.
검증: 전체 unit 1,671개·lint·typecheck·production build, targeted 70개, built browser 신규 9개·기존 5개 통과.
실제 API로 일곱 사유와 desktop/phone 양끝 경계를 확인했다. 독립 검토가 찾은 오래된 날짜 인덱스와
실제 응답의 경기 수 불일치는 시즌별 관측 count로 보완했다. `6d7f78b4` 독립 재검토에서 두 방향의
불일치·다른 날짜로 이동 후 유지·시즌 초기화·늦은 응답 처리를 확인했고 추가 지적은 없었다.
다음 단계: PR #228 preview와 production 확인, v1.2.10 릴리스. 기존 운영 미해결은 유지한다.

## 2026-10-26 — Games OT·경기 전 전적·Cup 계산 보류 (D-146)

v1.2.10은 PR #228로 배포했고 canonical/기존 alias를 실제 merge 배포에 맞춰 검증했다.
Owner 후속 승인으로 FINAL/OT·FINAL/2OT, 작은 경기 전 전적, Cup 입력이 불완전한 팀의
TBD 표시를 구현했다. 경기·점수·전적은 유지하고 paired RA·파생 표시와 불완전한 요약은 보류한다.
Cup 결승은 전적에 제외하고 물리 경기로 포함한다. Hinkle 위치는 해당 결승 날짜에만 적용한다.
기존 OT 수집·계산은 실제 43경기와 다음 경기 재계산에서 정상으로 확인했다. 계수·DB 쓰기 없음.
전적은 실제 PostgreSQL CTE와 154팀 측 독립 oracle에서 일치했고 CI의 disposable PostgreSQL에도 연결했다.
Cup 해제는 현재 입력과 저장/공개 tuple 비교로 확인하며, 완전 배정된 실제 시즌 자료는 아직 없어
해제 경로는 실제 schema에 맞춘 fixture로 검증한다. 현재 실제 DB의 보류·범위 종료는 직접 확인했다.
전체 unit 1,714개·lint·typecheck·build 통과. 다음 단계: desktop/mobile·200% browser 검증,
독립 고정 후보 검토, PR preview·실서비스 확인과 v1.3.0 릴리스. 기존 운영 미해결 항목은 유지한다.

독립 검토의 snapshot 대상 변경·정규 Cup 경기 이동 후 만료 경계 지적을 보완했다. 실제 200%
글자 확대의 행 겹침도 공유 em 높이와 필요한 위치의 줄바꿈으로 수정했다. 검토 후보는
`6e2485e3`이며, 기존 Cup 범위 이후에도 현재 입력·tuple과 미해결 연기를 검사한다.
