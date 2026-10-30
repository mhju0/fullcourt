import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { loadPlayerRestPublication } from "@/lib/player-rest-publication-server";

vi.mock("@/lib/player-rest-publication-server", () => ({ loadPlayerRestPublication: vi.fn() }));
vi.mock("@/components/home-content", () => ({
  HomeContent: ({ findings }: { findings: { shootingCoverage: string | null } }) =>
    createElement("p", null, findings.shootingCoverage),
}));

afterEach(() => vi.unstubAllEnvs());

describe("homepage shooting publication coverage", () => {
  it("uses the validated publication's current season rather than the bundled archive", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.mocked(loadPlayerRestPublication).mockResolvedValue({
      generated: "2026-10-29T16:54:50.509Z", names: [], teams: [], shrunk: [],
      seasons: [[0, 1996, 0, 20, 1, 1, 50, 0, 0, 0, 0], [0, 2026, 0, 20, 1, 1, 50, 0, 0, 0, 0]],
    });
    expect(renderToStaticMarkup(await HomePage())).toContain("1996-97 to 2026-27");
    expect(loadPlayerRestPublication).toHaveBeenCalledOnce();
  });
});
