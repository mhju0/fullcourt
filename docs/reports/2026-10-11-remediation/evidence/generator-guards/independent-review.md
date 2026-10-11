# Independent read-only acceptance

Candidate: `edd31eb0591bb5f58e7d248892da5797aacb7a83`
Baseline: `3445fcdbf3444a938460830990116ae4f8db1489`
Reviewer: independent Astra High; no writes.

[Verified] Accepted with no blocking defect within the approved D85 scope.

- Exact four identities validate stored NBA attributes and ESPN event/competition ID,
  season, date, teams and final scores (`scripts/referee-event-identity.ts:37`, `:78`).
- Separate collected and eligible foul-style populations derive coverage. Errors, empty
  populations and published count-floor violations precede the first output write
  (`scripts/fetch_officials.ts:286`, `:336`, `:410`).
- Officiating compares aware instants and rejects different source provenance at equal
  instants. All batches, including repeated seasons, validate before file writes
  (`ml/publish_officiating.py:40`, `:164`, `:206`).

Reviewer independently executed37/37 referee boundary tests under Node22 and13/13 Python
publisher tests. Inspected authentic cached CLI evidence:13,209 matched,12,636 collected,
11,952 style,573 missing,zero errors, current analytical fields unchanged; authentic older
snapshot refusal preserves files. No published JSON, schema or coefficient change.

Accepted limits: counts do not establish full membership continuity; post-validation
filesystem errors are not atomically recovered. This is source protection and local
verification, not new artifact publication or production writer execution.
