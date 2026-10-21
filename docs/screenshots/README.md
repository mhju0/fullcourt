# Product screenshots

Captured on 2026-10-21 from https://fullcourt.fyi after the v1.1.0 production alias was
verified at commit `9c313de8f6e42ae3f7e89307b15a08225415339e`, Ready deployment
`dpl_7APuWsqku5cEFWRKdPfRnYgFh9Gc`. [manifest.json](manifest.json) records each URL,
viewport, timestamp and page width. These are real rendered pages with live APIs, without
fixture substitution or image retouching. Data and default published seasons can change.

| Image | View |
| --- | --- |
| [games.png](games.png) | Desktop historical Games, 2024-12-02 |
| [shooting.png](shooting.png) | Desktop Shooting, latest published default |
| [officiating.png](officiating.png) | Desktop Officiating overview and reviews |
| [games-mobile-375.png](games-mobile-375.png) | Games at 375 × 812 CSS pixels |
| [shooting-mobile-402.png](shooting-mobile-402.png) | Shooting at 402 × 874 CSS pixels |
| [schedule-mobile-402.png](schedule-mobile-402.png) | Schedule Edge at 402 × 874 CSS pixels |

[Social preview](../social-preview.png) was fetched from the live `/opengraph-image` endpoint
on the same date and visually checked; its bytes already matched the tracked preview.

The phone captures demonstrate the compact reading order, four-column shooting comparison
and early schedule ranking. They use Chromium at device scale 1 with reduced motion.
The generator waits for populated content and loaded fonts, and rejects page-wide horizontal
overflow. Desktop images end after a representative content row; phone images retain the
viewport and bottom navigation. Physical iPhone/Safari/VoiceOver behavior is unverified.

## Reproduce

Run from the repository root with Playwright Chromium installed. Verify the production alias
and exact deployed commit before filling the identity fields; the generator records supplied
values and does not query Vercel itself.

```sh
SCREENSHOT_BASE_URL=https://fullcourt.fyi \
SCREENSHOT_DEPLOYMENT_SHA=9c313de8f6e42ae3f7e89307b15a08225415339e \
SCREENSHOT_DEPLOYMENT_ID=dpl_7APuWsqku5cEFWRKdPfRnYgFh9Gc \
node scripts/screenshots.mjs
```

Append image names without `.png` to capture selected views, for example
`node scripts/screenshots.mjs games shooting-mobile-402`. For a populated local app,
`SCREENSHOT_BASE_URL=http://localhost:3000 node scripts/screenshots.mjs` needs no deployment
identity. Local captures should not be described as production evidence.
