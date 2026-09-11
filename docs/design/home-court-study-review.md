# Home-court study release review

D-70 adds the Explore study at `/home-court` and the selected-season home baseline to Season Report. The [research record](../research/2026-09-11-home-advantage-trend.md) retains source data, research links, and owner decisions.

## Design and behavior

The study follows FullCourt’s Front Office typography, surfaces, borders, spacing, and controls. Antislop applied during implementation. Annual observations use straight connections, with a solid home-rate line and dashed, diamond-marked rested-home line. Pointer, keyboard, and native season selection expose rates, counts, and the count-derived gap. The expandable table keeps season links reachable on narrow screens.

Season Report shows its own home baseline from the first eligible final result. Rested-home rates and gaps appear only at 100 eligible games. Ongoing seasons are labeled season to date and excluded from completed five-season endpoint summaries. Completion reflects recorded publishable fixtures, not an independent schedule census. Counts and research caveats distinguish descriptive rates from causal venue or rest effects.

## Local verification — September 11, 2026

- Lint, typecheck, documentation links, and the production build passed.
- All 992 unit tests across 75 files passed; Python contracts passed (2 pipeline and 33 ML tests).
- Production dependency audit reported no known vulnerabilities.
- Six new Playwright tests cover completed-only endpoint summaries, annual records and links, the 99/100-game boundary, first-result home rates, old cached payloads, mobile pointer/keyboard selection, table overflow, and an unfiltered axe accessibility scan.
- Four analysis comparison checks and the existing Season Report/navigation checks passed. Two Deep Dive checks initially timed out while loading under concurrent local verification; both passed when rerun serially.
- Populated browser inspection confirmed the real 41-season series, desktop report alignment, mobile chart readability, and expandable data table.
- The read-only coverage audit found 47,143 final eligible games with complete fatigue pairs. No schema, persistent-data, or model-coefficient changes were made.

Hosted preview and production evidence is recorded in the release PR. Browser automation does not claim physical-device or human screen-reader verification.
