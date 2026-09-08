# FullCourt redesign — decision record and phased brief

Date: 2026-09-07. Source: UI/UX audit (70 questions) + live-site review of fullcourt-nba.vercel.app.
Owner-approved working direction, reconciled on 2026-09-07 after the follow-up review. These decisions remain revisable by the owner. Approval records design intent, not implementation or deployment completion.

Deployment status was not rechecked for this revision. Officiating is implemented locally; release still requires preview verification. The current implementation checkpoints are recorded below; uncompleted page changes remain planned.

## 1. Decision record

### A. Product purpose
| # | Decision | Chosen direction | Reason | Pages affected | Still unresolved |
|---|---|---|---|---|---|
| 1 | Default audience | Casual fan first; repeat use efficient; evidence underneath | Audit objective | All | — |
| 2 | Identity **[owner]** | Rest, fatigue, and schedule product. Homepage focuses on that premise; Explore also contains other basketball studies. | Owner-approved follow-up | Home, nav, Explore | — |
| 3 | 10-second understanding | Question the page answers → main finding → how to inspect evidence | Audit rec; Availability already does this | All | — |
| 4 | Return driver **[owner]** | Games + season updates. No accounts, login, personalization, or persisted personal preferences. URL exploration state and browser history remain supported. | Owner-approved follow-up | Games, Season, Officiating | — |
| 5 | Three primary tasks | Inspect a matchup · understand a finding · check its evidence | Audit rec | All | — |
| 6 | Research depth | Denominator + one limitation visible beside every headline number; extended research behind link/expansion | Live-site copy hedges 2–3 sentences before the number | All | — |

### B. Navigation
| # | Decision | Chosen direction | Reason | Pages affected | Still unresolved |
|---|---|---|---|---|---|
| 7 | Top-level **[owner]** | Desktop: **Games · Season Report · Schedule Edge · Explore**. Mobile may shorten labels with clear accessible names. Other product pages and Behind the Data remain accessible through Explore. | Owner-approved follow-up | Header, bottom bar | — |
| 8 | "Other" label | Rename to **Explore** | Audit rec | Header | — |
| 9 | Mobile Search **[owner]** | Explore replaces Search in the bottom bar | Search is a page palette, not real search; Explore does that job honestly | Bottom bar | Keep palette behind keyboard shortcut / footer link |
| 10 | Same groups desktop/mobile | Yes | Audit rec | Nav | — |
| 11 | Season vs Schedule vs Model **[owner]** | Keep Games, Season Report, Schedule Edge, and Model Results separate. Games owns matchups; Schedule Edge owns schedule demands and advantages; Season Report owns completed-season-to-date outcomes; Model Results owns historical evaluation. No planned season-hub merger. | Owner-approved follow-up | Season, Schedule | — |
| 12 | Research archive category | Stays inside Behind the Data; contextual links from findings | Audit rec | Behind the Data | — |
| 13 | Titles vs nav labels | Align. "Shooting by Rest" → nav "Player Shooting"; page title may keep the longer form; "Expected Shot Value" same treatment | Audit rec | Shooting, Shot Value | — |

### C. Homepage
| # | Decision | Chosen direction | Reason | Pages affected | Still unresolved |
|---|---|---|---|---|---|
| 14 | Length **[owner]** | Short landing; dark identity retained. Approximately 1,800px at the agreed desktop mockup viewport is a target, never a hard cap that shrinks readable text. | Owner-approved follow-up | Home | — |
| 15 | After the hero | One principal historical rest finding, then two supporting findings: schedule comparison and shooting by rest. | Owner-approved follow-up | Home | — |
| 16 | Brand story **[owner]** | Move "what FullCourt means" to `/about`, footer link | Story stays; homepage stops paying for it | Home, new About | — |
| 17 | Destination organization | By fan question, destination name attached ("Who's rested tonight? → Games") | Audit rec | Home | — |
| 18 | Changing data on home | All displayed findings derive from the same versioned/generated sources as their destination pages. Print coverage period, denominator, and necessary limitation; do not hand-maintain figures. | Owner-approved follow-up | Home | — |
| 19 | Primary CTA **[owner]** | Games. During the off-season, the last completed regular-season day has a clear regular-season-complete label and prominent View upcoming season action when available. Explicit URL selection wins. | Owner-approved follow-up | Home | — |
| — | Finding selection **[owner]** | Historical rest finding + schedule comparison + shooting-by-rest finding. Select defensible results, not the largest noisy player split. | Rest/fatigue identity | Exact figures and copy to validate in mockups |

### D. Visual
| # | Decision | Chosen direction | Reason |
|---|---|---|---|
| 20 | Scope | Refinement, not new direction | Identity works |
| 21 | Light app / dark home | Keep both; dark mode is separate work | — |
| 22 | Typography | Geist + Geist Mono stay | — |
| 23 | Larger text | Explanatory text and qualifications at least 15px; mobile form inputs at least 16px. Compact mono reserved for short labels and numerals. | — |
| 24 | Uppercase | Structural labels only; sentence case for any label over ~4 words | Live site uppercases full sentences |
| 25 | Cards | Controls and grouped content only; dividers + whitespace for sections | — |
| 26 | Spacing | Shared tokens; three densities: tool (Games), editorial (findings), reference (Behind the Data) | — |
| 27 | Team branding | Retain recognizable team marks in daily tools; semantic colors govern values. Preserve monochrome Officiating treatment; no blanket monochrome conversion. | — |
| 28 | Imagery | None decorative; court diagrams only where coordinates exist | — |
| 29 | Control states | Specified separately: selected (persistent fill), hover (bg), focus (2px ring), expanded (chevron + bg), disabled (muted, no pointer) | — |

### E. Page-specific
| # | Decision | Chosen direction | Still unresolved |
|---|---|---|---|
| 30 | Games order | Date controls + matchups first; summary metrics + Edges Ahead below list on mobile, right rail on desktop | — |
| 31 | Games mobile row | Teams · time/status · rest-advantage value in first view; workload under expansion | — |
| 32 | Season top three | Three sections: season result against its venue baseline with concise historical context; team records under different rest conditions; a short, transparently selected set of notable completed games. No repeated Schedule Edge headline or chart. | — |
| 33 | Schedule Edge | Ranking visible; full breakdown behind "Show full breakdown" | — |
| 34 | Model Results | Two sections with jump links: "The answer" / "The explorer" | — |
| 35 | Player Shooting mobile | Compact mobile player identity, no-rest eFG%, 3+ days eFG%, and difference, with attempt counts immediately available beside the comparison. Full table remains available. | — |
| 36 | Noisy rows | Uncertain differences remain muted by default; optional filter labeled Hide uncertain differences. Preserve the existing standard-error comparison; do not rename it as a sample-size threshold. | — |
| 37 | Shot Value | One court on mobile with "Compare models" toggle; side-by-side ≥1024px | — |
| 38 | Availability | Coefficient table behind expansion; hero and trend stay | — |
| 39 | Officiating | Add "Jump to game reviews" link under hero; hero size unchanged | — |
| 40 | Behind the Data | Local contents + anchored semantic headings; compact mobile topic nav (select or scroll row) | — |

### F. Charts and data
| # | Decision | Chosen direction |
|---|---|---|
| 41 | One-sentence answer above major charts | Yes, only when defensible; never manufacture a trend |
| 42 | Always printed | Headline value, unit, baseline, sample size |
| 43 | Long charts on phones | ≤6 tick labels; tap for exact season value; selected season highlighted |
| 44 | Chart vs table | Chart for pattern, table for lookup, linked |
| 45 | Uncertainty | Plain-language line beside result; intervals nearby |
| 46 | Missing / zero / unavailable / filtered | Four distinct labeled states; never a numeric 0 for failed data |
| 47 | Cross-page selections | Season carries between Games / Season / Schedule when valid; visible fallback text otherwise |
| 48 | Shareable URLs | Yes for season, filters, expanded record (Officiating pattern) |

### G. Motion
| # | Decision | Chosen direction | Still unresolved |
|---|---|---|---|
| 49 | Five-moment budget | Remains governing | — |
| 50 | Keyboard bypass | Keyboard-initiated navigation skips cross-fade. Preserve native semantics: Enter activates links; Space activates buttons, not ordinary links. | Policy doc update |
| 51 | Detail expansion | Instant (Games, Playoff Rest); fixes reduced-motion defect | — |
| 52 | Playoff hover lift | Removed; bg/border change instead | — |
| 53 | Homepage reveal | One brief hero entrance, at most 600ms total; remaining homepage content visible without scroll reveals. No motion under reduced motion. No first-visit tracking. | — |
| 54 | Live score | Keep 500ms cell flash + static "updated HH:MM" | — |
| 55 | Rapid clicks | Latest valid action wins; no filter reset | — |
| 56 | Reduced-motion contract | Immediate state change, no positional movement, static feedback retained | — |

### H. Mobile and accessibility
| # | Decision | Chosen direction |
|---|---|---|
| 57 | No-scroll essentials | Per page: Games = teams+status+rest adv; Shooting = name+two eFG%; Schedule = team+net edge; Officiating = matchup+counts |
| 58 | Horizontal scroll | Detail tables only, sticky identity column, visible edge fade |
| 59 | Filters | Primary visible; advanced behind "Filters (n)" |
| 60 | Bottom nav | Fixed; content padding-bottom ≥ bar height + 16px |
| 61 | Mobile text minimum | 15px for explanatory text; 12px only for metadata |
| 62 | Chart keyboard | Summary + value inspection; no per-cell tab stops |
| 63 | Long-table detail view | Yes where it removes sideways browsing (Shooting, Schedule breakdown) |
| 64 | Back / reload / share | URLs encode meaningful season/filter/expanded-record state. Back restores browser position; direct links reveal the selected record. Do not encode every transient interaction or scroll coordinate. |

### I. Loading, trust, release
| # | Decision | Chosen direction |
|---|---|---|
| 65 | Loading | Skeletons matching final structure; aria-busy |
| 66 | Refresh failure | Keep last valid data, print its age, distinct from empty |
| 67 | Off-season **[owner]** | Games defaults to the last completed regular-season day in the off-season, explicitly labeled. Offer View upcoming season when its schedule is available. Explicit URL selection overrides defaults. |
| 68 | Data through | Meaningful Data through information beside analytics; distinguish coverage from collection freshness. Remove the low-value render timestamp from the public footer rather than mislabeling it Page built. |
| 69 | Sharing | Stable links only; exportable graphics later |
| 70 | Success evidence | New reader: find a game, explain the main metric, name its limitation, reach the source — unaided |

## 2. Page ownership and homepage structure

Each analysis has one home. Shared controls, essential baselines and samples, contextual links,
and short homepage previews are allowed; duplicate analytical sections and tables are not.

| Content | Owner | Treatment |
| --- | --- | --- |
| Individual matchups, rest gaps, status, workload breakdown | Games | Date controls and matchup information first |
| Net edge ranking, favorable/unfavorable games, schedule worth | Schedule Edge | Relative advantages; full breakdown behind a deliberate action |
| Schedule Tax: travel, back-to-backs, dense stretches, modeled time-zone penalties | Schedule Edge | Move from Season Report; call section Schedule demands or Travel and workload |
| Weekly fatigue calendar | Schedule Edge | Workload over time, clearly separated from outcomes and projections |
| Season rest results and comparison with history | Season Report | Completed regular-season games only; venue baseline and uncertainty visible |
| Team rest-conversion records | Season Report | Descriptive records, not rankings of fatigue management |
| Largest completed rest gaps and actual results | Season Report | Small transparent selection, losses included; link to Games for details |
| Zero-rest player workload | Player Shooting | Supporting player context; remove duplicated Season Report leaderboard |
| Full historical thresholds, season charts, backtest | Model Results | Historical evaluation owns its full presentation |

Schedule burden and relative advantage are distinct: playing a back-to-back is a demand;
playing it against a rested opponent creates a relative disadvantage. Avoid stacking two full
30-team tables by default. Do not assume every moved metric is already exposed by Schedule Edge.
Published fixtures, measured-to-date fatigue, and projections must retain separate labels and
provenance. A moved chart does not acquire future coverage. Before games begin, Season Report
shows one awaiting-results state and links to the previous report and upcoming schedule.

Homepage order: Rest is a stat hero + Games CTA; one historical rest finding against its venue
baseline; two supporting schedule and shooting-by-rest findings; compact Explore further link;
footer. No repeated formula exposition. Brand story moves to About. Playoff workload is an
eligible seasonal rest-related feature. Availability is adjacent context; Officiating, shot-location
value, and referee folklore stay in Explore/other studies, outside the main homepage findings.

## 3. Phased implementation brief

### Phase 0 — Reconcile specifications and prepare release
- Preserve `/referees` redirect to `/officiating`; archive remains `/behind-the-data/referees/archive`.
- Rename product-facing references selectively; preserve distinct historical research titles.
- Verify the Officiating preview before any production merge; no deployment is implied here.
- Ratify motion rules before implementation: instant keyboard actions and detail expansion,
  no playoff hover lift, brief hero entrance only, complete reduced-motion suppression.

### Phase 1 — Repair confirmed defects
- Player-name column collapse; methodology semantic headings and badge clipping.
- Games and playoff expansion/reduced-motion compliance; crowded chart tick labels.
- Touch/keyboard shot-value inspection with a selected-value readout.
- Keep changes scoped; verify actual content, not only document overflow.

### Phase 2 — Approve representative mockups
- Homepage, Games, Season Report, Schedule Edge, Player Shooting, Shot Value, Behind the Data.
- Confirm first-screen priorities, readable mobile comparisons and samples, navigation, filters,
  and data scope before site-wide changes. Officiating is a reference, not a universal template.

### Phase 3 — Implement approved hierarchy and shared patterns
- Navigation and Explore; shortened homepage and About; content moves according to ownership.
- Games desktop/mobile hierarchy and off-season actions; Schedule Edge breakdown expansion.
- Model Results answer/explorer sections; Availability technical-detail expansion; Officiating jump link.
- Typography, three spacing densities, neutral reference headers, semantic control states,
  recognizable team marks, URL state, contextual freshness, and footer timestamp removal.
- Apply motion policy during component changes, not as a late cleanup phase.

### Phase 4 — Verify and release
- Desktop/mobile, keyboard, reduced motion, rapid actions, Back/reload/share, loading/error/empty,
  future-season scope, and data samples/baselines. Review preview before merge.

### Separate future scope
- Exportable graphics and universal search only if separately requested.
- Upcoming rest-edge projections require verified data support; existing schedule navigation is
  part of this redesign, not a deferred new feature.
- No account/personalization work and no planned Season Report/Schedule Edge merger.

## 4. Implementation checkpoint — 2026-09-07

The initial defect pass is implemented locally: Player Shooting table minimum width prevents
name/team overlap; Games and playoff details/chevrons are instant; playoff hover lift is removed;
keyboard links and palette choices skip cross-fades; methodology sections have anchored h2
headings and wrapping descriptors; season-chart tick candidates are limited to six; Shot Value
has pointer selection, one native keyboard slider per court, and a visible measured-value readout.
The compact mobile Shooting comparison, homepage/navigation changes and page-content moves remain
in the representative-mockup/hierarchy phases. Nothing was pushed, merged or deployed.

Validation: 945 unit tests passed; targeted browser suites passed (60-test run plus 11-test
follow-up, with overlap); lint and typecheck passed; production build and production dependency
audit passed. Mobile screenshots were inspected. Browser tests cover player-column geometry,
reduced-motion expansion, methodology heading/clipping, shot inspection, and keyboard navigation.
Physical-device and screen-reader testing remain release checks; automation does not replace them.

## 5. Representative mockups — ready for review, 2026-09-07

Seven responsive mockups plus supporting navigation are in `docs/design/rest-focused-mockups/`.
Open `review.html` for explicit 1280px/390px viewing or `index.html` for individual pages.
The homepage is 1,428px tall at the checked desktop width. Data snapshots, scope notes,
screenshots, and verification results accompany the artifacts. Mockup composition has not yet
been owner-reviewed; product route restructuring remains unimplemented. No deployment occurred.

## 6. Shooting density amendment — 2026-09-07

Owner requested a denser Shooting by Rest data table; the other mockups looked good at a glance.
Use aligned compact rows, with player/team, both rest-split rates and attempt counts, and the
percentage-point difference visible on mobile. Desktop can include games, total attempts and
overall eFG%. Do not use vertically spacious player blocks. The revised standalone mockup has
20 real sample rows, sorting and search. This is a composition revision, not application integration
or final approval of every other page. Other mockups are unchanged.

## 7. Shooting color selection — 2026-09-07

Owner selected A: tinted difference cells, with green for positive differences and red for
negative. Color intensity follows magnitude; near-zero differences are very light. Preserve
signed numbers and the quieter uncertainty marker, with player identity, shooting rates and
attempt counts neutral. B (centered bars) is rejected; C (row gradient) is not selected.
This palette exception applies to Shooting by Rest, not Officiating or other site surfaces.
The main standalone mockup now uses A; application integration remains separate.


## 8. Shooting application integration — 2026-09-07

Implemented locally after “let’s keep going”: dense responsive table, A tinted difference
cells, fixed ±10 pp color cap, quieter uncertainty markers, keyboard player expansion and
filter-empty guidance. Existing season/career data, filters and player URLs are preserved.
This integrates `/shooting` only; the remaining page compositions are still mockups. No deployment.


## 9. Homepage and research destinations — 2026-09-07

Implemented locally after the owner's request to continue: short rest-focused homepage,
real-source historical and schedule previews, player-coverage preview, `/about` brand story,
and `/explore` research directory. Removed the `/about` redirect and footer render timestamp.
The homepage is server-rendered with one 450ms hero entrance and no scroll reveals; reduced
motion is static. Shared navigation and the remaining page-content moves are next. Not deployed.

Validation: 957 unit tests, nine homepage browser tests, About navigation and both new
page-header checks passed. Desktop/mobile axe scans for all three pages found no violations.
Lint, typecheck, production build and production dependency audit passed. Desktop homepage
height is approximately 1,630px. Screenshots are in `docs/screenshots/home-rest-focused-*.png`.


## 10. Shared navigation — 2026-09-07

Implemented locally: Games / Season Report / Schedule Edge / Explore on both desktop and
mobile, with shorter visible mobile labels and full accessible names. Explore carries parent
selection on its analyses. The former OTHER menu and mobile Model/Search slots are removed.
Jump to page in the footer and ⌘K / Ctrl+K open the lazy palette. No new motion or personalization.
Next: Games hierarchy and off-season behavior, then the remaining page-content moves. Not deployed.

Navigation verification: 959 unit tests, 34 navigation/control browser tests and two additional
Explore reachability tests passed. Six desktop/mobile axe scans found no violations. Lint,
typecheck, production build and dependency audit passed. Only the current FullCourt server on
3110 remains listening; obsolete 3107 and 3112 servers are stopped.


## 11. Games hierarchy integration — 2026-09-07

Implemented locally: date controls and matchups lead; selected-slate summaries and Edges Ahead
sit in a 260px right column on wide desktop and follow matchups on mobile. Games defaults to the
current/completed evidence season, while upcoming edge discovery retains its schedule-facing
season. The upcoming season is offered only after its date endpoint returns games. Completion
copy explicitly says regular season; the final-slate label appears only on the final date.
Loading counts use a dash. Density is URL-addressable without localStorage; keyboard changes
are instant and pointer changes retain the existing reduced-motion-aware transition.

Pending: season/date URL restoration and browser-history behavior, followed by the Season Report /
Schedule Edge content separation. No deployment.


## 12. Games URL integration — 2026-09-08

Games now shares `season`, `date`, and `view` in the URL. Explicit links take precedence over
season defaults; date-only links infer a season. Invalid dates fall back safely, while valid
no-game dates remain selected. User navigation creates history entries; automatic date selection
replaces the current entry. Back/forward restores the slate without scrolling or animation.
The season control waits for URL initialization before accepting input, preventing an early
selection from being overwritten. Aborted calendar responses cannot replace the current season.

Next: implement the approved Season Report / Schedule Edge content separation. Local only.


## 13. Completed hierarchy integration — 2026-09-08

The approved page ownership is implemented: Season Report owns completed results, team records,
and five largest completed rest gaps (wins and losses); Schedule Edge owns the ranking, worth,
travel/workload disclosure, and completed-game fatigue calendar. Zero-rest player workload now
belongs to Shooting. Six team records are shown initially, with the remaining teams expandable.

Shared season links and fallback notices preserve valid context across Games, Season, and
Schedule. Shooting URLs preserve year, volume, team, position, uncertainty, sort, query, and
expanded player. Mobile Games exposes rest advantage without horizontal scrolling. Model Results
has answer/explorer anchors, Availability collapses coefficients, mobile Shot Value offers one
court plus Compare models, Officiating links directly to game reviews, and methodology pages
have compact topic navigation and local contents. No accounts or stored personal preferences.

See [the release review](redesign-release-review.md) for design rationale and scope.
The owner authorized verification and deployment on 2026-09-08. Exportable graphics, universal
search, and new analytics remain separate future scope, as agreed. No coefficient or schema change.
