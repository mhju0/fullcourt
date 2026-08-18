/**
 * The manifest is served by a route nothing in the commit gate renders — the same blind spot
 * as error.tsx and not-found.tsx (see error-boundary.test.ts), so its contract is asserted
 * here where `pnpm test:run` reaches it. The e2e half (e2e/pwa.spec.ts) proves the route is
 * actually served and linked; this half pins what the file promises.
 */
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const m = manifest();

describe("web app manifest", () => {
  it("opens standalone — the whole point of installing", () => {
    expect(m.display).toBe("standalone");
  });

  it("starts at the games board, not the marketing page", () => {
    // The front door argues; the pinned app is for someone already convinced. Same contract
    // as the GAMES tab after the 2026-08-12 front-door swap.
    expect(m.start_url).toBe("/games");
  });

  it("stays on the committed light theme", () => {
    // Both colors are --term-bg, and both must match viewport.themeColor in layout.tsx
    // (#F6F7F9). The app is light-only ("Broadcast") — a manifest declaring anything else
    // would flash the wrong chrome on launch.
    expect(m.theme_color).toBe("#F6F7F9");
    expect(m.background_color).toBe("#F6F7F9");
  });

  it("ships both icon forms — SVG for Chromium, PNG for everything else", () => {
    const types = (m.icons ?? []).map((i) => i.type);
    expect(types).toContain("image/svg+xml");
    expect(types).toContain("image/png");
  });
});

describe("maskable icons", () => {
  // Added 2026-08-18 (UIUX_CHECKLIST §2). An Android launcher that masks its icons crops
  // whatever it is given; declaring artwork `maskable` that runs to the edges is how a
  // court mark loses its corners on one launcher and gains a white plate on another.
  const maskable = (m.icons ?? []).filter((i) => i.purpose === "maskable");

  it("declares the 192 and 512 PNGs Chromium's install prompt reads", () => {
    expect(maskable.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    for (const icon of maskable) expect(icon.type).toBe("image/png");
  });

  it("names paths whose extension is real, not a metadata-route basename", () => {
    // `/apple-icon` above is extensionless because Next picks that path. These two are
    // route handlers, so `.png` is part of the served URL — asserting it here keeps a
    // future "tidy the paths" edit from turning both into 404s.
    for (const icon of maskable) expect(icon.src).toMatch(/^\/icon-\d+\.png$/);
  });

  it("keeps the unmasked path on a non-maskable icon", () => {
    // A manifest whose every icon is `maskable` leaves a non-masking consumer rendering
    // inset artwork. The SVG carries `purpose` undefined, i.e. "any".
    expect((m.icons ?? []).some((i) => i.purpose === undefined)).toBe(true);
  });
});
