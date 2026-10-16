import { test, expect } from "@playwright/test";

/**
 * No line break separates what reads as one token.
 *
 * The 2026-10-16 audit walked every route at twelve widths and found three shapes of break,
 * all of them figures: a season or ISO date split at its hyphen ("2019- ⏎ 20", which Chrome
 * allows before a digit), a number cut from its unit ("+6.0 ⏎ pp"), and an operator left at a
 * line end ("RA ≥ ⏎ 5", "p = ⏎ 0.0016"). `keepTogether()` and U+00A0 fixed them; this keeps
 * them fixed. The `·` separator is allowed to end a line: it divides clauses, not a figure.
 */

const ROUTES = [
  "/",
  "/games",
  "/season",
  "/schedule",
  "/home-court",
  "/analysis",
  "/playoffs",
  "/shooting",
  "/shot-quality",
  "/availability",
  "/referees",
  "/officiating",
  "/data-status",
  "/behind-the-data/rest-advantage",
  "/behind-the-data/schedule-edge",
  "/behind-the-data/player-shooting",
  "/behind-the-data/shot-value",
  "/behind-the-data/availability",
  "/behind-the-data/playoff-predictions",
  "/behind-the-data/referees",
  "/behind-the-data/referees/archive",
  "/behind-the-data/time-zones",
  "/behind-the-data/data-and-limits",
];

const WIDTHS = [320, 390];

function findBadBreaks(): string[] {
  const bad: string[] = [];
  const lines = new Map<Element, { top: number; bottom: number; words: string[] }[]>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || parent.closest("script, style, svg, .sr-only, [aria-hidden=true], option")) continue;
    let block: Element | null = parent;
    while (block && getComputedStyle(block).display.startsWith("inline")) block = block.parentElement;
    if (!block) continue;
    for (const m of text.data.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, m.index);
      range.setEnd(text, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      const split = rects.at(-1)!.top - rects[0].top > rects[0].height / 2;
      if (split && /\d{4}-\d{2}|\d-in-\d/.test(m[0])) bad.push(`split token "${m[0]}"`);
      const list = lines.get(block) ?? [];
      list.push({ top: rects[0].top, bottom: rects.at(-1)!.bottom, words: [m[0]] });
      lines.set(block, list);
    }
  }
  for (const tokens of lines.values()) {
    tokens.sort((a, b) => a.top - b.top);
    const rows: { bottom: number; words: string[] }[] = [];
    for (const t of tokens) {
      const last = rows.at(-1);
      if (last && t.top < last.bottom - 2) {
        last.words.push(...t.words);
        last.bottom = Math.max(last.bottom, t.bottom);
      } else rows.push({ bottom: t.bottom, words: [...t.words] });
    }
    for (let i = 1; i < rows.length; i++) {
      const end = rows[i - 1].words.at(-1)!;
      const start = rows[i].words[0];
      const at = `"${end} ⏎ ${start}"`;
      if (/^[−+-]?[$(]?\d[\d,.]*[,;:]?$/.test(end) && /^(%|pp|pts?|mi|km|ft)[.,;:)]?$/i.test(start)) bad.push(`unit cut ${at}`);
      else if (/^(−|\+|±|≥|≤|<|>|=|@|\/|vs\.?)$/.test(end)) bad.push(`operator stranded ${at}`);
      else if (end === "RA" && /^[≥≤\d]/.test(start)) bad.push(`operator stranded ${at}`);
    }
  }
  return [...new Set(bad)];
}

for (const width of WIDTHS) {
  test.describe(`figures do not break across lines at ${width}px`, () => {
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "networkidle" });
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(findBadBreaks)).toEqual([]);
      });
    }
  });
}
