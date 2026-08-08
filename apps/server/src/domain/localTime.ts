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
