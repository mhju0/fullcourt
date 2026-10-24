import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvailabilityContent } from "@/components/availability-content";
import { AVAILABILITY_EFFECTS } from "@/lib/availability-facts";
import { signedNumber } from "@/lib/signed-number";

const bar = (html: string, label: string) => {
  const match = html.match(new RegExp(`data-effect="${label}"[^]*?</div></div>`));
  if (!match) throw new Error(`No bar for ${label}`);
  return match[0];
};

describe("availability effect bars", () => {
  const html = renderToStaticMarkup(createElement(AvailabilityContent));

  it("signs each effect by the direction it moves the margin", () => {
    expect(bar(html, "homeCourt")).toContain(signedNumber(AVAILABILITY_EFFECTS.homeCourt.points, 2));
    for (const key of ["bestPlayerOut", "backToBack", "visitingAltitude", "priorOvertime"] as const) {
      expect(bar(html, key)).toContain(signedNumber(-AVAILABILITY_EFFECTS[key].points, 2));
    }
  });

  it("gives the helping effect its own colour", () => {
    expect(bar(html, "homeCourt")).toContain('data-direction="helps"');
    expect(bar(html, "homeCourt")).toContain("var(--term-pos)");
    expect(bar(html, "backToBack")).toContain('data-direction="hurts"');
    expect(bar(html, "backToBack")).not.toContain("var(--term-pos)");
  });
});
