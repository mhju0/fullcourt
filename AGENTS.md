# FullCourt

Evidence order: source/tests → Git → docs/DECISIONS.md → docs/ROADMAP.md → historical Claude material. Record significant decisions in DECISIONS.md and material roadmap changes in ROADMAP.md. Claude harness configuration is not inherited; migration requires an explicit request.

- From the repository root: `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm build`, `pnpm start`. CI uses Node 22 and Python 3.11; pnpm is pinned in package.json. Root dependency additions require `pnpm add -w`.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, `pnpm audit --prod`. CI also runs Python contracts in scripts/tests and ml/tests; commands and dependencies are in docs/TESTING_AND_CICD.md.
- Verification budget, to keep a task to minutes on the owner's Mac: while working, run `pnpm typecheck`, ESLint on changed files, and the Vitest files that cover the change; run the full `pnpm test:run` (about 20s, capped at half the cores) once before committing. For e2e, run only the specs that cover the changed route or copy, against one `pnpm build && pnpm start` server reused across runs; rebuild only after code changes. Rerun failures alone before investigating them. The full e2e suite, `audit:alignment`, multi-width sweeps and other site-wide scans run only when the owner asks or before a release. Search inside the repository, never the whole disk. Stop the server you started when the task ends.
- Everything local stays inside this folder; never create folders beside it in the parent Projects directory. Worktrees go in `.local/worktrees/<name>`, archives and backups in `.local/archive/`, other scratch in `.local/`. `.local/` is gitignored and excluded from TypeScript and ESLint. Never run `git clean -x` (or `-X`) here: it deletes ignored files, including the archive.
- `pnpm test:e2e` starts its own server and needs a populated database. Set PLAYWRIGHT_PORT for another port, or PLAYWRIGHT_BASE_URL to test an existing server. CI runs only the bounded smoke gate (`playwright.smoke.config.ts`, API fixtures); the full database-backed suite is a release check.
- Merging to `main` deploys directly to Vercel production; verify the PR preview before merging.
- Environment: .env.example. Database pages need DATABASE_URL and populated data. Python requirements: requirements.txt for local pipelines, scripts/requirements.txt for manual pipeline tools (the scheduled daily workflow installs nothing), ml/requirements.txt for modeling.
- src/lib/db/schema.ts is deliberately incomplete: shot_grid and shot_value_surface are queried with raw SQL. drizzle/ contains manual SQL records, not an automatic bootstrap. Do not run drizzle-kit push/generate or reconcile the database to the ORM schema. Prepare schema changes as SQL for the owner to apply in the Supabase SQL editor; never apply it yourself or assume it was applied. Python has no Alembic.
- src/lib/fatigue.ts contains ratified coefficients. Coefficient changes require an explicit owner decision (tuning them against the backtest would make it circular); structural changes to its interface go through an ADR. Before proposing a refit or a new factor, read docs/adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md, including its amendments, and use its three-step harness, never a database recompute: `scripts/export_fatigue_features.ts` → `ml/prepare_fatigue_dataset.py` → `ml/fit_fatigue_weights.py`. Skipping `prepare` raises `StaleFatigueArtifact` (`ml/fatigue_artifacts.py`).
- Game dates are America/New_York calendar dates; use formatEasternDateKey(), never the viewer's date or server UTC. Published game reads go through publishableGames() in queries.ts (regular season plus the regime filter); never hand-write either predicate. Ingest records every season; each module decides what it reads (ADR 0004).
- The headline counts isCalledSide() games (rested home team), keeps rested visitors as their own row, and reads every rate against a venue baseline (`AnalysisResponse.venueBaseline`, per season on the season chart), never a 50% line. The retired claims about rest never outweighing home court stay retired; `src/lib/rest-split-facts.ts` holds what replaced them.
- FullCourt is the product; rest advantage is the metric. Preserve rest-advantage identifiers when changing branding.
- Generated analytics artifacts in src/data/, public/data/, and the model-facts files must stay aligned with their producing scripts and pinning tests; do not hand-edit published figures. shadcn is a build dependency: globals.css imports shadcn/tailwind.css.
- Shared helpers, never hand-rolled: season labels `src/lib/nba-season.ts`; signed numbers `signedNumber()`; failure cards `MessageCard` with `errMsg`.
- Officiating is published at `/officiating` (`/referees` redirects, D-60). Publishing or unpublishing a route is a deliberate product act, never a side effect of a docs change. Quote a per-official figure only beside what chance produces at the same bar, with the caveat that three officials share every game.
- New analytics modules are additive, isolated slices: their own scripts, tables, routes and page.
- The app is light-only; `/` is the one dark surface, scoped with `fc-chrome-front`. Read docs/FRONTEND.md before any theme change.
- Python: new code logs with `logging`; HTTP uses stdlib `urllib`; `httpx` is not a dependency. Run pipeline scripts from the repository root.
- Docs: start at docs/README.md. A new page starts from docs/ADDING_A_SURFACE.md; a UI/UX pass starts from the open rows of docs/UIUX_CHECKLIST.md and flips its row in the same commit; domain terms in docs/GLOSSARY.md. `docs/agents/` and `docs/audit/` are local and gitignored.

## Release versioning

FullCourt v1.0.0 officially released on October 19, 2026 (D-117). For each subsequent
production release, bump package.json, add a dated CHANGELOG.md entry, and create a
matching immutable version tag and GitHub release after verification. See CHANGELOG.md
for patch/minor/major conventions. Do not move published release tags.

## Agent memory and handoff

- At session start, read `.memory/README.md` (private, git-ignored).
- Before ending a session that changed something or left work unfinished, update `.memory/handoff.md`.
- Product and engineering decisions go in docs/DECISIONS.md and docs/adr/; the owner's preferences about agent work go in `.memory/decisions.md`.
- Durable repository rules belong in AGENTS.md, not in `.memory/`.

<!-- antislop:start -->
## antislop

For UI, copy, accessibility, mobile layout, or code comments work, read `anti-slop/antislop.md`, then the relevant skill:
- UI / visual: `anti-slop/skills/antislop-ui/SKILL.md`
- Copy & text: `anti-slop/skills/antislop-copywriting/SKILL.md`
- Accessibility: `anti-slop/skills/antislop-human/SKILL.md`
- Mobile / responsive: `anti-slop/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `anti-slop/skills/antislop-code/SKILL.md`

Use `docs/design/BRAND_GRAMMAR.md` for existing design direction. Before UI work, ask whether antislop applies during the work or as an audit afterward, unless the session already establishes the mode. Explicit user instructions and existing owner decisions take precedence over skill defaults.
<!-- antislop:end -->

## Agent skills

### Issue tracker

For issue operations, use GitHub Issues in `mhju0/fullcourt`.
Read `docs/agents/issue-tracker.md`.

### Triage labels

Before triaging, read the five default role mappings in
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `docs/GLOSSARY.md` and `docs/adr/`.
Before domain exploration, read `docs/agents/domain.md`.

## Final report

End every task with this, in Korean:

```
변경 파일: (path — 무엇을, 왜)
영향 범위: (라우터/API/스키마/모델/프론트)
확인한 것: (실행한 검증 명령 + 결과, 핵심 수치는 file:line)
주의 사항: (수동 확인 필요, 남은 TODO, Escalate to senior 항목)
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
