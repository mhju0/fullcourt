# Historical overtime requires period evidence

Date: 2026-10-20. Status: accepted for implementation; production application requires
review of the exact candidate and the owner's immediate approval.

## Finding

A release follow-up verified the published arithmetic against a fresh read-only database
capture, then tested the remaining overtime-source gap. Official NBA period records
confirmed that some older games stored with zero overtime actually went to overtime.
Because the next appearance's fatigue score includes the previous game's overtime, this
can change a later rest-gap classification. A correct division of stored wins by games
does not establish the correctness of its inputs.

## Decision

Verify the bounded unconfirmed fixture set against retained official NBA responses.
Accept a period count only when the embedded game ID, Eastern date, normalized teams,
final status and scores match the captured fixture. Both teams must have the same complete
numbered periods, matching totals, and a tied cumulative score before every overtime
period. Preserve the exact count, including games with more than two overtime periods.
Unusable or internally inconsistent records remain unconfirmed.

A separately reviewed, fixture-specific adjudication may confirm the overtime field when
the archive's other fields conflict. Preserve the original rejection and raw values. Pin
the exact fixture, raw response and supplemental primary source hashes, the permitted
conflict and the independent duration evidence. The regular validator remains strict.
An overtime-list entry plus period five and two 265-minute team totals can confirm one
overtime despite an inconsistent quarter total. Four complete regulation periods and two
240-minute totals can confirm regulation when their sums and contemporary reporting agree
with the stored result despite an erroneous archive headline. Neither adjudication permits
changing the game result or accepting another fixture by analogy.

Keep the full attempted corpus and its accepted/rejected decisions separate from the
positive-overtime database delta. Pin raw response hashes, validator code, original source
snapshot and target facts. When scheduled-writer metadata changes between captures, use an
explicit identity/semantic bridge to a fresh baseline; never relabel the original hash.

Use a new overtime-only transition. The previous historical correction is an immutable
one-shot transition and its guards must not be loosened. Permit only verified
`games.overtime_periods` updates, no fixture additions or changed results. Recompute all
fatigue rows and eligible unresolved forecasts with unchanged coefficients and publication
rules. Preserve unchanged rows, resolved predictions, teams and both playoff tables.

Merge verified overtime into the cumulative reingest registry without removing earlier
venue, type or tip-time corrections. Regenerate each dependent analysis from a fresh
feature export and prepared model table. Independent player/shot/officiating source outputs
remain unchanged unless their own inputs change.

## Release requirements

Require a frozen candidate, source review, restored-backup proof, PostgreSQL atomicity,
retry, drift refusal, conditional rollback and server-restart checks. Before production,
pause writers, verify a fresh backup and exact baseline, and obtain approval for that
specific reviewed manifest. Verify the changed source inputs, score rows, generated
analytics, public APIs and canonical deployment after application.

The historic win rates remain descriptive associations with home court and population
composition. This repair does not establish causal effects or convert a historical replay
into contemporaneously published predictions.
