# Arena correction transition

This is a new Class-3 transition. It does not loosen or reuse the old overtime manifest
validator: that validator correctly requires its before-state to match the current engine.
Here the before-state must match the immutable v1.0.7 engine, and the after-state must match
the complete new geometry replay. Run from the repository root.

## Scope and exact transition

- Read and compare all six domains: `teams`, `games`, `fatigue_scores`, `predictions`,
  `playoff_series`, `playoff_series_predictions`.
- Replay every game/side, without season filtering. Update only fatigue sides whose
  semantic components change; update `computed_at` only on those sides. Unchanged rows,
  all side identities and row order remain exact.
- Change only `playoff_series.conference` for ID 265 (`2002-03_NOP-PHI`) and ID 278
  (`2003-04_MIA-NOP`), each NULL → `East`. Other playoff metadata/features/timestamps
  and all playoff prediction versions remain byte-identical.
- Preserve all graded predictions and every past/ineligible unresolved row. As the explicit
  ADR 0011 exception, deterministically insert/update/delete only unresolved, regular,
  normally-played, scheduled games whose tip is after the frozen `asOf`. Every changed
  forecast must also have an actual home/away two-decimal score change. Retained IDs and
  `created_at` stay exact; new IDs append after the old maximum. No grading or history reset.
- Before preparation, the old engine's future call set must already reconcile. Otherwise
  preparation writes a separate baseline forecast diff and refuses an arena manifest.
  Counts of eligible games, existing/expected calls and each mutation type are retained.

The trusted historical anchor is release
`65605ae972c2df0391d1eee0a9d246dafe29079a`, snapshot canonical hash
`ef953faeb133a329a636653ed017091da17c27639adbb44bf2d8bd4eedf8159b`.
The independent Section-8 evidence hashes are constants in `sources.ts`. A fresh baseline
may contain later real activity; it still must replay exactly under the old release and is
bound to a fresh full-domain compare-and-swap. The historical anchor is not substituted for
that fresh capture.

## Source proof and freezing

The root supplies a reviewed `arena-source-proof` JSON with:

```text
kind: "arena-source-proof", version: 1
baselineCommit, baselineSnapshotCanonicalHash
independentReplay: { path, sha256 }
followThrough: { path, sha256 }
baselineCapture: { path, sha256 }
geometrySources: { "allowed geometry path": "exact candidate SHA-256", ... }
evidence: [{ path, sha256 }, ...]
```

`geometrySources` must exactly equal the allowed geometry files in the new engine's import
closure. Currently those are `src/data/arena-history.json`, `src/lib/arena-history.ts`,
`src/lib/team-era-coordinates.ts`, `src/data/fixture-venue-corrections.json`, and
`src/lib/physical-venue.ts`, when present in that closure. The physical-venue file permits
only the exact mixed-arena missing-correction guard immediately before neutral fallback,
plus its exact import; all prior algorithm tokens and fixture/bubble precedence remain
protected. Modeled-base overrides are separate from factual venue eras: a required fixture
correction cannot silently fall back to a demolished or otherwise fictitious home venue.
`fatigue.ts` must remain byte-identical. Other engine/dependency changes
are rejected, except token-identical TypeScript comment/format edits, package-version-only
metadata, and the exact additive `summarizeHistoricalEvidenceCoverage` helper. Every existing
prediction-rule token remains protected.

Both engine closures include recursive local imports, registries, lockfile, package and
tsconfig bytes. The old checkout must have exactly the release HEAD, no tracked edits, and
every old closure file must equal `git show` for that commit. The old replay runs in a
separate process with that checkout's explicit tsconfig and without database credentials.
The new engine and all transition-tool imports are frozen separately. Evidence files and
the old replay receipt are hashed. Source checks run again inside the applying transaction.

## Local preparation and checks

The write-capable local target is exactly
`127.0.0.1:55437/fullcourt_arena_correction`. Set `ARENA_LOCAL_DATABASE_URL` explicitly;
the tools do not fall back to `DATABASE_URL`. Preparation only reads that database.

```sh
pnpm exec tsx scripts/arena-correction/prepare.ts \
  MANIFEST.json /tmp/fullcourt-v107-preview-20261020 SOURCE-PROOF.json \
  --expected-source-proof-sha REVIEWED_PROOF_SHA
```

For a local rehearsal intended for a separately reviewed production destination, append
`--target-fingerprint REVIEWED_DESTINATION_SHA`. The baseline still records the actual
local capture target separately. This does not connect to that destination or authorize it.

Preparation writes compact manifest bytes, a baseline receipt, SHA sidecar and a report.
Keep the bytes exact; reformatting changes the frozen digest. Review the report's fatigue
IDs/fields, affected seasons, both metadata cells, and every inserted/updated/deleted
future forecast before approval.

```sh
pnpm exec tsx scripts/arena-correction/run.ts check MANIFEST.json \
  --expected-manifest-sha FROZEN_MANIFEST_SHA
pnpm exec tsx scripts/arena-correction/run.ts apply MANIFEST.json \
  --expected-manifest-sha FROZEN_MANIFEST_SHA
pnpm exec tsx scripts/arena-correction/run.ts rollback MANIFEST.json \
  --expected-manifest-sha FROZEN_MANIFEST_SHA
```

Apply and rollback take writer-conflicting locks on all six tables, then compare the full
source state. The transaction explicitly uses READ COMMITTED so its first post-lock capture
includes writers that committed while it was waiting, even if the session default differed.
Only whitelisted columns are written, followed by exact six-table readback. The actual wall
clock, scheduled/regular/regime state and absence of a resolved row are checked before
writes and immediately before commit. A tip crossing during the operation aborts the entire
transaction. Rollback refuses later work or expired forecast eligibility. Idempotent retries
return `already-current` without writing.

Prediction sequences remain monotonic. An aborted insertion can leave harmless sequence
gaps; sequence counters are not part of the six row-domain hashes.

## Production boundary

The root must obtain the owner's **new explicit approval** for the exact frozen arena
manifest, source proof, target and before hash before production use. A previous overtime
or historical approval does not authorize this transition. Production mode reads only
`ARENA_CORRECTION_DATABASE_URL` and requires all guards below, with certificate-verified
TLS. URL query/fragment overrides and process-wide TLS verification bypass are refused.

```text
run.ts apply|rollback MANIFEST.json
  --production
  --expected-manifest-sha FROZEN_MANIFEST_SHA
  --expected-source-proof-sha REVIEWED_PROOF_SHA
  --expected-target REVIEWED_TARGET_FINGERPRINT
  --expected-before EXACT_SOURCE_STATE_HASH
  --ack APPLY_REVIEWED_ARENA_CORRECTION | ROLLBACK_REVIEWED_ARENA_CORRECTION
```

Production is never selected by preparation or read-only check. Production execution is not
part of the current tool implementation acceptance.

## Verification gates

```sh
ARENA_CONTRACT_DATABASE_URL=postgresql://arena_owner@127.0.0.1:55437/fullcourt_arena_correction \
ARENA_RELEASED_CHECKOUT=/tmp/fullcourt-v107-preview-20261020 \
pnpm exec vitest run --config scripts/arena-correction/vitest.config.ts
```

The protocol tests use a private schema on the dedicated local clone, leaving its public
baseline untouched. They exercise real transactional failure/rollback at every write stage,
all-six-domain CAS, ordinary-writer locking, a writer committing during lock acquisition,
connection re-open, source drift, later-work rollback refusal, and real tip expiry during a
deliberately delayed PostgreSQL update. These protocol fixtures isolate primary-source/old
replay authentication; they do not claim to be a real arena correction. Separate source tests
cover import-closure omissions, protected coefficients/rules and exact allowed additions.
The optional released-engine tests execute real Git validation and a tiny unmocked old replay.

Before acceptance, the root must additionally run the unmocked full old/new candidate,
verify complete apply/rollback on the local clone, perform an actual PostgreSQL **server**
restart and exact readback (connection re-open alone is not server-restart proof), obtain
independent review of the exact frozen commit, and complete the integrated artifact/browser
checks. Geometry evidence and the production owner decision remain separate gates.

## Guarded analytics regeneration

After the final registry and manifest are reviewed and the dedicated local clone is exactly
at the manifest after-state, run the unchanged 15 producer commands in the same order as
`scripts/recompute_overtime_analytics.py` through this separate arena runner:

```sh
ARENA_LOCAL_DATABASE_URL=postgresql://arena_owner@127.0.0.1:55437/fullcourt_arena_correction \
ml/.venv/bin/python scripts/arena-correction/regenerate.py MANIFEST.json \
  --expected-manifest-sha REVIEWED_MANIFEST_SHA \
  --expected-source-proof-sha REVIEWED_PROOF_SHA \
  --expected-after-hash REVIEWED_AFTER_HASH
```

Append `--preflight` to validate files and bindings without a database connection or running
producers. All three digests must be supplied externally. The runner uses only
`ARENA_LOCAL_DATABASE_URL`, rejects other destinations and URL overrides, and passes that
explicit local URL to existing read-only producers. It performs the new `run.ts check` with
the frozen manifest digest before and after producers, including after a producer failure;
each check must report the exact reviewed after-state and source-proof digest.

Preflight reports missing player/team box-score caches (1996–2025), frozen offline market
HTML/JSON pairs (1993–2025), appearance context, runtime/dependencies and producer scripts
before any producer executes. Market metadata URL/content hashes are checked. All 27 output
paths and the log directory must resolve inside this checkout. Keep `ml/data` local; input
CSV symlinks are allowed, but never symlink generated feature/model tables or output files
to a previous evidence checkout. Market inputs were copied from the accepted overtime
cache; the local `analytics/market-cache-copy.json` records source and matching file hashes.

The trend prefix is `docs/research/2026-10-20-arena-shooting/home-advantage-trend`. Stage logs,
commands, streamed input hash inventory and before/after bindings go to ignored
`docs/audit/arena-shooting-correction/analytics`. An input-byte change during the run rejects
the outputs. This runner does not alter coefficients, run database updates or grade games.
Its actual 15-stage execution remains a separate acceptance gate until the final candidate
is frozen; compilation/preflight alone do not establish regenerated numbers.
