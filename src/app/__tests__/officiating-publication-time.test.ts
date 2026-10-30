import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OfficiatingPage from "@/app/officiating/page";

vi.mock("@/components/officiating-content", () => ({ OfficiatingContent: () => null }));
vi.mock("@/lib/officiating-publication-server", () => ({
  loadOfficiatingPublication: vi.fn(async () => ({
    seasons: [], publication: { status: "published", checkedAt: "2026-10-29T17:06:25.271Z" },
  })),
}));

describe("Officiating publication check time", () => {
  it("prints the page-level check in the same Eastern format as its successful refresh", async () => {
    const html = renderToStaticMarkup(await OfficiatingPage());
    expect(html).toContain("Oct 29, 2026, 1:06 PM ET");
    expect(html).not.toContain("UTC");
    expect(html).not.toContain("2026-10-29T17:06:25.271Z");
  });
});
