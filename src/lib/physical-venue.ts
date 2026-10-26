import { BUBBLE_CAMPUS, hasBubbleBase } from "./bubble-venue";
import { lookupFixtureVenueCorrection } from "./game-input-corrections";
import { neutralVenueCoordinates, type NeutralVenue } from "./neutral-venues";
import { eraCoordinates, requiresFixtureVenueCorrection } from "./team-era-coordinates";

export interface VenueTeam {
  abbreviation: string;
  latitude: number;
  longitude: number;
  altitude: boolean;
}

export interface PhysicalVenueInput {
  date: string;
  homeTeam: VenueTeam;
  awayTeam: VenueTeam;
  neutralSite?: boolean;
  neutralVenueCity?: string | null;
}

/** Physical coordinates and designated home court are independent fixture facts. */
export function resolvePhysicalVenue(input: PhysicalVenueInput) {
  const { date, homeTeam, awayTeam } = input;
  const homeBase = eraCoordinates(homeTeam.abbreviation, date, homeTeam.latitude, homeTeam.longitude);
  const awayBase = eraCoordinates(awayTeam.abbreviation, date, awayTeam.latitude, awayTeam.longitude);
  const correction = lookupFixtureVenueCorrection({
    date,
    homeAbbr: homeTeam.abbreviation,
    awayAbbr: awayTeam.abbreviation,
  });
  if (correction) {
    return {
      venue: {
        latitude: correction.latitude,
        longitude: correction.longitude,
        altitude: correction.altitude,
      } satisfies NeutralVenue,
      homeBase,
      awayBase,
      neutralSite: correction.neutral,
      homeCourt: !correction.neutral,
      venueSource: "fixture-correction" as const,
    };
  }

  if (hasBubbleBase(homeTeam.abbreviation, date) && hasBubbleBase(awayTeam.abbreviation, date)) {
    return {
      venue: BUBBLE_CAMPUS,
      homeBase,
      awayBase,
      neutralSite: true,
      homeCourt: false,
      venueSource: "bubble-campus" as const,
    };
  }

  if (requiresFixtureVenueCorrection(homeTeam.abbreviation, date)) {
    throw new Error("Mixed-arena home game is missing its physical venue correction");
  }

  const neutral = input.neutralSite === true;
  const neutralVenue = neutral ? neutralVenueCoordinates(input.neutralVenueCity, date) : null;
  return {
    venue: neutralVenue ?? { ...homeBase, altitude: homeTeam.altitude },
    homeBase,
    awayBase,
    neutralSite: neutral,
    homeCourt: !neutral,
    // Unknown cities preserve the neutral classification; candidate verification rejects this fallback.
    venueSource: neutral
      ? neutralVenue ? "neutral-city" as const : "unknown-neutral-fallback" as const
      : "dated-home-base" as const,
  };
}
