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
| `/about` | Product purpose, author and engineering walkthrough entry |
| `/how-it-was-built` | Problem, data flow, implementation tradeoffs, verification and limits |
| `/privacy` | What a visit records, the three outside services that receive a request, the non-affiliation notice and the contact address |
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
interaction feedback. Artifact-derived previews identify Officiating and Availability findings; other tiles use less empty height. Research and archive links remain compact. This pattern is for choosing
a destination; tables retain their existing density. See D-63 for the owner selection.

Standard study pages pair `PageHeader` and the compact `MethodLink` in `.page-intro`.
Games and Shooting use a 24px entry gap so the first complete row clears the mobile dock.
About and the engineering walkthrough share `reading.module.css`: numbered chapters, a lead
sentence on an accent rule, tinted notes, labelled Problem / Built / Tradeoff rows and study cards.
The walkthrough adds `ReadingRail`, a sticky section list from 1024px that marks the section being
read. A method article's topic list opens over the page and closes on Escape or an outside press.
One footer exposes Methods, About, How it was built, Source, Status and Find a page.

Use `PageHeader`, `MethodLink`, `SeasonSelector`, `DataTable`, `StatTile`, `StatFigure`, and
`MessageCard` where their contracts fit. The homepage and Officiating have approved presentation
exceptions. See [Adding a surface](ADDING_A_SURFACE.md) and its source tests before extending them.

## State and data

Games keeps previous/next-day stepping visible from the `sm` breakpoint; a phone steps by week
(`WEEK_SHIFTED`), landing on the same weekday when it has games and otherwise on the week's
first slate. Exact four-night and six-night counts use
completed prior games plus the selected game. Altitude venue and carryover labels are separate.

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
`src/lib/terminal-styles.ts` and `globals.css`. Explanation text is 15px; shared filters use 16px text and a 44px minimum height at all
viewport sizes. Analysis filters use equal-width columns. Season Report separates its result
and interpretation with contrasting surfaces and a responsive divider. Short structural labels may use compact uppercase mono. Hairline dividers
and section spacing provide hierarchy without a card around every paragraph.

The app is light; the homepage is deliberately dark. Fatigue/rest semantics retain their existing
palette. Shooting's approved option A colors only signed difference cells: green positive, red
negative, bounded at ±10 percentage points; uncertain estimates stay muted. Officiating uses
blue for missed calls and gray for incorrect whistles, with direct text labels. Color never
replaces the number, sign, category, or uncertainty text.

Games exposes Season → Month → Date selection, and none of it scrolls sideways (D-78). From `sm`
the month buttons and date chips wrap, so a whole month shows at once. Below `sm` the page shows
one Sunday-to-Saturday week of seven 44px cells, with days that have no games at a count of 0;
the Calendar button opens the month buttons and a month grid, and a pick there closes the panel
and returns focus to the button. The three slate measures are one line above the matchups
wherever the summary rail is absent: below `lg`, and in Deep Dive at any width. The rail starts
at `lg` because the matchup table needs about 600px beside it. Season selectors share one labeled component across studies. Deep Dive uses
the full desktop width; narrower desktop/tablet tables scroll in a keyboard-focusable region.
Mobile Games shows teams, status, and rest advantage without sideways scrolling. Shooting keeps
identity, both splits, and samples available in compact rows. Shooting keeps a short signed-value interpretation key visible; rest definitions, uncertainty
explanation and coverage expand on demand. Officiating initially offers the common call types
plus an All call types control, and always includes a selected rare category. Advanced filters and secondary
tables use native disclosures. Wide detail tables retain sticky identity columns. Every
`DataTable` and the Deep Dive matchup table scroll inside `ScrollCue`
(`src/components/ui/scroll-cue.tsx`): the edge that hides content fades, a hint line follows a
table while it is wider than its box, and touch screens get no scrollbar. A new sideways
scroller uses `ScrollCue` rather than a bare `overflow-x-auto`, with `data-pinned` when its
first column is sticky so the start edge never fades over it. The Home Court season table and
Officiating's season strip and call-type row use it too. Schedule Edge's full breakdown
drops its rank and bar columns below `lg` and the team name below `sm`, since the chart above
it already draws them; it fits a tablet without scrolling. Officiating
chips scroll horizontally; expanded reports fill the row width. All interactive targets and
focus states follow the accessibility contracts, including reduced motion.

## Motion

Repeated controls and record expansions are immediate. Keyboard navigation and same-path
navigation bypass the route cross-fade. Reduced motion suppresses movement while retaining
static feedback. The homepage has one 450ms CSS hero entrance and one 500ms draw on the two
finding bars; the remaining content is visible without scroll reveals. Figures never count up.
No GSAP runtime or animation library is used.

Hover and press feedback is separate from motion moments. `.fc-control-button` shows an inset
ring on hover and scales to 0.97 while pressed; `.fc-sort` headers and `.fc-text-link` underline;
`.fc-table` rows tint. These rules use `box-shadow` and `transform` because several controls set
colors inline, which outranks a hover class. Keep comments in that block to plain words:
a comment containing backticks, an apostrophe and `#` caused the build to drop the block.

The existing route transition, homepage navigation retraction, live-score feedback, and their
exceptions are governed by `src/lib/route-transition.ts`, `globals.css`, the component modules,
and [ADR 0010](adr/0010-the-ui-redesign-was-decided-at-the-bench.md), as amended by the design
record. A page that writes its own URL after load asks `isLeavingPage()` first: a history
write from the page being left cancels a navigation that has not committed yet. Do not add decorative or per-row entry animation during routine maintenance.

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
