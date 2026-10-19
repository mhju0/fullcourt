# Frontend

The application uses Next.js App Router, React, Tailwind, Base UI, Recharts, and SWR.
Dependency versions live in `package.json` and `pnpm-lock.yaml`. The shared visual direction is
[Brand grammar](design/BRAND_GRAMMAR.md); owner decisions are in the [design record](design/fullcourt-decision-record.md).

## Page ownership

| Route | Main question and presentation |
| --- | --- |
| `/` | Rest and schedule findings, derived from existing data sources; dark front door, Games primary action |
| `/games` | Matchup rest/schedule conditions in tip-off order; controls, a one-line slate summary, the matchups, then Edges Ahead, in the same order at every width |
| `/games/team` | One team's season (BY TEAM, D-99): season and team selects, four counts (team more rested, opponent more rested, even, 3+ rest edges), with a MEDIUM or LARGE marker beside a marked gap (not on a phone, as on the board), then G · DATE · TIME · OPPONENT · REST ADVANTAGE with the gap signed from the team's side; the next game is tinted and marked NEXT; TIME holds the result once final, or LIVE / PENDING by `gamePhase`; a phone shows date, opponent and gap, with the result under the date; a season still short of its NBA Cup games shows them as "NBA CUP GAME · TBD" rows (`cupPlaceholders`, `src/lib/nba-cup.ts`) numbered into the season; the columns take shares of the width from the small breakpoint up rather than OPPONENT taking the rest, and a row opens that game on the board, expanded (`/games?…&game=<id>#game-<id>`, the OPPONENT name is the link, a click elsewhere on the row follows it, a chevron ends the row except on a phone), so Back returns to the team (D-107) |
| `/season` | Completed results against the season's venue baseline, six initial team records with remaining teams expandable, five largest completed rest gaps including losses |
| `/schedule` | Relative schedule ranking and worth; breakdown (with its column guide inside) and travel/workload in disclosures; league fatigue by week for completed games |
| `/explore` | Directory for the secondary basketball studies |
| `/analysis` | Historical model evaluation: The answer and The explorer. Two tiles (RESTED TEAM AT HOME, and its LARGE GAP slice) with the gap floor in numbers; a gap-size chart of small/medium/large against the venue baseline with 95% whiskers, where a bar opens exactly its games; an era chart reading each five-season era against its own home rate; and home court by season. The explorer defaults to the rested team at home and filters by rest gap and rested team (D-102) |
| `/shooting` | Player Shooting by Rest: dense player comparisons with no-rest/2–29 days off eFG%, attempt counts, uncertainty, and expandable seasons; zero-rest workload disclosure |
| `/shot-quality` | Expected shot value by location; one mobile court with Compare models, two desktop courts |
| `/availability` | Missing-player associations, trends, and expandable coefficient comparison |
| `/playoffs` | Previous-round workload and the separate series model |
| `/officiating` | Selected NBA L2M findings and games-first report browser; source verdicts, clean games, shareable filters |
| `/about` | Product purpose, author and engineering walkthrough entry |
| `/how-it-was-built` | Problem, data flow, implementation tradeoffs, verification and limits |
| `/privacy` | What a visit records, the four outside services that receive a request, the non-affiliation notice and the contact address |
| `/behind-the-data/*` | Seven-topic overview; ten method articles with visible scope limits, compact topic/contents disclosures and expandable evidence |
| `/behind-the-data/referees/archive` | Earlier referee research and its historical table |

`/referees` redirects to `/officiating`; `/upcoming` redirects to `/games`. They remain for
existing links. No active page uses the retired OTHER menu or onboarding dialog.

## Shell and navigation

`src/app/layout.tsx` owns the container, page gutters, footer, and main landmark.
`primary-navigation.ts` defines Games / Season Report / Schedule Edge / Explore for both the
header and mobile dock. Explore stays marked for its child analyses. The page palette opens
from the footer or keyboard shortcut; it is navigation, not universal data search.

Explore uses seven equal navigation tiles, in two columns on desktop and one on mobile.
`StudyLink` supplies a full-surface link with a visible arrow, descriptive action, and immediate
interaction feedback. Each tile uses the same category, question, and action structure; numerical findings stay on the destination page. Research and archive links remain compact. This pattern is for choosing
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
prior games, played or still scheduled, plus the selected game (D-82). ALT means tonight's arena is at altitude; the ALT TRIP carryover flag was removed with its term (D-100).

Games shares `season`, `date`, and expanded `game`; an old `view` parameter is ignored. Explicit historical selection wins
over offseason defaults. Invalid dates fall back; valid no-game dates remain selected. A date
change clears the previous expanded game. Upcoming seasons are offered only when schedule data
is available.

Games / Season Report / Schedule Edge preserve valid season context across navigation, with a
visible fallback on unsupported seasons. Shooting shares year, search, team, position, attempt
floor, uncertainty, sort, and player expansion. Officiating shares season, team, category, and game.
Reload and Back/Forward restore the view. Query controls read committed router search parameters
(`useSeasonUrl.ts`); synchronous competing URL snapshots caused a production history race. The
one exception is the hook's own write: Next commits a `pushState` in a later transition, so the
URL a control just wrote is shown until the route moves or the address bar leaves it. Without it
a changed select snapped back for a few hundred milliseconds (`shooting.spec.ts`, "same tick").

No account, localStorage preference, or first-visit tracking is required. Cache refresh errors keep
usable data visible with an error label. Loading, unavailable data, zero, and empty filters remain
distinct. Report files load on expansion and expose retry/source links on failure.

## Visual and mobile rules

Geist carries prose; Geist Mono and tabular numerals carry values. Use tokens from
`src/lib/terminal-styles.ts` and `globals.css`. Explanation text is 15px; shared filters use 16px text and a 44px minimum height at all
viewport sizes. Analysis filters use equal-width columns. Season Report separates its result
and interpretation with contrasting surfaces and a responsive divider. Short structural labels may use compact uppercase mono. Hairline dividers
and section spacing provide hierarchy without a card around every paragraph. Where a page is
several unlike blocks of text, each block is one bordered unit with its title in a tinted band
(D-79): `.fc-report-section` on Season Report and Home Court, and each play in an open
Officiating report. A table inside such a block has a 2px header rule and alternate-row tint;
a caveat that must be read with a table sits in `.fc-report-note`. `--term-border` and
`--term-hairline` are dark enough to show on the page ground; do not lighten them.

The app is light; the homepage is deliberately dark. Fatigue/rest semantics retain their existing
palette. Shooting's approved option A colors only signed difference cells: green positive, red
negative, bounded at ±10 percentage points; uncertain estimates stay muted. Officiating uses
blue for missed calls and gray for incorrect whistles, with direct text labels. Color never
replaces the number, sign, category, or uncertainty text.

Line breaks (2026-10-16 audit). `globals.css` sets `text-wrap: pretty` on running text (`p`,
`li`, `dd`, `td`, `figcaption`) and `balance` on headings, `th` and `summary`, so a last line
does not hold one word or a lone arrow. Chrome breaks after a hyphen that precedes a digit, so a
season, an ISO date or a "3-in-4" needs `nowrap`; an operator needs a no-break space to the
operand after it. `keepTogether()` (`src/components/ui/keep-together.tsx`) does both for string
children; `Prose`, `Note`, `LimitList`, `DataTable` headers and the Data Status values already
apply it. Elsewhere, write a number and its unit with U+00A0 (`61.2 pp`), keep a season
column `nowrap`, and keep a table header to two lines on a phone.

Games exposes Season → Month → Date selection, and none of it scrolls sideways (D-78). From `sm`
the month buttons and date chips wrap, so a whole month shows at once. Both are the same 60×48 box
(`PICKER_BOX`), so each month sits exactly over a date chip. From `sm` the previous/next day arrows sit at the
right of the DATE label's line, clear of its rule, so they never move; the selected date's long
form is in the Matchups heading (D-99). BY DATE / BY TEAM tabs (`GamesViewTabs`) sit under the
header on both Games views and carry the season across; below `sm` the method link moves to the
right of that row, so the first matchup clears the phone dock at 390×844. Below `sm` the page shows
one Sunday-to-Saturday week of seven 44px cells, with days that have no games at a count of 0;
the Calendar button opens the month buttons and a month grid, and a pick there closes the panel
and returns focus to the button. The three slate measures are one line above the matchups
at every width, and Edges Ahead follows the list. There is no Skim/Deep Dive toggle and no
side rail (D-79): from `sm` the matchup table always carries the fatigue and
gap-size columns at the full content width, and narrower desktop/tablet tables scroll in a
keyboard-focusable region. The header row reserves the same 3px accent edge as a row, so each label starts or ends where its cells do; a unit goes in parentheses. There is no days-rest column (D-95); days rest is in the expansion. FATIGUE SCORE takes no range: the score has a floor of 0 and no ceiling, and the bar is full at 10. The score leads its cell, on the label's left rail, with the bar after it. The rest advantage figure reads team, gap, ADVANTAGE ("PHI 4.0 ADVANTAGE"); an even game reads EVEN and its gap. Every fatigue score and rest gap on the site prints at one decimal, cut rather than rounded (`cutToTenths`, D-98): 2.96 prints 2.9, so a figure is never on the other side of a line from its label. Comparisons still read the two-decimal value (D-87). The host line carries HOME, or the city at a neutral site, where the model scores the host as a road team; its expansion reads HOST · city. The last column, EDGE, is blank except on a game where the rested team is at home, off a neutral site, by 3 or more: it carries an outlined MEDIUM REST EDGE badge from 3 to 5 or a filled LARGE REST EDGE badge at 5+, and the row takes the accent edge (`restEdgeSize`, D-96, D-101). A small gap (0.5–3) is home court and earns no mark. The slate summary's 3+ REST EDGES tile counts the marked games and carries the note AT HOME beside its figure (`SummaryItem.note`, D-108). The column's 160px minimum holds the wider badge beside the chevron. The heading row reads Matchups, the game count, and "Updated" with the time the view arrived in the viewer's clock, beside a 32px outline refresh button in a 44px target (named Refresh view, or Try again after a failure; `aria-disabled` while refreshing). Under the heading, a closed "How to read the board" toggle (`BoardGuide`) explains the fatigue score and its flags, the rest advantage, and both badges with each size's rate read live from `/api/analysis` (`restEdgeRates`); on a phone it sits after the list so the first game stays above the fold. Its rate is quoted without the venue baseline by owner decision (D-96). Flag chips are scoped per team, host included, and a line shows as many as fit its fixed strip (`inlineFlags`, at most four) before a +N count. Every game row is one height: the schedule sentence sits in the expansion, a projected gap carries no mark on the board (the owner judged the note clutter, 2026-10-16), and an upcoming game shows its tip time with no status label. No in-game score is shown: once the tip time passes a row reads LIVE over its tip time for three hours, then PENDING until the score is stored and FINAL sits over it (`gamePhase`, D-81), all on the table's one clock (`useNow`). The top line of the cell is always the state and the bottom line the data. LIVE is a label with a still dot and no row tint, so the accent edge stays the one accent, and the row button's name carries the state and score (`spokenGameState`) because a button's name replaces its contents for a screen reader. The board opens on the game day until 6 AM ET (`slateDateKey`). Matchups are ordered by tip-off time, then by the source event id
(`slateOrder()` in `src/lib/db/slate-order.ts`). Season selectors share one labeled component across studies.
Mobile Games shows teams, status, and rest advantage without sideways scrolling; the other
columns are under each row's expansion. Shooting keeps
identity, both splits, and samples available in compact rows. Shooting keeps a short signed-value interpretation key visible; rest definitions, uncertainty
explanation and coverage expand on demand. Officiating initially offers the common call types
plus an All call types control, and always includes a selected rare category. Its filter row centers the chips, the All call types button and the
team select on one line, and the select fills the row on a phone. Advanced filters and secondary
tables use native disclosures. The Schedule Edge fatigue chart is the whole league by week:
dated axis, a readout for the selected week with Previous/Next buttons, and lighter bars for
weeks well below the median. Wide detail tables retain sticky identity columns. Every
`DataTable` and the matchup table scroll inside `ScrollCue`
(`src/components/ui/scroll-cue.tsx`): the edge that hides content fades, a hint line follows a
table while it is wider than its box, and touch screens get no scrollbar. A new sideways
scroller uses `ScrollCue` rather than a bare `overflow-x-auto`, with `data-pinned` when its
first column is sticky so the start edge never fades over it. The Home Court season table and
Officiating's season strip and call-type row use it too; the season strip stretches its
columns so a whole number fills the width, since it opens scrolled to the newest season and a
half-cut column misread its figure (89.9% as "9.9%"). Schedule Edge's full breakdown
drops its rank and bar columns below `lg` and the team name below `sm`, since the chart above
it already draws them; it fits a tablet without scrolling. Officiating
chips scroll horizontally; expanded reports fill the row width. All interactive targets and
focus states follow the accessibility contracts, including reduced motion.

## Motion

Repeated controls and record expansions are immediate. Keyboard navigation and same-path
navigation bypass the route cross-fade. Reduced motion suppresses movement while retaining
static feedback. The homepage has one 450ms CSS hero entrance and one 500ms draw on the two
finding bars; the remaining content is visible without scroll reveals. Figures never count up.
No GSAP runtime or animation library is used. Analysis chart tooltips and fatigue fills update
immediately. Threshold drills scroll smoothly in normal mode and instantly under reduced
motion. Games date chips and day/week arrows reuse the shared button feedback below; the
Schedule column-guide chevron retains its 200ms rotation only in normal mode.

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

[Verified] The homepage full-bleed width uses `50cqw` from a query container scoped to `#main:has(.home)` in `src/components/home.module.css`. It measures available content width with classic scrollbars; other routes retain normal containment. `e2e/home.spec.ts` covers auto/stable gutters at 390/1440px.


## Closeout interaction safeguards (2026-10-18)

Calendar dates and the selected Games slate have independent request generations and loading
states. A valid explicit date can show its slate while calendar counts remain pending; no empty
month or zero-count calendar is inferred from that pending request. A calendar failure has one
application error card and a dates-only retry that preserves the loaded slate.

Model Results retains one shared page heading and one live loading status during both lazy
chunk and API loading. Decorative skeletons are hidden from announcements. Its recent-game
modal uses native list items containing buttons and 44px control targets. Calendar controls
wrap at narrow widths; Home's definition-list figures wrap with enlarged text. Computed-font
stress simulation does not establish native zoom or real-device behavior.

Explicit postponed/cancelled game states override the clock on board/team/detail labels and
accessible names. They show neither a score nor a workload/storyline claim. Future fatigue
may temporarily be unavailable during transactional invalidation and recovery; it remains
missing rather than becoming a fabricated zero. [Lifecycle contract](GAME_STATUS_LIFECYCLE.md).

## Season-data guides

`SeasonDataGuide` uses the shared card border, radius and spacing, 15px body type and
44px link targets. Its heading is “Awaiting season data”; previous publication and current
schedule links provide the next actions. The current-season release rule remains internal:
no team-game progress counter, milestone explanation or statistical-significance claim.
A schedule-derived expected-after date is shown only for a supported result availability
estimate, never as a universal study-publication promise. Current selections fail closed
while readiness is unknown, and a failed request has a retryable error state.

Static/pipeline-driven studies retain their latest published coverage. Schedule Edge is
available as a provisional outlook before results. Availability Cost remains a retrospective.
The homepage's period follows the finding explanation. Games keeps its compact wrapping
strip under “Upcoming large rest edges,” with readable title/body tokens and rested-home
5+ chronological selection (D-115/D-116).
