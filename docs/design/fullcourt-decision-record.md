# FullCourt design decisions

Date: 2026-09-07. Source: UI/UX audit (70 questions) + live-site review of fullcourt-nba.vercel.app.
Owner-approved working direction, reconciled on 2026-09-07 after the follow-up review. These decisions remain revisable by the owner. Approval records design intent, not implementation or deployment completion.

Implemented and deployed through PRs #84 and #85 on 2026-09-08. The current page map and interaction behavior are in [Frontend](../FRONTEND.md); evidence is in [the release review](redesign-release-review.md). The numbered entries retain the owner's decisions, not a new backlog.

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
| — | Finding selection **[owner]** | Historical rest finding + schedule comparison + shooting-by-rest finding. Select defensible results, not the largest noisy player split. | Rest/fatigue identity | Derived from published sources in `home-findings.ts` |

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
| 50 | Keyboard bypass | Keyboard-initiated navigation skips cross-fade. Preserve native semantics: Enter activates links; Space activates buttons, not ordinary links. | Implemented |
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


## Implementation refinements

Shooting uses the owner-selected option A: signed red/green tint on difference cells only,
bounded at ±10 percentage points; uncertain estimates stay muted. Full-row color and bar
variants were rejected. Season Report initially shows six team records and five largest
completed rest gaps including losses. Schedule Edge owns travel/workload and the completed-game
fatigue calendar; Shooting owns the zero-rest player workload disclosure.

The final page map and source paths live in [Frontend](../FRONTEND.md). Old mockups and phased
checkpoints were removed after delivery; Git snapshot `34b8961` preserves the exploration.
