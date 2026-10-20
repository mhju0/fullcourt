# Arena and Shooting audit ledger, 2026-10-20

This is the durable finding and correction index for D-131. It records the accepted local
candidate, rejected source interpretations, implementation mistakes and verification repairs
so that the next audit can start from evidence rather than repeat the same assumptions.
The detailed [accepted record](README.md), [D-131](../../DECISIONS.md#d-131--source-actual-historical-arenas-before-recomputing-their-findings-2026-10-20),
and ADR 0011 remain authoritative for scope. This ledger does not expand it.

## Candidate and status boundary

At this ledger's creation, implementation, local acceptance and independent review are
complete. The owner has separately approved the production application; execution and
canonical deployment acceptance belong to the root's release record. **This ledger does
not claim the candidate has been applied or deployed.** Append release evidence separately
when observed; do not infer deployment from approval, a manifest, tests or a merge.

| Binding | Exact value |
| --- | --- |
| Accepted final commit | `647906687fb4218ca939a250545902ad3747c0f4` |
| Independently reviewed core commit | `dfc6004d5819b04b3a6f7f52b1a4ad15f90e116e` |
| Released baseline | `65605ae972c2df0391d1eee0a9d246dafe29079a` |
| Manifest SHA-256 | `6cc5f11f24199936c118dc112ec47147eba275e8a7d522d5fbad87a71d0f70b6` |
| Source-proof SHA-256 | `140647c61490bbe8ef20ef721a555346e66b6abe14d79c7fa8eeb537cd419036` |
| Six-domain before hash | `ef953faeb133a329a636653ed017091da17c27639adbb44bf2d8bd4eedf8159b` |
| Six-domain after hash | `83fc2c66f301f6ac115d4b2fdfe45883b5304d33a041569712a94fe3cbb18fa7` |

The core review and narrow prediction-tool follow-up jointly accept this exact candidate.
The ledger itself is a later documentation addition, outside that frozen implementation.
Review receipts: `docs/audit/arena-shooting-correction/final-review-core.md` and
`final-review-followup.md`; exact bindings: `frozen-candidate-final.json` in the same folder.
These are ignored operational receipts, not portable regression tests.

## Findings and adopted corrections

Paths below are repository-relative unless they link to a report. IDs are stable ledger
references. “Closed locally” means implemented, exercised and verified within the retained
local evidence, not production acceptance.

| ID / status | Error or finding; accepted action | Durable code, tests and source record |
| --- | --- | --- |
| A01 / closed before new work | Verify that PR #187 really propagated overtime changes before attributing differences to arenas. Fresh capture and unchanged independent replay matched all 103,398 sides and 1,757,766 fields. The 346 corrected games have 692 subsequent appearances, 683 within 30 days; later rolling effects are covered by the complete replay. All 15 earlier producers and 27 retained output hashes matched. | [README Section 8](README.md#section-8--pr-187-follow-through-confirmed-first); ADR 0015; receipts `section8/result.json`, `section8/follow-through.json`, `capture.json` under the correction audit folder. This is a completed historical audit, not a new OT fix. |
| A02 / closed locally | Current coordinates concealed historical moves within the same metro. Inventory all 30 franchises; distinguish 76 observed arena episodes / 76 physical sites, 69 default/base intervals and one Atlanta modeled-base override. Observed first/last games are not building opening/closure dates; coverage can be left-censored at 1985-86. | `src/data/arena-history.json`, `src/lib/arena-history.ts`, `src/lib/team-era-coordinates.ts`; `arena-history.test.ts`, `team-era-coordinates.test.ts`; [arena-eras.csv](arena-eras.csv), [western report](western-arenas/REPORT.md), [eastern report](eastern-arenas/REPORT.md). Test filenames in this table are under `src/lib/__tests__/` unless prefixed otherwise. |
| A03 / closed locally | A default arena history alone misses alternate and return homes. Add 182 exact fixtures: the initial 101 candidates, 73 mixed Atlanta homes, six Maple Leaf Gardens games, Spectrum and MECCA returns. Preserve all 171 earlier entries: 353 cumulative exceptions. Do not call the original 101-candidate list exhaustive. | `src/data/fixture-venue-corrections.json`, `src/lib/physical-venue.ts`; `arena-corrections.test.ts`, `physical-venue.test.ts`; [fixture-venues.csv](fixture-venues.csv), [fixture adjudications](alternate-fixtures/README.md), [same-city returns](special-same-city-fixtures/README.md). |
| A04 / closed locally | Atlanta's mixed seasons cannot use a demolished Omni as an actual venue. Preserve the released modeled base separately; all 73 actual homes require fixture overrides (44 Georgia Dome, 29 Alexander). Missing corrections fail instead of silently falling back. | `arena-history.json`, `arena-history.ts`, `physical-venue.ts`; `arena-history.test.ts`, `arena-corrections.test.ts`, `scripts/arena-correction/sources.test.ts`. D-131 preserves the base/physical-venue distinction. |
| A05 / closed locally | Separate rounded LA coordinates created artificial movement inside one shared building. Lakers/Clippers share one STAPLES/Crypto physical point; only the Clippers move to Intuit. Temporary San Jose/Tacoma homes do not by themselves move operating bases; Tampa/Katrina base evidence is separate. | `arena-history.json`, `team-era-coordinates.ts`; `arena-corrections.test.ts`, `arena-history.test.ts`, `physical-venue.test.ts`; [western report](western-arenas/REPORT.md). |
| A06 / accepted with disclosed inference | The 1992-05-03 Lakers playoff home was Thomas & Mack, not the nominal LA building. Keep the existing designated-home rule and altitude threshold. The 1990-11-10 Seattle home is placed at Tacoma Dome by primary-source triangulation: city is directly named, building is inferred. Do not upgrade that inference to a direct same-day building citation. | [alternate fixture adjudications](alternate-fixtures/README.md), `alternate-fixtures/adjudications.json`; `fixture-venue-corrections.json`; `arena-corrections.test.ts`, `physical-venue.test.ts`. |
| A07 / closed locally | Shooting's native `002%` DB-ID filter excluded five valid synthetic canonical fixtures whose authentic NBA aliases already existed. Validate a bijective source/canonical mapping, exact ET date, teams, scores and full cache rosters; reject collisions and duplicate player/fixture rows. Require complete completed-season caches before publication. | `scripts/analyze_player_shooting.py`, `scripts/player_appearance_history.py`; `scripts/tests/test_shooting_fixture_aliases.py`, `scripts/tests/test_player_appearance_history.py`, authentic `scripts/tests/fixtures/shooting-aliases.json`; [Shooting record](shooting.md). |
| A08 / corrected impact claim | The universal “one or two games per player” claim was false: Thomas Bryant recovers three. Exact additions are 108 positive-FGA outcomes / 917 FGA / 84 player-seasons. Preserve all 696,961 prior outcomes. The global empirical-Bayes prior also legitimately changes 396 rounded career records, beyond directly affected season rows. Decode compact dictionaries before comparing identities; Jared Butler's team-order label changes without an identity error. | [Shooting counts and five aliases](shooting.md), generated `public/data/player-rest.json`; `player-rest.test.ts`. Independent full-cache verifier covers all 14,493 season rows and 1,309 career estimates. Shot Value lacks the same canonical-ID exclusion and is not assigned an unsupported cohort fix. |
| A09 / closed locally | Data Status labeled the venue-baseline population as all final games with fatigue evidence. Separate 47,143 neutral-inclusive games from 47,094 venue-baseline games; the 49 neutral games explain the difference. Retain published-game filters, latest paired evidence, caching/invalidation and unavailable handling. | `rest-advantage-evidence.ts`, `rest-advantage-evidence-server.ts`, `src/app/data-status/page.tsx`; `rest-advantage-evidence.test.ts`, `rest-advantage-evidence-server.test.ts`, `data-status-page.test.ts`; [status/metadata record](status-metadata.md). |
| A10 / closed locally | The flat referee producer missed four already accepted ESPN date corrections. Apply the existing fixture-specific crosswalk with identity/date/team/score guards; accept a provider-repaired date without subtracting another day. Exactly four dates change among 14,128 corpus games; player and foul CSVs stay exact. | `ml/extract_referee_corpus.py`, `ml/tests/test_referee_corpus.py`, authentic `referee-generator.json` fixture; [four-event table](referees.md#four-espn-dates), `scripts/referee-event-identity.ts`. |
| A11 / closed locally | L2M report-native `0022401229` needs a canonical join to `bref-202412140MIL`, not a renamed report ID. Append validated `canonicalExternalId`; preserve report URLs, detail paths and native IDs. All 4,546 detail files remain byte-identical; only the summary link changes. | `ml/publish_officiating.py`, `src/lib/officiating.ts`; `ml/tests/test_officiating_publish.py`, `officiating.test.ts`; [L2M identity record](referees.md#l2m-source-identity-and-canonical-join). |
| A12 / closed locally | New Orleans was Eastern in 2002-03 and 2003-04. Fix the builder and exactly two conference cells, IDs 265/278, NULL to East. Rebuild/compare all 600 stored series while preserving rounds, winners, orientation, tallies, features and prediction versions. | `ml/build_series_dataset.py`, `ml/tests/test_build_series_dataset.py`; [official media-guide evidence and exact delta](status-metadata.md#historical-conference-evidence-and-proposed-delta), `status-metadata-delta.json`. |
| A13 / closed locally | “Miles flown” overstated an arena-to-arena estimate. Expanded Games now says `MILEAGE, LAST 7 DAYS`. Correct stale explanatory numbers/comments and overtime database documentation without changing coefficients or score semantics. | `src/components/matchup-parts.tsx`, `docs/DATABASE.md`, `src/app/behind-the-data/rest-advantage/page.tsx`; [copy record](status-metadata.md#copy-and-documentation); built Games receipt described below. |

## Source candidates rejected, refined or held

A correct fixture ID/date/result does not certify its provider's arena label. The Western
boundary check reproduced 78/78 fixture identities while retaining 17 conflicting building
labels. The reports preserve source-by-source decisions; this table indexes the traps.

| ID / disposition | Candidate mistake and retained resolution | Evidence / recurrence guard |
| --- | --- | --- |
| S01 / rejected | Retroactive NBA arena names and IDs, whole-city BRef annotations, sponsor names and opening dates cannot alone establish the physical venue or actual game boundary. Preseason returns cannot extend competitive default eras. | Western/eastern source reports and their boundary/identity checks; separate era and exact-fixture registries. |
| S02 / refined | Candidate Richfield, Miami, Orlando, HemisFair and original ARCO I points did not identify the evidenced building accurately. Use individually sourced map/building points. Anaheim Convention Center campus pin is not the Arena; use the circular Arena roof polygon corroborated by the official plan. | [eastern report](eastern-arenas/REPORT.md), [western report](western-arenas/REPORT.md), [Anaheim adjudication](anaheim-arena/README.md), each record's coordinate method, primary URL and raw hash. |
| S03 / rejected or limited | Wrong Google matches for former McNichols/Sports Arena, present convention-center Salt Palace pin, viewport centers, request-name echoes and unapproved Apple address geocodes are not authenticated historic arena points. A multi-result Golden 1 search required a CID-specific response. Forum parcel corners and Portland UTM references with unestablished datum were not silently converted to court centers. | Western report and raw mapping candidate records. Original named-place tuples, OSM building rings, historical maps and independent identity controls remain distinct methods. |
| S04 / accepted estimate | HemisFair and Salt Palace use original USGS map symbols with independently checked NAD27/WGS84 transforms. Retain 40m/100m point-selection uncertainty respectively; these are neither surveyed court centers nor statistical confidence intervals. Some named venue pins elsewhere may be entrances or approximate sites. | Western report; `docs/audit/arena-shooting-correction/historical-topo/`; independent core review. |
| S05 / rejected additional override | UPI's March 29, 1991 Minnesota–Seattle Tacoma dateline conflicts with AP and LA Times Seattle reporting. Do not adopt a Tacoma override from that city claim alone. The separate November 1996 Toronto conflict remains without an unsupported new override. | Alternate-fixture adjudications and retained conflicting reports; no invented exact building assertion. |
| S06 / field-specific adjudication | Baltimore team guide supports 1992-12-26 over a conflicting Getty Landover caption, but omits a separately confirmed Baltimore game and misdates another. Clippers guide identifies 1994-01-27 Anaheim but prints an erroneous score: preserve canonical 102–103. Do not promote one accepted venue field into trust in every field. | [alternate-fixtures/README.md](alternate-fixtures/README.md) and machine-readable adjudications retain omissions, date/score conflicts and original fields. |
| S07 / acquisition limits retained | Search rendering and direct retained bytes are different evidence. WDBJ direct acquisition returned 410; UPI and some primary pages returned 403. Shooting's January 25 NBA page failed fresh browsing, while retained accepted source/cache validation remains available. No invented successful response or raw hash. A third-party HIFLD mirror is government-authored corroboration, not a current official-service capture. | Source reports, acquisition metadata and [shooting.md](shooting.md). Reacquire only when a new audit needs stronger evidence; preserve failed receipts. |

Mileage is an arena-to-arena estimate. Airports, actual flight paths, unobserved intermediate
home returns, overnight locations and sleep were not observed. The inventory does not prove
perfect actual itineraries or every intervening historical fixture's venue individually.

## Implementation and verification corrections

| ID / closed locally | Failure, correction and durable regression | Retained operational evidence |
| --- | --- | --- |
| V01 | First preparation stopped at a source-diff guard because the lexical scanner misread a template-literal tail after interpolation and treated approved comments as code. Use parser-resolved tokens of the complete old/new module. Tests explicitly reject threshold, aggregation, interpolation and helper mutations; do not widen a scoring-rule exemption. `scripts/arena-correction/sources.ts`, `sources.test.ts`. | `prepare-attempt1-source-guard.log`, `prepare-attempt1-baseline.json`, successful `prepare.log`. |
| V02 | Full Vitest initially had 12 failures in five files: stale rounded current coordinates and old regenerated calibration buckets. Travel expectations now use independent dated source points while preserving one-charge-per-leg, Cup context, no-extra-report-game and rolling-total checks. Schedule value uses producer integer counts and a wins-first calculation; no tolerance widening. `bubble-venue`, `season-travel`, `season-report-travel`, `schedule-value` tests. | `vitest-full.log`, `vitest-full-before-expectation-fix.log`, final full-suite logs. Targeted five-file rerun passed 30 tests; final candidate has 1,460 passing unit tests. |
| V03 | The stale “above 63%” prose was actually false for recent workload (62.98%). Render each term's generated rate explicitly: back-to-back 63.55%, workload 62.98%. `fatigue-ablation-facts.test.ts` renders the actual methods page and checks generated values and absence of the blanket claim. | Browser methods disclosure at both widths, `browser/README.md`, generated `ml/fatigue_ablation_facts.json`. Do not hand-edit the artifact. |
| V04 | Blocked team-logo images exposed white 10px ATL/POR fallback text on `#E03A3E`, about 4.33:1 in axe. Near-black also fails. Compute actual WCAG contrast; choose the stronger existing text color, using pure black only when both fail 4.5:1. `nba-team-colors.ts` and 79 tests cover all current/historical/neutral primary/secondary fills, real ATL/POR, dark/light and middle gray. | Original `browser/attempt-1/` retained. Rebuilt actual failed-image path at both widths selects black, ratio 4.844241230669417, zero axe violations/overflow: `browser/fallback-fixed/result.json`. Normal-image success alone was insufficient. |
| V05 | Two browser harness selectors were wrong: expansion correctly changed Expand to Collapse; the awaiting heading included the season suffix. Correct the selectors and rerun affected cases. Preserve the original failures. No product change was justified by these harness errors. | `browser/attempt-1/result.json`, `browser/result.json`, `browser/normal-summary.json`, final combined receipt. Local Vercel Insights 404/MIME logs were retained; final fallback run supplied empty JS only for that unsupported local telemetry URL, with no API/data mock. |
| V06 | Native `node --test` could not load the TS verifier's `@/lib` imports (`ERR_MODULE_NOT_FOUND`), although another runner could. The Node contract now loads TS with `tsImport` from `tsx/esm/api`, without changing package module type or production resolution. `scripts/tests/prediction-tools.test.mjs`. | `node-contracts-before-native-loader-fix.log`, `node-contracts-final.log`; all 24 native Node tests pass, including eight prediction-tool contracts. |
| V07 | Git text normalization could invalidate raw-response/source hashes (including CRLF), and verbatim GIS service responses contain provider trailing spaces. `.gitattributes` marks the dated evidence packet `-text whitespace=cr-at-eol`, with narrow `-whitespace` exceptions for the two original HIFLD service responses. Preserve bytes; do not reformat evidence to satisfy whitespace tools. | `.gitattributes`; independent source review rehashed all 1,629 source-evidence files. Verify worktree and Git-object byte hashes when copying/committing raw evidence. |
| V08 | The first independent core review found an unfulfilled explicit tool requirement: legacy reset still deleted all predictions and the verifier treated intentional historical drift as failure. Make reset report-only; refuse `--apply` before environment/DB loading. Split structural integrity and eligible future consistency from historical diagnostics. Preserve shared pool/TLS, read-only repeatable-read transaction and latest-fatigue ordering. | `scripts/reset_predictions.ts`, `scripts/verify_predictions.ts`, `scripts/tests/prediction-tools.test.mjs`; core and follow-up reviews; `prediction-tools/receipt.json`, `apply-refusal.json`, `verify-report.json`, `state-before.json`, `state-after.json`. Actual SELECT-only CLI runs leave the six-domain after hash unchanged. No reset/backfill/grading executed. |

### V09: PR #188 clean-runner dependency ordering correction

The first PR #188 CI run failed in `Run schedule contract tests` with
`ModuleNotFoundError: No module named 'psycopg2'`: the new Shooting alias test imports
`analyze_player_shooting.py`, while CI installed the Python environment only in the later
ML step. The populated local virtual environment masked that clean-runner ordering gap.
The failed discovery reported 51 tests with one import error; that is not a passing suite
or the complete successful-discovery count. The aggregate gate correctly failed and the
browser job was skipped; the PostgreSQL job passed independently.

Move the existing `python -m pip install -r ml/requirements.txt` command into its own step
before both Python discovery commands. The pinned requirements and dependency versions
are unchanged; no tests are skipped and no dependency stub is used. The testing guide
now states the prerequisite for both suites. Original failure receipt:
`docs/audit/arena-shooting-correction/release/ci-initial-failed.log`.
This is a workflow/documentation correction outside the frozen producer, scoring and
source-proof inputs. Local verification: all three `scripts/tests/release-gate.test.mjs` contracts and all 58
`scripts/tests` Python contracts pass; the workflow order check confirms one unchanged
requirements install before both unchanged discovery commands. `git diff --check` passes.
The populated local environment does not reproduce a fresh GitHub runner. Local contract
verification and the subsequent actual CI result remain distinct; CI acceptance requires
the new runner's successful receipt.

## Section 7: retained diagnostics, not repair instructions

The audit deliberately preserves coefficients, workload windows, streak definitions,
one-mile tolerance, designated-home rules, hypothetical home-return assumptions, seed
proxy and stored historical prediction versions. No 2026-27 grading was built or run.

| Diagnostic | Exact retained interpretation |
| --- | --- |
| Historical gap differences | **12,519 = 12,378 + 141.** The independent audit counted 12,378 stored rows still called under current rules with a changed gap. The preservation-aware CLI counts gap differences across all stored historical rows, also including 141 withdrawn/no-longer-called rows. These are different populations, not contradictory computations or newly edited history. |
| Historical missing / withdrawn calls | 838 / 141; report current-rule drift without inserting, deleting or rebuilding historical predictions. Three retained historical neutral-site predictions are diagnostics too. |
| Stored prediction integrity | 28,077 stored = 27,420 graded + 657 unresolved. All 27,420 graded rows remain exact; zero structural integrity failures. All 657 eligible future calls reconcile across 1,200 future games. Only eight existing future gap values change in this manifest; IDs, picks and creation timestamps remain, with no inserts/deletes. |
| Playoff history | All 3,149 prediction versions preserved. Of 615 reference series, 15 belong to the existing 2019-20 bubble-model exclusion; all 600 stored series match accepted metadata except the two approved conference repairs. |
| Other model/source diagnostics | 153 seed-proxy differences; 174 referee source/canonical neutral-flag differences; final-game window and streak counts 25,763 / 1,041. Retain their definitions and evidence rather than normalize them in this correction. |
| Shooting reference join | Original reference check retains 16 name-normalization misses. Separate player-ID/context checks reconcile all 16; all 2,028 externally sampled player-seasons match exact FGA/eFG numerator. Preserve the original report, and distinguish this sample from the separate all-14,493-season-row cache verification. |

## Evidence inventory and recurrence rules

Portable evidence includes committed source reports, selected source responses and hashes
in this dated research packet, arena/fixture/alias registries, producer code and regression
tests. Larger raw captures and operational receipts remain ignored private evidence; a
fresh clone does not contain every raw response. Tests establish implementation behavior
against retained facts, not that a provider is unchanged or a deployment used the accepted state.

Operational receipts are deliberately gitignored under
`docs/audit/arena-shooting-correction/` (and Shooting's earlier
`docs/audit/arena-shooting/`). Preserve them and their inventories with backups; a fresh clone
will not have them. Key receipts are `capture.json`, `fresh-backup/`, `source-proof.json`,
`candidate.json`, `rehearsal.json`, `analytics/output-manifest.json`, `independent/final-files.json`,
`comparison/`, `referees/`, `browser/final-summary.json`, `prediction-tools/`, the two final
reviews and `frozen-candidate-final.json`. Do not silently substitute a later file under an
old hash or turn an ignored receipt into a claim of permanent CI coverage.

The accepted local transition replayed all 103,398 sides: 52,611 semantic fatigue rows
change across 42 stored seasons, limited to Mileage, travel-load, total score and their
changed-row computation timestamps. Actual apply/readback, idempotent retry, PostgreSQL
restart/readback, conditional rollback, second restart and reapply passed locally. A fresh
public backup restored eight tables / 16 policies; its local `auth.role()` compatibility
shim does not verify production Supabase Auth.

Integrated receipts report 1,460 Vitest, 24 native Node, 58 Python-script, 72 ML and 36 real
PostgreSQL contracts passing; typecheck/build/docs/dependency audit pass. Full lint has zero
errors and two pre-existing unused-variable warnings. All 15 producers / 27 output hashes
were checked. Independent CSV comparison covers 186,953 rows / 3,282,412 fields; numeric
comparison covers 80,312 before/after leaves and 50,581 API leaves in each state across 86
requests. Twelve normal browser states, seven normal selected axe scans and two forced
fallback axe scans are bounded local Chromium evidence, not a device/all-route sweep.

| Trigger | Required next check |
| --- | --- |
| Travel resolver, fixture precedence, base/era interval or same-building handling changes | Run the arena-history/correction, physical-venue, team-era, bubble and season-travel/report tests. Inspect boundary and alternate-home semantics; source/engine closure changes require new preparation and independent review, not merely green unit tests. |
| Shooting aliases, roster validation, cache inventory or publication changes | Run the Python alias/history contracts and player-rest tests; rerun actual exporter/full-cache integer and EB comparisons on authenticated inputs. Do not assume only directly affected players' career values can change. |
| Coverage, referee or conference code changes | Run the named page/evidence, referee generator/publisher and series-builder contracts. Recheck actual population joins and generated artifact differences; preserve raw detail identities. |
| Explanatory figures or team-logo fallback changes | Render the actual page using generated facts; exercise normal and deliberately failed image paths on a built server at relevant widths, then rerun the previously failing axe case. |
| CLI loader or preservation-aware tool changes | Run the native Node suite, credential-free/pre-env `--apply` refusal and read-only actual CLI path; compare exact before/after state hashes. Keep historical diagnostics separate from defects. |
| Raw packet copy, formatting, Git attributes or archive changes | Verify original bytes, compressed/decoded hashes as specified and Git-object bytes; never normalize CRLF or provider whitespace without creating a newly documented source version. |
| New provider response, disputed venue evidence, new fixture, changed source bytes, engine/transition closure drift or changed database baseline | Start a fresh source/state audit and reviewed candidate. Authenticate identity and individual fields, retain rejected evidence, bind fresh backup/proof/manifest, rerun dependent producers and independent comparison as affected. Old receipts and owner approval do not authenticate the new candidate. |
| Production application / deployment | Root records fresh preflight and writer control, exact apply/readback, matching deployed SHA/artifacts, canonical API/browser acceptance and any rollback. Until those receipts exist, retain this ledger's local-only acceptance boundary. |


## V10: public source-metadata embed-key exposure, 2026-10-20

The owner reported a secret-scanner alert for a Google key in Western arena `sources.json`.
The value originated in a publicly served Smoothie King Center embed URL and matches retained
raw source HTML; it was not supplied by a FullCourt environment credential. The capture and
publication process nevertheless copied it into public extracted metadata unnecessarily.
Redact only that URL's key query value to `[REDACTED_PUBLIC_EMBED_KEY]`, retaining the exact
original privately at `docs/audit/arena-shooting-correction/release/security/source-metadata-original.json`
with mode 0600. The public metadata hash changes; preserve the earlier original for frozen
source-proof provenance rather than altering proof or pretending the hashes still agree.

The [Western report](western-arenas/REPORT.md#public-embed-key-redaction-2026-10-20) records
this redaction. `scripts/tests/source-metadata-secrets.test.mjs` inspects tracked extracted
source-metadata URLs and rejects Google API key values without printing them. Existing native
CI discovery includes the contract automatically. Private raw captures are outside that
publication check; their bytes and hashes, scorer, producers and manifest remain unchanged.
No key was printed or API-probed. No revocation, old-history purge, production action or
successful CI rerun is claimed by this record. Capture provenance is not proof of ownership
or permission to republish credentials; recurrence prevention belongs before public extraction.

The secret alert remains **OPEN**. It is not marked false-positive, revoked or fully
remediated: the value was already present in a public historical commit, and changing the
current tree does not erase that exposure. The root's accepted separation is a sanitized
public candidate and isolated exact approved private source files for manifest execution;
that plan must not be represented as executed until its own receipts exist. Do not restore
the original into a public release tree or silently update the frozen source proof.

Local checks for this correction: two targeted metadata tests and all 26 native Node tests
pass; original-byte comparison verifies exactly one query-value substitution, valid JSON
and private-file mode 0600. These checks did not contact the provider or test key validity.


## V11: production build before data apply, 2026-10-20

The root built production source `6ddf73f46a36e664fb505cd160ad92d324e748eb`
(deployment shorthand `etnyt` in the private release receipts) before applying the approved
database correction, intending to shorten the maintenance window. The homepage's
database-derived prerender/ISR output, with `revalidate = 86400`, therefore retained the
old headline: 65.2%, 3,901 games and +5.3 percentage points. After the approved apply,
all 86 actual API responses / 50,581 compared leaves matched the corrected state, while
the previously built homepage HTML still showed the earlier values. API parity did not
establish page acceptance.

Actual canonical browser checks caught the stale homepage at both 390px and 1440px.
The other ten selected browser states and all four forced-logo-fallback cases passed.
The root immediately restored maintenance; scheduled writers remain paused. The root
owns this release-order error. Remediation rebuilds the same `6ddf73f4` source only after
the database matches exact AFTER hash
`83fc2c66f301f6ac115d4b2fdfe45883b5304d33a041569712a94fe3cbb18fa7`;
staged deployment shorthand `4i7sjdouf` is building at this entry. No SQL change, refit,
coefficient change or new analytical publication is part of that remediation.

**Status: remediation pending; canonical acceptance is not established.** Preserve the
failed HTML/browser receipts and subsequent rebuild/readback separately. Root must append
the actual final deployment/SHA and canonical browser/API outcome before closing this entry.
The ignored release packet holds operational proof; this ledger records the recurrence rule.

Prevention: apply and independently verify the approved data state before building any
database-derived static/prerendered output. If an earlier build must be reused, explicitly
invalidate and re-render its affected output and prove the resulting HTML. Before promotion,
inspect the actual staged homepage SSR/prerendered headline, denominator and baseline/lift,
then verify the hydrated browser at relevant widths and the corresponding APIs against the
same accepted state. A successful deployment, correct APIs or an ISR interval alone cannot
accept the release. Follow the [HTML cutover runbook](../../GENERATED_ARTIFACTS.md#database-derived-html-cutover).
