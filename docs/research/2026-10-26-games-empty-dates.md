# Games: 빈 날짜와 일정 사유

2026-10-26 확인. 날짜는 모두 America/New_York 기준이다.

## 승인한 표시

- 정규시즌의 첫 공개 경기일부터 마지막 공개 경기일까지 빈 날짜도 선택한다.
  10월 개막 전과 4월 종료 후를 채우지 않는다. 실제 경기 없는 비시즌 월도 추가하지 않는다.
- 일반 빈 날짜: `No games scheduled for this day.`
- 올스타 휴식기: `All-Star break.`
- Cup 미정: `NBA Cup schedule pending. Matchups to be announced.`
- 확정된 빈 날짜는 GAMES 0, AVG REST GAP과 3+ REST EDGES는 대시다.
  경기 수가 아직 미정인 Cup 날짜는 TBD를 쓴다. 실제 경기 행이 항상 사유보다 우선한다.
- antislop은 owner 선택에 따라 작업 중 적용한다.

## 현재 시즌의 모든 빈 날짜

프로덕션 `/api/games/dates?season=2026-27`을 읽었다. 공개 경기 범위는
2026-10-20부터 2027-04-11까지이며, 그 안의 빈 날짜는 아래 18개다.

| 날짜 | 표시할 사유 | 근거 |
|---|---|---|
| 2026-11-03 | Election Day. No games scheduled. | 공식 일정 발표의 투표 참여 안내 |
| 2026-11-26 | Thanksgiving. No games scheduled. | 추수감사절 날짜와 빈 공식 정규시즌 일정 |
| 2026-12-04~10 | NBA Cup schedule pending. Matchups to be announced. | 그룹 경기 결과에 따라 추가 배정하는 정규시즌 경기 기간 |
| 2026-12-11 | NBA Cup Championship. No regular-season games scheduled. | 결승은 정규시즌 집계 제외 |
| 2026-12-24 | Christmas Eve. No games scheduled. | 크리스마스이브 날짜와 빈 정규시즌 일정 |
| 2027-02-19~24 | All-Star break. | 공식 주요 일정의 휴식기 |
| 2027-04-10 | League off day before the regular-season finale. | 공식 일정 발표의 최종 주말 안내 |

공식 1차 출처:

- [NBA Communications: 2026-27 일정 발표](https://pr.nba.com/2026-27-nba-regular-season-schedule/)
  (2026-08-13): 팀별 미배정 두 경기의 12월 4~10일 범위, 선거일, 최종 주말.
- [NBA Cup 101](https://www.nba.com/news/nba-cup-101): Cup 대진 배정과 결승의 정규시즌 제외.
- [NBA 주요 일정](https://www.nba.com/news/key-dates): 2027년 2월 19~24일 올스타 휴식기.
- [Hornets 공식 2025-26 미디어 가이드](https://cdn.nba.com/teams/uploads/sites/1610612766/2026/04/2025-26_CHA_MediaGuide_NEW.pdf):
  2026년 2월 13~18일 올스타 휴식기.
- [RealGM 빈 일정 표시](https://basketball.realgm.com/schedules/2026-08-30/NBA):
  간결한 `No games scheduled.` 문구 참고. 실제 제품 문구는 owner가 고른 안을 사용한다.

## 정확성 경계

NBA FAQ에는 같은 문서의 녹아웃 일정과 충돌하는 12월 9~15일 문장이 남아 있다.
구체적인 12월 4~10일을 명시한 리그 일정 발표를 우선한다.

Cup 미정 상태는 명시한 시즌·날짜와 그룹 경기 종료일까지의 확인된 상태에만 적용한다.
그 이후에도 행이 없으면 일정 미수집과 경기 없음은 구분한다. 지난 Cup 날짜를 영구적으로
TBD라 쓰거나 누락된 행만으로 리그가 미발표 상태라고 추정하지 않는다.

역사적 올스타 범위는 검증된 두 시즌만 등록한다. 임의의 2월 공백을 올스타 휴식기로
추정하지 않는다. 1999년은 취소됐고, 2021년은 3월에 열렸다. 다른 과거 시즌은
검증한 사유가 없으면 일반 빈 날짜 문구를 쓴다. 휴일 이름은 달력상 사실을 표시하며,
방송·수익·가족 휴가 등 리그의 의도는 근거 없이 덧붙이지 않는다.

날짜 API는 기존 `publishableGames()`를 유지한다. 잠금 시즌의 늦은 개막, 5월의 실제 경기,
2019-20 비정상 구간 제외를 보존한다. 화면의 빈 날짜를 위해 DB에 가짜 경기를 만들지 않는다.
