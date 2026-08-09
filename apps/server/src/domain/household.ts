import { localDateIn } from "./localTime";

export type Chore = {
  readonly name: string;
  /** Resolved to a person's name where possible; the API returns a user id. */
  readonly assignedTo?: string;
};

export type CalendarEntry = {
  readonly title: string;
  readonly startsAt: Date;
  readonly allDay: boolean;
};

export type Household = {
  readonly choresDueToday: readonly Chore[];
  readonly overdueChoreCount: number;
  /** Tonight's dinner, if anyone has planned one. */
  readonly dinner?: string;
  readonly today: readonly CalendarEntry[];
  /** The days after today, up to `UpcomingDays`. Never includes today, which
   * has a zone of its own and is read differently: today is a list of times,
   * the week ahead is a question of which days are already spoken for. */
  readonly upcoming: readonly CalendarEntry[];
};

/** How far ahead "the week ahead" reaches. Named because the Family Hub source
 * fetches to it and the Frame prints it. */
export const UpcomingDays = 7;

const startOfEntry = (entry: CalendarEntry): number =>
  entry.allDay ? -1 : entry.startsAt.getTime();

/** All-day items first, then chronological — the order you read a day in. */
export const inDayOrder = (
  entries: readonly CalendarEntry[],
): readonly CalendarEntry[] =>
  [...entries].sort((left, right) => startOfEntry(left) - startOfEntry(right));

/**
 * Day by day, and within each day the order above.
 *
 * Sorting several days by `inDayOrder` alone would hoist next Sunday's all-day
 * item above tomorrow morning, because the rule that puts all-day items first
 * only makes sense inside a single day.
 */
export const inCalendarOrder = (
  entries: readonly CalendarEntry[],
  timeZone: string,
): readonly CalendarEntry[] =>
  [...entries].sort((left, right) => {
    const day = localDateIn(left.startsAt, timeZone).localeCompare(
      localDateIn(right.startsAt, timeZone),
    );

    return day === 0 ? startOfEntry(left) - startOfEntry(right) : day;
  });
