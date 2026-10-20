export interface ArenaLocation {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  coordinateMethod: string;
  coordinateSourceUrls: string[];
}

export interface FranchiseArenaEra {
  abbreviation: string;
  from: string;
  before?: string;
  arenaId: string;
  firstGameDate: string;
  lastGameDate: string;
  sourceUrls: string[];
}

export interface ArenaHistory {
  version: number;
  arenas: ArenaLocation[];
  eras: FranchiseArenaEra[];
  modeledBaseOverrides?: ModeledBaseOverride[];
}

export interface ModeledBaseOverride {
  abbreviation: string;
  from: string;
  before: string;
  latitude: number;
  longitude: number;
  reason: string;
  sourceUrls: string[];
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function citations(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((value) => {
    if (typeof value !== "string" || /\s/.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.length > 0;
    } catch {
      return false;
    }
  });
}

/** One physical building has one point, including buildings shared by two teams. */
export function createArenaHistory(history: ArenaHistory) {
  if (history.version !== 1 || !Array.isArray(history.arenas) || !Array.isArray(history.eras)) {
    throw new Error("Unsupported arena history");
  }
  const arenas = new Map<string, ArenaLocation>();
  for (const arena of history.arenas) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(arena.id) || arenas.has(arena.id)) {
      throw new Error("Duplicate or invalid physical arena ID");
    }
    if (!arena.name || !arena.city || !arena.coordinateMethod || !citations(arena.coordinateSourceUrls)
      || !Number.isFinite(arena.latitude) || Math.abs(arena.latitude) > 90
      || !Number.isFinite(arena.longitude) || Math.abs(arena.longitude) > 180) {
      throw new Error(`Invalid location or coordinate evidence for ${arena.id}`);
    }
    arenas.set(arena.id, arena);
  }
  const byFranchise = new Map<string, FranchiseArenaEra[]>();
  for (const era of history.eras) {
    if (!/^[A-Z]{3}$/.test(era.abbreviation) || !arenas.has(era.arenaId)
      || !validDate(era.from) || !validDate(era.firstGameDate) || !validDate(era.lastGameDate)
      || (era.before !== undefined && !validDate(era.before)) || !citations(era.sourceUrls)
      || era.firstGameDate < era.from || era.lastGameDate < era.firstGameDate
      || (era.before !== undefined && (era.from >= era.before || era.lastGameDate >= era.before))) {
      throw new Error(`Invalid dated arena evidence for ${era.abbreviation}`);
    }
    const eras = byFranchise.get(era.abbreviation) ?? [];
    eras.push(era);
    byFranchise.set(era.abbreviation, eras);
  }
  const overrides = history.modeledBaseOverrides ?? [];
  for (const entry of overrides) {
    if (!/^[A-Z]{3}$/.test(entry.abbreviation) || !validDate(entry.from)
      || !validDate(entry.before) || entry.from >= entry.before || !entry.reason
      || !citations(entry.sourceUrls) || !Number.isFinite(entry.latitude)
      || Math.abs(entry.latitude) > 90 || !Number.isFinite(entry.longitude)
      || Math.abs(entry.longitude) > 180 || !byFranchise.has(entry.abbreviation)) {
      throw new Error("Invalid bounded modeled-base evidence");
    }
  }
  for (const [abbreviation, physicalEras] of byFranchise) {
    const eras = [...physicalEras, ...overrides.filter((entry) => entry.abbreviation === abbreviation)];
    eras.sort((a, b) => a.from.localeCompare(b.from));
    for (let index = 1; index < eras.length; index++) {
      if (eras[index - 1].before !== eras[index].from) {
        throw new Error(`Arena history overlaps or has a gap for ${abbreviation}`);
      }
    }
  }
  const overrideFor = (abbreviation: string, date: string) => overrides.find((entry) =>
    entry.abbreviation === abbreviation && entry.from <= date && date < entry.before);
  const arenaFor = (abbreviation: string, date: string): ArenaLocation | null => {
    if (!validDate(date)) throw new Error("Arena lookup requires an Eastern calendar date");
    const era = byFranchise.get(abbreviation)?.find((entry) => entry.from <= date
      && (entry.before === undefined || date < entry.before));
    return era ? arenas.get(era.arenaId)! : null;
  };
  return {
    arenaFor,
    baseFor(abbreviation: string, date: string): { latitude: number; longitude: number } | null {
      const arena = arenaFor(abbreviation, date);
      return overrideFor(abbreviation, date) ?? arena;
    },
    requiresFixtureCorrection: (abbreviation: string, date: string): boolean =>
      Boolean(overrideFor(abbreviation, date)),
    abbreviations: [...byFranchise.keys()].sort(),
  };
}
