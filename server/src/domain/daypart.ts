import { localMinuteOfDay } from "./localTime";

/**
 * What the Frame is about at this hour.
 *
 * `commute` is the window in which a train you could still catch is the most
 * useful thing on the fridge. `day` is the rest of it — the trains have gone
 * and their zone is worth more to something else.
 *
 * The Device has no idea this exists; it asks for a Frame and shows it.
 */
export type Daypart = "commute" | "day";

export type DaypartSchedule = {
  readonly timeZone: string;
  /** Local wall-clock minutes past midnight, so `6 * 60` is 06:00. */
  readonly commuteStartsAtMinute: number;
  readonly commuteEndsAtMinute: number;
};

/**
 * The window is half open — a Frame rendered at exactly the end minute is
 * already the day Daypart. Otherwise 09:00 would show a board whose first
 * train has, by that hour, invariably gone.
 */
export const daypartAt = (moment: Date, schedule: DaypartSchedule): Daypart => {
  const minuteOfDay = localMinuteOfDay(moment, schedule.timeZone);

  return minuteOfDay >= schedule.commuteStartsAtMinute &&
    minuteOfDay < schedule.commuteEndsAtMinute
    ? "commute"
    : "day";
};
