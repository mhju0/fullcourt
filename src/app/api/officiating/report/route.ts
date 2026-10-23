import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { loadOfficiatingPublication } from "@/lib/officiating-publication-server";
const query = z.object({
  publication: z.string().regex(/^[a-f0-9]{64}$/), season: z.string().regex(/^20\d{2}-\d{2}$/),
  game: z.string().regex(/^002\d{7}$/), source: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function GET(request: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  const { publication, season, game, source } = parsed.data;
  const result = await loadOfficiatingPublication(publication);
  const snapshot = result.snapshot;
  const g = snapshot?.season.games.find((row) => row.id === game && row.sha256 === source);
  const detail = g && snapshot?.season.season === season ? snapshot.details[`${game}-${source.slice(0, 16)}`] : null;
  if (!detail) return NextResponse.json({ error: "Report unavailable" }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
}
