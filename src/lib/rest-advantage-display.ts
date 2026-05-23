import type { RestAdvantage } from "@/types";

export type RestAdvantageDisplay =
  | {
      kind: "team";
      teamAbbreviation: string;
      value: string;
      text: string;
    }
  | {
      kind: "neutral";
      text: string;
    };

export function formatRestAdvantageValue(value: number): string {
  return Math.abs(value).toFixed(1);
}

export function formatRestAdvantageDisplay(
  restAdvantage: RestAdvantage | null,
  homeAbbreviation: string,
  awayAbbreviation: string
): RestAdvantageDisplay {
  if (!restAdvantage || restAdvantage.advantageTeam === "neutral") {
    return { kind: "neutral", text: "NEUTRAL" };
  }

  const teamAbbreviation =
    restAdvantage.advantageTeam === "home" ? homeAbbreviation : awayAbbreviation;
  const value = formatRestAdvantageValue(restAdvantage.differential);

  return {
    kind: "team",
    teamAbbreviation,
    value,
    text: `${teamAbbreviation} ${value}`,
  };
}
