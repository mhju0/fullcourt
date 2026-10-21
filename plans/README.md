# Motion fixes · 2026-10-14

Historical implementation and verification record. Pending-production statements below describe
the October 14 checkpoint; current release state belongs to [the handoff](../docs/PROJECT_HANDOFF.md)
and [release history](../CHANGELOG.md).

Baseline: `2d458dfdf2baec2d135c7bf7c6554efa5af91b28`. Execute 001→005; no dependencies. Only these five selected findings are authorized.

| Plan | Severity | Status |
| --- | --- | --- |
| [001 Disable repeated Analysis tooltip movement](001-analysis-tooltips.md) | HIGH | IMPLEMENTED · locally verified |
| [002 Reuse shared Games control feedback](002-games-controls.md) | MEDIUM | IMPLEMENTED · locally verified |
| [003 Respect reduced motion for Analysis drill scrolling](003-analysis-drill-scroll.md) | MEDIUM | IMPLEMENTED · locally verified |
| [004 Show fatigue fills immediately](004-fatigue-bar.md) | MEDIUM | IMPLEMENTED · locally verified |
| [005 Stop guide rotation transitions with reduced motion](005-schedule-guide.md) | MEDIUM | IMPLEMENTED · locally verified |

## Verification · 2026-10-14

Acceptance: implement exactly the five selected fixes, preserve existing data, handlers, static feedback and normal-mode exceptions. No optional motion, dependency, model, schema or analytics changes. All five requirements were implemented, exercised and locally verified. Production is unverified and deployment is pending the owner's database credential rotation and explicit merge approval.

Environment: Node 22.13.0, pnpm 11.8.0, Next 16.3.8, installed Recharts 3.8.1, Playwright Chromium; built server `http://localhost:3124`. PostgreSQL 18 restore `fullcourt_remediation` on localhost:55432: `current_database()|default_transaction_read_only|games count` returned `fullcourt_remediation|on|51695`. The app URL also sets `default_transaction_read_only=on`. No production credentials or database writes were used.

### Corrected regression evidence

Before source edits, the final baseline run used explicit `page.setViewportSize({width:1440,height:900})`, `innerWidth === 1440`, `page.emulateMedia` and a `matchMedia` assertion for each preference. `pnpm exec playwright test e2e/motion-accessibility.spec.ts --grep '1440px' --reporter=list` against baseline `2d458df` completed **exit 1: 7 expected failures, 3 preservation passes**.

| Requirement | Baseline failure | Candidate observed outcome |
| --- | --- | --- |
| 001 Analysis tooltips | Normal tooltip transition duration `0.4s`, expected `0s` | Both charts: `0s`; pointer and ArrowRight content still available |
| 002 Games controls | Normal individual scale did not use shared transform; reduced active scale `0.95`, expected `none` | Shared normal transform `.97`, 90ms/120ms timing; reduced transform/scale `none`, duration `0s`; keyboard/date selection works |
| 003 Analysis drill scroll | Reduced drill requested `smooth`, expected `instant` | Normal `smooth`, reduced `instant`; threshold filter `2`, `block:start`, destination visible; original 60ms retained in source |
| 004 Fatigue fill | Both preferences transition duration `0.5s`, expected `0s` | `0s`; percentage width and tone colors preserved |
| 005 Schedule guide | Reduced transition property `transform, translate, scale, rotate`, expected `none` | Reduced `none`; normal 200ms; native Enter/click disclosure and `rotate:180deg` work |

Recharts' installed `auto` default already respects reduced motion when it is actually emulated; 001 fixes the normal-mode 400ms movement and keeps both modes immediate. Tailwind uses individual `scale`/`rotate` properties, so tests inspect those in addition to `transform`.

The final built-server command was:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3124 pnpm exec playwright test \
  e2e/motion-accessibility.spec.ts e2e/games.spec.ts e2e/navigation.spec.ts \
  e2e/analysis.spec.ts e2e/analysis-season-comparison.spec.ts \
  e2e/schedule-disparity.spec.ts e2e/home.spec.ts --reporter=list
```

It completed **exit 0: 98/98 passed**, including all **20/20** selected-fix cases at asserted 390/1440px and normal/reduced preferences. These use the connected local API/database paths; the existing season-comparison and status/error regressions also use their documented synthetic responses. The entire product was not retested.

### Gates and rejected harness runs

| Check | Completed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0; unchanged lockfile/dependencies |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | final exit 0 |
| `pnpm test:run` | exit 0; 90 files, 1,148 tests |
| `pnpm build` | final exit 0; optimized build and TypeScript completed |
| `pnpm audit --prod` | exit 0; no known vulnerabilities |
| `pnpm docs:check` | exit 0; local targets resolve |
| `git diff --check` | exit 0 |

Preliminary runs are superseded and are not completion evidence. The first harness incorrectly supplied `reducedMotion` to `test.use`; Playwright ignored it, and TypeScript/build rejected it:

```text
e2e/motion-accessibility.spec.ts(27,52): error TS2353: Object literal may only specify known properties, and 'reducedMotion' does not exist in type 'Fixtures<{}, {}, PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>'.
Failed to type check.
[ELIFECYCLE] Command failed with exit code 1.
```

The unsupported fixture was removed. Explicit viewport/media calls and assertions now establish the actual browser conditions before every case. Early scroll-observer and CSS-property selector errors were also corrected before the final baseline above.

### Limits

Browser verification measures rendered CSS, mouse/keyboard interactions, real scroll/filter wiring, existing route/record behavior and nearby responsive layout. At 390px the existing Games fatigue columns are hidden; their retained DOM CSS was inspected, while visible fatigue fills were exercised on desktop. No physical touch device, screen-reader session, manual 10% animation playback, production preview or deployed verification is claimed. The built server is available for the root's independent visual review; deployment remains pending.
