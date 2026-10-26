# 시즌 초 데이터 공개와 일일 갱신

2026-10-23 owner 승인. D-137이 기존 공통 10경기 공개 제한을 대체한다.
작은 표본과 큰 관측 차이를 허용하되, 누락·오류·계산 불가를 실제 0과 구분한다.

## 페이지별 공개 시점

| 페이지 | 공개 조건 | 보존할 구분 |
| --- | --- | --- |
| Games / By Team | 공개 일정부터, 결과는 유효 final부터 | 예정·진행·종료, 예상/계산된 피로, 누락 점수 |
| Season Report | 점수와 양쪽 피로가 있는 첫 적격 final | 전체 final/피로 누락/해당 휴식 조건의 분모, ET 기준일 |
| Schedule Edge | 비교 가능한 공개 일정부터 | 전체 예정 일정과 결과 누적, 불균등 일정·미측정 팀, projected/measured |
| Home-court Advantage | 각 승률의 분모가 1 이상일 때 | 현재 부분 시즌과 완료 시즌, venue baseline, 0건은 비율 없음. 부분 시즌은 속 빈 점과 경기 수로 표시하고 축 범위·선에서 제외 (D-139) |
| Shooting | 검증된 첫 선수 박스스코어부터 | 전체 시도와 각 휴식군 시도, 첫 출전의 이전 이력 미확인, 현재 관측과 과거 career 추정 |
| Expected Shot Value | 검증된 실제 슛 좌표 공개본부터 | 관측 지도와 모델 표면, 모델별 전체 셀 커버리지, 없는 모델 값은 null |
| Officiating | 첫 검증된 NBA L2M 보고서부터 | 선정된 접전 종료 구간, 식별 오류 중 놓친 비중, 전체 판정 정확도 아님. 시즌 비교의 현재 시즌 막대는 점선 윤곽과 경기 수로 표시 (D-139) |
| Playoff Rest | 실제 시리즈·이전 라운드 입력이 게시될 때 | 정규시즌 readiness와 독립, 예정·결과·기존 연구 기간 |
| Model Results | 기존 적격 완료 경기부터 | 전체 역사 집계와 완료 시즌/시대별 비교의 모집단 |
| 홈페이지 | 현재 시즌 관측 누적은 별도 표시 | 기존 완료 시즌 대표 수치는 유지 |
| Availability Cost / 심판 연구 archive | 해당 연구가 재현·검증되어 다시 게시될 때 | 연구 기간과 방법 유지, 실시간 결장/개별 심판 인과 효과로 바꾸지 않음 |

현재 시즌 공개본이 있으면 해당 시즌을 기본으로 사용한다. 명시적 URL·뒤로 가기·기존 필터는 보존한다.
아직 공개본이 없으면 실제 이전 시즌을 명시하고, 선택한 새 시즌은 빈 자료 안내를 유지한다.
새로운 공통 최소 경기 수는 없다. 150 FGA/arm은 과거 career 모델의 추정 조건이며 원시 관측 공개 조건이 아니다.

## 통계와 표본

Season Report의 승률은 Wilson 95% 구간을 함께 제공한다. 1/1 또는 0/1에 오차 0을 붙이지 않는다.
관측 차이는 인과 효과나 통계적 발견으로 자동 해석하지 않는다. 0건은 `No eligible games`로 표시한다.
Shooting은 시도별 eFG 기여값 0/1/1.5의 정확한 합과 제곱합을 사용한다.
시도가 한 번뿐이면 표본 SE를 추정하지 않으며, 같은 결과만 관측되어 SE=0이어도 확실하다고 강조하지 않는다.

과거 Shooting 원시 집계는 재생성 전후 동일하다. 수정된 표본 분산에서 현재 career 방법의 잔여 분산 추정이
0으로 제한되어 추정치가 풀 평균으로 수축된다. 이는 선수의 실제 효과가 같거나 이질성이 없다는 증거가 아니다.
ESPN 현재 선수 ID는 NBA 과거 선수 ID와 이름으로 합치지 않는다. 현재 관측과 과거 career 기간을 명시한다.

## 일일 발행 경로

`.github/workflows/season-publications.yml`은 매일 10:50·21:50 UTC와 수동 실행을 지원한다.

1. read-only `collect` job은 NBA L2M, ESPN 현재 박스스코어, NBA ShotChartDetail을 각자 수집·검증한다.
   DB 연결은 Shooting의 점수·경기 식별 대조용 SELECT이며 fixture rekey나 데이터 변경은 하지 않는다.
2. 각 후보는 이전 dataset hash, source 기준일·경기 ID·커버리지·생성 시각을 보존한다.
   실패/미게시 항목은 다른 항목의 성공을 막지 않으며 기존 정상 공개본을 대체하지 않는다.
3. 별도 `publish` job만 contents write를 갖는다. 신뢰된 코드로 후보를 재검증하고
   `data-publications` 브랜치에 `manifest.json`과 SHA-256 주소의 append-only blob을 원자적으로 commit한다.
   main에 push하거나 PR을 자동 merge하지 않는다. 데이터 브랜치의 고정 `vercel.json`은 자동 앱 배포를 끈다. 동일 dataset의 stale 후보는 제외하고 Git 동시 push 충돌은 거절한다. 최종 검증·커버리지 역행도 해당 모듈만 실패 처리한다.
4. manifest의 시즌별 `history` 참조와 append-only blob은 다음 시즌에도 보존한다. 새 서버에서도 과거 시즌의 최종 공개본을 읽으며 앱의 개막 fallback으로 되돌리지 않는다.
   서버는 고정 저장소의 manifest와 content hash를 검증한다. 외부 URL·임의 경로·초과 크기·변조 JSON을 거절한다.
   오래된 manifest도 이전 blob을 유지하므로 같은 공개본의 요약·경기·상세를 일관되게 읽는다.
5. 조회 실패 시 브랜치의 마지막 정상 공개본 또는 앱에 묶인 fallback과 실제 자료 날짜를 제공한다.
   새 서버가 과거 다른 서버의 최신 자료를 기억한다고 보장하지 않는다. 캐시는 최대 수분 지연을 허용한다.

정상 workflow 종료가 모든 공급자의 새 자료 성공을 뜻하지 않는다. 각 dataset의 `checks.status`와 실제 through를 확인한다.
기존 `officiating-refresh.yml`은 수동 조사·archive PR용으로만 남긴다. 현재 시즌 일일 공개는 새 workflow가 담당한다.
데이터 갱신은 앱 소프트웨어 릴리스와 별개이며 매일 package version/tag를 만들지 않는다.
앱/검증기/워크플로 변경은 기존 PR preview·CI·독립 리뷰·앱 릴리스 절차를 따른다.

## 공급자 경계와 운영 확인

hoopR 파일의 연도 의미는 실제 GAME_ID·날짜로 확인해야 한다. 조사 당시 live 2026 파일은 2025–26,
2027 파일은 404였으므로 현재 관측은 검증된 ESPN summary ID로 별도 생성한다.
NBA ShotChartDetail은 환경에 따라 응답하지 않는다. 실패 시 새 시즌 지도나 모델 값을 만들지 않는다.
과거 DB 표면의 학습 기간·원본 날짜가 저장되어 있지 않으면 미확인으로 표시한다.

실행 예시(저장소 루트, Python 계약 의존성 설치 후):

```sh
python scripts/collect_daily_publications.py --out /tmp/season-publications
python scripts/publish_daily_publications.py --stage /tmp/season-publications
```

두 번째 명령은 외부 데이터 브랜치에 쓰므로 검증된 운영 실행에서만 사용한다.
로컬 준비 검증에는 `--publication-root /tmp/isolated-publication`을 추가해 Git push 없이 검사한다.
원본 수집 증거는 workflow artifact, 앱·데이터 공개 완료 증거는 dated release record로 남긴다.

## 2026-10-26 — Shooting 자동 재계산과 실패 감지

Shooting은 기존 10:50·21:50 UTC 일정마다 해당 시즌의 완료 경기와 선수 박스스코어를
다시 읽어 개인 출전 이력·전체 시도·각 휴식군을 재계산한다. 정규 데이터 갱신에는 앱 릴리스가
필요하지 않다. GitHub의 실제 예약 실행은 지연될 수 있다.

Shooting 수집·검증은 최대 3회 시도하며, 기존 전체 900초 예산 안에 검증과 재시도 대기를
포함한다. 각 시도는 이전 임시 출력을 지우고 새 결과를 검증한다. 공급자·검증 실패는 경기
없음으로 바꾸지 않는다. 실패가 소진되어도 정상본과 다른 모듈의 발행은 보존한다.

발행 workflow의 필수 Shooting 검증은 부분 발행 이후에 실행된다. 새로 읽고 고정한 remote
Git head에서 이번 candidate의 checkedAt, 자료 해시·크기·시즌·생성 시각과 실제 blob을
대조한다. 수집 실패, 발행 거절, 오래된 base로 제외된 후보, 읽기·해시 불일치는 run을 실패로
표시한다. 다른 모듈의 기존 공급자 장애는 Shooting 검증의 실패 사유로 삼지 않는다.

완료된 정규시즌 경기가 없다는 명시적 자료만 0경기 예외로 허용한다. 같은 시즌에 이미 양수
coverage가 게시되어 있다면 0경기 응답을 정상으로 처리하지 않는다. 쉬는 날에는 새 경기가
추가되지 않아도 같은 경기 집합을 검증한 새 정상 자료가 성공이다.

이 검증은 실행된 갱신과 발행 저장소를 확인한다. GitHub 예약 실행 자체의 누락, 상위 DB
수집의 누락을 검출하는 독립 감시기는 아니며, 서비스에는 기존 수분 단위 캐시 지연이 있다.
GitHub 실패 run의 이메일 알림은 owner의 GitHub 알림 설정에 따른다.
