# Dependency closeout, 2026-10-18

Candidate based on main `69b5e026456f1d90c1308cbe81d02018657c819b` combines
Dependabot #172 (`8181a6e6297931726f668c99374bf53ebe47967c`) and #173
(`9643a8a1d0a9851adc70a31e3d0bba8dcc85780a`). Only the dependency manifest and
lockfile change runtime inputs. Next/eslint-config-next move together to 16.4.1;
React/react-dom move together to 19.3.1; Playwright moves to 1.64.1, shadcn to
4.21.5, and direct dotenv to 18.0.8. The combined lockfile differs from #172
only by #173's dotenv update; existing transitive dotenv 17.4.2 remains.

## Compatibility decision

[Next 16.4.1's release](https://github.com/vercel/next.js/releases/tag/v16.4.1)
contains security fixes. No application security or authentication logic changes.
The installed Next upgrading and environment-variable guides were read before
changing dependencies.

[Dotenv's upstream changelog](https://github.com/motdotla/dotenv/blob/v18.0.8/CHANGELOG.md)
records the v18 removal of vault support and preloading, an opt-in fast parser,
and logging changes (stderr injection messages, no tips). A repository search
found eight Node consumers, all using `config({ path: ".env.local" })`; none uses
vault, preloading, the CLI, or the fast parser. Python's separately pinned
python-dotenv is unchanged. Next itself uses its built-in environment loader.

Synthetic files were parsed with the installed old 17.3.1 and new 18.0.8 modules.
The checks passed for database URL punctuation, comments, empty values, single,
double and backtick quotes, escaped newlines, Unicode, export syntax, literal
dollar values, colon assignments and duplicate keys. Both versions preserved
exported-value precedence, first-file precedence across sequential config calls,
missing-file ENOENT errors and explicit override behavior. This was a bounded
compatibility probe, not an exhaustive dotenv parser equivalence proof. No real
environment file was read and no database or provider was contacted.

## Verification

Local checks used Node 22.13.0 and pinned pnpm 11.8.0 (frozen installation itself
ran under the workstation's Node 26.4.0). Node 22's bundled old Corepack could not
validate the current package-manager signing key; using the already-installed
newer Corepack with Node 22 resolved this without disabling signature checks.

- Frozen-lockfile install passed, including supply-chain policy validation.
- `pnpm lint` and `pnpm typecheck` passed.
- `pnpm test:run`: 99 files, 1,192 tests passed in 15.52 seconds.
- `pnpm build`: compiled Next 16.4.1, completed TypeScript and generated 42 static
  pages without database credentials; local Sentry uploads were explicitly skipped.
- `pnpm audit --prod`: no known vulnerabilities.
- `pnpm exec playwright test --config playwright.smoke.config.ts`: all 12 tests
  passed in 20.6 seconds on the built app, across desktop and phone/reduced-motion
  projects. Covered Games filters/URL/keyboard/calendar, palette/focus/navigation,
  reduced motion and axe checks with synthetic APIs. Temporary servers stopped.
  Sentry emitted a diagnostics-channel hook warning referencing `/ROOT` during
  startup; the SDK version is unchanged, tracing is not enabled, and no page/API
  errors were reported. This does not establish live Sentry span collection.

Both original PR heads already have successful checks, PostgreSQL, browser and
aggregate verify jobs. Their Ready previews were independently located by the
coordinator on 2026-10-18; preview existence is separate from rendered validation.
The combined candidate still requires its own CI/preview and release verification
before being treated as deployed. No merge or deployment is performed here.
