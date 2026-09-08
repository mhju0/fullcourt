import { expect, it } from "vitest";
import { DIRECT_NAV_ITEMS, EXPLORE_NAV_ITEMS, primaryNavCurrent } from "@/lib/primary-navigation";

it("keeps analytical pages reachable under Explore without claiming the directory is the current page", () => {
  for (const { href } of EXPLORE_NAV_ITEMS) expect(primaryNavCurrent(href, "/explore")).toBe("location");
  expect(primaryNavCurrent("/explore", "/explore")).toBe("page");
  for (const path of ["/", "/about", "/behind-the-data", "/behind-the-data/referees/archive", "/shooting-extra"]) {
    expect(primaryNavCurrent(path, "/explore")).toBeUndefined();
  }
});
it("only marks the selected primary destination", () => {
  for (const selected of DIRECT_NAV_ITEMS) {
    const active = DIRECT_NAV_ITEMS.filter((item) => primaryNavCurrent(selected.href, item.href));
    expect(active).toEqual([selected]);
  }
});
