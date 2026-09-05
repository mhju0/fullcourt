# FullCourt

Evidence order: source/tests → Git → docs/DECISIONS.md → docs/ROADMAP.md → docs/PROJECT_HANDOFF.md → historical Claude material. Record significant decisions in DECISIONS.md, material roadmap changes in ROADMAP.md, and high-level state/architecture changes in PROJECT_HANDOFF.md. Claude harness configuration is not inherited; migration requires an explicit request.

- From the repository root: `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm build`, `pnpm start`. CI uses Node 22 and Python 3.11; pnpm is pinned in package.json. Root dependency additions require `pnpm add -w`.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, `pnpm audit --prod`. CI also runs Python contracts in scripts/tests and ml/tests; commands and dependencies are in docs/TESTING_AND_CICD.md.
- `pnpm test:e2e` starts or reuses localhost:3000 through Playwright and needs a populated database. It is not run in CI.
- Environment: .env.example. Database pages need DATABASE_URL and populated data. Python requirements: requirements.txt for local pipelines, scripts/requirements.txt for the daily workflow, ml/requirements.txt for modeling.
- src/lib/db/schema.ts is deliberately incomplete: shot_grid and shot_value_surface are queried with raw SQL. drizzle/ contains manual SQL records, not an automatic bootstrap. Do not run drizzle-kit push/generate or reconcile the database to the ORM schema. Prepare schema changes as SQL for the owner to apply manually.
- src/lib/fatigue.ts contains ratified coefficients. Coefficient changes require an explicit owner decision; preserve the evaluation protocol in docs/adr/0006-fatigue-weights-were-fitted-and-the-model-was-not-changed.md, including its amendments.
- Game dates are America/New_York calendar dates; use formatEasternDateKey(). Published regular-season game reads use publishableGames() in queries.ts. The headline counts isCalledSide() games (rested home team), keeps rested visitors separate, and compares rates with venue baselines.
- FullCourt is the product; rest advantage is the metric. Preserve rest-advantage identifiers when changing branding.
- Generated analytics artifacts in src/data/, public/data/, and the model-facts files must stay aligned with their producing scripts and pinning tests; do not hand-edit published figures. shadcn is a build dependency: globals.css imports shadcn/tailwind.css.
