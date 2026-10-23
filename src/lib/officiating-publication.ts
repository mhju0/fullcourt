import { z } from "zod";
import type { ReviewSeason } from "@/lib/officiating";
import { formatEasternDateKey } from "@/lib/nba-season";

const date = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nbaUrl = z.string().url().refine((value) => new URL(value).origin === "https://official.nba.com");
const counts = z.record(z.string(), z.number().int().nonnegative());
const game = z.object({
  id: z.string().regex(/^002\d{7}$/), canonicalExternalId: z.string().optional(), date,
  home: z.string().min(2).max(3), away: z.string().min(2).max(3),
  homeName: z.string().max(80), awayName: z.string().max(80),
  missed: z.number().int().nonnegative(), wrong: z.number().int().nonnegative(), ungraded: z.number().int().nonnegative(),
  categories: counts, source: nbaUrl, sha256: digest,
});
const event = z.object({
  id: z.string().max(100), period: z.string().max(30), clock: z.string().max(30).nullable(), category: z.string().max(150),
  grade: z.enum(["IC", "INC", "CC", "CNC", "Undetectable", "NCI", "NCC", ""]),
  verdict: z.string().max(20_000), video: nbaUrl.nullable(),
});
export const officiatingSnapshotSchema = z.object({
  schemaVersion: z.literal(1), generatedAt: z.string().datetime({ offset: true }),
  season: z.object({
    season: z.string().regex(/^20\d{2}-\d{2}$/), refreshedAt: z.string().datetime({ offset: true }), through: date,
    indexSource: nbaUrl, indexSha256: digest, missed: z.number().int().nonnegative(), wrong: z.number().int().nonnegative(),
    categories: counts, games: z.array(game).min(1).max(2000),
  }),
  details: z.record(z.string(), z.object({
    id: z.string(), sha256: digest, crew: z.array(z.string().max(100)).max(3), source: nbaUrl,
    events: z.array(event).max(1000),
  })),
}).superRefine((value, context) => {
  const s = value.season;
  let missed = 0, wrong = 0;
  const categories: Record<string, number> = {};
  const seen = new Set<string>();
  const fail = () => context.addIssue({ code: "custom", message: "Report evidence differs from publication" });
  const year = Number(s.season.slice(0, 4));
  if (Date.parse(value.generatedAt) > Date.now() + 300_000 || Date.parse(s.refreshedAt) > Date.parse(value.generatedAt) ||
      s.through > formatEasternDateKey(new Date(s.refreshedAt))) fail();
  if (s.season !== `${year}-${String(year + 1).slice(-2)}` || s.indexSource !== `https://official.nba.com/${s.season}-nba-officiating-last-two-minute-reports/`) fail();
  for (const g of s.games) {
    const detail = value.details[`${g.id}-${g.sha256.slice(0, 16)}`];
    if (seen.has(g.id) || g.home === g.away || g.source !== `https://official.nba.com/l2m/L2MReport.html?gameId=${g.id}` ||
        !g.id.startsWith(`002${String(year).slice(-2)}`) || g.date < `${year}-09-01` || g.date > `${year + 1}-07-31` ||
        !detail || detail.id !== g.id || detail.sha256 !== g.sha256 || detail.source !== g.source) { fail(); continue; }
    seen.add(g.id);
    const m = detail.events.filter((e) => e.grade === "INC").length;
    const w = detail.events.filter((e) => e.grade === "IC").length;
    const local: Record<string, number> = {};
    for (const e of detail.events) if (e.grade === "INC" || e.grade === "IC") local[e.category] = (local[e.category] ?? 0) + 1;
    if (m !== g.missed || w !== g.wrong || detail.events.filter((e) => ["", "Undetectable", "NCI", "NCC"].includes(e.grade)).length !== g.ungraded ||
        new Set(detail.events.map((e) => e.id)).size !== detail.events.length ||
        Object.entries(local).some(([k, n]) => g.categories[k] !== n) || Object.entries(g.categories).some(([k, n]) => (local[k] ?? 0) !== n)) fail();
    missed += m; wrong += w;
    for (const [k, n] of Object.entries(local)) categories[k] = (categories[k] ?? 0) + n;
  }
  if (missed !== s.missed || wrong !== s.wrong || s.through !== s.games.map((g) => g.date).sort().at(-1) ||
      Object.keys(value.details).length !== s.games.length ||
      Object.entries(categories).some(([k, n]) => s.categories[k] !== n) || Object.entries(s.categories).some(([k, n]) => (categories[k] ?? 0) !== n)) fail();
});
export type OfficiatingSnapshot = z.infer<typeof officiatingSnapshotSchema>;
export function parseOfficiatingSnapshot(value: unknown): OfficiatingSnapshot | null {
  const result = officiatingSnapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function mergeOfficiatingSeasons(bundled: readonly ReviewSeason[], snapshot: OfficiatingSnapshot | null): ReviewSeason[] {
  if (!snapshot) return [...bundled];
  const previous = bundled.find((s) => s.season === snapshot.season.season);
  if (previous && (Date.parse(snapshot.season.refreshedAt) < Date.parse(previous.refreshedAt) ||
      previous.games.some((g) => !snapshot.season.games.some((next) => next.id === g.id)))) return [...bundled];
  return [...bundled.filter((s) => s.season !== snapshot.season.season), snapshot.season].sort((a, b) => a.season.localeCompare(b.season));
}
