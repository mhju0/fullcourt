import { z } from "zod";
import { CACHE, jsonRoute } from "@/lib/api-route";
import { getHomeCourtStudy } from "@/lib/home-court-study-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = jsonRoute("api/home-court", z.object({}), getHomeCourtStudy, CACHE.inSeason);
