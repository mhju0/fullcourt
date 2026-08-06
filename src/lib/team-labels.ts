/**
 * What a team is called on a published table, including when the directory has no row
 * for it.
 *
 * Two modules built this lookup independently — the Season Report and Schedule Edge —
 * and each chose the same two fallbacks by hand: an em-dash for a missing abbreviation
 * and `Team {id}` for a missing name. Those are published strings, and they had no owner,
 * so nothing kept a third reader from inventing a third pair.
 *
 * A team can be missing from the directory: `teams` is seeded from the current league,
 * while games reach back to 1985-86, so a franchise that no longer exists under that id
 * has rows in `games` and none in `teams`. The fallbacks exist for exactly that, which is
 * why they are readable rather than empty — a blank cell reads as a rendering failure.
 * `team-history.ts` is the module that knows about relocations and renames; this one only
 * answers what to print when the lookup misses.
 */

export type TeamLabel = {
  abbreviation: string;
  name: string;
};

/** Shown for a team the directory does not have. */
const UNKNOWN_ABBREVIATION = "—";

export type TeamDirectoryRow = {
  id: number;
  abbreviation: string;
  name: string;
};

/**
 * Builds the lookup once for a directory, then labels by id.
 *
 * Returns a function rather than a Map so the fallbacks are applied by this module on
 * every call — a Map would hand callers `undefined` and put them back in the business of
 * choosing what to print.
 */
export function teamLabeller(
  directory: readonly TeamDirectoryRow[]
): (teamId: number) => TeamLabel {
  const byId = new Map(directory.map((t) => [t.id, t]));

  return (teamId) => {
    const team = byId.get(teamId);
    return {
      abbreviation: team?.abbreviation ?? UNKNOWN_ABBREVIATION,
      name: team?.name ?? `Team ${teamId}`,
    };
  };
}
