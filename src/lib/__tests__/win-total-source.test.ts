import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadSourcePage, parseSeasonPage } from "../../../scripts/fetch_win_totals";

const page = `<table><tr><th>Team</th><th>Win Total</th></tr>
<tr><td>Atlanta Hawks</td><td>36.5</td><td>-110</td><td>-110</td><td>82</td><td>40</td><td>Over</td></tr>
<tr><td>Boston Celtics</td><td>N/A</td><td></td><td></td><td>82</td><td>61</td><td>Under</td></tr></table>`;

describe("frozen season-win sources", () => {
  it("replays the captured page offline and refuses missing or modified evidence", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fullcourt-market-"));
    const fetchPage = vi.fn<typeof fetch>().mockResolvedValue(new Response(page));
    try {
      const captured = await loadSourcePage(2024, directory, false, fetchPage);
      expect(fetchPage).toHaveBeenCalledOnce();
      expect(await loadSourcePage(2024, directory, true, fetchPage)).toEqual(captured);
      expect(fetchPage).toHaveBeenCalledOnce();
      expect(parseSeasonPage(captured.html, "2024-25")).toEqual([
        { season: "2024-25", abbr: "ATL", line: 36.5, actual: 40, result: "Over" },
      ]);
      expect(JSON.parse(readFileSync(join(directory, "2024.json"), "utf8")).sha256).toBe(captured.sha256);
      await expect(loadSourcePage(2023, directory, true, fetchPage)).rejects.toThrow("Missing frozen");
      writeFileSync(join(directory, "2024.html"), `${page}changed`);
      await expect(loadSourcePage(2024, directory, false, fetchPage)).rejects.toThrow("hash mismatch");
      expect(fetchPage).toHaveBeenCalledOnce();
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it("refuses an incomplete capture instead of silently fetching replacement evidence", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fullcourt-market-"));
    try {
      writeFileSync(join(directory, "2024.html"), page);
      await expect(loadSourcePage(2024, directory, false)).rejects.toThrow("Incomplete frozen");
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
