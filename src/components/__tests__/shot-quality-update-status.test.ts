import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShotQualityContent } from "@/components/shot-quality-content";

const state = vi.hoisted(() => ({ status: "failed" }));
vi.mock("@/hooks/useSeasonUrl", () => ({
  usePageQuery: () => ({ params: new URLSearchParams("season=2026-27"), update: vi.fn() }),
}));
vi.mock("swr", () => ({ default: () => ({ data: {
  season: "2026-27", latestPublishedSeason: "2025-26", activeModel: "gbm-v1", cells: [],
  meta: { cellCount: 0, totalFga: 0, publication: { checkedAt: null, updateStatus: state.status } },
}, isLoading: false }) }));

describe("shot publication update status", () => {
  it("shows a failed refresh without inventing a last-check time", () => {
    state.status = "failed";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).toContain("The latest update failed; the previous publication is retained.");
    expect(html).not.toContain("Last update check");
  });

  it("does not present an unpublished provider result as a failed refresh", () => {
    state.status = "unavailable";
    const html = renderToStaticMarkup(createElement(ShotQualityContent));
    expect(html).not.toContain("The latest update failed");
    expect(html).not.toContain("Last update check");
  });
});
