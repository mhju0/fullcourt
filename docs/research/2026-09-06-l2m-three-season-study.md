# L2M research expanded to 2023–24 and 2024–25

The owner requested two additional seasons before making major product decisions. This pass collects the same data and runs the same descriptive analysis; no UI, publication or scheduling decision has been made.

## Deliverables

- [Generated comparison tables](2026-09-06-l2m-three-season-comparison.md) and [comparison JSON](2026-09-06-l2m-three-season-comparison.json).
- [2023–24 full results](2026-09-06-l2m-2023-24-results.json), [2024–25 full results](2026-09-06-l2m-2024-25-results.json), and the retained [2025–26 results](2026-09-06-l2m-season-results.json).
- [Independent earlier-season validation](2026-09-06-l2m-earlier-seasons-validation.md) and [official-source comparability review](2026-09-06-l2m-three-season-context.md).
- [Pre-calculation scope extension](../../ml/l2m_three_season_extension.md), continuing the original descriptive protocol.

All **1,239 indexed reports across three seasons** have been collected and linked to three working officials: 394 for 2023–24, 430 for 2024–25, and 415 for 2025–26. This is complete acquisition of each linked index, not an independent census of all eligible close games. Sources: NBA [2023–24 index](https://official.nba.com/2023-24-nba-officiating-last-two-minute-reports/), [2024–25 index](https://official.nba.com/2024-25-nba-officiating-last-two-minute-reports/), and [2025–26 index](https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/).

## What the added seasons establish descriptively

Regular-season reviewed errors per game are **1.169, 0.764 and 0.974**, respectively. Normalizing by represented periods preserves that ordering: **1.017, 0.676 and 0.858**. Thus 2025–26 is above 2024–25 but below 2023–24 on both descriptive measures; this does not support a simple claim that officiating gets worse every year.

Missed calls account for **84.6%, 80.0% and 81.9%** of regular-season error grades. The predominance of missed calls is present in all three seasons, not only the latest sample. These are shares of incorrect reviewed decisions, not the probability a real foul goes uncalled.

Shooting fouls are the largest error category in every regular-season sample: **105, 75 and 102**. Defensive-three-second errors are **53, 32 and 37**. The comparison exports every raw category, not just those examples. Some labels vary in spelling, spacing or classification across years; similarly worded categories have not been silently merged. Before a product chart groups categories, define and validate its category mapping.

The separate cached regulation-event series has 37.08, 36.92 and 39.51 foul events per game and 0.722, 0.662 and 0.665 technical events per game. Its population differs from L2M and its latest/earliest seasons have missing games. Neither a volume increase nor an L2M decline identifies the cause of changes in officiating.

## Comparability and integrity

The three NBA index introductions state the same eligibility and grading rules. However, **replay scope expanded in 2024–25**, allowing out-of-bounds challenges to identify proximate uncalled fouls. Final L2M grades can reflect decisions corrected during review. Differences may also reflect who reaches close-game situations and which non-calls are considered material. [Official rule change](https://official.nba.com/nba-expands-use-of-instant-replay-on-out-of-bounds-reviews/)

Keep regular season, play-in and playoffs separate. The comparison includes all three phases, but tiny play-in/postseason samples should not be interpreted as strong seasonal trends. Represented periods mean distinct game-period labels with assessment rows, not independently confirmed minutes of review exposure.

All three seasons have empty explicit per-error beneficiary fields. Their event error counts disagree with their team-benefit summary totals in **22, 25 and 20 games**, respectively. The earlier-season extension therefore does not remove the existing blocker to reliable team-benefit rankings. No helped/hurt-team totals or personal referee mistakes are inferred.

The 2024–25 raw data contains two identical pairs of correct-call rows. NBA gamebooks show two real take fouls near the corresponding timestamps in each game, so automatic deduplication could remove an assessed foul. The rows remain counted as the source publishes them, with [reviewed exceptions bound to source hashes and exact row pairs](2026-09-06-l2m-2024-25-reviewed-duplicates.json). Assessment identity remains ambiguous. A hypothetical deduplicated version would have two fewer CC/assessment rows; all incorrect-decision counts and errors-per-game/period measures would be identical. The [primary evidence](2026-09-06-l2m-three-season-context.md#reviewed-duplicate-row-exceptions-in-2024-25) documents the gamebooks and timing differences.

Six missing earlier-season assignment joins were resolved with separately hashed NBA gamebooks and ESPN summaries. An ESPN order value of 4 does not universally mean standby when only three officials are listed: two such trios were verified against NBA gamebooks. No broad order filter was introduced. [Assignment validation](2026-09-06-l2m-earlier-seasons-validation.md)

## Reproduction and checks

From the repository root:

```sh
python3 ml/collect_l2m_season.py --season 2023-24
python3 ml/collect_l2m_season.py --season 2024-25
```

Those commands create new snapshots. Reproduce the saved research using the original snapshots:

```sh
python3 ml/analyze_l2m_season.py \
  ml/data/l2m-research/2023-24/20260906T145128311475Z \
  --assignment-corrections docs/research/2026-09-06-l2m-2023-24-assignment-corrections.json \
  --out docs/research/2026-09-06-l2m-2023-24-results.json
python3 ml/analyze_l2m_season.py \
  ml/data/l2m-research/2024-25/20260906T145127099997Z \
  --assignment-corrections docs/research/2026-09-06-l2m-2024-25-assignment-corrections.json \
  --reviewed-duplicates docs/research/2026-09-06-l2m-2024-25-reviewed-duplicates.json \
  --out docs/research/2026-09-06-l2m-2024-25-results.json
python3 ml/compare_l2m_seasons.py
python3 -m unittest discover -s ml/tests -p 'test_l2m_season.py'
```

Raw data remains in ignored local caches with source timestamps and hashes. A new snapshot requires re-review if the hash or identity of an exceptional duplicate changes; the analyzer fails rather than reusing stale exceptions. The comparison JSON records hashes for all season-result inputs and the secondary context file.

Independent raw reductions reproduced both earlier seasons' grades, represented periods and error counts. Five focused tests passed, including rejection of unreviewed or changed duplicate exceptions. Source hashes, phase/month/category partitions and official/trio exposure reconciliations passed for all new outputs. Existing 2025–26 output values were checked for backward compatibility. Local document links and `git diff --check` passed. Product source, generated public analytics and the live site were not changed.
