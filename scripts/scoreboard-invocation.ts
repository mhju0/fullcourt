import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseScoreboard } from "@/lib/espn-scoreboard";

function location(date: string) {
  const directory = process.env.DAILY_STAGE_SUMMARY_DIR;
  const runId = process.env.DAILY_SCOREBOARD_RUN_ID;
  if (!directory || !runId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const root = join(directory, "scoreboards");
  return { root, path: join(root, `${date}.json`), runId };
}

export function retainInvocationScoreboard(date: string, body: string): boolean {
  const target = location(date);
  if (!target) return false;
  try {
    mkdirSync(target.root, { recursive: true });
    writeFileSync(target.path, JSON.stringify({
      schemaVersion: 1, runId: target.runId, date,
      sha256: createHash("sha256").update(body).digest("hex"), body,
    }));
    return true;
  } catch {
    return false;
  }
}

export function readInvocationScoreboard(
  date: string,
  targets: readonly { home: string; away: string }[]
): unknown | null {
  const source = location(date);
  if (!source) return null;
  try {
    const receipt = JSON.parse(readFileSync(source.path, "utf8"));
    if (receipt.schemaVersion !== 1 || receipt.runId !== source.runId || receipt.date !== date
      || typeof receipt.body !== "string"
      || receipt.sha256 !== createHash("sha256").update(receipt.body).digest("hex")) return null;
    const payload = JSON.parse(receipt.body);
    if (!Array.isArray(payload?.events)) return null;
    const events = parseScoreboard(payload);
    for (const target of targets) {
      const matching = events.filter(event => event.date === date
        && event.homeAbbr === target.home && event.awayAbbr === target.away);
      if (matching.length !== 1 || matching[0].status !== "final") return null;
    }
    return payload;
  } catch {
    return null;
  }
}
