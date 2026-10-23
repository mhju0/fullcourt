import { NextResponse } from "next/server";
import { loadPlayerRestPublication } from "@/lib/player-rest-publication-server";
export async function GET() {
  return NextResponse.json(await loadPlayerRestPublication(), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
