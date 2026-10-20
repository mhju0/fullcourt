# 경기장 보정 전후 공개 수치 비교

매니페스트 SHA256: `6cc5f11f24199936c118dc112ec47147eba275e8a7d522d5fbad87a71d0f70b6`. 고정된 후보 스냅샷 비교이며 프로덕션 적용·배포 확인과 구분합니다.

[검토용 HTML](before-after.html) · [30팀 경기장 출처](arena-eras.csv) · [예외 경기 출처](fixture-venues.csv)

| 모집단 | 수정 전 승 / 경기 | 수정 전 | 수정 후 승 / 경기 | 수정 후 | 정확한 승률 차이 |
|---|---:|---:|---:|---:|---:|
| 전체 · 더 쉰 홈팀 (0.5+) | 17,180 / 28,109 | 61.1% | 17,182 / 28,117 | 61.1% | -0.010277 pp |
| 전체 · 큰 격차의 홈팀 (5+) | 2,543 / 3,901 | 65.2% | 2,540 / 3,899 | 65.1% | -0.043504 pp |
| 전체 · 더 쉰 원정팀 | 4,530 / 10,676 | 42.4% | 4,527 / 10,670 | 42.4% | -0.004256 pp |
| 전체 · 홈 승률 기준선 | 28,225 / 47,094 | 59.9% | 28,225 / 47,094 | 59.9% | +0.000000 pp |
| 최근 완결 10시즌 · 더 쉰 홈팀 | 3,834 / 6,599 | 58.1% | 3,836 / 6,601 | 58.1% | +0.012695 pp |
| 최근 완결 10시즌 · 큰 격차의 홈팀 | 357 / 587 | 60.8% | 357 / 586 | 60.9% | +0.103785 pp |
| 최근 완결 10시즌 · 홈 기준선 | 6,670 / 11,863 | 56.2% | 6,670 / 11,863 | 56.2% | +0.000000 pp |
| 최근 완결 10시즌 · 더 쉰 원정팀 | 1,337 / 2,800 | 47.8% | 1,336 / 2,798 | 47.7% | -0.001608 pp |

독립 산술 검증: 수정 전 40,156개·수정 후 40,156개 항목, 불일치 0건. 실제 API 검증: 수정 전 보관 응답 50,581개·수정 후 로컬 응답 50,581개 항목, 불일치 0건.

오프라인 숫자 비교는 로컬 스냅샷·소스·보관 응답 파일만 읽었습니다. 별도 최종 API 검증에서는 고정된 후보에 연결된 로컬 앱에 HTTP GET 86회를 수행했습니다. 프로덕션 쓰기는 수행하지 않았습니다.

예정 경기 예측 8개 행, 1,207개 시즌·팀 행과 모든 시즌별 필드 변경 수를 CSV로 제공합니다. 채점된 정규 예측 27,420개, 표 외의 미채점 정규 예측 649개 및 기존 플레이오프 예측 3,149개는 값 전체가 동일합니다.

수정 전은 기존 소스와 당시 좌표를 사용했고, 수정 후는 후보 소스와 새 등록부를 사용했습니다. 독립 거리 계산은 각 소스가 해석한 좌표를 공유하므로 역사적 경기장 위치의 진실을 별도로 재입증하지 않습니다. 좌표 출처와 정확도 경계는 경기장 출처 표에 남겼습니다.

상세 검증 기록은 이 Markdown 옆이 아닌 로컬 비공개 감사 폴더 `docs/audit/arena-shooting-correction/comparison/final/`의 `summary.json`, `before/after-independent.json`, `before/after-api-parity.json`에 있습니다. HTTP 원본·해시는 `docs/audit/arena-shooting-correction/comparison/api-after/capture-manifest.json`에 보존했습니다. 이 감사 폴더는 gitignored이며 공개 HTML·CSV와 별도로 보관됩니다.

전체 CSV:

- [all-analysis-numbers.csv](before-after-all-analysis-numbers.csv)
- [all-season-mileage-ranks.csv](before-after-all-season-mileage-ranks.csv)
- [all-season-report-norms.csv](before-after-all-season-report-norms.csv)
- [all-season-report-numbers.csv](before-after-all-season-report-numbers.csv)
- [all-season-schedule-edge-numbers.csv](before-after-all-season-schedule-edge-numbers.csv)
- [all-season-schedule-edge-ranks.csv](before-after-all-season-schedule-edge-ranks.csv)
- [all-season-summary.csv](before-after-all-season-summary.csv)
- [all-season-team-comparison.csv](before-after-all-season-team-comparison.csv)
- [forecast-changes.csv](before-after-forecast-changes.csv)
- [headline.csv](before-after-headline.csv)
- [manifest-field-changes-detail.csv](before-after-manifest-field-changes-detail.csv)
- [manifest-field-counts-by-season.csv](before-after-manifest-field-counts-by-season.csv)
