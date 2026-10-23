# Officiating operations

The historical archive contains 12 regular seasons (2014–15 through 2025–26). New-season reports open with the first validated NBA publication. No database migration or new service credentials are needed to render it. Release verification is recorded in `docs/design/redesign-release-review.md`.

## Published data

`ml/publish_officiating.py` consumes complete immutable snapshots made by `ml/collect_l2m_season.py`. It validates identity, source hashes, known grades, duplicate assessments, and continuity of published report IDs before writing anything. Only regular-season (`002`) games enter v1. The 12 published seasons total 4,546 regular-season reports; the original three seasons retain their 1,152 reports. Snapshot boundaries and corrections remain documented in `docs/research/`.

Publication also requires a valid timezone-aware `finished_at` on each snapshot. For an already published season, `refreshedAt` must be valid and timezone-aware, and the incoming instant cannot be older. Equal instants are allowed only when the index hash and report ID/hash/source-URL sets match; verified crew normalization is separate from source freshness. All snapshots in a CLI batch pass validation before any output is written, including repeated seasons checked against the preceding staged result. Missing, malformed or timezone-free timestamps stop publication.

Output:

- `src/data/officiating.json`: season index, source provenance, game metadata and error counts.
- `public/data/officiating/<season>/<game>-<source-hash-prefix>.json`: every assessed play, NBA verdict text, video-page links, and available verified crew assignments.

The initial-release snapshot recipe below is historical. It cannot replace a season published from a newer snapshot. To reconstruct it, use `--root` with a separate output directory that has no newer publication:

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

The daily path is `.github/workflows/season-publications.yml`, at 10:50 and 21:50 UTC. It collects
the complete current NBA index, including source revisions, and publishes a validated
content-addressed snapshot to the dedicated data branch. No app deployment or manual data
PR merge is required. [Publication policy](EARLY_SEASON_PUBLICATION.md) documents validation,
per-module failures, compare-and-swap, hash-pinned details and fallback freshness.

The previous `officiating-refresh.yml` remains manual-only for archive investigation and
review branches. Missing indexes, failed requests, duplicate anomalies and removed report IDs
still refuse replacement. Before a never-published season has reports, exit 3 means unavailable.
Raw L2M source artifacts are retained for 90 days. The page shows current reports immediately
and keeps historical comparisons separate from a partial current season; no automatic
three-point monotonicity claim describes officiating as improving or worsening.

First remote verification: [run 34179954451](https://github.com/mhju0/fullcourt/actions/runs/34179954451). The 2025–26 refresh changed only the source-index hash and successful-refresh timestamp; report content and all counts were unchanged.

## UI behavior

Latest published season is the default; regular season is the only phase. The hero and chip counts stay league-wide when browser filters change. Game-row counts always describe all errors in that game; an active category filter states this explicitly. Category-filtered games include a matching identified error; team-only results retain clean games. “Copy report link” copies an absolute URL preserving season, team, category and game. Success is announced; clipboard failure exposes a selectable URL. Back/forward restores that context. Opening details changes the URL without scrolling; later rows naturally reflow.

Report files load only when opened. Failure preserves the game row and provides retry and the original NBA report. The errors-only view can expand to all assessments, including ungraded rows. Text is rendered as text after HTML decoding, never injected as markup. Video links follow the NBA report's own URL pattern, but the video endpoint returned 403 during verification; playback is not guaranteed. The UI labels them NBA video page.

`/referees` redirects to `/officiating`. Earlier referee studies remain at `/behind-the-data/referees/archive`, reachable through the new methodology's compact archive link. Their historical samples and original tests are retained.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, then `pnpm audit --prod`. Python publication contracts run with `python3 -m unittest discover -s ml/tests -p 'test_officiating_publish.py'`; the existing Python CI suite includes them.

Browser contracts live in `e2e/officiating.spec.ts`, with existing referee tests now exercising the archive. Use `PLAYWRIGHT_BASE_URL` for a populated preview or local production server. Header, alignment, accessibility, and layout route inventories include the new pages.

Local verification on 2026-09-07: lint, typecheck, production build, 945 unit tests, 24 ML Python contracts, two scripts contracts, and the production dependency audit passed. The full 315-case browser run passed 313 cases and found a search alias regression and a methodology-header line-wrap issue. Both were fixed; a final nine-case run passed the affected navigation/header checks and all Officiating browser contracts. Desktop and mobile axe checks passed. Workflow YAML, embedded shell syntax, scheduled offseason skipping, and manual season selection were checked locally; no remote workflow was dispatched.
