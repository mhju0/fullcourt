import { describe, expect, it } from "vitest";
import { glueOperators, splitUnbreakable } from "@/lib/keep-together";

const NBSP = " ";

describe("splitUnbreakable", () => {
  it("isolates seasons, ISO dates and N-in-M stretches at odd indexes", () => {
    const parts = splitUnbreakable("The 2019-20 bubble, data through 2026-10-20, and every 3-in-4 stretch.");
    expect(parts.filter((_, i) => i % 2)).toEqual(["2019-20", "2026-10-20", "3-in-4"]);
    expect(parts.join("")).toBe("The 2019-20 bubble, data through 2026-10-20, and every 3-in-4 stretch.");
  });

  it("leaves hyphenated words and plain numbers alone", () => {
    expect(splitUnbreakable("home-court edge of 61.2% over 27,400 games")).toHaveLength(1);
  });
});

describe("glueOperators", () => {
  it("binds an operator to the operand after it", () => {
    expect(glueOperators("p = 0.0016")).toBe(`p =${NBSP}0.0016`);
    expect(glueOperators("|z| ≥ 2")).toBe(`|z| ≥${NBSP}2`);
    expect(glueOperators("(HOME-COURT − OPPONENT)")).toBe(`(HOME-COURT −${NBSP}OPPONENT)`);
    expect(glueOperators("0.6148 vs 0.6931")).toBe(`0.6148 vs${NBSP}0.6931`);
    expect(glueOperators("+ means higher")).toBe(`+${NBSP}means higher`);
  });

  it("keeps RA with the comparison that follows it", () => {
    expect(glueOperators("RA ≥ 5")).toBe(`RA${NBSP}≥${NBSP}5`);
  });

  it("does not touch a signed number or an operator inside a word", () => {
    expect(glueOperators("−3.2 pp and +1.4 pp")).toBe("−3.2 pp and +1.4 pp");
    expect(glueOperators("C++ and a=b")).toBe("C++ and a=b");
  });
});
