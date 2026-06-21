/**
 * Reports data gaps: games missing fatigue scores, optional scheduled-slate gaps.
 *
 * Usage (repo root, DATABASE_URL in .env.local):
 *   npx tsx scripts/audit_data.ts
 *
 * "Old formula" note: fatigue model changes are not version-stored in the DB.
 * If you shipped new fatigue logic, recompute with:
 *   pnpm exec tsx scripts/backfill_fatigue.ts --force
 */

import { and, count, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { loadEnvLocal } from "@/lib/load-env-local";
import { db } from "@/lib/db";
import { fatigueScores, games } from "@/lib/db/schema";

async function main(): Promise<void> {
  loadEnvLocal();

  const homeF = alias(fatigueScores, "hf");
  const awayF = alias(fatigueScores, "af");

  const finalRegular = and(
    eq(games.status, "final"),
    eq(games.gameType, "regular"),
    isNotNull(games.homeScore),
    isNotNull(games.awayScore)
  );

  const missingHomeFatigue = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      homeF,
      and(eq(homeF.gameId, games.id), eq(homeF.teamId, games.homeTeamId))
    )
    .where(and(finalRegular, isNull(homeF.id)));

  const missingAwayFatigue = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      awayF,
      and(eq(awayF.gameId, games.id), eq(awayF.teamId, games.awayTeamId))
    )
    .where(and(finalRegular, isNull(awayF.id)));

  const missingEither = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      homeF,
      and(eq(homeF.gameId, games.id), eq(homeF.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayF,
      and(eq(awayF.gameId, games.id), eq(awayF.teamId, games.awayTeamId))
    )
    .where(
      and(finalRegular, or(isNull(homeF.id), isNull(awayF.id)))
    );

  const scheduledNoFatigue = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      homeF,
      and(eq(homeF.gameId, games.id), eq(homeF.teamId, games.homeTeamId))
    )
    .where(
      and(
        eq(games.status, "scheduled"),
        eq(games.gameType, "regular"),
        isNull(homeF.id)
      )
    );

  const totalGames = await db.select({ c: count() }).from(games);
  const totalFatigueRows = await db.select({ c: count() }).from(fatigueScores);

  const staleComputed = await db
    .select({
      oldest: sql<string>`min(${fatigueScores.computedAt})::text`,
      newest: sql<string>`max(${fatigueScores.computedAt})::text`,
    })
    .from(fatigueScores);

  console.log("── FullCourt — data audit ──\n");
  console.log(`Total games rows:           ${totalGames[0]?.c ?? 0}`);
  console.log(`Total fatigue_scores rows: ${totalFatigueRows[0]?.c ?? 0}`);
  console.log(
    `Fatigue computedAt range:   ${staleComputed[0]?.oldest ?? "—"} … ${staleComputed[0]?.newest ?? "—"}`
  );
  console.log("");
  console.log(
    `Final regular games missing HOME fatigue row:  ${missingHomeFatigue[0]?.c ?? 0}`
  );
  console.log(
    `Final regular games missing AWAY fatigue row: ${missingAwayFatigue[0]?.c ?? 0}`
  );
  console.log(
    `Final regular games missing either side:      ${missingEither[0]?.c ?? 0}`
  );
  console.log(
    `Scheduled regular games missing home fatigue: ${scheduledNoFatigue[0]?.c ?? 0} (run run-daily / backfill_fatigue)`
  );
  // ── Tag-integrity guard (external_id prefix ↔ game_type) ──────────────
  // NBA stats GAME_ID prefixes map 1:1 to game_type: 002 → regular, 004 →
  // playoffs/finals, 005 → play_in. Any mismatch is data pollution — most
  // dangerously a 004/005 row tagged 'regular', which (for mid-April play-in
  // dates inside the Oct 1–Apr 30 calendar guard) would leak into the
  // regular-season product. A non-empty result is a WARNING to investigate.
  //
  // NOTE: until the full 004 playoff backfill (scripts/fetch_playoffs.py) has
  // been run for every season, this will still flag the not-yet-retagged
  // playoff rows (e.g. 2024-25 004 rows tagged 'regular'). That is expected and
  // is exactly what this guard is for — not a failure of the guard itself.
  const tagMismatches = await db
    .select({
      season: games.season,
      prefix: sql<string>`left(${games.externalId}, 3)`,
      gameType: games.gameType,
      c: count(),
    })
    .from(games)
    .where(
      or(
        and(
          sql`${games.externalId} LIKE '002%'`,
          sql`${games.gameType} <> 'regular'`
        ),
        and(
          sql`${games.externalId} LIKE '004%'`,
          sql`${games.gameType} NOT IN ('playoffs', 'finals')`
        ),
        and(
          sql`${games.externalId} LIKE '005%'`,
          sql`${games.gameType} <> 'play_in'`
        )
      )
    )
    .groupBy(games.season, sql`left(${games.externalId}, 3)`, games.gameType)
    .orderBy(games.season);

  console.log("");
  console.log("── Tag-integrity guard (external_id prefix ↔ game_type) ──");
  if (tagMismatches.length === 0) {
    console.log("OK — every 002/004/005 row carries its expected game_type.");
  } else {
    const total = tagMismatches.reduce((sum, r) => sum + Number(r.c), 0);
    console.log(
      `⚠️  WARNING: ${total} row(s) have a prefix/game_type mismatch across ${tagMismatches.length} group(s):`
    );
    for (const r of tagMismatches) {
      const expected =
        r.prefix === "002"
          ? "regular"
          : r.prefix === "004"
            ? "playoffs/finals"
            : "play_in";
      console.log(
        `   ${r.season}  prefix ${r.prefix} → tagged '${r.gameType}' (expected ${expected}): ${r.c} row(s)`
      );
    }
    console.log(
      "   Fix: re-run scripts/fetch_playoffs.py (004) / scripts/fetch_play_in.py (005) for the offending seasons."
    );
  }

  console.log("");
  console.log(
    "To refresh all fatigue with the current TypeScript model: pnpm exec tsx scripts/backfill_fatigue.ts --force"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
