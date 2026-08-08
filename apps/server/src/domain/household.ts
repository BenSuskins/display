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
};

const startOfEntry = (entry: CalendarEntry): number =>
  entry.allDay ? -1 : entry.startsAt.getTime();

/** All-day items first, then chronological — the order you read a day in. */
export const inDayOrder = (
  entries: readonly CalendarEntry[],
): readonly CalendarEntry[] =>
  [...entries].sort((left, right) => startOfEntry(left) - startOfEntry(right));
