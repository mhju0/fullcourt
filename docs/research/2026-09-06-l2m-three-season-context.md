# L2M comparability: 2023-24 through 2025-26

Research date: 2026-09-06. Official-source context for the three-season analysis; no product changes or causal findings.

## Reporting rules are comparable

The [2023-24](https://official.nba.com/2023-24-nba-officiating-last-two-minute-reports/), [2024-25](https://official.nba.com/2024-25-nba-officiating-last-two-minute-reports/), and [2025-26](https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/) archive introductions state the same selection and assessment rules:

- Eligible games come within three points at any moment in the final two minutes of the fourth quarter or applicable overtime.
- Reports assess whistles and material non-calls affecting a possession.
- Incorrect judgments require clear, conclusive video evidence.
- Some indirect incidents or observations requiring technical aids can appear in brackets without an incorrect grade.
- The NBA may revise an assessment after further review.

This supports comparing published IC/INC grades across the three seasons. It does not prove that the unobserved pool of potential non-calls, their materiality judgments, or the mix of reviewed games remained identical. Use the same phase definitions and show games, reviewed periods, and assessments alongside error rates. Regular season should be the primary like-for-like comparison; keep play-in and playoffs separate. The 2025-26 archive's regular-season heading includes postseason games, unlike the earlier archives' explicit sections, so use game metadata to classify phases.

## Playing and replay rules still changed

Beginning in 2023-24, a successful first coach's challenge earned a second challenge. The NBA also introduced an in-game flopping penalty on a one-season trial. Both apply from the beginning of this comparison period. [July 11, 2023 rule announcement](https://official.nba.com/nba-board-of-governors-approves-in-game-flopping-penalty-and-expanded-use-of-coachs-challenge/)

The flopping penalty became permanent in July 2024. [NBA announcement](https://pr.nba.com/nba-board-of-governors-in-game-flopping-penalty-nba-cup-tiebreakers/)

**A substantive replay boundary changed in 2024-25:** an out-of-bounds challenge could now identify and penalize a proximate previously uncalled foul. The NBA's example contrasts an Irving foul on McDaniels in the 2024 playoffs: the old review scope could award Dallas the ball despite the foul; under the new rule, the foul could be assessed and Minnesota retain possession or receive free throws. [September 10, 2024 announcement](https://official.nba.com/nba-expands-use-of-instant-replay-on-out-of-bounds-reviews/)

Analysis implication: a decline in published incorrect grades does not by itself establish better original whistle accuracy. More mistakes might be corrected before the final ruling because replay scope changed. Keep review-related events distinguishable. The inspected 2025-26 successful-challenge example in [the source-context note](2026-09-06-officiating-source-context.md) demonstrates a corrected original foul appearing as CNC.

## Documented season emphases

The following are topics explicitly named on the NBA's education pages. Page text was verified; detailed video examples were not independently recoded. They document league guidance, not personal referee intent or the cause of a statistical change.

| Season and publication | Named topics |
|---|---|
| [2023-24, September 27, 2023](https://official.nba.com/2023-24-points-of-emphasis/) | Freedom of movement in screens, perimeter and post; traveling; non-basketball moves; transition take fouls; bench conduct; respect for the game. |
| [2023-24 update, January 19, 2024](https://official.nba.com/update-2023-24-points-of-emphasis-2/) | Updates to those subjects, explicitly including flopping. |
| [2024-25, September 25, 2024](https://official.nba.com/2024-25-points-of-emphasis/) | Straight-line pathways and verticality; jump-shot closeouts; flopping. |
| [2025-26, September 26, 2025](https://official.nba.com/2025-26-points-of-emphasis/) | Jump-shot landing space; high-five contact; straight-line pathways. |

There was also a [February 26, 2024 update](https://official.nba.com/update-2023-24-points-of-emphasis-3/). Season-long guidance is therefore not necessarily one unchanged preseason directive. Publication dates can annotate exploratory monthly charts, but should not be treated as causal intervention dates without establishing when guidance actually took effect and controlling for other changes.

## Carry forward the beneficiary integrity gate

The [2025-26 audit](2026-09-06-officiating-source-context.md#full-snapshot-beneficiary-integrity-audit) found missing per-event beneficiary fields, inconsistent summary totals and incorrect summary direction in concrete games. Do not assume earlier seasons are better or worse. Audit each independently, including direction in games whose totals reconcile. A three-season comparison of graded error counts can proceed separately from unverified team-benefit rankings.

## Reviewed duplicate-row exceptions in 2024-25

The snapshot `ml/data/l2m-research/2024-25/20260906T145127099997Z` contains two exact duplicate pairs of CC personal-foul rows. All row positions below are zero-based. NBA gamebooks independently establish two distinct real fouls near those times in each game:

| Report and duplicate pair | L2M contents | Official gamebook evidence |
|---|---|---|
| `0022400587`, rows 14/15 | Q4 00:09.6; Holiday take foul on Young; CC; same video and possession fields. | [Atlanta at Boston, January 18, 2025](https://statsdmz.nba.com/pdfs/20250118/20250118_ATLBOS_book.pdf), page 21: Holiday take fouls at 11.0 seconds (personal foul 1, team foul 3) and 9.7 seconds (personal foul 2, team foul 4). |
| `0022400931`, rows 13/14 | Q4 00:09.6; Highsmith take foul on Bridges; CC; same video and possession fields. | [Charlotte at Miami, March 10, 2025](https://statsdmz.nba.com/pdfs/20250310/20250310_CHAMIA_book.pdf), page 17: Highsmith take fouls at 10.9 seconds (personal foul 2, team foul 4) and 9.6 seconds (personal foul 3, penalty). |

The Atlanta gamebook was downloaded directly from the NBA with HTTP 200 and its PDF text inspected; the Miami gamebook was read through web PDF extraction. These primary timings differ slightly from the cached ESPN play-by-play and from the duplicated L2M fields. Preserve each source's original timing; do not overwrite L2M timestamps using another feed.

**Recommended exception:** preserve both source rows in each pair and flag their assessment identity as ambiguous. The gamebooks show that two actual fouls existed, making automatic deduplication unsafe; they do not prove that the NBA intended these exact two L2M rows to represent the two separate fouls. Allow only these reviewed pairs, with source hashes and row positions, rather than accepting every duplicate globally.

For sensitivity, compare the preserved source-row assessment count with a scenario removing one row from each pair: the latter is two assessments lower. IC/INC counts, errors per game, errors per reviewed period, and games with errors are unchanged because both pairs are CC. Only reviewed-assessment denominators and correct-call counts change. Do not label the sensitivity scenario as corrected ground truth.
