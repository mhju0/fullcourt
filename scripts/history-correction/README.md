# Historical correction staging

These tools default to `127.0.0.1:55434/fullcourt_recalculation`. Both CLI URL
validation and the write transaction inspect the destination. Production mode is
available only with explicit reviewed target/hash/acknowledgement guards
described below. No schema migration, wipe, score/prediction reset, or coefficient
fit is performed. The root owns the fresh database dump, restoration, baseline replay,
production approval boundary, and release decisions.

Run from the repository root with its `.env.local` pointing only to that shadow:

```sh
pnpm exec tsx scripts/history-correction/prepare.ts docs/audit/history-recalculation/candidate-full-history.json docs/audit/history-recalculation/baseline/six-table-baseline-evidence.json
pnpm exec tsx scripts/history-correction/rehearse.ts docs/audit/history-recalculation/candidate-full-history.json
pnpm exec tsx scripts/history-correction/run.ts apply docs/audit/history-recalculation/candidate-full-history.json
pnpm exec tsx scripts/history-correction/run.ts rollback docs/audit/history-recalculation/candidate-full-history.json
pnpm exec vitest run --config scripts/history-correction/vitest.config.ts
python3 -m unittest discover -s scripts/history-correction -p 'test_*.py'
```

`prepare` requires a fresh baseline with zero original-engine differences and a
bridge binding the original four-table input hash plus the independently captured full playoff two-table hash. The manifest is version 2; four-table candidates cannot be replayed by this version. It asserts unique ET-date/home/away keys,
exact stored IDs and each accepted before-value. The stable registry identity
survives an external-provider ID re-key. No unknown tips, disputed scores, or
individual Detroit arena inferences are patched.

The manifest contains the complete before/after `teams`, `games`,
`fatigue_scores`, `predictions`, `playoff_series`, and `playoff_series_predictions`, exact input differences, source-file hashes,
and season/component plus all-history/recent-ten publication comparisons. Its
sidecar SHA-256 covers the complete file. Existing score IDs are retained and all
pairs receive a fresh computation time. Replay uses every stored type/season;
final targets use final priors, other targets use final/scheduled/live priors,
and unplayed priors have overtime and margins neutralized. The history window is
30 prior calendar days. Unknown true-neutral geometry fails closed.

Resolved predictions and noneligible forecasts are preserved exactly. Only
scheduled games with a known future tip and no resolved prediction can have their
open prediction rebuilt. Every eligible game has both candidate scores, and the
normal published regular-season rested-home rule controls its prediction.
Prediction eligibility is checked again in the transaction and before completion.

Apply/rollback acquire actual table locks, compare the entire captured domain,
then update only changed rows. A partial failure rolls back all five mutable
tables. Retry returns `already-current`. Rollback accepts only the exact candidate
state and refuses later drift. Sequence values remain monotonic, so rollback can
leave harmless ID gaps. The post-write full-domain checksum must match or the
transaction rolls back. The manifest binds the shadow server TimeZone; the transaction sets that zone
locally before capture so equivalent timestamp instants compare identically across
servers, while genuine value drift still fails. The CLI refuses a changed engine, correction registry,
or tooling source after preparation. This is controlled historical maintenance,
not a reusable production bulk writer.

`rehearse` tests partial-write failure, source drift, real writer locks, apply and
retry, reconnect, resolved-history preservation, conditional rollback and rollback
retry on the shadow. Its reconnect check is not a PostgreSQL server-restart test;
the root separately restarts the owned local cluster and verifies the manifest
hash after restart.

The committed registries contain 783 accepted overtime facts, 109 postseason
sublabels, 18 omitted neutral flags/cities plus 171 bounded Disney-campus
flags/cities, two future tips, and 171 physical venue fixtures (the earlier
167-game register plus four reviewed missing workload games). Some fixtures have multiple changes. Venue identity/event authority and
coordinate evidence are separate: official event/history sources establish the
venue; the linked arena building/map feature supplies an approximate point, not
surveyed precision. Toronto/Tacoma/San Jose season statements support the era,
not individually checked gamebooks. Austin's eight completed dates are supported
by primary event records, and its three future assignments retain the official
schedule evidence. Existing neutral maps remain fallbacks outside this fixture
registry; this correction does not claim every historical venue was verified.
The four reviewed additions are NBA IDs `0051900111`, `0062300001`,
`0062400001`, and `0062500001`. They add one `play_in` and three `cup_final`
fixtures with known results, overtime and schedule tip instants. All are physical
neutral games; the 2020 gamebook identifies The Field House, not AdventHealth
Arena. `build-additions.py` asserts canonical archive identities/results and
complete ESPN four-period totals, retains source hashes, and writes the addition
registry. The raw 2024 NBA PDF was unavailable during capture; its NBA game
summary confirms venue/results while ESPN numbered line scores establish no OT.
The other primary gamebooks were readable through web retrieval but raw direct
PDF downloads timed out, so they are not claimed archived byte proofs.

The candidate permits exactly those four additional identities, creates eight
complete fatigue rows, and excludes them from regular-season publication and
historical forecasts. Existing game identity/results and all columns outside the five approved input
fields are immutable. Existing fatigue ID-to-game/team bindings are retained;
exactly eight new score rows belong to the four additions. Apply inserts parents
before children; rollback removes children before parents. Stable staged IDs and full-domain CAS prevent duplicate
retries; game/score/prediction sequences remain monotonic.

Canonical `006` IDs now classify as `cup_final`, and `005` as `play_in`.
The ESPN schedule seed recognizes the two observed exact championship headlines;
Cup finals do not enter equal regular-season team-count validation and must be a
single identified neutral fixture. Daily score sync still reports unknown
fixtures instead of inserting them. When a future Cup pairing becomes assigned,
perform the existing controlled seed/re-key procedure; no unresolved 2026 Cup
participants are invented here. Reingest overlays preserve accepted type, OT,
tip and neutral facts after provider normalization.

The separately discovered incorrect Arena CDMX fallback is corrected in the
shared geometry module. 1997 Mexico uses Palacio de los Deportes instead.

`build-registry.py` then `build-additions.py`, in that order, reproduce the
committed JSON from the frozen local raw audit, source CSVs and captured
scoreboards. The first step alone omits the four additions and is not a complete
registry build. Neither script recaptures providers or accesses a database.

## Additive playoff data revision

The accepted eleven-feature artifact is `playoff-feature-corrections.json`:
nine full official-season `win_pct_diff` values and two physical-prior
`entry_rest_diff` values. Only those fields and the eleven affected
`computed_at` values may change; all 600 series identities, labels, seeds and
other features remain exact. The feature producer naturally derives these facts
from corrected canonical games, without a manual feature override.

`playoff-prediction-revision.json` is the read-only producer output for
`logistic_grind_v2_r20261020`: 600 `full_insample` and 450
`walk_forward_oos` rows, with the existing ten-season warm-up and fixed four
features. Preparation regenerates the producer input digest from the corrected
series, using Python float JSON formatting, and verifies it against the artifact.
Existing 2,099 playoff prediction rows remain byte-for-byte unchanged. The new
1,050 rows receive deterministic staged IDs after the baseline maximum and are
inserted without conflict updates. Rollback deletes only those new revision rows
before restoring the eleven original feature rows.

The local-only `stage-playoff.ts` was used to capture the original complete two
tables and temporarily stage features for read-only model production. Its private
`playoff-stage.json` stores full before/after hashes and snapshots; restore
requires the exact staged hash. The temporary stage was restored before the
six-table candidate was prepared. It is not part of production cutover. The
six-table baseline bridge must independently match both the zero-difference
original-engine four-table baseline and that original playoff capture; it does
not treat the temporarily corrected feature stage as the starting state.

## Guarded production invocation

This code path is prepared for independent review and an immediately preceding
owner approval; its existence is not approval to execute it. It never reads
`.env.local`. The root supplies the production connection through
`HISTORY_CORRECTION_DATABASE_URL` privately. The URL must contain no query or
fragment overrides. TLS uses `verify-full`, which verifies the server certificate;
postgres-js `require` alone would disable certificate verification.

```sh
pnpm exec tsx scripts/history-correction/run.ts apply docs/audit/history-recalculation/candidate-full-history.json --production --expected-manifest-sha MANIFEST_SHA256 --expected-target TARGET_SHA256 --expected-before BEFORE_SHA256 --ack APPLY_REVIEWED_HISTORICAL_CORRECTION
```

`MANIFEST_SHA256` must be copied explicitly from the exact frozen review and
owner approval, never filled from the adjacent sidecar. Production hashes one
file buffer and checks that external SHA before JSON parsing or connecting; the
same buffer is parsed afterward. This also binds rollback to the same reviewed
file bytes. The sidecar is an additional corruption check. `applyManifest` is an
internal trusted-code helper; it does not separately enforce external file-byte
approval against a privileged caller.

`TARGET_SHA256` is `targetFingerprint({host,port,user,database})` from
`authorization.ts`: SHA-256 of the JSON object with keys ordered database, host,
port, user; the password is excluded. `BEFORE_SHA256` must equal the manifest's
beforeHash. The transaction repeats the target checks against the actual
postgres-js options, and still requires the full current-domain CAS and real
locks. The root handles paused writers, maintenance responses, backup verification
and cache activation. Those operational steps are not performed by this tool.

Rollback uses the same explicit production guards, `--expected-before` equal to
the candidate afterHash, and `--ack ROLLBACK_REVIEWED_HISTORICAL_CORRECTION`.
Production apply/rollback have not been executed by the tooling implementer.

## Coordinated production cutover

This is an operations plan, not a record that these steps ran. The root owns
provider controls and the approval request. Do not run production apply until the
reviewed release, tested maintenance gate, fresh backup, exact manifest, and
recovery plan are concrete. A code deployment and a database transaction are two
separate activations; the maintenance window prevents readers seeing a mixture.

1. Freeze one reviewed release commit, its source/registry hashes, generated
   analytics artifact hashes, package version and CHANGELOG entry. Record the
   previous production deployment ID and exact SHA, candidate file SHA-256,
   beforeHash/afterHash, target fingerprint, resolved-prediction hash and local
   rehearsal/restart evidence. Source and artifact alignment checks must pass on
   that commit. A preview must be checked against the corrected shadow. Merging
   `main` normally auto-deploys here; arrange staged/manual domain assignment
   before a merge could expose the corrected reader against the old database.

2. Inventory and pause every writer before the final backup. `vercel.json`
   defines twelve `/api/cron/update` schedules, hourly at 21:00–08:00 UTC. Use the
   project's Cron Jobs disable control and verify the disabled state. Pause
   `.github/workflows/daily-update.yml` (21:17 UTC, plus manual dispatch), hold
   manual seed/backfill/rekey/context/projection commands, and drain existing
   executions/transactions. A new deployment does not stop an already running
   Vercel cron. The daily Actions concurrency group does not coordinate with
   Vercel or maintenance. Also hold Officiating refresh merges/deployments: that
   workflow runs at 20:30 UTC and creates a data branch/PR rather than writing the
   database. Record which controls were changed and which jobs were in flight.
   [Vercel cron controls](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
   [GitHub workflow controls](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

3. Activate and test maintenance coverage before any database mutation.
   `FULLCOURT_MAINTENANCE=historical-recalculation` drives `src/proxy.ts`:
   pages, API routes (including cron), and `/data/*` must return 503 with
   `no-store` and `Retry-After`; `/api/health`, framework static assets and the
   favicon remain exceptions. Verify real responses, including JSON files,
   page/RSC navigation and an authenticated cron request. A health 200 alone
   is not a maintenance test. Inventory canonical/custom domains, branch aliases,
   production/preview deployment URLs and old deployments holding production DB
   credentials. An environment change/new proxy deployment does not retrofit old
   immutable deployments. Protect or otherwise block every live old-host data
   path with a verified provider control; keep the exact rollback deployment
   private. If any old deployment can still return data or invoke a writer,
   maintenance coverage is unproven and cutover must wait. Old JS already loaded
   in a browser can retain previously delivered data; it must not receive a mixed
   new response through a forgotten API/data host.
   [Deployment protection](https://vercel.com/docs/deployment-protection).

4. While writers remain paused, take a new verified full backup and an independent
   read-only capture of all six guarded tables. Bind capture formatting to the
   manifest databaseTimeZone. Require its hash to equal beforeHash immediately
   before requesting approval. Check the candidate source hashes again and
   re-evaluate future-tip eligibility. If any row or source changed, restore the
   fresh dump into the local shadow, redo the original-engine baseline replay,
   prepare/rehearse a new candidate, regenerate affected artifacts and repeat the
   exact-candidate review. Do not weaken CAS, omit a timestamp field, or edit the
   candidate hash merely to make an old artifact apply. Store backups, manifests
   and credentials privately; they are not public release assets.

5. Obtain explicit owner approval immediately before the production mass update.
   Show the exact reviewed commit, target fingerprint, candidate file SHA,
   beforeHash/afterHash, input/score/prediction deltas, preserved resolved-history
   hash and tested rollback command. This is the production approval boundary.
   Preparation and prior local approval do not satisfy it. Then execute the
   guarded production command above using only the explicitly supplied production
   connection. Keep writers paused and public data gated while the command locks
   all six tables, checks CAS, applies atomically and verifies the complete
   resulting hash. Save the result and independently re-read the candidate hash
   and representative corrected inputs/components; retry is safe only through
   the same guards.

6. Activate the matching reader and generated artifacts while public traffic is
   still gated. Build the final staged production release from the reviewed SHA
   against the now-corrected production data, or prove every build-time data input
   came from the matching candidate. `/` and `/analysis` have 86,400-second
   revalidation, so a production build made against old data can carry stale HTML
   even when its source is correct. Stage a production deployment without assigning
   public domains; verify it privately. A staged production promotion keeps the
   build, while preview promotion rebuilds under production environment settings.
   Record the final build's exact SHA, environment and deployment ID. Do not open
   public traffic while only the database or only the generated facts are current.
   [Production staging and promotion](https://vercel.com/docs/deployments/promoting-a-deployment).

7. Purge/verify every relevant cache layer before reopening. The process-local
   `createStampedCache` Maps belong to server instances; new deployment instances
   provide fresh Maps. Historical origin/API lifetimes reach one hour, historical
   API responses allow another five minutes of stale revalidation, and current
   APIs allow 60+60 seconds. The corrected `getCompletedGamesStamp()` uses the `completed-v3` content
   fingerprint, including the completed loader's game fields and fatigue revisions/scores; its mutation harness verifies
   correction invalidation. Old deployed code still uses the prior stamp. The
   season stamp also includes lifecycle/derived contents. Keep old instances/URLs
   inaccessible; purge affected CDN/ISR entries using the verified project control
   and warm/check the staged reader. For this coordinated correction, a background
   stale invalidation alone is insufficient evidence: require fresh observed values
   before unblocking traffic. Vercel's documented foreground Delete option can
   target the entire project with `*`; assess origin load while gated and record
   the operation/result. Deployment creation and cache purge have different effects.
   [Vercel CDN purge semantics](https://vercel.com/docs/caching/cdn-cache/purge).

8. Promote the exact verified production deployment, open the canonical surface,
   and verify it in a fresh browser plus API requests. Check all-history and
   recent-ten call counts/wins, venue baselines, threshold/size/season rows,
   representative changed game components, future forecasts, Season Report
   Mileage and generated data consumers against the frozen evidence. Check the
   selected mobile route and console/network failures. Confirm the provider's
   production deployment SHA and canonical-domain responses, not just preview
   success or health. Keep all writers paused until this acceptance completes.
   Then create the matching immutable version tag/GitHub release and retain the
   release evidence according to repository versioning policy.

9. Restore writer controls deliberately. Confirm scheduled/manual jobs will use
   the corrected release and accepted-fact overlays, re-enable the recorded cron
   and Actions controls, and observe the next actual write/recovery run. Do not
   call a monitor's no-op/maintenance response successful ingestion. Once a writer
   commits any change in the guarded tables, the original candidate no longer
   guarantees a rollback; archive the post-release state and use a freshly
   reviewed recovery plan if later repair is needed.

### Failure and recovery

If anything fails before apply, leave production data untouched and retain the
maintenance gate until the root chooses to resume the old coherent release. A
failed apply transaction rolls back automatically; verify beforeHash before
reopening anything. If apply succeeded but release/cache verification fails,
keep writers paused and data gated. Independently obtain approval immediately
before an actual production rollback mass update, then use the candidate's
expected afterHash and the literal rollback acknowledgement. Verify the exact
restored beforeHash and resolved-history hash, restore the recorded old reader
and old artifact set together, refresh its caches, and verify the canonical site
before reopening/resuming writers. An app-only rollback does not restore the DB.
A CAS or expired-tip refusal is a stop condition: never bypass it with a blind
restore or reset-predictions command.

### Candidate freshness checkpoint — observed 2026-10-19 17:43 UTC

The preceding 167-fixture candidate was created at `2026-10-19T17:37:24.365Z`. Its earliest stored
scheduled tip is `2026-10-20T19:00:00Z` (game 118696), about 25 hours after this
checkpoint. The 85 games whose open prediction rows actually change first tip at
`2026-10-24T01:30:00Z` (game 118719), about 104 hours after the checkpoint. Thus no
changed prediction had expired at this inspection. This is a dated observation,
not a later execution guarantee. Recompute eligibility before approval/apply;
the transactional clock checks cover changed forecasts at start and completion.
Even earlier unchanged fixtures or a nightly zero-score recomputation can change
computed_at/status/prediction rows and invalidate the full-domain CAS. The next
configured writer slot was 21:00 UTC that day; source freshness and the live hash
must be proven anew after any elapsed writer window. The tool checks database and
local source consistency, not whether a provider has published a newer schedule
change. Reconcile new authoritative tip/venue updates before freezing a replacement.


Do not rerun `ml/predict_series.py --write` against an existing model revision. That legacy
manual upsert path is not the reviewed release path. Any later data/model regeneration must
choose a fresh revision and preserve existing rows; this release uses only the insert-only
reviewed six-table manifest.
