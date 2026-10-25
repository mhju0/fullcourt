/**
 * One keyboard contract for inspectable charts (D-142): with the chart focused, ← and → move to
 * the adjacent item, Home and End jump to the first and last. Returns the new index, or null when
 * the key is not an inspection key and the event should be left alone.
 */
export function inspectionStep(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  const clamp = (value: number) => Math.max(0, Math.min(count - 1, value));
  if (key === "ArrowLeft") return clamp(index - 1);
  if (key === "ArrowRight") return clamp(index + 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Index of the item nearest a pointer, for charts whose items sit at evenly spaced x positions. */
export function nearestIndex(clientX: number, left: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
  return Math.round(ratio * (count - 1));
}

export const SERIES_INSPECTION_HELP =
  "Hover or tap to inspect a season. With the chart focused, use ← or → for adjacent seasons, or Home or End for the first or latest season.";

export const COURT_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The location an arrow key moves to: the nearest one on that side of the court, with
 * sideways drift costing double so a straight line beats a diagonal. Null at the edge.
 */
export function courtNeighbour(locations: { cx: number; cy: number }[], from: number, key: string): number | null {
  const step = COURT_STEPS[key];
  const origin = locations[from];
  if (!step || !origin) return null;
  let best: number | null = null;
  let bestCost = Infinity;
  locations.forEach((m, i) => {
    const along = (m.cx - origin.cx) * step[0] + (m.cy - origin.cy) * step[1];
    if (along <= 0) return;
    const across = Math.abs((m.cx - origin.cx) * step[1] + (m.cy - origin.cy) * step[0]);
    const cost = along + 2 * across;
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  });
  return best;
}
