/**
 * Local wall-clock minutes past midnight, so 06:30 is 390.
 *
 * Everything the Render Service decides by time of day — which Daypart a Frame
 * is, how long the Device sleeps — is a question about the clock on the kitchen
 * wall, not about UTC. Going through `Intl` rather than arithmetic on the epoch
 * is what makes British Summer Time somebody else's problem.
 */
export const localMinuteOfDay = (moment: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(moment);

  const valueOf = (type: "hour" | "minute"): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return valueOf("hour") * 60 + valueOf("minute");
};

/**
 * The calendar date on the kitchen wall when the moment happened, as
 * `YYYY-MM-DD`.
 *
 * The format is chosen so that two of these compare correctly with `<` and
 * `===`, which is how every "is this today?" and "is this within the week?"
 * question in the Render Service is answered.
 */
export const localDateIn = (moment: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(moment);

/**
 * The date a number of days after the given one, in calendar terms.
 *
 * Deliberately not `+ days * 86_400_000` on the original instant: the day a
 * clock changes is 23 or 25 hours long, and "a week on Monday" is a statement
 * about the calendar rather than about elapsed time.
 */
export const dateDaysAfter = (isoDate: string, days: number): string => {
  const moved = new Date(`${isoDate}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
};
