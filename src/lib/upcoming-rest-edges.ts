type ScheduledTip = {
  date: string;
  tipOffUtc: string | Date | null;
  gameId: number;
};

/** Unknown tip times follow timed games on the same Eastern calendar date. */
export function compareUpcomingTipOff(left: ScheduledTip, right: ScheduledTip): number {
  const dateOrder = String(left.date).localeCompare(String(right.date));
  if (dateOrder) return dateOrder;
  const time = (tip: ScheduledTip["tipOffUtc"]) => {
    const value = tip === null ? NaN : new Date(tip).getTime();
    return Number.isFinite(value) ? value : Infinity;
  };
  const leftTime = time(left.tipOffUtc);
  const rightTime = time(right.tipOffUtc);
  return (leftTime === rightTime ? 0 : leftTime - rightTime) || left.gameId - right.gameId;
}
