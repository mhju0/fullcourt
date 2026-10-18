# Generated-source reproduction — 2026-10-18

## Official L2M input

The tracked collector captured a new immutable 2025–26 snapshot from
https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/ .
All 415 indexed report JSON responses passed identity, grade and required-field validation;
none failed. These include 386 regular-season reports and 29 play-in/playoff reports.
The publisher intentionally reads regular-season reports only.

The new manifest is retained alongside this record. Raw reports are retained locally under
`ml/data/l2m-research/2025-26/20261018T065424522741Z/` in the primary checkout.
Its index SHA-256 is `b5594f1c7f9177da7d38e21107920b194c8fb1a7c76a607aaf056804557032aa`.

Running the actual publication builder with the existing crew and duplicate reviews reproduces
every published 2025–26 game, category/count and all 386 detail files exactly. Only the verified
source-index hash and refresh timestamp differ. The tracked publisher was then run against the
closeout worktree, updating those metadata fields; no figure or detail content was hand-edited.
Older seasons were preserved. This closes the missing-newer-snapshot gate; it does not recover
the exact September 8 raw snapshot retrospectively.

## Referee Legends, from retained upstream cache

In an isolated `/tmp/fullcourt-legends-rebuild-2026-10-18` tree, the actual extractor read the
retained ESPN officials cache and rebuilt games/fouls/players CSVs. All six upstream analyses
were rerun (`referee_axes`, `referee_player_axes`, `referee_exploratory_axes`,
`referee_makeup_diagnostic`, `referee_playoff_claims`, `referee_playoff_confound`) before
`build_referee_legends.py`; the previous intermediate results were not reused.

The final output is byte-identical to `src/data/referee-legends.json`, SHA-256
`a1c7f66c61e0b1a5fff808fc21dc04743bffe041d095b063820cb8ea1f6223c0`.
The isolated logs/results remain beside the staged output. No tracked Legends data changed.
This establishes full reproduction from the retained source cache, not a fresh fetch of every
historical ESPN payload or an independent validation of ESPN's underlying event facts.

## Boundaries

No database connection, production write, coefficient fitting or model change occurred.
The historical shooting regeneration and other-season publication contracts remain recorded
in the earlier regeneration report; they were not relabeled as fresh upstream collections.
Human/device checks and first completed-slate ingestion remain separate.
