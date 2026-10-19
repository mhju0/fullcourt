import { SeasonDataGuide } from "@/components/season-data-guide";
import { defaultNbaSeason } from "@/lib/nba-season";

export function StudySeasonGuide({
  latestPublishedSeason, body, previousHref, season = defaultNbaSeason(),
}: {
  latestPublishedSeason: string;
  body: string;
  previousHref: string;
  season?: string;
}) {
  if (latestPublishedSeason >= season) return null;
  return <SeasonDataGuide
    season={season}
    body={body}
    previousHref={previousHref}
    previousLabel={`View published results · ${latestPublishedSeason}`}
  />;
}
