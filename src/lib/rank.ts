/**
 * Ranks for the D1 rank riders (ADR 0010): a value's standing within the population the
 * reader is actually looking at, computed from the rows the table already holds — never a
 * second query, never a league-wide constant a filter would silently invalidate.
 *
 * Competition ranking ("1224"): ties share a rank, and the next distinct value skips the
 * shared slots. Chosen over dense ranking because "two teams tied at 3rd, next is 5th" is how
 * standings are read everywhere else in basketball; a reader should not meet a private
 * convention inside a rank badge.
 */

/**
 * Rank each value of `rows` under `get`, best first. `dir: "desc"` means the largest value is
 * 1st (a schedule-tax count, an eFG%); `"asc"` means the smallest is.
 *
 * Returns ranks positionally, aligned with `rows`. Rows whose value is `null` get `null` —
 * an unmeasured arm has no standing, and 30th-of-30 would be a claim about it.
 */
export function competitionRanks<Row>(
  rows: readonly Row[],
  get: (row: Row) => number | null,
  dir: "desc" | "asc" = "desc"
): (number | null)[] {
  const measured = rows
    .map((row) => get(row))
    .filter((v): v is number => v !== null);

  return rows.map((row) => {
    const value = get(row);
    if (value === null) return null;
    let better = 0;
    for (const other of measured) {
      if (dir === "desc" ? other > value : other < value) better++;
    }
    return better + 1;
  });
}

/** 1 → "1ST", 2 → "2ND", 3 → "3RD", 4 → "4TH", 11–13 → "11TH"…, 21 → "21ST". */
export function ordinal(rank: number): string {
  const rem100 = rank % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${rank}TH`;
  switch (rank % 10) {
    case 1:
      return `${rank}ST`;
    case 2:
      return `${rank}ND`;
    case 3:
      return `${rank}RD`;
    default:
      return `${rank}TH`;
  }
}
