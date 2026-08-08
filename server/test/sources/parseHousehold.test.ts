import { describe, expect, test } from "bun:test";

import { parseHousehold } from "../../src/sources/familyHubHouseholdSource";

// Field names are PascalCase because Family Hub's Go models carry no json tags.
// Verified by marshalling the real structs.
const chore = (name: string, assignedToUserID: string | null = null) => ({
  ID: "c1",
  Name: name,
  AssignedToUserID: assignedToUserID,
  DueDate: "2026-08-10T18:00:00Z",
  Status: "pending",
});

const users = [
  { ID: "u1", Name: "Ben", Role: "admin" },
  { ID: "u2", Name: "Sam", Role: "member" },
];

const parseOrThrow = (request: Parameters<typeof parseHousehold>[0]) => {
  const result = parseHousehold(request);
  if (!result.ok) throw new Error(JSON.stringify(result.failure));
  return result.value;
};

const request = (
  dashboard: unknown,
  calendar: unknown = { events: [] },
  userList: unknown = users,
) => ({ dashboard, calendar, users: userList });

describe("parseHousehold", () => {
  test("reads chores due today", () => {
    const parsed = parseOrThrow(
      request({ chores_due_today_list: [chore("Bins", "u1")] }),
    );

    expect(parsed.choresDueToday).toEqual([{ name: "Bins", assignedTo: "Ben" }]);
  });

  test("resolves the assignee id to a person's name", () => {
    const parsed = parseOrThrow(
      request({
        chores_due_today_list: [chore("Bins", "u1"), chore("Hoover", "u2")],
      }),
    );

    expect(parsed.choresDueToday.map((one) => one.assignedTo)).toEqual([
      "Ben",
      "Sam",
    ]);
  });

  test("leaves an unassigned chore without a name rather than inventing one", () => {
    const parsed = parseOrThrow(request({ chores_due_today_list: [chore("Bins")] }));

    expect(parsed.choresDueToday).toEqual([{ name: "Bins" }]);
  });

  test("leaves an unknown assignee id unresolved", () => {
    const parsed = parseOrThrow(
      request({ chores_due_today_list: [chore("Bins", "ghost")] }),
    );

    expect(parsed.choresDueToday).toEqual([{ name: "Bins" }]);
  });

  test("counts overdue chores", () => {
    const parsed = parseOrThrow(
      request({ chores_overdue_list: [chore("Gutters"), chore("Filter")] }),
    );

    expect(parsed.overdueChoreCount).toBe(2);
  });

  test("picks dinner out of the day's meals", () => {
    const parsed = parseOrThrow(
      request({
        today_meals: [
          { Date: "2026-08-10", MealType: "lunch", Name: "Soup" },
          { Date: "2026-08-10", MealType: "dinner", Name: "Chicken traybake" },
        ],
      }),
    );

    expect(parsed.dinner).toBe("Chicken traybake");
  });

  test("has no dinner when only other meals are planned", () => {
    const parsed = parseOrThrow(
      request({
        today_meals: [{ Date: "2026-08-10", MealType: "lunch", Name: "Soup" }],
      }),
    );

    expect(parsed.dinner).toBeUndefined();
  });

  describe("today's events", () => {
    const eventsOf = (events: readonly unknown[]) =>
      parseOrThrow(request({}, { events })).today;

    test("reads title and start time", () => {
      const [entry] = eventsOf([
        { ID: "e1", Title: "Dentist", StartTime: "2026-08-10T13:00:00Z", AllDay: false },
      ]);

      expect(entry?.title).toBe("Dentist");
      expect(entry?.startsAt).toEqual(new Date("2026-08-10T13:00:00Z"));
      expect(entry?.allDay).toBe(false);
    });

    test("orders by start time", () => {
      const titles = eventsOf([
        { Title: "Book club", StartTime: "2026-08-10T19:00:00Z" },
        { Title: "Standup", StartTime: "2026-08-10T09:00:00Z" },
        { Title: "Dentist", StartTime: "2026-08-10T13:00:00Z" },
      ]).map((entry) => entry.title);

      expect(titles).toEqual(["Standup", "Dentist", "Book club"]);
    });

    test("puts all-day items first, since they have no time to sort by", () => {
      const titles = eventsOf([
        { Title: "Standup", StartTime: "2026-08-10T09:00:00Z" },
        { Title: "Bank holiday", StartTime: "2026-08-10T00:00:00Z", AllDay: true },
      ]).map((entry) => entry.title);

      expect(titles).toEqual(["Bank holiday", "Standup"]);
    });

    test("skips an event with an unreadable start rather than failing", () => {
      const entries = eventsOf([
        { Title: "Broken", StartTime: "not a time" },
        { Title: "Fine", StartTime: "2026-08-10T09:00:00Z" },
      ]);

      expect(entries.map((entry) => entry.title)).toEqual(["Fine"]);
    });
  });

  describe("awkward payloads", () => {
    test("an empty dashboard parses to a quiet household", () => {
      expect(parseOrThrow(request({}))).toEqual({
        choresDueToday: [],
        overdueChoreCount: 0,
        today: [],
      });
    });

    test("null lists are treated as empty", () => {
      const parsed = parseOrThrow(
        request({ chores_due_today_list: null, chores_overdue_list: null }),
      );

      expect(parsed.choresDueToday).toEqual([]);
      expect(parsed.overdueChoreCount).toBe(0);
    });

    test("a dashboard that is not an object is a malformed failure", () => {
      expect(parseHousehold(request("nope")).ok).toBe(false);
    });

    test("a missing users list leaves assignees unresolved but keeps the chores", () => {
      const parsed = parseOrThrow(
        request({ chores_due_today_list: [chore("Bins", "u1")] }, { events: [] }, null),
      );

      expect(parsed.choresDueToday).toEqual([{ name: "Bins" }]);
    });
  });
});
