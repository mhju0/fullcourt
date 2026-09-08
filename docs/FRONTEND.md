# Frontend

The application uses Next.js App Router, React, Tailwind, Base UI, Recharts, and SWR.
Dependency versions live in `package.json` and `pnpm-lock.yaml`. The shared visual direction is
[Brand grammar](design/BRAND_GRAMMAR.md); owner decisions are in the [design record](design/fullcourt-decision-record.md).

## Page ownership

| Route | Main question and presentation |
| --- | --- |
| `/` | Rest and schedule findings, derived from existing data sources; dark front door, Games primary action |
| `/games` | Matchup rest/schedule conditions; controls and games first, summaries beside them on desktop and below on mobile |
| `/season` | Completed results against the season's venue baseline, six initial team records with remaining teams expandable, five largest completed rest gaps including losses |
| `/schedule` | Relative schedule ranking and worth; breakdown and travel/workload in disclosures; completed-game fatigue calendar |
| `/explore` | Directory for the secondary basketball studies |
| `/analysis` | Historical model evaluation: The answer and The explorer |
| `/shooting` | Dense player comparisons with no-rest/3+ days eFG%, attempt counts, uncertainty, and expandable seasons; zero-rest workload disclosure |
| `/shot-quality` | Expected shot value by location; one mobile court with Compare models, two desktop courts |
| `/availability` | Missing-player associations, trends, and expandable coefficient comparison |
| `/playoffs` | Previous-round workload and the separate series model |
| `/officiating` | Selected NBA L2M findings and games-first report browser; source verdicts, clean games, shareable filters |
| `/about` | Brand story |
| `/behind-the-data/*` | Seven-topic overview; ten method articles with visible scope limits, compact topic/contents disclosures and expandable evidence |
| `/behind-the-data/referees/archive` | Earlier referee research and its historical table |

`/referees` redirects to `/officiating`; `/upcoming` redirects to `/games`. They remain for
existing links. No active page uses the retired OTHER menu or onboarding dialog.

## Shell and navigation

`src/app/layout.tsx` owns the container, page gutters, footer, and main landmark.
`primary-navigation.ts` defines Games / Season Report / Schedule Edge / Explore for both the
header and mobile dock. Explore stays marked for its child analyses. The page palette opens
from the footer or keyboard shortcut; it is navigation, not universal data search.

Explore uses six equal navigation tiles, in two columns on desktop and one on mobile.
`StudyLink` supplies a full-surface link with a visible arrow, descriptive action, and immediate
interaction feedback. Research and archive links remain compact. This pattern is for choosing
a destination; tables retain their existing density. See D-63 for the owner selection.

Use `PageHeader`, `MethodLink`, `SeasonSelector`, `DataTable`, `StatTile`, `StatFigure`, and
`MessageCard` where their contracts fit. The homepage and Officiating have approved presentation
exceptions. See [Adding a surface](ADDING_A_SURFACE.md) and its source tests before extending them.

## State and data

Games shares `season`, `date`, `view`, and expanded `game`. Explicit historical selection wins
over offseason defaults. Invalid dates fall back; valid no-game dates remain selected. A date
change clears the previous expanded game. Upcoming seasons are offered only when schedule data
is available.

Games / Season Report / Schedule Edge preserve valid season context across navigation, with a
visible fallback on unsupported seasons. Shooting shares year, search, team, position, attempt
floor, uncertainty, sort, and player expansion. Officiating shares season, team, category, and game.
Reload and Back/Forward restore the view. Query controls read committed router search parameters
(`useSeasonUrl.ts`); synchronous competing URL snapshots caused a production history race.

No account, localStorage preference, or first-visit tracking is required. Cache refresh errors keep
usable data visible with an error label. Loading, unavailable data, zero, and empty filters remain
distinct. Report files load on expansion and expose retry/source links on failure.

## Visual and mobile rules

Geist carries prose; Geist Mono and tabular numerals carry values. Use tokens from
`src/lib/terminal-styles.ts` and `globals.css`. Explanation text is 15px; mobile form controls
have a 16px floor. Short structural labels may use compact uppercase mono. Hairline dividers
and section spacing provide hierarchy without a card around every paragraph.

The app is light; the homepage is deliberately dark. Fatigue/rest semantics retain their existing
palette. Shooting's approved option A colors only signed difference cells: green positive, red
negative, bounded at ±10 percentage points; uncertain estimates stay muted. Officiating uses
blue for missed calls and gray for incorrect whistles, with direct text labels. Color never
replaces the number, sign, category, or uncertainty text.

Mobile Games shows teams, status, and rest advantage without sideways scrolling. Shooting keeps
identity, both splits, and samples available in compact rows. Advanced filters and secondary
tables use native disclosures. Wide detail tables retain sticky identity columns. Officiating
chips scroll horizontally; expanded reports fill the row width. All interactive targets and
focus states follow the accessibility contracts, including reduced motion.

## Motion

Repeated controls and record expansions are immediate. Keyboard navigation and same-path
navigation bypass the route cross-fade. Reduced motion suppresses movement while retaining
static feedback. The homepage has one 450ms CSS hero entrance; the remaining content is visible
without scroll reveals. No GSAP runtime is used.

The existing route transition, homepage navigation retraction, live-score feedback, and their
exceptions are governed by `src/lib/route-transition.ts`, `globals.css`, the component modules,
and [ADR 0010](adr/0010-the-ui-redesign-was-decided-at-the-bench.md), as amended by the design
record. Do not add decorative or per-row entry animation during routine maintenance.

## Verification and screenshots

`e2e/` covers mobile layout, keyboard behavior, URL/history, source/error states, motion, and axe
scans. `src/app/__tests__/page-contract.test.ts` guards route inventories and design conventions.
Run the checks for changed behavior; automation does not claim physical-device or screen-reader
validation. [UI/UX checklist](UIUX_CHECKLIST.md) lists the remaining manual checks.

`node scripts/screenshots.mjs` updates the README captures and their manifest from a running,
populated application. The generator waits for actual content and fails on missing anchors.
See [Testing and CI/CD](TESTING_AND_CICD.md) for release steps.


## Methodology reading controls

The shared method shell is server-rendered. Native disclosures work without JavaScript;
optional client controls expand or collapse technical sections. Existing section IDs remain
stable when visible headings change. Hash navigation opens the linked evidence, and printing
temporarily opens every technical disclosure before restoring the reading state. Related links
return to the relevant study or coverage page. Definition tables scroll within their own
keyboard-focusable region on narrow screens. The overview retains four qualified null findings
and compact archive links; technical tables and generated analytics retain their existing data.
