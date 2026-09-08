# Independent validation: 2023–24 and 2024–25 L2M

Read-only count audit of snapshots `2023-24/20260906T145128311475Z` and `2024-25/20260906T145127099997Z` under `ml/data/l2m-research/`. Independent reductions loaded raw JSON directly without importing the parent analyzer. No raw reports, original referee corpus or parent code changed.

## Counts

| Season | Reports | CC | CNC | IC | INC | Ungraded | IC+INC | Reports without IC/INC | Represented game-periods |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2023–24 | 394 | 1,895 | 5,496 | 73 | 398 | 10 | 471 | 127 | 452 |
| 2024–25, raw rows retained | 430 | 2,074 | 4,914 | 68 | 265 | 2 | 333 | 200 | 487 |

2024–25 raw CC count is 2,074. Two pairs of exactly matching whole-row JSON assessments occur at `0022400587` row 15 and `0022400931` row 14 (zero-based repeated-row indices). **Retain the raw rows under the parent's reviewed exceptions.** The separate season-context audit verified two physical fouls in each official gamebook, so identical serialized assessments are not sufficient evidence that one event should be deleted. This independent count pass establishes the raw count, not the physical identity of those pairs. Raw assessment total is **7,323**. Hypothetically removing the two repeated CC entries would yield CC 2,072 and 7,321 assessments; errors and game-period exposure remain unchanged. That is a sensitivity check, not a correction. No exact duplicates were found for 2023–24; its assessment total is 7,872.

By phase, IC+INC counts: 2023–24 regular season 429, playoffs 41, play-in 1; 2024–25 regular season 305, playoffs 23, play-in 5. Independently found 22 and 25 beneficiary-summary mismatches respectively, with no populated `teamIdInFavor` on any error row in either season. Do not infer team beneficiaries from these empty fields.

## Every missing assignment resolved

Corrections with exact metadata expectations, source paths and SHA256:

- [2023–24 correction JSON](2026-09-06-l2m-2023-24-assignment-corrections.json): four games.
- [2024–25 correction JSON](2026-09-06-l2m-2024-25-assignment-corrections.json): two games.

| NBA game | ESPN event | Working officials | Primary evidence |
|---|---|---|---|
| 0022300085 | 401584713 | David Guthrie; Kevin Cutler; Jason Goldenberg | [NBA gamebook, page 1](https://statsdmz.nba.com/pdfs/20231027/20231027_LACUTA_book.pdf) |
| 0022300478 | 401585106 | Sean Wright; Ashley Moyer-Gleich; J.T. Orr | [NBA gamebook, page 1](https://statsdmz.nba.com/pdfs/20240104/20240104_DENGSW_book.pdf) |
| 0052300101 | 401654659 | Tony Brothers; Bill Kennedy; Mitchell Ervin | [NBA gamebook, page 1](https://statsdmz.nba.com/pdfs/20240417/20240417_MIAPHI_book.pdf) |
| 0052300121 | 401654655 | Eric Dalen; Curtis Blair; Scott Foster | [ESPN summary](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401654655) |
| 0052400121 | 401766459 | Josh Tiven; Bill Kennedy; Nick Buchert | [NBA gamebook, page 1](https://statsdmz.nba.com/pdfs/20250415/20250415_MEMGSW_book.pdf) |
| 0052400201 | 401766462 | James Capers; Ed Malloy; Mitchell Ervin | [ESPN summary](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401766462) |

Fresh play-in summaries' teams, dates and scores match the L2M reports; two missing regular-season trios come from official gamebooks which confirm dates, teams and final scores. Evidence is isolated under `ml/data/l2m-research/assignment-validation-earlier-20260906/`. Four downloaded NBA PDFs were parsed independently for the page-one official names; each matches its correction exactly.

**ESPN `order: 4` is not universally a standby.** Two play-in summaries contain only three names with nonconsecutive orders 1,3,4. NBA gamebooks confirm all three worked: Nick Buchert for 0052400121 and Mitchell Ervin for 0052300101. These exceptions use the gamebook, not an `order <= 3` filter. The 0052300121 summary has four names with consecutive orders; its three active names are orders 1–3 and the fourth is excluded. No general reclassification of existing crews is performed here.

These counts describe NBA-selected close-game review windows. No-IC/INC reports are not proof of perfect officiating, ungraded assessments are not automatically correct, and assignment exposure does not identify which official made an error. No inferential tests were performed.
