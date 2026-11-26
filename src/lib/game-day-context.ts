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

// Historical windows join official NBA All-Star dates to adjacent regular-season slate dates.
// D-159 records the sources, the 1999 cancellation and later schedule exceptions.
const ALL_STAR_BREAKS: Readonly<Partial<Record<string, { start: string; end: string }>>> = {
  "1985-86": { start: "1986-02-07", end: "1986-02-10" },
  "1986-87": { start: "1987-02-06", end: "1987-02-09" },
  "1987-88": { start: "1988-02-05", end: "1988-02-08" },
  "1988-89": { start: "1989-02-10", end: "1989-02-13" },
  "1989-90": { start: "1990-02-09", end: "1990-02-12" },
  "1990-91": { start: "1991-02-08", end: "1991-02-11" },
  "1991-92": { start: "1992-02-07", end: "1992-02-10" },
  "1992-93": { start: "1993-02-19", end: "1993-02-22" },
  "1993-94": { start: "1994-02-11", end: "1994-02-14" },
  "1994-95": { start: "1995-02-10", end: "1995-02-13" },
  "1995-96": { start: "1996-02-09", end: "1996-02-12" },
  "1996-97": { start: "1997-02-07", end: "1997-02-10" },
  "1997-98": { start: "1998-02-06", end: "1998-02-09" },
  "1999-00": { start: "2000-02-11", end: "2000-02-14" },
  "2000-01": { start: "2001-02-09", end: "2001-02-12" },
  "2001-02": { start: "2002-02-08", end: "2002-02-11" },
  "2002-03": { start: "2003-02-07", end: "2003-02-10" },
  "2003-04": { start: "2004-02-13", end: "2004-02-16" },
  "2004-05": { start: "2005-02-18", end: "2005-02-21" },
  "2005-06": { start: "2006-02-17", end: "2006-02-20" },
  "2006-07": { start: "2007-02-16", end: "2007-02-19" },
  "2007-08": { start: "2008-02-15", end: "2008-02-18" },
  "2008-09": { start: "2009-02-13", end: "2009-02-16" },
  "2009-10": { start: "2010-02-12", end: "2010-02-15" },
  "2010-11": { start: "2011-02-18", end: "2011-02-21" },
  "2011-12": { start: "2012-02-24", end: "2012-02-27" },
  "2012-13": { start: "2013-02-15", end: "2013-02-18" },
  "2013-14": { start: "2014-02-14", end: "2014-02-17" },
  "2014-15": { start: "2015-02-13", end: "2015-02-18" },
  "2015-16": { start: "2016-02-12", end: "2016-02-17" },
  "2016-17": { start: "2017-02-17", end: "2017-02-22" },
  "2017-18": { start: "2018-02-16", end: "2018-02-21" },
  "2018-19": { start: "2019-02-15", end: "2019-02-20" },
  "2019-20": { start: "2020-02-14", end: "2020-02-19" },
  "2020-21": { start: "2021-03-05", end: "2021-03-09" },
  "2021-22": { start: "2022-02-18", end: "2022-02-23" },
  "2022-23": { start: "2023-02-17", end: "2023-02-22" },
  "2023-24": { start: "2024-02-16", end: "2024-02-21" },
  "2024-25": { start: "2025-02-14", end: "2025-02-18" },
  "2025-26": { start: "2026-02-13", end: "2026-02-18" },
  "2026-27": { start: "2027-02-19", end: "2027-02-24" },
};

export function allStarBreak(season: string) {
  return ALL_STAR_BREAKS[season];
}

export function gameDayContext(args: {
  season: string;
  date: string;
  gameCount: number;
  today: string;
  inSeason?: boolean;
}): GameDayContext | null {
  if (args.gameCount > 0) return null;
  const { date } = args;
  const leagueBreak = allStarBreak(args.season);
  if (leagueBreak && date >= leagueBreak.start && date <= leagueBreak.end) {
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
