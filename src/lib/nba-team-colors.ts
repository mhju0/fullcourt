/**
 * Official-ish NBA team colors, keyed by the same abbreviations the DB stores
 * (mirrors the keys in `nba-team-ids.ts`, historical aliases included). Used by
 * the Broadcast matchup UI to theme each game with its two teams' colors.
 *
 * `primary` drives the color band + logo chip; `secondary` is the complementary
 * accent. These are brand chrome only — they never touch the fatigue/rest-
 * advantage data semantics (red = more fatigued, blue = more rested), which
 * stay on the `--term-red` / `--term-blue` tokens.
 */
export type TeamColors = { primary: string; secondary: string };

/** Neutral steel for any team not in the map (keeps the UI intact for odd rows). */
export const NEUTRAL_TEAM_COLORS: TeamColors = { primary: "#3A4048", secondary: "#8A929C" };

export const NBA_TEAM_COLORS: Record<string, TeamColors> = {
  ATL: { primary: "#E03A3E", secondary: "#C1D32F" },
  BOS: { primary: "#007A33", secondary: "#BA9653" },
  BKN: { primary: "#0A0A0A", secondary: "#FFFFFF" },
  CHA: { primary: "#1D1160", secondary: "#00788C" },
  CHI: { primary: "#CE1141", secondary: "#000000" },
  CLE: { primary: "#860038", secondary: "#FDBB30" },
  DAL: { primary: "#00538C", secondary: "#002B5E" },
  DEN: { primary: "#0E2240", secondary: "#FEC524" },
  DET: { primary: "#C8102E", secondary: "#1D42BA" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C" },
  HOU: { primary: "#CE1141", secondary: "#C4CED4" },
  IND: { primary: "#002D62", secondary: "#FDBB30" },
  LAC: { primary: "#C8102E", secondary: "#1D428A" },
  LAL: { primary: "#552583", secondary: "#FDB927" },
  MEM: { primary: "#5D76A9", secondary: "#12173F" },
  MIA: { primary: "#98002E", secondary: "#F9A01B" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6" },
  MIN: { primary: "#0C2340", secondary: "#78BE20" },
  NOP: { primary: "#0C2340", secondary: "#C8102E" },
  NYK: { primary: "#006BB6", secondary: "#F58426" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24" },
  ORL: { primary: "#0077C0", secondary: "#C4CED4" },
  PHI: { primary: "#006BB6", secondary: "#ED174C" },
  PHX: { primary: "#1D1160", secondary: "#E56020" },
  POR: { primary: "#E03A3E", secondary: "#B6BFBF" },
  SAC: { primary: "#5A2D81", secondary: "#63727A" },
  SAS: { primary: "#C4CED4", secondary: "#000000" },
  TOR: { primary: "#CE1141", secondary: "#B4975A" },
  UTA: { primary: "#002B5C", secondary: "#F9A01B" },
  WAS: { primary: "#002B5C", secondary: "#E31837" },
  // Historical franchises (share IDs with current teams in nba-team-ids.ts)
  NJN: { primary: "#002A60", secondary: "#CD1041" },
  VAN: { primary: "#00838A", secondary: "#BC953B" },
  NOH: { primary: "#002B5C", secondary: "#00778B" },
  NOK: { primary: "#002B5C", secondary: "#00778B" },
  SEA: { primary: "#00653A", secondary: "#FFC200" },
  WSB: { primary: "#002B5C", secondary: "#E31837" },
};

export function getTeamColors(abbreviation: string | null | undefined): TeamColors {
  if (!abbreviation) return NEUTRAL_TEAM_COLORS;
  return NBA_TEAM_COLORS[abbreviation.toUpperCase()] ?? NEUTRAL_TEAM_COLORS;
}

/**
 * Readable text color for a chip filled with `hexBg`. On the light theme a few
 * teams have near-white primaries (SAS silver, etc.), where white chip text
 * vanishes — pick black or white by the fill's perceived luminance (W3C sRGB).
 */
export function readableTextOn(hexBg: string): "#FFFFFF" | "#111318" {
  const h = hexBg.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#111318" : "#FFFFFF";
}
