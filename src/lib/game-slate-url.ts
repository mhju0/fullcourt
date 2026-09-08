import { browsableSeasons, seasonLabelForDateKey } from "@/lib/nba-season";

export function readSlateUrl(search: string, fallbackSeason: string, todayKey: string) {
  const params = new URLSearchParams(search);
  const rawDate = params.get("date");
  const parsed = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? new Date(`${rawDate}T12:00:00Z`) : null;
  const date = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === rawDate
    ? rawDate : null;
  const seasons = browsableSeasons(todayKey);
  const requestedSeason = params.get("season");
  // An explicit season preserves exceptional calendars such as the 2020 bubble.
  const inferredSeason = date ? seasonLabelForDateKey(date) : fallbackSeason;
  const season = requestedSeason && seasons.includes(requestedSeason)
    ? requestedSeason : seasons.includes(inferredSeason) ? inferredSeason : fallbackSeason;
  const startYear = Number(season.slice(0, 4));
  const dateYear = date ? Number(date.slice(0, 4)) : null;
  return { season, date: dateYear === startYear || dateYear === startYear + 1 ? date : null };
}

export function slateUrl(href: string, season: string, date: string | null): URL {
  const url = new URL(href);
  if (url.searchParams.has("date") && url.searchParams.get("date") !== date) {
    url.searchParams.delete("game");
    if (url.hash.startsWith("#game-")) url.hash = "";
  }
  url.searchParams.set("season", season);
  if (date) url.searchParams.set("date", date);
  else url.searchParams.delete("date");
  return url;
}
