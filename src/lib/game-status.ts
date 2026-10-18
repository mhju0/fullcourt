/** Persisted lifecycle states. Unknown provider labels never become stored states. */
export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "cancelled";
export const WORKLOAD_STATUSES = ["final", "scheduled", "live"] as const;
export const isHeldGame = (status: string): status is "postponed" | "cancelled" =>
  status === "postponed" || status === "cancelled";
export const isSettledGame = (status: string): boolean => status === "final" || status === "cancelled";
