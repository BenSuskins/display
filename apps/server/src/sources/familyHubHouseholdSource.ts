import {
  inCalendarOrder,
  inDayOrder,
  UpcomingDays,
  type CalendarEntry,
  type Chore,
  type Household,
} from "../domain/household";
import { dateDaysAfter, localDateIn } from "../domain/localTime";
import { fail, succeed, type Result } from "../domain/result";
import type { SourceFailure } from "./departureSource";
import type { HouseholdSource } from "./householdSource";

// Family Hub's models carry no json tags, so Go marshals them with the Go field
// names — PascalCase. Only the dashboard's own wrapper keys are snake_case.
// Verified by marshalling the real structs, not assumed.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const readArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const readChore = (
  candidate: unknown,
  nameOfUser: (id: string) => string | undefined,
): Chore | undefined => {
  if (!isRecord(candidate)) return undefined;

  const name = readString(candidate["Name"]);
  if (name === undefined) return undefined;

  const assignedToId = readString(candidate["AssignedToUserID"]);
  const assignedTo =
    assignedToId === undefined ? undefined : nameOfUser(assignedToId);

  return assignedTo === undefined ? { name } : { name, assignedTo };
};

const readEvent = (candidate: unknown): CalendarEntry | undefined => {
  if (!isRecord(candidate)) return undefined;

  const title = readString(candidate["Title"]);
  const startsAtText = readString(candidate["StartTime"]);
  if (title === undefined || startsAtText === undefined) return undefined;

  const startsAt = new Date(startsAtText);
  if (Number.isNaN(startsAt.getTime())) return undefined;

  return { title, startsAt, allDay: candidate["AllDay"] === true };
};

const dinnerFrom = (meals: readonly unknown[]): string | undefined => {
  const dinner = meals.find(
    (meal) => isRecord(meal) && meal["MealType"] === "dinner",
  );
  return isRecord(dinner) ? readString(dinner["Name"]) : undefined;
};

const namesById = (users: unknown): ReadonlyMap<string, string> =>
  new Map(
    readArray(users).flatMap((user) => {
      if (!isRecord(user)) return [];
      const id = readString(user["ID"]);
      const name = readString(user["Name"]);
      return id === undefined || name === undefined ? [] : [[id, name]];
    }),
  );

/**
 * Every readable event across however many calendar payloads were fetched.
 *
 * Keyed by start and title, so an event that turns up in two payloads is still
 * one event. The caller fetches whole weeks rather than an exact window, and
 * this is what makes that free to do.
 */
const eventsIn = (calendars: readonly unknown[]): readonly CalendarEntry[] => {
  const byIdentity = new Map<string, CalendarEntry>();

  for (const calendar of calendars) {
    if (!isRecord(calendar)) continue;

    for (const candidate of readArray(calendar["events"])) {
      const event = readEvent(candidate);
      if (event === undefined) continue;

      byIdentity.set(`${event.startsAt.getTime()} ${event.title}`, event);
    }
  }

  return [...byIdentity.values()];
};

export type ParseHouseholdRequest = {
  readonly dashboard: unknown;
  /** One payload per calendar range fetched. Between them they must cover
   * today and the next `UpcomingDays`; anything further out is ignored. */
  readonly calendars: readonly unknown[];
  readonly users: unknown;
  readonly now: Date;
  readonly timeZone: string;
};

export const parseHousehold = ({
  dashboard,
  calendars,
  users,
  now,
  timeZone,
}: ParseHouseholdRequest): Result<Household, SourceFailure> => {
  if (!isRecord(dashboard)) {
    return fail({ kind: "malformed", detail: "dashboard was not an object" });
  }

  const names = namesById(users);
  const nameOfUser = (id: string) => names.get(id);

  const choresDueToday = readArray(dashboard["chores_due_today_list"]).flatMap(
    (candidate) => {
      const chore = readChore(candidate, nameOfUser);
      return chore === undefined ? [] : [chore];
    },
  );

  const dinner = dinnerFrom(readArray(dashboard["today_meals"]));

  const todayDate = localDateIn(now, timeZone);
  const lastUpcomingDate = dateDaysAfter(todayDate, UpcomingDays);

  // Split by the calendar date the event starts on rather than by elapsed
  // hours: an event at 23:00 tonight belongs to today even at 23:30, and one at
  // 08:00 tomorrow is not "in six hours", it is tomorrow.
  const events = eventsIn(calendars);
  const dateOf = (entry: CalendarEntry) => localDateIn(entry.startsAt, timeZone);

  const upcoming = events.filter((entry) => {
    const date = dateOf(entry);
    return date > todayDate && date <= lastUpcomingDate;
  });

  return succeed({
    choresDueToday,
    overdueChoreCount: readArray(dashboard["chores_overdue_list"]).length,
    today: inDayOrder(events.filter((entry) => dateOf(entry) === todayDate)),
    upcoming: inCalendarOrder(upcoming, timeZone),
    ...(dinner === undefined ? {} : { dinner }),
  });
};

export type FamilyHubConfig = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly timeZone: string;
  readonly fetch?: typeof globalThis.fetch;
};

export const familyHubHouseholdSource = ({
  baseUrl,
  accessToken,
  timeZone,
  fetch = globalThis.fetch,
}: FamilyHubConfig): HouseholdSource => {
  const get = async (path: string): Promise<unknown> => {
    const response = await fetch(new URL(path, baseUrl), {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`family hub answered ${response.status} for ${path}`);
    }
    return response.json();
  };

  return {
    household: async (now) => {
      const today = localDateIn(now, timeZone);

      try {
        // No single endpoint covers this: the dashboard has chores and meals
        // but no events, the calendar has events but no overdue chores, and
        // chores name their assignee only by id.
        //
        // Two calendar calls, because the week view is anchored to the Monday
        // of whichever week the date falls in. This week alone runs out on a
        // Monday — it would reach only six days ahead — so the smallest range
        // that always covers today plus seven days is this week and the next.
        const [dashboard, thisWeek, nextWeek, users] = await Promise.all([
          get("/api/dashboard"),
          get(`/api/calendar?view=week&date=${today}`),
          get(`/api/calendar?view=week&date=${dateDaysAfter(today, UpcomingDays)}`),
          get("/api/users"),
        ]);

        return parseHousehold({
          dashboard,
          calendars: [thisWeek, nextWeek],
          users,
          now,
          timeZone,
        });
      } catch (cause) {
        return fail({
          kind: "unreachable",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
};
