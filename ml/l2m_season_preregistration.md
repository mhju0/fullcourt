# L2M season research protocol

Recorded 2026-09-06 before downloading or calculating event-level results. User authorized data-first research, with a current-season cumulative report as the main candidate. No product publication or UI change is part of this study.

Population: every unique report linked from the NBA's 2025–26 L2M season index at retrieval. There are no 2026–27 season reports identified yet. Keep regular season, play-in and playoffs separate by NBA game identifier, not the index heading (which also contains postseason games). Preserve index snapshots, raw report responses, timestamps and hashes; report failed downloads and missing fields. Do not call indexed coverage complete coverage of all eligible games without a separate eligibility audit.

Fixed descriptive questions:

1. How many reviewed games, assessed events and reviewed periods? How many incorrect calls (IC), incorrect non-calls (INC), correct calls (CC), correct non-calls (CNC), and ungraded entries? What fraction of reviewed games have an error?
2. Which call types account for errors? Split missed whistles from wrong whistles. Monthly comparisons remain descriptive; report denominators and separate postseason. Changes cannot identify rule emphasis or intent.
3. Which teams benefit or are disadvantaged by reviewed errors? Use explicit NBA beneficiary fields where valid; retain unknowns. Validate IC versus INC direction against source descriptions. Report gross for/against and net, games and reviewed events. No conversion into points or wins.
4. Can errors be associated with the three officials assigned to a game? Prefer source-provided on-court assignments. Exact trios and individual assignment exposure are separate units. Each error occurs once in league/team totals, but is associated with all three officials when showing assignment histories. Never attribute personal responsibility unless an explicit verified field identifies it. Preserve zero-error games. Report denominators and missing joins; no worst-ref ranking or significance claims.
5. Do data fields permit player-level treatment and equivalent-contact consistency? Profile fields and missingness. Do not infer denied opportunities from ordinary box scores or absent play events. The L2M selection limits any player statement to these reviewed situations.

Stop at descriptive counts and feasibility for this round. No post-hoc thresholds, named bias claims, or hypothesis tests. A later inferential study requires a separate pre-registration and held-out data. Prioritize findings by usefulness only after recording all outputs, including empty/inconclusive results.

Validation: unique game/event identity, recognized grading codes, game/season consistency, source hashes, all indexed reports accounted for, totals reconciled across game/phase/month and error-type summaries, beneficiary balance including unknowns, and manual inspection of several IC/INC/zero-error/overtime reports. Changes to source reports should produce new snapshots, not erase older evidence. These local scripts are research tooling, not a scheduled production pipeline.
