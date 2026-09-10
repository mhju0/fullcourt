# Controls and report separation

September 10, 2026. Local implementation review; this document does not certify production deployment.

## Direction

Apply UI UX Pro Max's focused control-sizing guidance and Emil's component consistency review,
with antislop during implementation. FullCourt remains a calm NBA research interface: energy 1,
rhythm 2, motion 1. Use the existing light surfaces, indigo interface accent, semantic data colors,
and Geist typography. No new animation, shadows, data colors, or findings are needed for this change.

## Findings and changes

| Before | After | Why |
| --- | --- | --- |
| Analysis used private compact native selects alongside the larger SeasonSelector | Four equal-width, 44px-high filters, season first, labels above all four | A single visual family and reading order; desktop row, tablet two columns, phone stack |
| Shared secondary selects used 12px desktop text and could be 36px high | Shared `.fc-control` with 16px text, 44px minimum height, matching borders and corners | Season and secondary filters now share geometry; long values remain readable |
| Shooting search was shorter than its season selector | Search shares the control geometry | One control row no longer contains mismatched boxes |
| Games day arrows were 28px, month controls 42px; Analysis pagination 28px | 44px action controls and 44px square icon buttons | Consistent interaction targets across desktop and mobile |
| Analysis threshold and shot-map controls were compact | 44px minimum control height | Matches the other standalone controls without enlarging data rows |
| Officiating had separate 3px corners and a hard-coded border | Shared radius and control-border token | Keeps report chips recognizable while removing styling drift |
| Season Report's result and explanation floated on one background | One bordered frame: white result, recessed explanation, dividing rule | Makes the two reading roles immediately distinct |
| Season Report's lower sections relied on whitespace | Separate white sections, heading rules, shaded table header | Clear section boundaries across a long report |
| About, engineering, and Playoff Rest prose chapters relied on whitespace | Rules between adjacent chapters | A lighter treatment where full boxes would repeat existing cards |

The control border is `#858B91` (3.44:1 against white, measured). This is a non-text boundary,
not a text color. Existing text and data-color meanings remain unchanged. The report's decorative
rules supplement headings, spacing and surface contrast; they do not carry meaning alone.

## Site coverage

| Surface | Audit result |
| --- | --- |
| Home | Existing dark hierarchy retained; no new control or section styling needed |
| Games | Day arrows and month controls normalized; equal date tiles and local table scrolling retained |
| Season Report | Main structural changes described above; divider turns horizontal on mobile |
| Schedule Edge | Shared season control updated; existing divided statistics, chart frame and disclosures retained |
| Model Results / Analysis | Filters, threshold controls and pagination updated; chart frames already group evidence |
| Shooting by Rest | Shared filters and search updated; dense table, uncertainty treatment and signed color cells retained |
| Playoff Rest | Shared season control and prose chapter boundary updated; bracket cards already separate series |
| Officiating | Shared season control and chip border/radius aligned; split bar, report rows and quote boundaries retained |
| Availability Cost | Existing heading rules and separate evidence cards already provide grouping |
| Expected Shot Value | Map controls normalized; chart and comparison boundaries retained |
| Explore | Equal-column destination cards already provide clear targets; retained |
| About / How it was built | Chapter rules added; existing destination buttons and engineering cards retained |
| Behind the Data | Existing equal-column method links, bordered sections, disclosures and archive boundaries retained |
| Reference articles and referee archive | Shared reference layout audited; no additional nested boxes needed |

Consistency means matching controls within their role, not forcing every link, data cell and
multiline card into the same rectangle. Native checkboxes retain their 44px label targets.
Desktop table-sort labels retain compact typography; mobile sort controls retain 44px targets.
Destination cards keep their larger dimensions. Inline prose links retain their text flow.

## Verification

- Production build, lint, typecheck and all 972 unit tests pass. All 47 selected browser checks pass (46 in the
  main production run, plus the updated Shooting typography assertion on rerun).
- Geometry checks cover 1280px, 768px and 390px, including equal Analysis select dimensions,
  keyboard focus, filter clearing, desktop divider and mobile stacking.
- Rendered main-route audit covers 14 pages at 1280px and 390px; no page-level horizontal overflow.
- Combined core and supplemental checks cover 26 routes at two widths (52 route/viewport
  combinations), with no page-level horizontal overflow. Supplemental coverage checks the homepage, legacy referee redirect and all remaining reference
  routes at both widths. Reference article layouts share the same existing section components.
- The old accessibility spec expected a removed “JUMP TO PAGE” button and twelve palette entries.
  It now verifies the current “Find a page” control and thirteen destinations.
- Local review captures are in `/tmp/fc-design-after`; the initial Analysis capture caught loading,
  so its baseline is the supplied screenshot and the original source, not that loading image.

## Design gate

| Check | Result and evidence |
| --- | --- |
| Purpose and hierarchy | PASS: panels separate measured result, interpretation, team records and individual games |
| Real content | PASS: calculations, records and verdicts are unchanged; no invented examples |
| Responsive geometry | PASS: 44px filter measurements and breakpoint tests; no overflow in route sweep |
| Keyboard and behavior | PASS: focus, command palette and filter interaction checks |
| Color and motion | PASS: measured control boundary contrast; existing semantic colors; no added motion |
| React review | PASS: presentation changes only; no new effects, requests, dependencies or state |

