/**
 * Player rest-split database — decoding and row-building for /shooting.
 *
 * The payload is written by `scripts/export_player_rest.py` as columnar arrays.
 * Everything here is pure so the table logic can be tested without a browser.
 *
 * ONE SIGN RULE, applied nowhere else: a rest effect is always the rested arm
 * minus the no-rest arm. Positive means he shoots better with more rest. The
 * export already stores career deltas in that orientation, so no view ever
 * flips a sign and no two views can disagree.
 */

/** Column offsets into a packed season row. Keep in step with the export script. */
export const S = {
  PLAYER: 0,
  YEAR: 1,
  TEAM: 2,
  AGE: 3,
  GAMES: 4,
  FGA: 5,
  EFG: 6,
  NO_REST_FGA: 7,
  NO_REST_EFG: 8,
  RESTED_FGA: 9,
  RESTED_EFG: 10,
  EFG_NUMERATOR: 11,
  NO_REST_NUMERATOR: 12,
  RESTED_NUMERATOR: 13,
  EFG_SECOND_MOMENT: 14,
  NO_REST_SECOND_MOMENT: 15,
  RESTED_SECOND_MOMENT: 16,
} as const

export interface PlayerRestPayload {
  generated: string
  refresh?: { checkedAt: string | null; status: string; publishedAt: string | null }
  playerIds?: string[]
  seasonOnlyPlayers?: number[]
  publication?: { through: string | null; expectedGames: number; observedGames: number; missingGameIds: string[]; season?: string; source?: string; generatedAt?: string; emptyArms?: number; historyGames?: number; fixtureIds?: string[]; fixtureIdentitySha256?: string }
  publications?: Record<string, NonNullable<PlayerRestPayload["publication"]>>
  names: string[]
  teams: string[]
  /** Original 11 columns, optionally followed by whole/no-rest/rested integer 2*FGM+3PM numerators. */
  seasons: number[][]
  /** [player, careerDelta, careerSe, careerShrunk] — only players clearing 150 attempts per arm */
  shrunk: number[][]
  /** "G" | "F" | "C" | "" per player, parallel to `names`. Absent in payloads exported before the filters. */
  pos?: string[]
}

export interface CareerEstimate {
  delta: number
  se: number
  shrunk: number
}

export interface PlayerRestIndex {
  generated: string
  refresh?: PlayerRestPayload["refresh"]
  publication?: PlayerRestPayload["publication"]
  publications?: PlayerRestPayload["publications"]
  names: string[]
  teams: string[]
  pos: string[]
  seasonOnlyPlayers: Set<number>
  /** Search keys with diacritics stripped, parallel to `names`. */
  searchKeys: string[]
  /** Every season a player appeared in, oldest first. */
  seasonsByPlayer: Map<number, number[][]>
  career: Map<number, CareerEstimate>
  /** Season start years, newest first. */
  years: number[]
}

export interface BrowseRow {
  player: number
  name: string
  /** Team tricode in a season view; the career span in the career view. */
  context: string
  age: string
  games: number
  fga: number
  efg: number
  noRestFga: number
  noRestEfg: number | null
  restedFga: number
  restedEfg: number | null
  effect: number | null
  se: number | null
  /** True when the error bar swamps the difference — shown, but not to be trusted. */
  underEvidenced: boolean
}

export interface CareerTotals {
  games: number
  fga: number
  efg: number | null
  noRestFga: number
  noRestEfg: number | null
  restedFga: number
  restedEfg: number | null
  effect: number | null
  se: number | null
  exactNumerators: boolean
  ageLo: number | null
  ageHi: number | null
}

export type SortKey =
  | "name" | "age" | "games" | "fga" | "efg" | "noRestFga" | "noRestEfg" | "restedFga" | "restedEfg" | "effect"

/** "2025" → "2025-26", the season format used everywhere else on the site. */
export function seasonLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

/**
 * Search key for a name. Around two dozen players carry diacritics and they
 * include Jokić, Dončić, Porziņģis and Vučević, so a raw substring match would
 * fail on some of the most-searched names in the league.
 */
export function searchKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** The one sign rule. Null when either arm is empty. */
export function restEffect(noRestEfg: number | null, restedEfg: number | null): number | null {
  if (noRestEfg === null || restedEfg === null) return null
  return restedEfg - noRestEfg
}

/** Sample-mean variance for attempts worth 0, 1 or 1.5 eFG makes.
 * Numerators are 2*FGM+FG3M and second moments are 4*FGM+5*FG3M.
 * A single attempt cannot estimate sampling variation; legacy payloads lack moments.
 */
export function effectSe(
  noRestFga: number, restedFga: number,
  noRestNumerator?: number, restedNumerator?: number,
  noRestSecondMoment?: number, restedSecondMoment?: number,
): number | null {
  const variance = (n: number, numerator?: number, second?: number) => {
    if (n < 2 || numerator === undefined || second === undefined ||
      !Number.isFinite(numerator) || !Number.isFinite(second)) return null
    const centered = second / 4 - numerator * numerator / (4 * n)
    return Math.max(0, centered) / (n * (n - 1))
  }
  const a = variance(noRestFga, noRestNumerator, noRestSecondMoment)
  const b = variance(restedFga, restedNumerator, restedSecondMoment)
  return a === null || b === null ? null : 100 * Math.sqrt(a + b)
}

export function defaultPlayerVolume(year: number | "career", currentYear: number, explicit: string | null): number {
  const fallback = year === currentYear ? 0 : 300
  if (explicit === null) return fallback
  const value = Number(explicit)
  return [0, 300, 600, 900].includes(value) ? value : fallback
}

export function indexPayload(payload: PlayerRestPayload): PlayerRestIndex {
  const seasonsByPlayer = new Map<number, number[][]>()
  for (const row of payload.seasons) {
    const list = seasonsByPlayer.get(row[S.PLAYER])
    if (list) list.push(row)
    else seasonsByPlayer.set(row[S.PLAYER], [row])
  }
  for (const list of seasonsByPlayer.values()) list.sort((a, b) => a[S.YEAR] - b[S.YEAR])

  const career = new Map<number, CareerEstimate>()
  for (const [player, delta, se, shrunk] of payload.shrunk) {
    career.set(player, { delta, se, shrunk })
  }

  const years = [...new Set(payload.seasons.map((r) => r[S.YEAR]))].sort((a, b) => b - a)

  return {
    generated: payload.generated,
    refresh: payload.refresh,
    publication: payload.publication,
    publications: payload.publications,
    names: payload.names,
    teams: payload.teams,
    pos: payload.pos ?? [],
    seasonOnlyPlayers: new Set(payload.seasonOnlyPlayers ?? []),
    searchKeys: payload.names.map(searchKey),
    seasonsByPlayer,
    career,
    years,
  }
}

function hasExactNumerators(row: number[]): boolean {
  return [S.EFG_NUMERATOR, S.NO_REST_NUMERATOR, S.RESTED_NUMERATOR]
    .every((column) => Number.isSafeInteger(row[column]) && row[column] >= 0)
}

function seasonEfg(row: number[], attempts: number, rate: number, numerator: number): number | null {
  if (!row[attempts]) return null
  return hasExactNumerators(row) ? 50 * row[numerator] / row[attempts] : row[rate]
}

/** Career totals pool integer shooting numerators when present; legacy rows retain their stored rates. */
export function careerTotals(seasons: number[][]): CareerTotals {
  let games = 0, fga = 0, made = 0
  let noRestFga = 0, noRestMade = 0, restedFga = 0, restedMade = 0
  for (const r of seasons) {
    games += r[S.GAMES]
    fga += r[S.FGA]
    made += hasExactNumerators(r) ? 50 * r[S.EFG_NUMERATOR] : r[S.EFG] * r[S.FGA]
    noRestFga += r[S.NO_REST_FGA]
    noRestMade += hasExactNumerators(r) ? 50 * r[S.NO_REST_NUMERATOR] : r[S.NO_REST_EFG] * r[S.NO_REST_FGA]
    restedFga += r[S.RESTED_FGA]
    restedMade += hasExactNumerators(r) ? 50 * r[S.RESTED_NUMERATOR] : r[S.RESTED_EFG] * r[S.RESTED_FGA]
  }
  const exactMoments = seasons.length > 0 && seasons.every(r =>
    [S.NO_REST_SECOND_MOMENT, S.RESTED_SECOND_MOMENT].every(c => Number.isSafeInteger(r[c]) && r[c] >= 0))
  const sumColumn = (column: number) => seasons.reduce((total, r) => total + r[column], 0)
  const se = exactMoments ? effectSe(noRestFga, restedFga,
    sumColumn(S.NO_REST_NUMERATOR), sumColumn(S.RESTED_NUMERATOR),
    sumColumn(S.NO_REST_SECOND_MOMENT), sumColumn(S.RESTED_SECOND_MOMENT)) : null
  const noRestEfg = noRestFga ? noRestMade / noRestFga : null
  const restedEfg = restedFga ? restedMade / restedFga : null
  return {
    games,
    fga,
    efg: fga ? made / fga : null,
    noRestFga,
    noRestEfg,
    restedFga,
    restedEfg,
    effect: restEffect(noRestEfg, restedEfg),
    se,
    exactNumerators: seasons.length > 0 && seasons.every(hasExactNumerators),
    ageLo: seasons.length ? seasons[0][S.AGE] || null : null,
    ageHi: seasons.length ? seasons[seasons.length - 1][S.AGE] || null : null,
  }
}

/** A season's own row, for the expansion under a player. */
export function seasonRow(index: PlayerRestIndex, r: number[]): BrowseRow {
  const noRestEfg = seasonEfg(r, S.NO_REST_FGA, S.NO_REST_EFG, S.NO_REST_NUMERATOR)
  const restedEfg = seasonEfg(r, S.RESTED_FGA, S.RESTED_EFG, S.RESTED_NUMERATOR)
  const effect = restEffect(noRestEfg, restedEfg)
  const se = effectSe(r[S.NO_REST_FGA], r[S.RESTED_FGA],
    r[S.NO_REST_NUMERATOR], r[S.RESTED_NUMERATOR],
    r[S.NO_REST_SECOND_MOMENT], r[S.RESTED_SECOND_MOMENT])
  return {
    player: r[S.PLAYER],
    name: index.names[r[S.PLAYER]],
    context: index.teams[r[S.TEAM]],
    age: r[S.AGE] ? String(r[S.AGE]) : "—",
    games: r[S.GAMES],
    fga: r[S.FGA],
    efg: seasonEfg(r, S.FGA, S.EFG, S.EFG_NUMERATOR) ?? 0,
    noRestFga: r[S.NO_REST_FGA],
    noRestEfg,
    restedFga: r[S.RESTED_FGA],
    restedEfg,
    effect,
    se,
    underEvidenced: effect === null || se === null || se === 0 || Math.abs(effect) < se,
  }
}

/**
 * Historical tricode → the franchise it became, the way Basketball-Reference and the
 * NBA's own franchise histories fold them. The team filter offers franchises, so a
 * visitor picking OKC finds the Seattle years instead of losing them to a defunct code.
 */
const CURRENT_BY_HISTORICAL: Record<string, string> = {
  SEA: "OKC", VAN: "MEM", NJN: "BKN", NOH: "NOP", NOK: "NOP", CHH: "CHA",
}

const franchiseOf = (tricode: string): string => CURRENT_BY_HISTORICAL[tricode] ?? tricode

/** Tricodes in a season team label: "LAL/CLE+" → ["LAL", "CLE"]. The "+" marks a third
    team the label does not carry — 0.7% of player-seasons, accepted in the spec. */
const labelTricodes = (label: string): string[] => label.replace(/\+$/, "").split("/")

const matchesFranchise = (label: string, franchise: string): boolean =>
  labelTricodes(label).some((t) => franchiseOf(t) === franchise)

export interface FranchiseOption {
  value: string
  label: string
}

/** One dropdown option per franchise found in the payload's team labels, sorted by
    tricode, labeled "OKC · SEA" where a defunct code was folded in. */
export function franchiseOptions(teams: readonly string[]): FranchiseOption[] {
  const folded = new Map<string, Set<string>>()
  for (const teamLabel of teams) {
    for (const t of labelTricodes(teamLabel)) {
      const f = franchiseOf(t)
      const hist = folded.get(f) ?? new Set<string>()
      if (t !== f) hist.add(t)
      folded.set(f, hist)
    }
  }
  return [...folded.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, hist]) => ({
      value,
      label: hist.size ? `${value} · ${[...hist].sort().join("/")}` : value,
    }))
}

export interface BuildOptions {
  /** A season start year, or "career" to pool every season a player played. */
  year: number | "career"
  minFga: number
  query: string
  sort: SortKey
  /** -1 descending, 1 ascending. */
  dir: -1 | 1
  /** Current-era franchise tricode ("OKC" covers the Seattle years); null/absent = all teams. */
  team?: string | null
  /** Modal position. Players without one (never started) match only when this is null/absent. */
  pos?: "G" | "F" | "C" | null
  /** Keep only rows whose effect clears its own standard error — the rows rendered dim. */
  evidencedOnly?: boolean
}

export function buildRows(index: PlayerRestIndex, opts: BuildOptions): BrowseRow[] {
  const rows: BrowseRow[] = []

  if (opts.year === "career") {
    for (const [player, seasons] of index.seasonsByPlayer) {
      if (index.seasonOnlyPlayers.has(player)) continue
      const est = index.career.get(player)
      if (opts.team && !seasons.some((s) => matchesFranchise(index.teams[s[S.TEAM]], opts.team!))) continue
      const t = careerTotals(seasons)
      const effect = t.exactNumerators ? t.effect : (est?.delta ?? t.effect)
      const se = t.se
      rows.push({
        player,
        name: index.names[player],
        context: `${seasonLabel(seasons[0][S.YEAR])}–${String(seasons[seasons.length - 1][S.YEAR] + 1).slice(-2)}`,
        age: t.ageLo && t.ageHi ? `${t.ageLo}–${t.ageHi}` : "—",
        games: t.games,
        fga: t.fga,
        efg: t.efg ?? 0,
        noRestFga: t.noRestFga,
        noRestEfg: t.noRestEfg,
        restedFga: t.restedFga,
        restedEfg: t.restedEfg,
        effect,
        se,
        underEvidenced: effect === null || se === null || se === 0 || Math.abs(effect) < se,
      })
    }
  } else {
    for (const seasons of index.seasonsByPlayer.values()) {
      const r = seasons.find((s) => s[S.YEAR] === opts.year)
      if (!r) continue
      if (opts.team && !matchesFranchise(index.teams[r[S.TEAM]], opts.team)) continue
      rows.push(seasonRow(index, r))
    }
  }

  const filtered = rows.filter((r) => {
    if (r.fga < opts.minFga) return false
    if (opts.pos && index.pos[r.player] !== opts.pos) return false
    if (opts.evidencedOnly && r.underEvidenced) return false
    if (!opts.query) return true
    return index.searchKeys[r.player].includes(opts.query)
  })

  const { sort, dir } = opts
  filtered.sort((a, b) => {
    if (sort === "name") return dir * a.name.localeCompare(b.name)
    const x = sort === "age" ? parseInt(a.age, 10) : a[sort]
    const y = sort === "age" ? parseInt(b.age, 10) : b[sort]
    // Missing values sort last in both directions rather than clumping at one end.
    if (x === null || x === undefined || Number.isNaN(x)) return 1
    if (y === null || y === undefined || Number.isNaN(y)) return -1
    return dir * ((x as number) - (y as number))
  })
  return filtered
}

/** One player's no-rest shooting volume in one season. */
export interface ZeroRestWorkloadRow {
  name: string
  team: string
  noRestFga: number
  noRestEfg: number
  games: number
}

/**
 * A season's players ranked by shot attempts taken on zero days' rest.
 *
 * Volume, deliberately not a rest *effect*. A single season's eFG% split is not an
 * estimate of anything — at 50 attempts per arm the extremes swing ±30pp and the top of
 * any such list is bench players with tiny samples, which is why the career `shrunk`
 * column exists. Attempts on no rest is a plain fact, and it answers the question worth
 * asking here: who is being asked to carry the back-to-backs.
 *
 * Ties break on name so the table is stable between renders.
 */
export function zeroRestWorkload(
  payload: PlayerRestPayload,
  seasonStartYear: number,
  limit: number
): ZeroRestWorkloadRow[] {
  return payload.seasons
    .filter((row) => row[S.YEAR] === seasonStartYear && row[S.NO_REST_FGA] > 0)
    .map((row) => ({
      name: payload.names[row[S.PLAYER]],
      team: payload.teams[row[S.TEAM]],
      noRestFga: row[S.NO_REST_FGA],
      noRestEfg: seasonEfg(row, S.NO_REST_FGA, S.NO_REST_EFG, S.NO_REST_NUMERATOR) ?? 0,
      games: row[S.GAMES],
    }))
    .sort((a, b) => b.noRestFga - a.noRestFga || a.name.localeCompare(b.name))
    .slice(0, limit)
}
