# Repository and local research maintenance — 2026-10-20

The owner requested cleanup after the historical data audit. The original v1.0.7
verification below remains dated evidence. The v1.0.9 follow-up at the end integrates the
subsequent arena correction while preserving calculations, source decisions and receipts.

## Local files reconciled

The primary checkout was fast-forwarded to the released source. Seventeen ignored
research CSVs, coverage files and reports were synchronized from the verified recalculation
outputs. Their SHA-256 values match the retained producer manifest. Previous differing
copies were archived before replacement. This includes both fatigue feature/model tables,
so the primary checkout no longer carries the pre-correction versions of those inputs.

Four idle, reproducible Next build directories were removed from the primary,
player-rest, recalculation and serverless-pool worktrees (322,159,008 logical bytes).
The primary checkout's previous generated browser report was archived. Source caches,
model binaries, dependency installs, database backups and historical research were preserved.
These are local housekeeping actions, not changes to the published analytics.

## What remains active

The export → prepare → analysis chain remains operational. The exporter checks stored-score
fidelity; preparation joins player/team box scores; downstream studies consume those inputs.
The maintenance guards bind successful outputs to content hashes and their producing source
files. They refuse missing receipts, stale preparation, source changes and cache inventory
changes before dependent calculations or output writes. Existing files are not retroactively
certified. Rebuild them through the producers; see [the analysis inventory](../../ml/README.md).

A receipt establishes consistency with the captured local inputs and source files. It does
not establish that an offline export matches the current production database or that an
upstream provider is correct. Database/source audits remain separate evidence.

## What remains historical

- `scripts/history-correction/` and `scripts/overtime-correction/` retain their frozen,
  guarded transition logic. Do not rewrite their old manifests to run a later correction.
- Field-specific source adjudications, raw responses, database captures and rollback backups
  remain at their original paths. Several manifests bind absolute paths and hashes.
- The player-rest source cache remains intact: existing audit proofs name its files directly.
- Prototype and audit branches retain decisions and mock designs. A clean worktree or squash
  merge alone is insufficient evidence that its ignored research material is disposable.
- Older research scripts with dedicated documentation or callers remain available. Their
  presence does not authorize a production write or a model refit.

Local evidence is indexed under `docs/audit/repository-cleanup-20261020/` in the primary
checkout: `local-cache-sync.json`, `cache-cleanup.json` and `shadow-binding.json`.
The release audit lives under `docs/audit/release-numbers-20261020/`; the frozen overtime
worktree retains `release-acceptance.json`, actual before/after snapshots and public API checks.
These ignored records stay private and are absent from fresh clones.

## Verification before independent review

All 1,366 Vitest tests across 118 files, 72 ML Python contracts, TypeScript, ESLint,
documentation links, dependency audit and the production build passed. The guarded producers
ran against a SELECT-only local clone whose complete six-table hash matches the accepted
production after-state. Feature CSV SHA-256 remains `d720448021fd77996a884ab2473b92eef7a27c8d36a6724c4969a5e605f10aad`;
model-table SHA-256 remains `30df45f3d5588e2dff46868c39e9d77fe2b53c821c2165e68b7f868134ad47fe`.
The model table still contains 47,231 rows and 55 columns; both receipts validate. No fits,
published analytical outputs or production database writes were performed by this maintenance.
The build initially refused a cross-worktree dependency symlink; a local dependency copy
resolved that environment restriction and the unchanged source passed its normal build.


## Arena-closure follow-up for v1.0.9 — 2026-10-20

The queued branch locally merged main `6ddf73f46a36e664fb505cd160ad92d324e748eb`,
preserving the v1.0.8 publications and release records. The exporter source inventory now
also pins `src/data/arena-history.json` and `src/lib/arena-history.ts`; its recursive import
contract covers the shared registry/factory, and producer-change tests exercise both.
No scoring transformation, coefficients, fit or published analytical artifact changed.

Before regenerating intermediates, the prior feature/model CSVs, both success receipts and
export report were copied to dated private evidence. The actual guarded export → prepare
ran against SELECT-only `arena_reader` on the dedicated local AFTER clone. A separate
REPEATABLE READ READ ONLY capture compared all six complete tables to the approved manifest:
hash `83fc2c66f301f6ac115d4b2fdfe45883b5304d33a041569712a94fe3cbb18fa7`, all rows equal.
The exporter compared 100,998 stored game-sides with zero mismatches/failures. Both newly
generated success receipts validate, without retroactively certifying previous files.

Feature CSV SHA-256 is `54fb5631d9eadf722a0e40f698003b07821ea6baed0a271174779bb92cf6314e`;
model-table SHA-256 is `f46ee8e2e0675ecb7019d94dcbe5daf90c35fe0d2a2eeb21d6bfb67dfbd2d206`.
These bytes exactly match the independently accepted arena intermediates. Published files
in `src/data/`, `public/data/` and the ML facts remain identical to incoming main.

Verification: 1,463 Vitest tests, 81 ML Python contracts, 58 script Python contracts,
26 native Node contracts, TypeScript, ESLint, documentation links and production build
passed. The focused closure contracts pass as part of that suite. Private logs, source/input
hashes and the archived old receipts are under
`docs/audit/repository-cleanup-20261020/arena-followup-20261020/` in this worktree.
No production connection, model fit, publication regeneration, cloud action, push or deployment
was performed by this follow-up. Root owns the separate v1.0.8 canonical acceptance record.


## TypeScript configuration provenance follow-up — 2026-10-20

Independent review found that `tsconfig.json` also selects exporter computation sources
through its import aliases. The source inventory now pins its exact bytes. The closure test
uses the actual TypeScript configuration and module resolver, rejecting unresolved configured
aliases, rather than maintaining a separate hardcoded `@/*` map. A valid-JSON alias mutation
contract rejects both success receipts before analysis and preserves the existing model bytes.
The immediately preceding CSV/receipt/report set is archived separately before actual export
and preparation rerun; no old receipt is relabeled and no analytical formula changes.

The rerun succeeded on the same SELECT-only accepted AFTER clone: both CSV hashes above
remain byte-identical and both new receipts validate with `tsconfig.json` included. Focused
closure tests (3), all ML Python contracts (82), typecheck, changed-file ESLint and documentation
links pass. The prior full suite/build evidence remains recorded separately; no model or
application runtime code changed in this follow-up. New private logs, hashes and archived
receipts are under `docs/audit/repository-cleanup-20261020/tsconfig-followup-20261020/`.
