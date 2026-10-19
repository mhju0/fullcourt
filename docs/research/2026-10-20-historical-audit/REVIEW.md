# Independent review record — October 20, 2026

An independent read-only Astra reviewer approved the research candidate below with no blocking findings. The root accepted the findings and verified the rendered report. This approval covers the audit's calculations and claim boundaries, not a production correction, a rescore, or complete historical itinerary accuracy.

## Frozen candidate hashes

| Artifact | SHA-256 |
|---|---|
| Main README | `51bab2ce6503ac725ed066ee1166ae7fc1afde9a32f42199ceb40a8bced142c1` |
| HTML report | `83064f008441bb3b925c4efb29c757307f94ca1e5f2a9a9cbc92e301c865ed49` |
| Numeric artifact manifest | `f7c4df706bcd1297c3167f868e6fe73e5377863bf8b2d20274fe8317b7e2c0a1` |
| Core source artifact manifest | `d9baa1de819cafac5e5c9188d8bac3aa9c7c7fa8ba4cc1de040de4691909d409` |
| Supplemental source manifest | `78a9321edb059f7330c000cfb441391a4e34f9e03ee211b823777facafbd9d54` |
| Venue README | `b85392bbcea87e7a2bb3e71bf70a803fddc1f48871ef4b9cd88105d16380c204` |
| Venue case register | `3c09f6a311b4859dd47f6512b7df1566ff96df80506a9925cb4bea30097b66fc` |
| Venue raw-artifact manifest | `aab1b7024d1ded95c334608fdf20a673e40504c782a44a06d0057e6a9779b86d` |

## Independent checks

The reviewer reassembled all 103,390 scores and all 51,695 homecoming counterfactuals from captured components, with zero mismatches. Eligibility, baselines, added/lost calls and all reported streak counts independently reconcile.

The core-source review verified artifact/cache hashes, reread all 157 Basketball Reference overtime labels and both team-minute rows for all 432 NBA overtime cases, and reconstructed the 109 Finals metadata mismatches across 41 completed seasons. The supplement independently matches 3,621 unique games, validates 3,610 period sequences including 194 overtime cases, and reproduces the combined date/score/OT coverage without double-counting.

The venue review verified all 1,269 raw hashes, the 167 distinct qualified cases and 334 adjacent team contexts. Tampa's 36, San Jose's 41 and Tacoma's 43 home rows reconcile. Whole-season inference, Austin's partial dated confirmation, Detroit's separate era inference and the unverified provider-candidate queue remain visibly distinguished.

The reviewer found two follow-up-plan wording issues, both corrected before final acceptance: returned engine components preserve the original rounding order; a future correction must cover predictions/cache/artifact consistency and a deliberate policy for resolved historical predictions. No retroactive prediction rewrite was approved.

## Root verification and packaging

- `pnpm test:run`: 108 files and 1,279 tests passed. Numeric-script ESLint and full TypeScript checks passed; all audit Python scripts compile.
- Rendered HTML checked at desktop and 390px phone width; 42 inventory rows, all report sections and eight tables are present, with no horizontal page overflow. Temporary viewport override was reset and the local server was stopped.
- All 74 report links resolve to existing local targets/fragments or external URLs. External URLs were not universally re-fetched by this link check.
- All 28 staged CSVs retain exactly the captured bytes. Scoped `.gitattributes` prevents Git line-ending normalization from invalidating their SHA-256 manifests. `git diff --cached --check` passes.
- Application source, production database, coefficients and published generated artifacts are unchanged. Raw captures remain local and ignored; the research branch is not a production deployment.
