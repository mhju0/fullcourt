# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# FullCourt project rules

Everything above is the baseline. This half is FullCourt-specific and **additive**: where a
project rule is stricter, the stricter rule wins.

These notes moved here from a local-only `AGENTS.md` on 2026-08-01, and only the durable rules
came with them. Anything with a real source of truth — versions, counts, model figures, env vars —
was dropped rather than copied, because that file had drifted from the code on every one of them.
**Trust the code over this file, and fix this file when they disagree.**

## What this is

FullCourt models how NBA **travel, rest, and schedule density** affect game outcomes. Each team
in a matchup gets a **fatigue score**; the differential is the **rest advantage**; the backtest
asks whether the more-rested team actually won.

- Live: https://fullcourt-nba.vercel.app · Repo: https://github.com/mhju0/fullcourt
- Headline figures are computed live from the database and rendered on the site. Do not hand-type
  one into prose — see the pinning rules below.

## Module status

Both additive modules are **complete**. Status and phase history live in committed docs, not here:

- [docs/ROADMAP.md](docs/ROADMAP.md) — project status, shipped modules, ongoing operational work
- [docs/PLAYOFF_PREDICTOR_DESIGN.md](docs/PLAYOFF_PREDICTOR_DESIGN.md) — Playoff Predictor design
  and build record, the single source of truth for that module
- [docs/SHOT_QUALITY_DESIGN.md](docs/SHOT_QUALITY_DESIGN.md) — Shot Quality, SQ-0 … SQ-7
- [docs/adr/](docs/adr/) — five accepted decisions. Read the relevant one before reopening a
  question it already settled.

New analytics modules are built as **additive, isolated slices** — their own scripts, tables,
routes and page — so they never destabilize the rest-advantage flow.

## Brand vs. metric (critical)

"FullCourt" is the product. "Rest advantage" is a **metric**: `restAdvantage`,
`restAdvantageDifferential`, `rest_advantage_differential`, `RestAdvPanel`,
`formatRestAdvantageDisplay`, and the `REST ADVANTAGE` / `RA` UI labels. Never rename the metric
while touching branding.

## Hard bans

- **Never rename rest-advantage identifiers.** See above.
- **Never run `drizzle-kit push` or `drizzle-kit generate`.** `schema.ts` intentionally lags the
  live DB — `shot_grid` and `shot_value_surface` are read via raw SQL and are absent from it on
  purpose. Never reconcile it.
- **All schema changes are manual SQL applied by the human** in the Supabase SQL editor. Use the
  `fullcourt-migration` skill.
- **Python:** `logging`, not `print()`. `httpx`, not `requests`. No Alembic.
- **No secrets in code or logs.**

`src/lib/fatigue.ts` holds **ratified coefficients**. Never change a constant or a scoring term
without escalating: those numbers were hand-set and ratified before the backtest ran, so tuning
them against it would make the result circular. The file's *interface* is not frozen — ADR 0005
reshaped it deliberately. Structural changes go through an ADR; number changes go through Michael.

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
- Tag conclusions `[Verified file:line]` / `[Inferred]` / `[Unknown]`. No untagged claims.
- Verify before prescribing: check whether a workflow trigger already exists before adding one,
  whether a component is actually unused before removing it, and the real deployed URL before
  baking it into a file.

## Dev environment

- **pnpm is the package manager.** `pnpm-workspace.yaml` exists, so the repo root is a workspace
  root: adding a root dependency needs `pnpm add -w <pkg>`, or pnpm refuses.
- **Always run pipeline scripts from the project root.** `daily_update.py` and the backfills
  resolve the repo root relative to the file, and the `tsx` scripts rely on the `@/*` alias.
- **Python:** activate a virtualenv, then `pip install -r requirements.txt` (root, pinned) or
  `scripts/requirements.txt` (loose; what CI installs).
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

## Final report

End every task with this, in Korean:

```
변경 파일: (path — 무엇을, 왜)
영향 범위: (라우터/API/스키마/모델/프론트)
확인한 것: (실행한 검증 명령 + 결과, 핵심 수치는 file:line)
주의 사항: (수동 확인 필요, 남은 TODO, Escalate to senior 항목)
```
