import { expect, test } from "@playwright/test";

/**
 * The install surface — manifest, apple-touch-icon, standalone metadata (2026-08-15).
 *
 * Until these shipped, "Add to Home Screen" produced a page-screenshot icon that opened in
 * Safari chrome (docs/ROADMAP.md, "Known and not fixed"). The unit half
 * (src/app/__tests__/manifest.test.ts) pins what the manifest promises; this half proves the
 * routes are actually served and that every page advertises them — a manifest nothing links
 * to installs nothing.
 */
test.describe("Install surface", () => {
  test("the manifest is served and standalone", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { display: string; start_url: string };
    expect(body.display).toBe("standalone");
    expect(body.start_url).toBe("/games");
  });

  test("the apple touch icon is a real PNG, not a screenshot fallback", async ({ request }) => {
    // Extensionless: generated metadata routes serve at their basename, like the existing
    // /opengraph-image. The first version of this test asked for /apple-icon.png and 404'd —
    // which is also why the manifest references /apple-icon, and what this guards.
    const res = await request.get("/apple-icon");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    // A generated 180×180 icon has real weight; a broken generation route would 200 with
    // an error page or an empty body long before it produced kilobytes of PNG.
    expect((await res.body()).length).toBeGreaterThan(1000);
  });

  test("every page advertises the pair", async ({ page }) => {
    await page.goto("/games");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /manifest\.webmanifest/
    );
    await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute(
      "href",
      /apple-icon/
    );
  });
});
