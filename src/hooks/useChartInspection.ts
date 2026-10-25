"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { inspectionStep, nearestIndex } from "@/lib/chart-inspection";

/**
 * Selection state for a Recharts chart read through a fixed panel (D-142). Recharts' own
 * keyboard layer is turned off: it moves a floating tooltip, and the panel replaces that. The
 * chart frame takes focus instead and steps with ← → Home End, while hover and tap pick the
 * category under the pointer. The selection stays after the pointer leaves.
 *
 * The pointer is read from the plot's grid, not from Recharts' mouse handlers: Recharts updates
 * its pointer state once per frame, so a click handler there reads the previous position.
 * `band` charts (bars) split the plot into equal columns; `point` charts (lines) put the first
 * and last item on the plot edges.
 */
export function plotIndexAt(event: PointerEvent<HTMLElement>, count: number, layout: "band" | "point"): number | null {
  const grid = event.currentTarget.querySelector(".recharts-cartesian-grid");
  if (!grid || count === 0) return null;
  const plot = grid.getBoundingClientRect();
  if (event.clientY < plot.top || event.clientY > plot.bottom) return null;
  return layout === "band"
    ? Math.max(0, Math.min(count - 1, Math.floor(((event.clientX - plot.left) / plot.width) * count)))
    : nearestIndex(event.clientX, plot.left, plot.width, count);
}

export function useChartInspection(count: number, initial: number, layout: "band" | "point") {
  const [picked, setPicked] = useState<number | null>(null);
  const index = count === 0 ? -1 : Math.max(0, Math.min(count - 1, picked ?? initial));
  const pick = (event: PointerEvent<HTMLElement>) => {
    const next = plotIndexAt(event, count, layout);
    if (next !== null) setPicked(next);
  };
  return {
    index,
    chartProps: { accessibilityLayer: false },
    frameProps: {
      tabIndex: 0,
      role: "group" as const,
      style: { cursor: "pointer", touchAction: "manipulation" },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") pick(event);
      },
      onPointerDown: pick,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const next = inspectionStep(event.key, index, count);
        if (next === null) return;
        event.preventDefault();
        setPicked(next);
      },
    },
  };
}
