import { expect, test } from "@playwright/test";

test("body and formula text use the bundled fonts rather than their fallback", async ({ page }) => {
  await page.goto("/behind-the-data/rest-advantage");
  await page.locator(".reference-contents > summary").click();
  await page.getByRole("button", { name: "Expand technical detail", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument");
  for (const [selector, family] of [["main h1", /^Geist$/i], ["main pre", /^Geist\s*Mono$/i]] as const) {
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
    expect(fonts.some(font => font.isCustomFont && family.test(font.familyName) && font.glyphCount > 0)).toBe(true);
    expect(fonts.some(font => /Arial/i.test(font.familyName))).toBe(false);
  }
  const preloads = page.locator('link[rel="preload"][as="font"]');
  await expect(preloads).toHaveCount(2);
  for (const href of await preloads.evaluateAll(nodes => nodes.map(node => (node as HTMLLinkElement).href))) {
    expect(new URL(href).origin).toBe(new URL(page.url()).origin);
  }
  await session.detach();
});
