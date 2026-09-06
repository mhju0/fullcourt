/** The measured figure, order and meaning of a Schedule Edge ranking belong together. */
type RankableTeam = {
  teamId: number;
  netEdgeGames: number | null;
  netRestEdge: number;
};

type RankingRow<T> =
  | { team: T; value: number; rank: number }
  | { team: T; value: null; rank: null };

/**
 * Use net rest edge only when the entire season lacks fatigue measurements. Once any
 * team is measured, unmeasured teams follow the ranking without a value or ordinal.
 * A measured zero is ranked normally; ties retain the existing team-id order.
 * Other figures, especially opener-inclusive schedule value, do not decide admission.
 */
export function rankScheduleTeams<T extends RankableTeam>(teams: readonly T[]) {
  const basis = teams.some((team) => team.netEdgeGames !== null) ? "fatigue" : "rest";
  const ordered = teams.map((team) => ({
    team,
    value: basis === "fatigue" ? team.netEdgeGames : team.netRestEdge,
  })).sort((a, b) => {
    if (a.value === null) return b.value === null ? a.team.teamId - b.team.teamId : 1;
    if (b.value === null) return -1;
    return b.value - a.value || a.team.teamId - b.team.teamId;
  });
  const rows: RankingRow<T>[] = ordered.map(({ team, value }, index) =>
    value === null ? { team, value, rank: null } : { team, value, rank: index + 1 }
  );
  const ranked = rows.filter((row): row is Extract<RankingRow<T>, { value: number }> => row.value !== null);
  const most = ranked[0];
  const least = ranked[ranked.length - 1];

  return {
    basis,
    unit: basis === "fatigue" ? "games" : "rest days",
    rows,
    most,
    least,
    spread: most && least ? most.value - least.value : null,
  };
}
