# Full-season audit artifacts

Read [FULL_SEASON_AUDIT.md](FULL_SEASON_AUDIT.md) for scope, findings, monthly totals, source hierarchy and limits. This covers all assigned 2026–27 regular fixtures through April 11; the previous opening-quarter audit remains historical.

- `numeric-summary.json`: coverage and comparison results.
- `team-season.csv`: all 30 teams; assigned games, B2B, 3-in-4, 4-in-6, once-counted Mileage, maxima, local legs, homecoming load counts and geography research queue counts.
- `team-month.csv`: 210 team-month summaries, computed from a single full-season chain.
- `calendar-oracle.csv`: 2,400 expected team-game workload/mileage records.
- `per-leg.csv`: 2,400 incoming arena legs; the first starts at own arena, no post-season return invented.
- `all-consecutive-away-pairs.csv`: 680 pairs with direct/via-home/detour/proximity metrics and break flags.
- `geography-research-queue.csv`: 55 pairs screened with gap ≥2 days and extra via-home mileage ≤150; explicit research threshold, not inferred itinerary.
- `travel-candidates.csv`: 99 away-to-away gaps ≥3 days plus 86 local nonzero legs; `all-long-gaps.csv`: all 424 team gaps ≥3 days.
- `current-provider-venues.csv`: all 1,200 current venue IDs/names; three Austin and three neutral venues differ from each nominal home team's majority venue.
- `stored-mismatches.csv`: 508 homecoming road-streak fields.
- `homecoming-impact.csv` / `score-diagnostic.json`: 185 positive homecoming road terms and fixed-input diagnostic effects; no coefficient change.
- `home-stand-feature-mismatches.json`: 507 current-away sides retaining a prior home-stand feature; does not enter current score.
- `api-mismatches.csv`, `schedule-differences.csv`, `tip-differences.csv`: header-only means no differences against the stated DB/initial-PDF/API snapshots.
- `espn-differences.csv`: two tips now corroborated by current primary sources.
- `teams.json`: all current DB arena coordinates; `raw-manifest.json`: retained raw hashes and sources.

No application/database changes or production rescore occurred. All totals are provisional: 30 regular-season fixtures remain undefined; the separately excluded Cup championship is still physical workload for two unknown participants. Actual flights, travel home, arrival times and airport usage remain unknown.

Reproduce from the repository root:

```sh
pnpm exec tsx docs/research/2026-10-20-full-season-audit/capture.mts
node docs/research/2026-10-20-full-season-audit/fetch-providers.mjs
node docs/research/2026-10-20-full-season-audit/fetch-daily.mjs
pnpm exec tsx docs/research/2026-10-20-full-season-audit/score-diagnostic.mjs
python3 docs/research/2026-10-20-full-season-audit/audit.py
python3 docs/research/2026-10-20-full-season-audit/verify_artifacts.py
python3 docs/research/2026-10-20-full-season-audit/fingerprint.py
```

Use `node_modules/.bin/tsx` if pnpm is missing from the current shell. Capture reads existing `.env.local` without printing its values and starts `REPEATABLE READ READ ONLY`; it requires the existing postgres/dotenv dependencies. PDF conversion requires `pdftotext`. `fetch-daily.mjs` makes a fresh ESPN pass on 242 dates with four bounded workers, then reads each of 156 assigned public API dates sequentially with an 800ms pause and a 429 retry. Raw default: gitignored `docs/audit/2026-10-20-full-season-audit/`; `SCHEDULE_AUDIT_RAW_DIR` overrides it. Preserve hashes before replacing a dated capture.

The current manifest preserves the earlier byte-identical official August schedule PDF capture. Additional dated primary releases and current venue pages are listed in `additional-sources.json`; fetch their recorded URLs to recreate those corroboration snapshots. A live provider refresh can change legitimate tips/venues or fill Cup fixtures, requiring a new dated assessment rather than treating old assertions as permanent league rules.

Checks exercised: `audit.py`, `score-diagnostic.mjs`, `verify_artifacts.py`, targeted audit-script ESLint, repository `tsc --noEmit --incremental false`, Python compile and JavaScript syntax checks. No full app unit suite, UI rendering or deployment was needed for these audit documents.
