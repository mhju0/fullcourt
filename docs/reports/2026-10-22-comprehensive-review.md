# 전체 코드·성능 리뷰 — 2026-10-22

검토 기준: `75b2e61e1879bdf11f406f56b7957bae8efb4097` (v1.1.4).
전체 저장소의 코드·성능 검토 후 재현과 독립 재검토를 거쳐 수정한다.
운영 DB에 쓰거나 모델 계수·발표 수치·스키마를 바꾸는 작업은 포함하지 않는다.

## 검토 범위

| 영역 | 검토·실행한 내용 |
| --- | --- |
| API·SQL·도메인 | API 경로, DB queries/pool, 집계·stamped cache, Eastern 날짜, publishableGames, 홈/원정·중립구장과 venue baseline |
| 클라이언트 | 라우터·URL·history, Games reducer/요청 lifecycle, SWR 오류·필터, 내비게이션 취소, 모바일 렌더링 |
| 수집·ML·CI | daily/score/context/시즌 시더, provider 형태, artifact 계약, Actions, Python·Node 계약 |
| 성능·운영 | 실제 SELECT 시간, 브라우저 요청 순서·전송량, 캐시 계약, production build, 의존성 audit, 미리보기·운영 검증 |

## 재현해 수용한 발견 사항

| ID | 신뢰·위험 | 문제와 수용 기준 |
| --- | --- | --- |
| R1 | 높음 / Class 3 | 실제 서로 다른 hoopR 경기가 같은 점수 키에 충돌해 같은 날짜로 연결됨. 모호한 매칭 거절, 기존 행 불변, 원자적 insert-only/no-op 시더로 수정. [ADR 0016](../adr/0016-season-seeds-refuse-ambiguous-fixtures.md) |
| R2 | 중간 / Class 2 | Games의 활성 내비게이션을 누르면 URL에서 날짜가 빠져도 화면은 이전 날짜를 표시. 같은 경로 탐색·Back/Forward·자체 history 쓰기를 일관되게 복원 |
| R3 | 중간 / Class 2 | Games 달력 날짜 요청을 멈추면 14초 후에도 로딩, slate 요청·재시도 버튼 없음. 제한 시간 이후 오류·재시도 제공, 취소한 이전 응답 무시 |
| R4 | 중간 / Class 1 | 팀 일정 82행을 읽은 뒤 재연결 503 한 번에 결과 전체가 사라짐. 이전 성공 결과를 보존하고 갱신 오류·재시도 표시 |
| R5 | 중간 / Class 2 | Officiating 필터 변경 직후 선택과 결과가 이전 값으로 되돌아가 라우터 완료까지 기다림. 공용 optimistic query 경로로 즉시 반영 |
| R6 | 중간 / Class 2 | 다른 경로로 이동을 시작한 뒤 현재 경로로 덮어쓰면 leaving 표식이 15초 남아 URL 갱신을 막음. 대체 탐색 시작 시 이전 표식 해제 |
| R7 | 중간 / Class 1 | 두 수동 시더가 없는 캐시 폴더에 응답을 쓰며 ENOENT 발생. 새 복제본에서도 폴더 생성 후 캐시 저장 |
| R8 | 중간 / Class 3 | upcoming 시더는 날짜 수집 실패를 기록해도 계속 진행하고, 균형 잡힌 15경기도 전체 일정으로 통과. 수집 실패·불완전 경기 수·상충 관측 차단 |

## 성능 측정과 채택하지 않은 변경

다음 수치는 이 Mac과 실제 읽기 전용 DB 연결에서 관측한 표본이다. SLO나 운영
p95 추정이 아니며, cold/warm 요청과 네트워크 상황에 따라 달라진다.

- 완료 경기 47,146행 읽기: cold 3,979ms / warm 1,679ms. fingerprint는
  cold 1,937ms / warm 220ms로, 전체 읽기보다 싼 변경 감지라는 현재 목적을 유지한다.
- season stamp 113ms, season rows 138ms, upcoming 313ms, dates 49ms, team schedule 284ms.
- Games의 명시적 날짜 진입은 dates 요청과 slate 요청이 1ms 차이로 시작했다.
  기본 진입에서 사용할 날짜를 고르는 의존성까지 없애는 투기적 prefetch는 채택하지 않았다.
- 한 Node 프로세스에서 홈→analysis→home-court는 전체 읽기를 세 번 수행했지만,
  Vercel의 별도 함수 사이 메모리 공유 이득은 확인되지 않았다. 공용 raw-row 캐시는
  메모리 유지량을 늘릴 수 있어 채택하지 않았다.
- Officiating 보고서 반복 fetch는 3,238→300 bytes, 29→19ms로 브라우저 재검증을
  사용했다. 파일명 해시는 원본 해시이고 출력 본문의 해시가 아니므로 immutable 캐시는
  거절했다. 300초 캐시도 maintenance 즉시 차단 계약을 약화하므로 이번에는 유지하지 않았다.
- daily pipeline의 연속 ESPN refresh는 같은 날짜를 다시 읽지만, 오래된 캐시와 수집
  실패를 구분하는 invocation 계약 없이 제거하면 최신성 보장이 약해진다. 무조건 제거하지 않았다.
- 프로덕션 의존성 audit: 취약점 0건. 설치된 버전의 Next 문서와 실제 build를 확인했다.
- Officiating 같은 이벤트 루프 검사: 이전 코드는 NYK 선택 직후 값이 빈 문자열로
  되돌아갔고 다음 tick에도 같았다. 수정 후에는 NYK 선택 4.8ms 시점과 다음 tick에
  NYK를 유지했고, 이어 BOS를 선택해도 즉시 BOS를 유지했다. 단일 브라우저 표본으로,
  전체 페이지 로드나 운영 p95의 개선 수치로 일반화하지 않는다.

## 검증 기록

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm docs:check`: 통과.
- `pnpm test:run`: 130개 파일, 1,524개 테스트 통과. 시더 최종 집중 검사 9개 통과.
- Python scripts 70개, ML 82개, Node 자동화 26개 통과.
- 별도 correction suites: history 15개, overtime 82개, arena 18개 통과.
  기존 SQL 전용 환경이 필요한 27개는 이 세 suite에서 skip했다.
- 실제 PostgreSQL: 기존 prospective/freshness/lifecycle/pool 계약과 새 seed 4개 그룹 통과.
  후반 chunk 오류는 앞선 insert를 rollback했고, 기존 행은 불변이며 동시 writer의
  lock 대기를 관측했다. 실제 중복 hoopR 입력은 CLI에서 HTTP/DB 전에 거절했다.
- 새 브라우저 회귀 6개 통과. 390/1440px 오류 상태는 기존 표·재시도를 표시하며
  document 너비가 viewport와 같고 pageerror가 없었다.
- 독립 Astra 리뷰: `5d59cfaa0b90ffd5e1ac7a5b2794ea5e0da1ddfb` 승인. 리뷰어가
  PostgreSQL 시더 4개 그룹과 실제 CLI usage/종료 경로를 별도로 재실행해 통과했다.
- [PR #210](https://github.com/mhju0/fullcourt/pull/210) 미리보기:
  `dpl_GMHvJGNKBKatWL5z2rhbAYDg6fSD`, READY. 실제 Games 11경기, 팀 일정 82경기,
  활성 Games 날짜 재설정·reload 일치, NYK 필터 즉시 반영, 390/1440px overflow 없음,
  pageerror 0개, health 200/DB up을 확인했다. 빌드의 Sentry source-map 업로드도 성공했다.
- 전체 브라우저 검사: `PLAYWRIGHT_BASE_URL=http://localhost:3111 pnpm test:e2e`,
  **580/580 통과, 9.3분**. 접근성·keyboard·반응형·history·새 회귀를 포함한다.
- PR의 checks/browser/postgres/verify와 세 CodeQL 언어 검사 모두 통과했다.
  운영 배포의 정확한 merge SHA·deployment ID·실제 동작은
  [v1.1.5 릴리스](https://github.com/mhju0/fullcourt/releases/tag/v1.1.5)에 기록한다.

테스트 통과와 실제 운영 수집·물리 기기 확인은 별개다.

## 변경 UI의 antislop gate

기존 Front Office 방향을 유지한다: ENERGY 1 / RHYTHM 1 / MOTION 1.
새 디자인이나 데이터 인코딩을 추가하지 않고, 실패 안내는 기존 MessageCard를 재사용한다.

| 블록 | 결과·근거 |
| --- | --- |
| Hard gate | PASS: 새 재시도 동작·오류 후 복구를 실제 클릭했고, 390/1440px overflow와 pageerror는 0. 빨강 안내 6.16:1, 보조 문구 5.85:1, 재시도 링크 5.63:1 대비율 |
| Purpose gate | PASS: 기존 오류 카드·타입·색만 사용. 새 아이콘·그림자·장식·애니메이션 없음 |
| Liveliness | PASS: 기존 평온한 정보 위계와 표를 유지. 갱신 오류 뒤에도 표가 남고 선택은 즉시 반영됨 |
| Craftsmanship | PASS: 실제 API와 명시한 테스트 fixture를 구분. keyboard/axe 검증과 retry·history 회귀를 실행하며 가짜 수치나 보장 문구를 추가하지 않음 |

## 남은 낮은 우선순위·한계

- 날짜 API는 `0000-01-01`을 허용해 PostgreSQL에서 500이 된다. `0001-01-01`은
  200 빈 결과, `2024-02-30`은 400으로 확인했다. 이번 강한/중간 수정 범위에는 포함하지 않았다.
- 같은 날짜의 검색 결과에 ID tie-breaker가 없지만, 실제 페이지 중복·누락은 재현하지 못했다.
- 실제 조회에서 잘못된 final 점수, scheduled prediction/fatigue 불일치, scheduled fatigue
  pair 누락은 각각 0건이었다. 전 시즌 모든 원본 경기의 독립 검증이라는 뜻은 아니다.
- 기존 미해결 운영 관측, 물리 iPhone/Safari/VoiceOver, owner가 보류한 lint/type/SQL
  확장 과제는 이 리뷰의 자동 승인으로 완료 처리하지 않는다.
