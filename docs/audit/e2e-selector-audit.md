# E2E 셀렉터 감사 (2026-07-04)

READ-ONLY 감사. 코드/스펙 미수정, git 명령 미실행, 테스트 미실행. 목적: 현재 UI 5페이지의
실제 셀렉터를 확정하고 기존 Playwright 스펙 3개(home/analysis/navigation)의 stale 지점을
전수 대조해 재작성 근거를 만든다.

## 1. Inventory — 현재 라우트 (디스크 기준)

`command find src/app -name "page.tsx"` 결과 5개:

| 경로 | 파일 | 컴포넌트 유형 | nav 노출 |
|---|---|---|---|
| `/` | `src/app/page.tsx:204` | client component (`"use client"`, 자체 h1 포함) | Yes |
| `/analysis` | `src/app/analysis/page.tsx:10` | server wrapper → `AnalysisContentLazy`(dynamic, ssr:false) → `AnalysisContent`(client). **h1은 lazy 컴포넌트 안에 있음** | Yes |
| `/upcoming` | `src/app/upcoming/page.tsx:8` | server wrapper, h1은 page.tsx 자체에 있고 본문만 `UpcomingContentLazy` | Yes |
| `/playoffs` | `src/app/playoffs/page.tsx:8` | server wrapper, h1은 page.tsx 자체, 본문만 `PlayoffsContentLazy` | Yes |
| `/shot-quality` | `src/app/shot-quality/page.tsx:8` | server wrapper, h1은 page.tsx 자체, 본문만 `ShotQualityContentLazy` | Yes |

[Verified `src/app/page.tsx`, `src/app/analysis/page.tsx:1-12`, `src/app/upcoming/page.tsx:1-28`, `src/app/playoffs/page.tsx:1-29`, `src/app/shot-quality/page.tsx:1-29`]

**주의**: `/analysis`만 h1을 lazy 컴포넌트(`analysis-content.tsx:690`)에 두고, 나머지 3개
(`/upcoming`, `/playoffs`, `/shot-quality`)는 h1을 서버 래퍼 page.tsx 자체에 둔다.
`analysis/page.tsx:8-9`의 주석이 이 비대칭을 명시적으로 설명함 ("keep it there to avoid a
duplicate heading"). [Verified]

## 2. nav 실제 구조

```ts
// src/components/nav-bar.tsx:7-13
const NAV_LINKS = [
  { href: "/", label: "TODAY'S GAMES" },
  { href: "/analysis", label: "ANALYSIS" },
  { href: "/upcoming", label: "PICKS" },
  { href: "/playoffs", label: "PLAYOFFS" },
  { href: "/shot-quality", label: "SHOT QUALITY" },
] as const
```

[Verified `src/components/nav-bar.tsx:7-13`]

- nav 링크 5개 전부 노출. `playoffs`, `shot-quality` 둘 다 nav에 **있음** — "nav에서 빠져있을 것"이라는
  가정은 틀렸다. [Verified]
- 렌더 텍스트는 label 그대로 (`"TODAY'S GAMES"` 등, 이미 전부 대문자) — 별도의 `.toUpperCase()` 변환 없음
  (`nav-bar.tsx:103`에서 `{label}` 그대로 출력). [Verified `src/components/nav-bar.tsx:89-105`]
- active 링크 색상은 `var(--term-red)`이고 `--term-red: #C9082A`(`globals.css:118`) = `rgb(201, 8, 42)`.
  인라인 style로 적용, class 아님. [Verified `src/components/nav-bar.tsx:99`, `src/app/globals.css:118`]
- 상단 status bar(28px, FULLCOURT 워드마크 + 시즌 라벨 "2025-26 SEASON" 하드코딩)와 티커 스트립(26px,
  `--term-blue` 배경, 팀 6개 하드코딩 mock 데이터)이 nav 위/아래에 존재 — 실제 데이터 아님, 셀렉터로 쓰기엔
  불안정한 장식용 콘텐츠. [Verified `src/components/nav-bar.tsx:15-22, 24-26, 111-152`]
- **"Prediction Tracker" / `/tracker` 라벨·라우트는 코드 어디에도 존재하지 않는다**
  (`grep -rniE "prediction tracker|/tracker" src e2e` → 0 hits). 감사 질문이 가정한 의심 지점 자체가
  현재 코드베이스에 없다. [Verified — 0 매치]

## 3. 페이지별 안정 셀렉터

| 경로 | h1 실제 텍스트 | eyebrow (heading 아님) | `data-testid` | 추천 전략 |
|---|---|---|---|---|
| `/` | `"Today's Matchups"` (`page.tsx:421`) | `"REST ADVANTAGE DASHBOARD"` (span, `page.tsx:418-420`) | `selected-date-display` (`page.tsx:542`) — **저장소 전체에서 유일한 testid** | role(heading) + 기존 testid 활용 |
| `/analysis` | `"Rest Advantage Analysis"` (`analysis-content.tsx:690`, **lazy 컴포넌트 내부**) | `"HISTORICAL BACKTEST"` (`analysis-content.tsx:687-689`) | 없음 | role(heading), 초기 로딩 스켈레톤 대기 필요 |
| `/upcoming` | `"Future Games"` (`upcoming/page.tsx:19`, 서버 래퍼) | `"2025–26 SEASON"` (`upcoming/page.tsx:13-18`, en-dash 주의) | 없음 | role(heading) — DB 없이도 즉시 렌더 |
| `/playoffs` | `"Series Predictions"` (`playoffs/page.tsx:19`) | `"PLAYOFF PREDICTOR"` (`playoffs/page.tsx:13-18`, 색상 하드코딩 `#C9082A`, CSS 변수 아님) | 없음 | role(heading) — DB 없이도 즉시 렌더 |
| `/shot-quality` | `"Expected Shot Value"` (`shot-quality/page.tsx:19`) | `"EXPECTED SHOT VALUE · xeFG%"` (`shot-quality/page.tsx:13-18`, 색상 하드코딩 `#C9082A`) | 없음 | role(heading) — DB 없이도 즉시 렌더 |

[Verified 각 file:line 상기 표 참조]

**testid 부재 범위**: 저장소 전체(`src/components`, `src/app`)에서 `data-testid`는
`src/app/page.tsx:542` 단 1건. 나머지 4개 페이지는 role/text 기반 셀렉터로만 재작성 가능.
[Verified `grep -rn "data-testid" src/components src/app` → 1 hit]

## 4. 기존 스펙 stale 대조

### `e2e/home.spec.ts`

| 위치 | assertion 요약 | 현재 코드 실제값 | 판정 |
|---|---|---|---|
| `home.spec.ts:8` | heading `"Today's Matchups"` | `page.tsx:421` h1 텍스트 동일 | [Verified 일치] |
| `home.spec.ts:11` | `getByLabel("Season")` | `page.tsx:438-440` `<label htmlFor="nba-season">SEASON</label>` — 문자열 매칭은 대소문자 무시 substring이라 매치 | [Verified 일치] |
| `home.spec.ts:12` | `getByRole("button", { name: /^Oct$/ })` | 버튼 실제 텍스트는 `{label.toUpperCase()}` → `"OCT"` (`page.tsx:485`, 라벨 소스는 `nba-season.ts:24` `"Oct"`). Playwright는 **정규식 name은 대소문자를 자동 무시하지 않음**(flag 없음) → `/^Oct$/`는 `"OCT"`와 매치 실패 | [Verified 불일치 — 케이스 버그] |
| `home.spec.ts:13` | `getByRole("button", { name: /^Dec$/ })` | 동일 사유, 실제 텍스트 `"DEC"` | [Verified 불일치 — 케이스 버그] |
| `home.spec.ts:19` | `getByTestId("selected-date-display")` | `page.tsx:542`에 동일 testid 존재 | [Verified 일치] |
| `home.spec.ts:37-38` | season select `"2024-25"`, 버튼 `/^Dec$/` | `NBA_SEASONS`(`nba-season.ts:8-18`)에 `"2024-25"` 포함 확인됨; `/^Dec$/`는 위와 동일 케이스 버그 | [Verified: 시즌값 일치 / 버튼 정규식 불일치] |
| `home.spec.ts:40` | `getByRole("button", { name: /December 25, 2024/ })` | `DateChip` `aria-label`이 `${longLabel}, ${gameCount} games`이고 `longLabel = format(...,"MMMM d, yyyy")` → `"December 25, 2024"` 포함, 케이스 그대로라 매치 | [Verified 일치] |
| `home.spec.ts:44-46` | `waitForResponse` url `/api/games/2024-12-25` | `page.tsx:342` `fetch(`/api/games/${selectedDateKey}`)` 패턴과 일치 | [Verified 일치] |
| `home.spec.ts:49` | `page.getByText(/\b[A-Z]{3}\s*@\s*[A-Z]{3}\b/)` (matchupHeading) | **`MatchupCard`(`matchup-card.tsx`) 어디에도 이런 패턴의 텍스트 노드가 없음.** away/home 팀 약어는 각각 `TeamBlock`(line 203-205)의 별도 span에 들어있고, 그 사이엔 `FatigueBarsBlock`이 위치 — `"@"` 문자 자체가 홈페이지 카드 안에 존재하지 않음(`"@"`는 `/analysis`의 ExploreGames 테이블(`analysis-content.tsx:516`)과 `/upcoming` 테이블(`upcoming-content.tsx:214`)에만 있음). **이 assertion은 홈페이지에서 매치할 대상이 없어 타임아웃/실패한다** | [Verified 불일치 — 핵심 회귀] |
| `home.spec.ts:52` | `.tabular-nums` + `/\d+\.\d/` | `FatigueBarRow` score span(`matchup-card.tsx:238-240`, `score.toFixed(1)`)이나 홈 `StatCard`(`page.tsx:57`, `avgRestAdv.toFixed(1)`)가 매치 대상 제공 | [Verified 일치 — 단, 위 항목이 먼저 실패하므로 도달 못 함] |
| `home.spec.ts:59` | 버튼 `/^Oct$/` | 위와 동일 케이스 버그 | [Verified 불일치] |
| `home.spec.ts:63-66` | `waitForResponse` url `/api/games/dates` & `month=10` | `page.tsx:273-275` `params.set("month", String(month))` 패턴과 일치 | [Verified 일치] |
| `home.spec.ts:68` | `button[aria-label*="games"]` | `DateChip` `ariaLabel`이 항상 리터럴 `"games"` 포함(`page.tsx:519`, 단수/복수 무관하게 하드코딩) | [Verified 일치] |
| `home.spec.ts:79` | text `"NO GAMES SCHEDULED"` | `EmptyState` p 텍스트(`page.tsx:141`) 동일 | [Verified 일치] |

**home.spec.ts 결론**: 대소문자 정규식 버그(월 탭 `/^Oct$/` `/^Dec$/`, 총 3곳)와 "@" 패턴 텍스트
매칭 완전 소실(1곳, 3번째 테스트를 사실상 무력화) — 4개 테스트 중 2개가 stale 어설션으로 실패할 것으로
판단됨(테스트 3, 4).

### `e2e/analysis.spec.ts`

| 위치 | assertion 요약 | 현재 코드 실제값 | 판정 |
|---|---|---|---|
| `analysis.spec.ts:9` | heading `"Rest Advantage Analysis"` | `analysis-content.tsx:690` h1 동일 | [Verified 일치] |
| `analysis.spec.ts:12` | text `"OVERALL WIN RATE"` | `StatCard label` (`analysis-content.tsx:700`) 동일 | [Verified 일치] |
| `analysis.spec.ts:15` | text `"WIN RATE BY RA THRESHOLD"` | `SectionDivider label` (`analysis-content.tsx:720`) 동일 | [Verified 일치] |
| `analysis.spec.ts:16` | text `"HOME TEAM MORE RESTED"` | `SectionDivider label` (`analysis-content.tsx:785`) 동일 | [Verified 일치] |
| `analysis.spec.ts:17` | text `"WIN RATE BY SEASON"` | `SectionDivider label` (`analysis-content.tsx:809`) 동일 | [Verified 일치] |
| `analysis.spec.ts:14` (주석) | `"current markup — no text-7xl hero"`이라고 스펙이 자체 명시 | `analysis-content.tsx` 전체에 `text-7xl`/`rounded-3xl` 클래스 없음(현재 스타일은 `termCardStyle` 기반) | [Verified — 스펙이 이미 최신 마크업 인지하고 작성됨] |

**analysis.spec.ts 결론**: **stale하지 않음.** 감사 질문이 전제한 `text-7xl`/`rounded-3xl`/섹션
문구 케이싱 문제는 현재 스펙 파일에 존재하지 않는다 — 이미 터미널 디자인 기준으로 재작성되어 있고,
5개 assertion 전부 현재 코드와 1:1 일치. 이전 세션에서 이미 손댄 것으로 추정됨. [Inferred: 과거 재작성 이력]

### `e2e/navigation.spec.ts`

| 위치 | assertion 요약 | 현재 코드 실제값 | 판정 |
|---|---|---|---|
| `navigation.spec.ts:10` | `getByRole("navigation", { name: "Main navigation" })` | `nav-bar.tsx:86` `aria-label="Main navigation"` 동일 | [Verified 일치] |
| `navigation.spec.ts:11-13` | 링크명 `"Today's Games"`, `"Analysis"`, `"Picks"` | 실제 label은 전부 대문자(`"TODAY'S GAMES"` 등, `nav-bar.tsx:8-10`)지만 문자열 name 매칭은 대소문자 무시 substring이라 매치됨 | [Verified 일치 — 문자열 매칭이라 안전] |
| `navigation.spec.ts:4, 19` | `ACTIVE_COLOR = "rgb(201, 8, 42)"` | `--term-red: #C9082A`(`globals.css:118`) = `rgb(201, 8, 42)`, active 링크 색상으로 사용(`nav-bar.tsx:99`) | [Verified 일치] |
| `navigation.spec.ts:22, 26, 30` | URL 패턴 `/\/analysis$/`, `/\/upcoming$/`, `/\/$/` | `NAV_LINKS`의 href와 일치(`nav-bar.tsx:9-10`) | [Verified 일치] |
| — | "Prediction Tracker"/`/tracker`/`toHaveClass(/17408B/)` 존재 여부 | **이 스펙 파일에 해당 문자열/셀렉터가 전혀 없음**. `toHaveClass`도 쓰이지 않고 전부 `toHaveCSS`(인라인 style 검증)로 작성돼 있어 class 기반 색상 검증 자체가 없음 | [Verified — 감사가 전제한 문제 자체가 부재] |

**navigation.spec.ts 결론**: **stale하지 않음.** 5개 assertion 전부 현재 코드와 일치. 감사 질문이
지목한 의심 지점("Prediction Tracker", `/tracker`, `toHaveClass(/17408B/)`)은 이 파일에 존재하지
않으며, nav 링크 5개 중 3개(`playoffs`, `shot-quality` 미검증)만 커버하는 점이 커버리지 갭으로
남는다.

## 5. DB 의존성 요약

- `/` (홈): 월 탭·시즌 셀렉트·h1·eyebrow는 정적 렌더, DB 무관. 날짜 목록(`/api/games/dates`)과
  경기 카드(`/api/games/:date`)는 DB 의존 — 실패 시 `ErrorState`, 빈 배열이면 `EmptyState`
  ("NO GAMES SCHEDULED") 렌더. 결정론적 폴백 있음. [Verified `page.tsx:261-361, 564-581`]
- `/analysis`: h1·eyebrow·모든 섹션 디바이더 텍스트가 **`/api/analysis` 성공 후에만** 렌더됨
  (`loading` 중엔 `AnalysisSkeleton`, `error || !data`면 "FAILED TO LOAD ANALYSIS" 대체 렌더 —
  h1 자체가 안 뜸). 의미 있는 콘텐츠 전부가 라이브 데이터 의존. [Verified `analysis-content.tsx:604, 651-667, 683-695`]
- `/upcoming`: h1("Future Games")·eyebrow는 서버 래퍼(`upcoming/page.tsx`)에 있어 DB 없이 즉시
  렌더. 테이블 본문(`UpcomingContent`)만 `/api/games/upcoming` 의존, 오프시즌엔 결정론적
  `OffSeasonEmptyState` 렌더. [Verified `upcoming/page.tsx:8-28`, `upcoming-content.tsx:103-104, 172-182`]
- `/playoffs`: h1("Series Predictions")·eyebrow는 서버 래퍼에 있어 DB 없이 즉시 렌더. 본문은
  `PlayoffsContentLazy` 내부 데이터 의존(내용까지는 이번 감사 범위 밖, 스켈레톤만 확인). [Verified `playoffs/page.tsx:8-29`]
- `/shot-quality`: h1("Expected Shot Value")·eyebrow는 서버 래퍼에 있어 DB 없이 즉시 렌더. 본문은
  `ShotQualityContentLazy` 내부 데이터 의존(스켈레톤만 확인). [Verified `shot-quality/page.tsx:8-29`]

## 6. 우선순위별 약점 목록 (재작성 근거 — 수정 아님)

1. **[HIGH] `home.spec.ts:49` "@" 텍스트 매칭 완전 소실** — `MatchupCard`가 팀 약어를 인접한
   "AWY @ HOM" 텍스트로 렌더하지 않게 된 이후 회귀. 테스트 3 전체가 무력화됨.
2. **[HIGH] `home.spec.ts` 월 탭 정규식 케이싱 버그 3곳** (`:12, :13, :59`) — 버튼 텍스트가
   `toUpperCase()`로 렌더되는데 정규식엔 대소문자 무시 플래그가 없어 실패. 테스트 1, 3, 4에 영향.
3. **[MED] testid 커버리지 0/5(신규 4페이지)** — `/analysis`, `/upcoming`, `/playoffs`,
   `/shot-quality` 전부 role/text 셀렉터 의존 강제. 향후 문구 변경 시 스펙이 다시 stale해질
   구조적 리스크.
4. **[LOW] `navigation.spec.ts` 커버리지 갭** — `playoffs`/`shot-quality` 링크는 nav에 존재하고
   nav-bar.tsx에서 확인됐지만 스펙엔 없음. 현재 스펙 자체는 stale이 아니라 "불완전".
5. **[INFO] `/analysis` h1 위치 비대칭** — h1이 lazy 컴포넌트 내부에 있어 로딩 스켈레톤 대기
   없이 heading을 찾으면 타임아웃 위험 (다른 3페이지는 서버 래퍼에 h1이 있어 즉시 존재).

## 7. 열린 [Unknown] — 런타임 확인 필요

- 실제 브라우저에서 Playwright 정규식 name 매칭이 대소문자를 무시하는지는 문서 근거로만
  판단했음(코드로 100% 재현 불가, playwright 소스 미포함) — 3번 항목의 케이싱 버그는
  실행 전까지 [Inferred]에 가까움. 단, 이번 감사는 스펙 미실행 지시를 따랐으므로 별도
  세션에서 `pnpm test:e2e -g "loads matchups"` 실행으로 확정 필요.
- `PlayoffsContent`/`ShotQualityContent`/`ExploreGameDetailModal` 내부의 안정 셀렉터는 이번
  범위(질문 3의 5페이지 중 lazy 본문 내부)에 포함되지 않아 미조사 — 재작성 시 별도 조사 필요.
