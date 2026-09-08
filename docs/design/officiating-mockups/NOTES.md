# Officiating mockups

Open `desktop.html` or `mobile.html` directly in a browser. Each file embeds its CSS, vanilla JavaScript, Geist, and Geist Mono. No framework, installation, build, server, or network connection is needed for the mockup itself. External source/methodology links require internet access.

Desktop is designed for a 1280px viewport. Mobile has a 390px maximum canvas, including when opened on a desktop, and also reflows at 320px.

## Assumptions and deliberate simplifications

- These are isolated design artifacts, not a new production route. The existing referee page is untouched.
- The shell uses a compact FullCourt text lockup and a visible design-mockup label; it does not reproduce full production navigation or exact optical wordmark kerning.
- Geist stays the display face. Blue is #245BB7; gray denotes incorrect whistles. Indigo is confined to the existing wordmark treatment. There is no animation.
- Only supplied regular-season figures are used. Season selection updates the hero, denominator, and All error count. The historical strip and three-season trend remain fixed context; the latest season stays blue.
- The split uses exact count proportions. The strip plots 84.6%, 80.0%, and 81.9% on a labeled 50–100% range, with rounded 85%, 80%, and 82% labels as requested. Seven empty, outlined slots demonstrate expansion to ten seasons without claiming future values or dates. Labels remain visible while scrolling.
- The initial error example is expanded to expose the verdict treatment. The long verdict repeats explicit placeholder strings solely to stress wrapping. Several errors, clean reports, and assessment labels are illustrative states, not real game records.
- All team names, monochrome team marks, dates, crews, game-level counts, categories, report URLs, video URLs, and verdicts are placeholders. Unknown counts are [N], never zero. No real matchups or verdict wording have been invented.
- Call-type counts remain [N] except All. Without category counts, proportional chip fills would fabricate magnitudes, so the chips use text counts only. All counts identified errors, not games.
- Browser filters never change the league-wide figures. Category selection demonstrates hiding clean games; the remaining error example does not claim a real category match. The team select contains explicit clean and empty demonstration options. Team-only clean filtering keeps the no-error example visible.
- The supplied brief has no playoffs data. The empty state says playoffs are not included in this mockup; it does not claim NBA playoff reports do not exist.
- Source/video destinations for individual plays are visibly marked, noninteractive URL placeholders. The unavailable-video state is separate. Behind the Data links to the existing FullCourt site, and the unavailable-report example links to the NBA season report index.
- Game links use local `?game=example-…` URLs and reopen their corresponding detail. These demonstrate addressability, not production game IDs or hosted sharing. Filter/season URL persistence is not implemented. Clicking the link updates the current URL without scrolling.
- Native details/summary provides keyboard expansion. The selected row remains anchored while subsequent content reflows; filters persist on opening/closing.
- State studies below the section footer are a design-review gallery and would not ship as part of the page. They include loading, unavailable report, empty filter, empty playoffs, a team-only clean example, and the ten-season strip. Loading skeletons are static.

## Verification

Checked both files in headless Chromium at 1280px and 390px and inspected full-page renders. Also checked narrow overflow at 320px and the mobile file's 390px canvas on a desktop viewport.

Passed: season counts, phase switching, category/team filters, reset, clean and empty states, keyboard expansion, selected-row position preservation, visible control heights of at least 44px, embedded font loading, no page JavaScript errors, and zero animated elements. The ten-season strip scrolls without widening the page.

Computed text contrast: muted text 5.50:1, blue on expanded surface 5.80:1, gray on expanded surface 5.14:1. Control borders and prior-season bar outlines exceed 3:1 against the page surface. These are focused checks, not a complete assistive-technology audit. No production app build or database tests were needed for standalone artifacts.
