# 2026–27 opening-quarter numeric audit

Captured 2026-10-20 KST (2026-10-19 16:23:44–16:23:45 UTC DB snapshot), source `f7a20dac58a52b1f4be50d562bdc327ea5bcf4c4`. Read-only audit: no database/schema writes, no production recomputation, no coefficient changes. Audit scripts and derived results are tracked here; raw responses and database snapshot are retained in gitignored `docs/audit/2026-10-20-schedule-audit/` and fingerprinted in `raw-manifest.json`.

## Coverage and oracle

- All 1,200 defined regular-season fixtures, 30 teams × 80 games, 2,400 latest fatigue rows, no duplicate latest-side rows or team/date double bookings.
- Target: every October–December fixture: **475 games / 950 team-games / 62 active game dates**. September–January DB context contains 711 regular-season games, starting October 20; no preseason records were present. Full-season chains are built before selecting target months, so month boundaries do not reset distance, rest, or streaks. January fixtures are retained for boundary inspection; future dates do not enter December backward-looking workload.
- Independent Python calendar-date oracle uses Eastern `games.date`, previous date for B2B, tonight plus the preceding 3 dates for 3-in-4, tonight plus preceding 5 for 4-in-6. Held fixtures are excluded; none currently exist in this season. The held-fixture failure path was inspected in source, not exercised by authentic season rows.
- Independent haversine calculation uses all 30 captured arena coordinates, known neutral venues, full-season preceding arena, first-game origin at own arena. Each inbound leg appears once in season totals; rolling 7-day values additionally include inbound legs arriving at prior games dated D−7 through D−1. The inbound leg to the first included prior game may have been travelled earlier. No return trip after December 31 is invented.
- Public `https://fullcourt.fyi/api/games/YYYY-MM-DD`: every one of the 62 target dates, 950 team-games. ESPN: all 153 September–January calendar-date responses, 711 defined regular-season fixtures and 4 unresolved placeholders.

| Month | Games | B2B team-games | 3-in-4 team-games | 4-in-6 team-games | Once-counted arena-leg miles |
| --- | ---: | ---: | ---: | ---: | ---: |
| October | 88 | 30 | 44 | 42 | 83,886.906 |
| November | 215 | 72 | 103 | 111 | 222,625.714 |
| December | 172 | 61 | 77 | 83 | 191,088.024 |
| Total | 475 | 163 | 224 | 236 | 497,600.646 |

Totals combine both teams' schedules; flags overlap and are not counts of unique difficult stretches. Miles above reproduce the current stored venue assumptions; Austin omission below means they are not a fully venue-correct estimate.

## Confirmed passes

The [official NBA by-date schedule PDF](https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf), dated August 13 and explicitly subject to change, was parsed completely: 1,200 rows, zero rejected rows, zero fixture/date/tip differences against DB. This establishes release-schedule fidelity, not that every tip is still current. All target stored B2B, 3-in-4, 4-in-6, days-since, prior-7/prior-30 counts and rolling-mile values match the independent oracle. All 950 public API side records match those fields, normalized full days off, and current-away streak. Current score engine replay also matches all 950 composite stored scores exactly.

DB LAC (33.9534, −118.3417) corresponds to Intuit Dome, and GSW (37.7680, −122.3877) to Chase Center; neither uses its old home coordinates. [Intuit Dome identifies itself as the Clippers' home](https://www.intuitdome.com/). This is not an independently surveyed coordinate inventory of all 30 arenas.

## Findings

1. **Current tip update is missing:** October 23 CHI at MIL is stored and served as 8 p.m. ET / October 24 00:00 UTC, matching the August PDF. Current ESPN gives October 23 20:00 UTC / 4 p.m. ET. The [October 16 official change announcement](https://www.nba.com/news/milwaukee-bucks-move-home-opener-world-series) and current Bulls team schedule corroborate a move to 3 p.m. Milwaukee time. The announcement's introductory ET wording conflicts with its local-time body; current team schedule plus ESPN resolve 4 p.m. ET. Date-based B2B/density/miles are unaffected. Source freshness needs repair through a reviewed existing writer; this audit writes nothing.
2. **Physical venue omission:** October 23 HOU at SAS, game 118719, is at Moody Center, Austin. Official PDF note A and current ESPN venue ID 7317 both identify Austin. DB has `neutral_site=false`, no venue override; model places it at San Antonio's home arena. SAS gets a zero-mile home-to-home inbound leg. This is an alternate Spurs home court: do not automatically change `neutral_site=true`, which would also change home-court eligibility and workload semantics. Venue coordinates need a representation separate from home-court designation, or an explicit domain decision. No exact Austin coordinate sensitivity is claimed here.
3. **Stored homecoming streak/model disagreement:** 208 of 950 stored side records retain the previous away-game streak on a home return, while the documented current-away streak is 0 and public API displays 0. `venueStreak` in `src/lib/fatigue.ts` counts trailing prior road games without resetting when tonight is home. 66 of those home games have prior streak >2 and a positive road term. Holding ratified constants and all other inputs fixed, diagnostic removal of that home-game road term changes 18 rested-side/neutral classifications and 21 gap-size classifications. Maximum score difference: NYK vs UTA December 23, prior road streak 7, road term 1.70; score 4.86 → 3.16, home-relative gap −0.87 → +0.83. Earliest positive example: DET vs CHA October 28, prior road streak 3, road term 0.34; multiplied score effect 0.48 (7.03 → 6.55). This is a semantic counterfactual for owner/reviewer assessment, not an approved model change or an actual-results claim.
4. **Conflicting upcoming tip:** October 24 HOU at ATL is stored/PDF 8 p.m. ET; current ESPN says 8:30 p.m. ET. Current NBA game/team evidence checked by root still says 8 p.m. ET. Preserve as provider disagreement until resolved; do not blindly adopt ESPN. It is not a fixture/date mismatch.

## Travel interpretation and provisional dates

`per-leg.csv` has all 2,400 full-season team legs and explicitly marks target rows. Within October–December: 273 zero legs, maximum inbound 2,438.084 miles (BKN from New York to Portland December 29), maximum rolling 7-day value 5,474 miles (LAC November 1). No negative or geographically impossible distances emerged under the current arena assumptions. Zero home stands and repeated venues are expected; Austin is the confirmed misplaced zero.

There are **43 away-to-away gaps of at least 3 calendar days**, of which **6 cross the December 4–10 unresolved Cup window** and may acquire intervening games. These are sensitivity candidates, not evidence that a team returned home. There are **33 nonzero local legs under 100 miles**: LAC/LAL 10, GSW/SAC 7, NYK/PHI 6, CHI/MIL 3, BKN/NYK 3, CLE/DET 2, BKN/PHI 2. They do not establish an actual flight. Arena-to-arena distance is a schedule-geography proxy, not charter, airport, road or observed travel mileage. The candidate CSV includes hypothetical via-home distance only to show the numerical range; no default return-home rule is justified by the schedule alone.

The [NBA release](https://pr.nba.com/2026-27-nba-regular-season-schedule/) and [NBA Cup FAQ](https://www.nba.com/news/nba-cup-frequently-asked-questions) explain two unresolved games per team. Current 1,200 vs eventual 1,230 regular-season games leaves 30 fixtures undefined, concentrated December 4–10. December 11 Cup championship does not count in regular-season standings. Known December totals and subsequent rolling workload/travel are provisional; the undefined matchups and actual itineraries cannot be verified now. Mexico City November 7 is correctly flagged and resolves the configured arena coordinates; January Paris/Manchester records are present and outside the requested quarter.

## Reproduce and evidence

From repository root, use installed pnpm (or `node_modules/.bin/tsx` if pnpm is absent from this shell):

```sh
pnpm exec tsx docs/research/2026-10-20-schedule-audit/capture.mts
node docs/research/2026-10-20-schedule-audit/fetch-providers.mjs
node docs/research/2026-10-20-schedule-audit/fetch-daily.mjs
python3 docs/research/2026-10-20-schedule-audit/audit.py
pnpm exec tsx docs/research/2026-10-20-schedule-audit/score-diagnostic.mjs
```

Capture needs existing `.env.local` DATABASE_URL; it never prints credentials and begins a `REPEATABLE READ READ ONLY` transaction. Provider PDF text conversion needs `pdftotext`. Oracle/replay run entirely against snapshots. `SCHEDULE_AUDIT_RAW_DIR` overrides the gitignored raw directory. Fresh captures intentionally replace the snapshot: preserve the dated manifest before refreshing. Daily capture reuses already captured ESPN files; remove/relocate that raw subdirectory before a genuinely fresh ESPN pass. The failed NBA CDN attempt (HTTP 403) and unsupported ESPN range attempt (HTTP 400) are retained; individual-day ESPN requests all succeeded.

Outputs: `numeric-summary.json`, `team-month.csv`, `calendar-oracle.csv`, `stored-mismatches.csv`, `api-mismatches.csv`, `schedule-differences.csv`, `tip-differences.csv`, `espn-differences.csv`, `per-leg.csv`, `travel-candidates.csv`, `homecoming-impact.csv`, `score-diagnostic.json`. Empty difference CSVs have headers only. Raw SHA-256 fingerprints identify exactly what was exercised. No UI/browser rendering, actual flight logs, future Cup fixtures, held real-season rows, production writes or corrective deployment were exercised.
