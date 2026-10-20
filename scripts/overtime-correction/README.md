# Historical overtime coverage transition

This is a separate OT-only transition from the current six-table baseline. The earlier
`history-correction` preparer and its one-time additions/playoff revision are unchanged.
The default write target is exactly `127.0.0.1:55436/fullcourt_overtime`; preparation and
rehearsal refuse every other target. Root owns backup/restore, writer controls, independent
review, immediate production approval and release acceptance.

## Acceptance contract

- Only `games.overtime_periods` may change. No game or fatigue identities are added,
  removed or rebound. Stored overtime is the exact official integer, including five or more.
- All 5,815 source targets must have a frozen attempted result. Verified zero values
  remain zero; unknown source decisions remain unchanged. Fourteen exact, separately typed adjudications
  may support those facts through pinned primary evidence; other unknowns remain holdouts.
  No outcome is guessed.
  Raw team codes and both game-code tokens are independently normalized with the frozen
  21-entry alias policy. Available team minutes and explicit final/OT text must agree with
  numbered periods. Every accepted observation is checked against numbered periods, regulation/intermediate
  ties, score sums, final status, date, identity and retained raw official response bytes.
- Teams and both complete playoff tables remain byte-identical. Resolved predictions are
  byte-identical. The entire fatigue domain is replayed with the ratified engine, without
  coefficient changes. Only rows with a changed semantic component receive new values and
  `computed_at`; unchanged rows retain every byte, including IDs and timestamps.
- Future unresolved forecasts follow the existing scheduled/known-future-tip/no-resolved-row
  policy and rested-home publication rule. Unchanged forecasts retain every byte. Changed
  forecasts are checked again before and after the transaction for tip expiration.
- Every apply/rollback locks all six tables in one transaction, compares the entire captured
  from-state, changes only allowed columns/forecasts and verifies the entire to-state.
  Retry returns `already-current`; conditional rollback refuses any later domain drift.
  Prediction sequences are monotonic; rollback can leave harmless sequence gaps.

## Source and fresh-backup bridge

The source proof has its original immutable complete snapshot hash. A later backup must not
be relabeled with that hash. The explicit bridge independently derives all 5,815 target
projections from both snapshots: stored ID, external ID, ET date, season, status/type,
team IDs and derived abbreviations, scores and old overtime. Team-ID/abbreviation mappings
and complete final-game/final-fatigue semantics must also match. Compute timestamps and
future-only changes may differ; any source-target or final-history semantic drift requires
re-adjudication. The manifest separately binds the fresh complete raw before-state and its
semantic input hash. Every fact is checked against both original and fresh stored identities.

## Local preparation

Run from the worktree root with its `.env.local` containing only the owned local shadow URL.
The root supplies the source team's final `proof.json` and an externally recorded SHA-256.
The corpus must be complete; partial proof files cannot prepare a mutation candidate.

```sh
pnpm exec tsx scripts/overtime-correction/capture-baseline.ts BASELINE.json --target-fingerprint REVIEWED_DESTINATION_SHA256
pnpm exec tsx scripts/overtime-correction/bridge.ts BRIDGE.json BASELINE.json SOURCE/proof.json --expected-proof-sha SOURCE_SHA256
pnpm exec tsx scripts/overtime-correction/prepare.ts CANDIDATE.json BASELINE.json SOURCE/proof.json BRIDGE.json --expected-proof-sha SOURCE_SHA256
pnpm exec tsx scripts/overtime-correction/run.ts check CANDIDATE.json
pnpm exec tsx scripts/overtime-correction/rehearse.ts CANDIDATE.json
pnpm exec tsx scripts/overtime-correction/run.ts apply CANDIDATE.json
pnpm exec tsx scripts/overtime-correction/run.ts rollback CANDIDATE.json
```

Baseline capture is read-only and requires zero current-engine semantic differences. Without
`--target-fingerprint`, it records the local shadow fingerprint, which cannot authorize a
later production invocation. Preparation freezes all engine/tool/source files, complete
before/after snapshots, source bridge, source proof and component/prediction changes.
The sidecar hashes exact manifest file bytes, not merely parsed JSON. `run.ts check`
validates the frozen manifest and captures the complete state in a read-only transaction;
it reports whether the shadow matches the exact before or after state, and performs no writes.


## Specifically reviewed supplemental adjudications

Strict raw NBA decisions and counts are preserved. The committed
`supplemental-adjudications.json` supports only these fixed cases:

- `period_tie_anomaly_overtime_confirmed`: game 29679 / `0028800519`, Chicago hosting
  Detroit on 1989-01-31, 98–104. The official numbered periods and both 265-minute totals
  establish exactly one OT; the strict parser retains the 91–92 regulation discrepancy.
  The official Bulls guide's pinned PDF, physical page 127 / printed page 125, lists the
  exact game under “BULLS VS. PISTONS IN OVERTIME:”. This supports OT occurrence without
  rewriting the NBA quarter totals or either stored final score.
- `headline_score_conflict_regulation_confirmed`: exactly thirteen listed 1989-90 fixtures.
  Each remains a strict headline-score mismatch. Four numbered regular periods, period 4,
  both 240-minute totals, no contradictory OT text and period sums equal to stored final
  scores establish the regulation duration. Pinned contemporary press corroborates only
  the date, pairing and final scores; a score capsule alone does not establish duration.
  These thirteen cases add supported zero-OT coverage and produce no database game change.

Every case pins its exact fixture, raw NBA body/gzip hashes, allowed discrepancy fields,
strict reasons, final fact-file hash and corroborating primary-source byte hash. The
checked-in adjudications include the final frozen fact hashes and reviewed press provenance.
Preparation refuses missing bindings or different source bytes. No generic “accept unknown” or tie/score-check bypass exists.

The loader exposes effective acceptance in `sourceProof.supplementalAcceptedGameIds`,
`supplementalAccepted`, `supplementalPositiveOT`, `supplementalAdjudicationsSha256` and
`effectivePositiveOT`; raw `verified` / `unknown` counts are unchanged. The Python registry
merger can consume the records selected by those accepted IDs after verifying the recorded
adjudications SHA. `inputChanges` includes only nonzero database deltas, with an explicit
`adjudication` kind; the thirteen zero-OT coverage records remain in the typed evidence.

## Verification

```sh
OVERTIME_CONTRACT_DATABASE_URL=postgres://overtime_owner@127.0.0.1:55436/fullcourt_overtime pnpm exec vitest run --config scripts/overtime-correction/vitest.config.ts
```

The PostgreSQL contracts create and drop their own `ot_contract_*` schema with copies of
actual table definitions and FK-backed fixture rows. They do not mutate public baseline
rows or sequences. Only their source-adjudication boundary is mocked, so they prove SQL
atomicity/locking/CAS, not the final full-corpus candidate. Retained authentic period evidence
and adversarial arithmetic/identity cases are checked independently. The unmocked `rehearse`
command must additionally pass on the exact final source-bound candidate. Reconnection is
not a server-restart claim; root separately restarts the local cluster and checks the hash.

## Production boundary

These commands are a prepared interface, not authorization. Immediately before a production
mass update or rollback, root obtains explicit owner approval of the frozen candidate,
backup, target, before/after hashes, source corpus and recovery plan. No production operation
is performed by the implementer.

The production CLI never reads `.env.local`. Root supplies the private connection through
`OVERTIME_CORRECTION_DATABASE_URL`. Query/fragment overrides are forbidden, and the actual
transaction target must match both manifest and external target fingerprint. TLS is always
certificate-verified; supply the official CA through the Node trust store when required.

```sh
pnpm exec tsx scripts/overtime-correction/run.ts apply CANDIDATE.json --production --expected-manifest-sha REVIEWED_FILE_SHA --expected-source-proof-sha REVIEWED_SOURCE_SHA --expected-target REVIEWED_TARGET_SHA --expected-before REVIEWED_BEFORE_SHA --ack APPLY_REVIEWED_OVERTIME_CORRECTION
pnpm exec tsx scripts/overtime-correction/run.ts rollback CANDIDATE.json --production --expected-manifest-sha REVIEWED_FILE_SHA --expected-source-proof-sha REVIEWED_SOURCE_SHA --expected-target REVIEWED_TARGET_SHA --expected-before REVIEWED_AFTER_SHA --ack ROLLBACK_REVIEWED_OVERTIME_CORRECTION
```

The external manifest digest is checked before parsing or connecting. The adjacent sidecar
is only an additional corruption check. `applyManifest` is an internal trusted-code helper;
the CLI owns approval of external exact file bytes. Code deployment, generated analytics,
maintenance, cache activation and ingestion overlays remain root-owned separate work.
