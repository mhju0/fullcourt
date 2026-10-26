/** Explicit league-calendar annotations; game responses always take precedence. */
export interface GameDayContext {
  message: string;
  count: 0 | "TBD" | "—";
}

// Sources and exact coverage: docs/research/2026-10-26-games-empty-dates.md
// 2026-27 NBA release, NBA Cup 101, and NBA key dates:
// https://pr.nba.com/2026-27-nba-regular-season-schedule
// https://www.nba.com/news/nba-cup-101
// https://www.nba.com/news/key-dates
const KNOWN_EMPTY_DAYS: Readonly<Record<string, string>> = {
  "2026-11-03": "Election Day. No games scheduled.",
  "2026-11-26": "Thanksgiving. No games scheduled.",
  "2026-12-11": "NBA Cup Championship. No regular-season games scheduled.",
  "2026-12-24": "Christmas Eve. No games scheduled.",
  "2027-04-10": "League off day before the regular-season finale.",
};

export function gameDayContext(args: {
  season: string;
  date: string;
  gameCount: number;
  today: string;
  inSeason?: boolean;
}): GameDayContext | null {
  if (args.gameCount > 0) return null;
  const { date } = args;
  if ((args.season === "2026-27" && date >= "2027-02-19" && date <= "2027-02-24")
    || (args.season === "2025-26" && date >= "2026-02-13" && date <= "2026-02-18")) {
    return { message: "All-Star break.", count: 0 };
  }
  if (args.season === "2026-27" && date >= "2026-12-04" && date <= "2026-12-10") {
    if (date <= args.today) return { message: "No regular-season games listed for this day.", count: "—" };
    return args.today <= "2026-11-27"
      ? { message: "NBA Cup schedule pending. Matchups to be announced.", count: "TBD" }
      : { message: "NBA Cup schedule not available.", count: "TBD" };
  }
  const message = args.season === "2026-27" ? KNOWN_EMPTY_DAYS[date] : undefined;
  if (message) return { message, count: 0 };
  if (args.inSeason === false) return null;
  // Holiday labels identify the calendar date only after a successful empty response.
  if (date.slice(5) === "12-24") return { message: "Christmas Eve. No games scheduled.", count: 0 };
  const day = new Date(`${date}T12:00:00Z`);
  if (day.getUTCMonth() === 10 && day.getUTCDay() === 4 && day.getUTCDate() >= 22 && day.getUTCDate() <= 28) {
    return { message: "Thanksgiving. No games scheduled.", count: 0 };
  }
  return null;
}
