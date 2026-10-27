# Product screenshots

Captured on 2026-10-27 from https://fullcourt.fyi after the v1.3.2 production alias was
verified at commit `8419bb8f8a62f06206255119f802103a1288cc68`, Ready deployment
`dpl_DxhVk7bmFU6YapGjtCxmRuMAPJQi`. [manifest.json](manifest.json) records each URL,
viewport, timestamp and page width. These are real rendered pages with live APIs, without
fixture substitution or image retouching. Data and default published seasons can change.
The two Shooting images were recaptured the same day at the completed 2025-26 season
(`?year=2025`) from deployment `dpl_7AAkjSBHZkFLc76iQwj1QhrBpWCx` (commit `0ce35fe2`, a
docs-only change over `8419bb8f`); the phone view starts at the season picker.

| Image | View |
| --- | --- |
| [games.png](games.png) | Desktop historical Games, 2024-12-02 |
| [shooting.png](shooting.png) | Desktop Shooting, 2025-26 season |
| [officiating.png](officiating.png) | Desktop Officiating overview and reviews |
| [games-mobile-375.png](games-mobile-375.png) | Games at 375 × 812 CSS pixels |
| [shooting-mobile-402.png](shooting-mobile-402.png) | Shooting at 402 × 874 CSS pixels, 2025-26, scrolled to the season picker |
| [schedule-mobile-402.png](schedule-mobile-402.png) | Schedule Edge at 402 × 874 CSS pixels |

[Social preview](../social-preview.png) was fetched from the live `/opengraph-image` endpoint
on the same date and visually checked; its bytes already matched the tracked preview.

The phone captures demonstrate the compact reading order, the shooting table with the rest
difference beside each player, and early schedule ranking. They use Chromium at device
scale 1 with reduced motion.
The generator waits for populated content and loaded fonts, and rejects page-wide horizontal
overflow. Desktop images end after a representative content row; phone images retain the
viewport and bottom navigation. Physical iPhone/Safari/VoiceOver behavior is unverified.

## Reproduce

Run from the repository root with Playwright Chromium installed. Verify the production alias
and exact deployed commit before filling the identity fields; the generator records supplied
values and does not query Vercel itself.

```sh
SCREENSHOT_BASE_URL=https://fullcourt.fyi \
SCREENSHOT_DEPLOYMENT_SHA=8419bb8f8a62f06206255119f802103a1288cc68 \
SCREENSHOT_DEPLOYMENT_ID=dpl_DxhVk7bmFU6YapGjtCxmRuMAPJQi \
node scripts/screenshots.mjs
```

Append image names without `.png` to capture selected views, for example
`node scripts/screenshots.mjs games shooting-mobile-402`. For a populated local app,
`SCREENSHOT_BASE_URL=http://localhost:3000 node scripts/screenshots.mjs` needs no deployment
identity. Local captures should not be described as production evidence.
