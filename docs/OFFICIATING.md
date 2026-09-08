# Officiating operations

The release contains 12 regular seasons of Officiating reports (2014–15 through 2025–26) and its publication pipeline. No database migration or new service credentials are needed to render it. Release verification is recorded in `docs/design/redesign-release-review.md`.

## Published data

`ml/publish_officiating.py` consumes complete immutable snapshots made by `ml/collect_l2m_season.py`. It validates identity, source hashes, known grades, duplicate assessments, and continuity of published report IDs before writing anything. Only regular-season (`002`) games enter v1. The 12 published seasons total 4,546 regular-season reports; the original three seasons retain their 1,152 reports. Snapshot boundaries and corrections remain documented in `docs/research/`.

Output:

- `src/data/officiating.json`: season index, source provenance, game metadata and error counts.
- `public/data/officiating/<season>/<game>-<source-hash-prefix>.json`: every assessed play, NBA verdict text, video-page links, and available verified crew assignments.

Regenerate all initial data:

```sh
python3 ml/publish_officiating.py \
  ml/data/l2m-research/2023-24/20260906T145128311475Z \
  ml/data/l2m-research/2024-25/20260906T145127099997Z \
  ml/data/l2m-research/2025-26/20260906T143154961791Z
```

The 12-season count baseline is pinned in `src/lib/__tests__/officiating.test.ts`. If a verified source revision changes those archived counts, update that baseline in the reviewed data PR. New seasons are checked against their report evidence by the Python contracts.

Do not edit published JSON manually. Source revisions produce a different report filename; retain old versions so a previously loaded index can still fetch its report. This is source-content addressing, not a cryptographic signature. Crew associations use previously verified joins when game metadata matches; new games say Assignment unavailable until their assignments are verified.

Historical PDF/JSON collection, normalization, independent grade checks, and source provenance are documented in the [archive publication record](research/2026-09-09-l2m-archive.md). The first season is partial and review criteria changed in 2017–18. Historical PDF video links remain unresolved; their original reports remain accessible.

## Refresh workflow

`.github/workflows/officiating-refresh.yml` runs daily at 20:30 UTC from October through June, or manually for a supplied season. Scheduled runs skip July through September; manual collection remains available. It re-fetches the entire current season so earlier revisions are eligible for publication. Missing indexes, failed requests, duplicate anomalies, and removed published IDs fail the refresh; they never overwrite the live site with partial totals. Before the first report in a new season the job may fail while the published previous season remains available.

The workflow uploads raw source evidence and its manifest as a run artifact retained for 90 days. Download evidence before expiration if permanent offline archival is required. Published sources remain externally linked and their hashes are retained in Git.

Successful refreshes prepare a data-update branch and attempt to open a PR, never merge to main. When repository policy blocks bot-created PRs, the job summary links to the validated branch comparison so an owner can open it. This implements the existing preview-review requirement. Public freshness advances only after review, merge and deployment, not merely when a scheduled job runs. Daily timestamps may create a PR even when counts are unchanged. Close superseded pending updates rather than merging stale snapshots after newer ones.

Operational checks:

- Workflow is on the default branch; Actions are enabled.
- Repository settings currently block Actions-created PRs; the validated-branch comparison link is the supported fallback.
- Confirm whether the Vercel integration builds previews for bot-created PRs. GITHUB_TOKEN-created events do not automatically trigger other GitHub workflows; do not assume CI ran. Run the required checks and verify the preview before merging an update.
- `official.nba.com` was reachable from Actions in the successful manual run on 2026-09-08. Complete collection, evidence upload, publication contracts, and the review-branch fallback passed.

First remote verification: [run 34179954451](https://github.com/mhju0/fullcourt/actions/runs/34179954451). The 2025–26 refresh changed only the source-index hash and successful-refresh timestamp; report content and all counts were unchanged.

## UI behavior

Latest published season is the default; regular season is the only phase. The hero and chip counts stay league-wide when browser filters change. Game-row counts always describe all errors in that game; an active category filter states this explicitly. Category-filtered games include a matching identified error; team-only results retain clean games. Share links preserve season, team, category and game. Back/forward restores that context. Opening details changes the URL without scrolling; later rows naturally reflow.

Report files load only when opened. Failure preserves the game row and provides retry and the original NBA report. The errors-only view can expand to all assessments, including ungraded rows. Text is rendered as text after HTML decoding, never injected as markup. Video links follow the NBA report's own URL pattern, but the video endpoint returned 403 during verification; playback is not guaranteed. The UI labels them NBA video page.

`/referees` redirects to `/officiating`. Earlier referee studies remain at `/behind-the-data/referees/archive`, reachable through the new methodology's compact archive link. Their historical samples and original tests are retained.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, then `pnpm audit --prod`. Python publication contracts run with `python3 -m unittest discover -s ml/tests -p 'test_officiating_publish.py'`; the existing Python CI suite includes them.

Browser contracts live in `e2e/officiating.spec.ts`, with existing referee tests now exercising the archive. Use `PLAYWRIGHT_BASE_URL` for a populated preview or local production server. Header, alignment, accessibility, and layout route inventories include the new pages.

Local verification on 2026-09-07: lint, typecheck, production build, 945 unit tests, 24 ML Python contracts, two scripts contracts, and the production dependency audit passed. The full 315-case browser run passed 313 cases and found a search alias regression and a methodology-header line-wrap issue. Both were fixed; a final nine-case run passed the affected navigation/header checks and all Officiating browser contracts. Desktop and mobile axe checks passed. Workflow YAML, embedded shell syntax, scheduled offseason skipping, and manual season selection were checked locally; no remote workflow was dispatched.
