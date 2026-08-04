# FullCourt

These notes moved here from a local-only `AGENTS.md` on 2026-08-01, and only the durable rules
came with them. Anything with a real source of truth — versions, counts, model figures, env vars —
was dropped rather than copied, because that file had drifted from the code on every one of them.
**Trust the code over this file, and fix this file when they disagree.**

## What this is

FullCourt models how NBA **travel, rest, and schedule density** affect game outcomes. Each team
in a matchup gets a **fatigue score**; the differential is the **rest advantage**; the backtest
asks whether the more-rested team actually won — counting only the games the site **calls**, which
since 2026-08-02 means the more-rested team is also at home (`isCalledSide`,
`src/lib/rest-advantage-evidence.ts`). Rest alone never outweighs home court at any magnitude the
NBA produces, so a rested visitor is declined rather than picked.

- Live: https://fullcourt-nba.vercel.app · Repo: https://github.com/mhju0/fullcourt
- Headline figures are computed live from the database and rendered on the site. Do not hand-type
  one into prose — see the pinning rules below.

## Module status

**Nine product routes. Eight are published and complete; `/referees` is deliberately held back**
(see the hard ban below). Status and phase history live in committed docs, not here:

- [docs/ROADMAP.md](docs/ROADMAP.md) — project status, shipped modules, ongoing operational work
- [docs/PLAYOFF_PREDICTOR_DESIGN.md](docs/PLAYOFF_PREDICTOR_DESIGN.md) — Playoff Predictor design
  and build record, the single source of truth for that module
- [docs/SHOT_QUALITY_DESIGN.md](docs/SHOT_QUALITY_DESIGN.md) — Shot Quality, SQ-0 … SQ-7
- [docs/adr/](docs/adr/) — the accepted decisions. Read the relevant one before reopening a
  question it already settled.

New analytics modules are built as **additive, isolated slices** — their own scripts, tables,
routes and page — so they never destabilize the rest-advantage flow.

## Brand vs. metric (critical)

"FullCourt" is the product. "Rest advantage" is a **metric**: `restAdvantage`,
`restAdvantageDifferential`, `rest_advantage_differential`, `RestAdvPanel`,
`formatRestAdvantageDisplay`, and the `REST ADVANTAGE` / `RA` UI labels. Never rename the metric
while touching branding.

## Hard bans

- **Never publish `/referees`, and never "correct" its in-progress copy.** The page renders an
  in-progress `MessageCard` and the nav guide says `"Still being built."` **on purpose** — the
  data, `RefereeStyleContent` and its tests all work, but the writing around them is unfinished,
  and a per-official foul table without it reads as the bias claim the surface exists to refuse.
  A doc-currency pass will keep flagging this as stale drift; it is not. **This exact mistake was
  made and shipped on 2026-08-04 and had to be reverted** (PRs #9 → #10). Publishing it is a
  deliberate edit by Michael, never a side effect of tidying docs.
- **Never rename rest-advantage identifiers.** See above.
- **Never run `drizzle-kit push` or `drizzle-kit generate`.** `schema.ts` intentionally lags the
  live DB — `shot_grid` and `shot_value_surface` are read via raw SQL and are absent from it on
  purpose. Never reconcile it.
- **All schema changes are manual SQL applied by the human** in the Supabase SQL editor. Use the
  `fullcourt-migration` skill.
- **Python:** no Alembic. New code uses `logging`, not `print()` — every `ml/` script and the
  newer `scripts/sq*` / `aggregate_*` already do; the pipeline scripts (`daily_update.py`,
  `fetch_schedule.py`) still print to the Actions log and are left alone. HTTP goes through stdlib
  `urllib`; `requests` is present only because `nba_api` and `fetch_schedule.py` use it. **Do not
  add `httpx`** — it is not a dependency of this repo.

`src/lib/fatigue.ts` holds **ratified coefficients**. Never change a constant or a scoring term
without escalating: those numbers were hand-set and ratified before the backtest ran, so tuning
them against it would make the result circular. The file's *interface* is not frozen — ADR 0005
reshaped it deliberately. Structural changes go through an ADR; number changes go through Michael.

One coefficient has moved, and it is the precedent rather than a loophole: `ALTITUDE_MULTIPLIER`
was raised 1.15 → 1.29 on 2026-08-02 — the first ratified constant changed on measured evidence,
approved by Michael, reasoned in the constant's own docblock (`src/lib/fatigue.ts`) and in ADR
0006. It was fitted against **final margin**, not against the win rates the site publishes, which
is what keeps it non-circular. `ALTITUDE_CARRYOVER_MULTIPLIER` was deliberately *not* moved with it.

The ban was suspended once, deliberately, to find out whether fitted weights would beat the
ratified ones. They do not, by enough to matter — and most of the model's terms turn out to
carry no signal at all. Read [ADR 0006](docs/adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md)
before proposing either a refit or a new factor; it says what was already tried and measured.
Use the harness to answer questions of this shape — never a database recompute. It is **three**
steps and the middle one is not optional:

```
scripts/export_fatigue_features.ts   →  ml/data/fatigue_features.csv
ml/prepare_fatigue_dataset.py        →  ml/data/fatigue_model_table.csv
ml/fit_fatigue_weights.py            →  reads fatigue_model_table.csv
```

Skipping `prepare` fails **silently**: `fatigue_model_table.csv` is already on disk from the
2026-08-02 run, so the fit succeeds against a stale table and reports numbers that look valid.

## Domain rules that are easy to get wrong

- **Publishing a game row?** Go through `publishableGames()` (`src/lib/db/queries.ts`), which folds
  in `game_type = 'regular'` **and** the abnormal-stretch regime filter. Never hand-write either
  predicate — that is exactly how four readers quietly lost the regime filter, and
  `publishable-games.test.ts` now fails if a second copy appears.
- **Ingest records what was played.** 2019-20 is in `NBA_SEASONS`; each module decides what it may
  read. See [ADR 0004](docs/adr/0004-season-exclusions-belong-to-modules-not-ingest.md).
- **Dates are US/Eastern everywhere.** `games.date` is the ET calendar date of tip-off. App-side
  "today" uses `formatEasternDateKey()` — never the viewer's local date, never server UTC.
- **Never hardcode a derived season label.** Use the helpers in `src/lib/nba-season.ts`.
- **Never hand-roll a signed number.** `signedNumber()` (`src/lib/signed-number.ts`) — U+2212, bare
  zero, units at the call site.
- **Never hand-roll a failure card.** `MessageCard` (`src/components/ui/message-card.tsx`) carries
  `role="alert"` on the error tone; normalize the thrown value with `errMsg` (`src/lib/fetcher.ts`).
- **Published figures are pinned to generated artifacts, never typed into prose.** A number that
  cannot be pinned should be rewritten so it cannot age (`"every season since 1985-86"`, not a
  count).
- **The app is light-only** ("Broadcast"). It went light → dark → light once; do not reintroduce a
  dark token set without reading [docs/FRONTEND.md](docs/FRONTEND.md). `/about` is the one
  deliberately dark surface and is scoped to itself.

## Evidence discipline

- This environment has masked numeric digits in Bash stdout before. **Never trust grep/stdout for
  a number that matters.** Write it to a file and re-read it with the Read tool.

## Dev environment

- **Verification commands.** `pnpm test:run` (Vitest), `pnpm typecheck`
  (`tsc --noEmit --incremental false`), `pnpm lint` (ESLint), `pnpm build` (Next). Those four are
  the commit gate. E2E is `pnpm test:e2e` and is deliberately not part of it — see the Playwright
  note below.
- **pnpm is the package manager.** `pnpm-workspace.yaml` exists, so the repo root is a workspace
  root: adding a root dependency needs `pnpm add -w <pkg>`, or pnpm refuses.
- **Always run pipeline scripts from the project root.** `daily_update.py` and the backfills
  resolve the repo root relative to the file, and the `tsx` scripts rely on the `@/*` alias.
- **Python: three requirements files, and they are not interchangeable.** Activate a virtualenv,
  then `requirements.txt` (root, pinned) or `scripts/requirements.txt` (loose; what the
  **daily-update** workflow installs — `ci.yml` installs no Python deps, since its one unittest is
  stdlib-only). The `ml/` harness needs its own stack: `pip install -r ml/requirements.txt`
  (scipy + scikit-learn), deliberately isolated from the pipeline pins. Running the fatigue
  harness without it is an `ImportError`.
- Env vars are documented with descriptions in the committed `.env.example`.
- Playwright is **not** run in CI — its specs need a running server and a populated database.

## Documentation index

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — end-to-end data flow, module map, dated decisions
- [docs/DATABASE.md](docs/DATABASE.md) — tables, indexes, RLS policies, Data API grants
- [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md) — every script + the full fatigue-model math
- [docs/API.md](docs/API.md) — every route: params, response shape, DB reads
- [docs/FRONTEND.md](docs/FRONTEND.md) — pages, components, the `--term-*` design system
- [docs/TESTING_AND_CICD.md](docs/TESTING_AND_CICD.md) — Vitest/Playwright, CI, data workflow
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — domain language and the nav-label rationale
- [docs/SEASON_ROLLOVER.md](docs/SEASON_ROLLOVER.md) — rollover runbook and data-source matrix
- [docs/agents/](docs/agents/) — how the engineering skills consume this repo: domain-doc
  conventions, the `gh` issue-tracker rule, triage labels
- [docs/audit/](docs/audit/) — read-only audit reports, and the one directory the
  `fullcourt-audit` skill may write to

## Final report

End every task with this, in Korean:

```
변경 파일: (path — 무엇을, 왜)
영향 범위: (라우터/API/스키마/모델/프론트)
확인한 것: (실행한 검증 명령 + 결과, 핵심 수치는 file:line)
주의 사항: (수동 확인 필요, 남은 TODO, Escalate to senior 항목)
```
