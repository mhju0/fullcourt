import { z } from "zod";
import { browsableSeasonParam, CACHE, jsonRoute } from "@/lib/api-route";
import { NBA_SEASONS } from "@/lib/nba-season";
import { getSeasonReport } from "@/lib/season-report-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

/** Stated rather than inherited: Hobby defaults to 10s and caps at 60s. Worst observed cold
 *  read was 4.6s, so this is headroom for a slow refresh, not a budget to grow into. */
export const maxDuration = 30;

// The browsable list, so a released-but-unplayed season can be asked for. It used to be the
// stricter `seasonParam` on the grounds that "this page reports games that were played" — but
// that is only true of half the page. Schedule value, travel, back-to-backs and 3-in-4s are
// properties of the calendar and are decided the day it is published; `buildSeasonReport`
// reports those on a `"schedule"` basis and leaves every result-derived figure empty rather
// than zero. Defaults to the season whose games are ahead, the same one the board opens on.
//
// Evaluated per request, not at module load: the upcoming season leaves the browsable list on
// October 1 and a warm lambda would otherwise keep offering it.
//
// The DEFAULT stays the newest season with data, which is deliberately not the same widening.
// Accepting an upcoming season is what lets a reader ask for it; defaulting to it would open
// the page on a report whose whole results half is empty, in preference to a complete one.
// From October the two coincide anyway — NBA_SEASONS is derived from the ET date.
const seasonSchema = browsableSeasonParam.default(
  () => NBA_SEASONS[NBA_SEASONS.length - 1]
);

// `inSeason`: this defaults to the newest season with data, and reports progress through it —
// games played, record so far — so an hour of edge drift would be visible on the page.
export const GET = jsonRoute(
  "api/season-report",
  z.object({ season: seasonSchema }),
  ({ season }) => getSeasonReport(season),
  CACHE.inSeason
);
