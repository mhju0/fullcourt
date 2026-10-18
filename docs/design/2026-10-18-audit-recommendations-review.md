# Independent audit implementation review

Owner-approved scope, 2026-10-18: all F01–F09, the two additional Recommended decisions,
applicable Studio Illicit guidance, and very subtly sky-blue whites. The original audit at
`docs/audit/2026-10-18-independent/index.html` is a local historical artifact, not a live status page.

| Recommendation | Implementation and acceptance behavior |
| --- | --- |
| F01 | Analysis preserves native table rows/cells; a native Details button opens the dialog. Row pointer shortcut focuses that button first. Enter, Space, nested drill/back and Escape focus return are exercised. |
| F02 | Games labels response receipt Checked, separately explaining final-only scores and the estimated LIVE label. |
| F03 | Board guide describes the score ranges and links to Model Results for historical baseline comparisons; no isolated win rates. |
| F04 | Fatigue is estimated schedule load; time-zone adjustment is named as a model rule. Numerical model unchanged. |
| F05 | Methods scopes uncertainty styling to the individual study legend. |
| F06 | API forwards missingFixtureGames separately from provisional. Confirmed 2023–24 through 2026–27 calendars use 1,230 regular fixtures; earlier/unknown calendars return null. Published held fixtures count toward coverage before analytic exclusion. |
| F07 | Automatic fallback describes missing required rest data, even when final scores exist. |
| F08 | Analysis has a visible Details action; Shooting has stateful chevrons, explicit accessible action names and a 44px target. |
| F09 | Season failures and missing-comparison responses provide a retry bound to the selected report. Repeated failure retains retry/focus; success restores figures. |
| Schedule shortcut | Team labels link to Games by Team with both season and team preserved; numerical cells remain data. |
| Home unit | The large-gap finding explicitly says fatigue-score points. |
| Studio Illicit | Clear action feedback, local recovery, consistent surfaces and readable hierarchy. Existing Home motion stays brief and respects reduced motion; repeated controls stay immediate. |
| Palette | Page #F3F8FC, panels #FBFDFF, secondary #EAF2F8; cool off-white #F2F8FD on the dark Home. Semantic data hues and indigo retain their jobs. Browser/PWA theme colors align. |

The 1,230-fixture expectation is supported by the [NBA schedule notes](https://www.nba.com/news/2026-27-nba-schedule-notes-numbers-to-know).
It describes fixture coverage in FullCourt's database, not a guarantee about provider completeness.

## Verification checkpoint

- Frozen source candidate `ea0e5b85a75155fc2db3e8d7fbb5419f191b2662`: 1,233 unit tests in 100 files pass; typecheck and build pass; lint has no errors and two existing unused-variable warnings in cron-update.test.ts. Production dependency audit has no known vulnerabilities.
- Independent Astra reviewed all 32 changed files against `460a3fe`; no blocking defect. Accepted one API documentation correction. Final narrow delta and browser acceptance are recorded below when complete.
- Real database-backed local Schedule API: 2026–27 scheduledGames 1,200; missingFixtureGames 30; provisional true. No database writes performed.
- Initial targeted browser run: 9 pass; five new assertion failures were CSS hex case, heading punctuation, and Next's global route announcer. Corrected the assertions; the five affected cases pass. No product fix was needed for those failures.
- Manual 390px inspection shortened the new table action from Game details to Details to avoid needless wrapping. The accessible matchup action name remains explicit.

Pending at this checkpoint: rebuilt narrow label change, final targeted browser acceptance, site-wide rendered accessibility sweep, preview and release decision. No production deployment claimed.

Physical iPhone, human screen-reader use, native zoom and opening-night provider/writer validation remain distinct from browser simulation and controlled API fixtures.
