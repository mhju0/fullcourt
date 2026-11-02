import type { ShotQualityCell } from "@/types";

/** Display areas describe a cell center, not NBA source zones or individual shot types. */
export function shotCourtAreaLabel(cell: Pick<ShotQualityCell, "cellX" | "cellY" | "zoneBasic">): string {
  if (cell.zoneBasic !== null) return cell.zoneBasic;

  const x = cell.cellX + 0.5;
  const y = cell.cellY + 0.5;
  const cornerY = Math.sqrt(23.75 ** 2 - 22 ** 2);
  if (Math.abs(x) > 22 && y <= cornerY) return x < 0 ? "Left corner" : "Right corner";

  const distance = Math.hypot(x, y);
  if (distance > 23.75) return "Above the arc";
  if (distance <= 4) return "Near rim";
  const courtY = y + 5.25;
  if (Math.abs(x) <= 8 && courtY >= 0 && courtY <= 19) return "Paint";
  return "Mid-range";
}
