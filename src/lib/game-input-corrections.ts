import inputs from "@/data/game-input-corrections.json";
import venues from "@/data/fixture-venue-corrections.json";

export interface FixtureIdentity { date: string; homeAbbr: string; awayAbbr: string }
export interface FixtureVenueCorrection extends FixtureIdentity {
  arena: string; city: string; latitude: number; longitude: number; altitude: boolean;
  neutral: boolean; sourceUrls: string[]; coverage: string;
}
export const fixtureKey = ({ date, homeAbbr, awayAbbr }: FixtureIdentity): string =>
  `${date}:${homeAbbr}:${awayAbbr}`;
function index<T extends FixtureIdentity>(fixtures: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const fixture of fixtures) {
    const key = fixtureKey(fixture);
    if (result.has(key)) throw new Error(`Duplicate accepted fixture identity: ${key}`);
    result.set(key, fixture);
  }
  return result;
}
const inputIndex = index(inputs.fixtures);
const venueIndex = index(venues.fixtures as FixtureVenueCorrection[]);
export const lookupFixtureVenueCorrection = (identity: FixtureIdentity): FixtureVenueCorrection | undefined =>
  venueIndex.get(fixtureKey(identity));
export const acceptedAddedFixtures = inputs.addedFixtures;
const additionIndex = index(acceptedAddedFixtures);
export const lookupGameInputCorrection = (identity: FixtureIdentity) => inputIndex.get(fixtureKey(identity));
export const lookupAcceptedAddedFixture = (identity: FixtureIdentity) => additionIndex.get(fixtureKey(identity));
export function espnScheduleGameType(notes?: readonly { headline?: string }[]): "regular" | "cup_final" {
  return notes?.some(note=>note.headline==="NBA Cup Championship"||note.headline==="NBA In-Season Tournament Championship") ? "cup_final" : "regular";
}
export function canonicalGameType(externalId: string): string | null {
  return ({ "002": "regular", "004": "playoffs", "005": "play_in", "006": "cup_final" } as Record<string,string>)[externalId.slice(0,3)] ?? null;
}
export function applyGameInputCorrection<T extends FixtureIdentity>(normalized: T): T {
  const addition = lookupAcceptedAddedFixture(normalized);
  if (addition) return { ...normalized, gameType:addition.gameType, overtimePeriods:addition.overtimePeriods,
    tipOffUtc:addition.tipOffUtc,neutralSite:addition.neutralSite,neutralVenueCity:addition.neutralVenueCity };
  const accepted = lookupGameInputCorrection(normalized);
  if (!accepted) return normalized;
  const result = { ...normalized };
  for (const [field, values] of Object.entries(accepted.fields))
    Object.assign(result, { [field]: values!.after });
  return result;
}
