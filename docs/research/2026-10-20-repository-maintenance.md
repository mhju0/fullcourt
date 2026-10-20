# Repository and local research maintenance — 2026-10-20

The owner requested cleanup after the historical data audit. The production correction
was accepted in [v1.0.7](https://github.com/mhju0/fullcourt/releases/tag/v1.0.7);
this maintenance preserves its calculations, source decisions and historical evidence.

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
