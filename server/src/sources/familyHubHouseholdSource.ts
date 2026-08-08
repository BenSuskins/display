import {
  inDayOrder,
  type CalendarEntry,
  type Chore,
  type Household,
} from "../domain/household";
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

export type ParseHouseholdRequest = {
  readonly dashboard: unknown;
  readonly calendar: unknown;
  readonly users: unknown;
};

export const parseHousehold = ({
  dashboard,
  calendar,
  users,
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

  const today = isRecord(calendar)
    ? inDayOrder(
        readArray(calendar["events"]).flatMap((candidate) => {
          const event = readEvent(candidate);
          return event === undefined ? [] : [event];
        }),
      )
    : [];

  return succeed({
    choresDueToday,
    overdueChoreCount: readArray(dashboard["chores_overdue_list"]).length,
    today,
    ...(dinner === undefined ? {} : { dinner }),
  });
};

export type FamilyHubConfig = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly timeZone: string;
  readonly fetch?: typeof globalThis.fetch;
};

const localDate = (moment: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(moment);

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
      try {
        // Three calls, because no single endpoint covers it: the dashboard has
        // chores and meals but no events, the calendar has events but no
        // overdue chores, and chores name their assignee only by id.
        const [dashboard, calendar, users] = await Promise.all([
          get("/api/dashboard"),
          get(`/api/calendar?view=day&date=${localDate(now, timeZone)}`),
          get("/api/users"),
        ]);

        return parseHousehold({ dashboard, calendar, users });
      } catch (cause) {
        return fail({
          kind: "unreachable",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
};
