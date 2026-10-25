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
