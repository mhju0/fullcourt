import { getTeamBranding } from "@/lib/team-history";
import type { FatigueInfo, GameResponse, TeamInfo } from "@/types";

/**
 * The storyline line (2026-08-28 redesign, C4): one plain-English line naming what the
 * schedule did to this specific game — "Nuggets on a back-to-back and playing at altitude;
 * Lakers playing a 4th game in 6 nights." It renders in both slate densities, and ONLY when a team actually
 * carries a story: silence on an ordinary game is what makes the line mean something,
 * and a line under all twelve games every night would be wallpaper.
 *
 * This is deliberately NOT the evidence sentence in the row expansion. That sentence
 * names the historical CLASS the matchup falls into (win rate vs venue baseline) and is
 * class-level by design; this one is game-level — the schedule facts the fatigue model
 * scored, said in words. The same facts drive the flag chips; the chips compress, this
 * narrates.
 */

/** A team's clauses, in the order they matter. At most this many are said. */
const MAX_CLAUSES_PER_TEAM = 3;

function teamClauses(fatigue: FatigueInfo | null): string[] {
  if (!fatigue) return [];
  const clauses: string[] = [];

  if (fatigue.isBackToBack) clauses.push("on a back-to-back");
  // 4-in-6 subsumes 3-in-4 — saying both counts the same nights twice.
  if (fatigue.is4In6) clauses.push("playing a 4th game in 6 nights");
  else if (fatigue.is3In4) clauses.push("playing a 3rd game in 4 nights");
  if (fatigue.altitudePenalty) clauses.push(fatigue.altitudeArenaLabel ? "playing at altitude" : "after an altitude trip");
  if (fatigue.roadTripConsecutiveAway >= 4)
    clauses.push(`playing a ${ordinal(fatigue.roadTripConsecutiveAway)} straight road game`);
  if (fatigue.isOvertimePenalty) clauses.push("coming off overtime");
  if (fatigue.hasTimeZoneDisplacement) clauses.push("still adjusting after traveling 2+ time zones");

  return clauses.slice(0, MAX_CLAUSES_PER_TEAM);
}

function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return clauses[0];
  return `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
}

/**
 * The nickname the team played under that season ("Bucks", "SuperSonics"). The headline
 * grammar has no verb, so a plural nickname reads where the city abbreviation did not.
 */
function teamName(team: TeamInfo, season: string): string {
  return getTeamBranding(team.abbreviation, season, { name: team.name, city: team.city }).name;
}

export function buildGameStoryline(
  game: Pick<GameResponse, "season" | "homeTeam" | "awayTeam" | "homeFatigue" | "awayFatigue" | "seasonOpeners">
): string | null {
  const away = teamClauses(game.awayFatigue);
  const home = teamClauses(game.homeFatigue);
  const awayName = teamName(game.awayTeam, game.season);
  const homeName = teamName(game.homeTeam, game.season);

  const parts: string[] = [];
  if (game.seasonOpeners?.away && game.seasonOpeners?.home) {
    parts.push("Season opener for both teams. No earlier regular-season game this season; preseason is not included");
  } else if (game.seasonOpeners?.away || game.seasonOpeners?.home) {
    const team = game.seasonOpeners.away ? awayName : homeName;
    parts.push(`Season opener for the ${team}. No earlier regular-season game this season; preseason is not included`);
  }
  if (game.seasonOpeners?.away && !game.awayFatigue) parts.push(`No fatigue data for the ${awayName}`);
  if (game.seasonOpeners?.home && !game.homeFatigue) parts.push(`No fatigue data for the ${homeName}`);
  if (away.length > 0) parts.push(`${awayName} ${joinClauses(away)}`);
  if (home.length > 0) parts.push(`${homeName} ${joinClauses(home)}`);

  if (parts.length === 0) return null;
  return `${parts.join("; ")}.`;
}
