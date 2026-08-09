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

// 13:30 local on Monday 10 August, in British Summer Time.
const Now = new Date("2026-08-10T12:30:00Z");

const request = (
  dashboard: unknown,
  calendar: unknown = { events: [] },
  userList: unknown = users,
) => ({
  dashboard,
  calendars: [calendar],
  users: userList,
  now: Now,
  timeZone: "Europe/London",
});

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

    test("keeps a late event in today until the local day is actually over", () => {
      // 22:30 local is still the 10th, though it is the 11th in UTC.
      const entries = eventsOf([
        { Title: "Late film", StartTime: "2026-08-10T21:30:00Z" },
      ]);

      expect(entries.map((entry) => entry.title)).toEqual(["Late film"]);
    });
  });

  describe("the week ahead", () => {
    const upcomingOf = (events: readonly unknown[]) =>
      parseOrThrow(request({}, { events })).upcoming;

    test("holds the days after today, and not today itself", () => {
      const titles = upcomingOf([
        { Title: "Dentist", StartTime: "2026-08-10T13:00:00Z" },
        { Title: "Bin day", StartTime: "2026-08-11T06:00:00Z" },
      ]).map((entry) => entry.title);

      expect(titles).toEqual(["Bin day"]);
    });

    test("reaches seven days out and no further", () => {
      const titles = upcomingOf([
        { Title: "Seventh day", StartTime: "2026-08-17T09:00:00Z" },
        { Title: "Eighth day", StartTime: "2026-08-18T09:00:00Z" },
      ]).map((entry) => entry.title);

      expect(titles).toEqual(["Seventh day"]);
    });

    test("runs day by day, with each day's all-day items first", () => {
      // The rule that lifts all-day items to the top belongs inside a day.
      // Applied across the week it would hoist Friday above tomorrow morning.
      const titles = upcomingOf([
        { Title: "Book club", StartTime: "2026-08-12T18:00:00Z" },
        { Title: "Sam away", StartTime: "2026-08-14T00:00:00Z", AllDay: true },
        { Title: "Bin day", StartTime: "2026-08-11T06:00:00Z" },
        { Title: "Half term", StartTime: "2026-08-12T00:00:00Z", AllDay: true },
      ]).map((entry) => entry.title);

      expect(titles).toEqual(["Bin day", "Half term", "Book club", "Sam away"]);
    });

    test("counts an event appearing in two calendars once", () => {
      // The two week windows the source fetches do not overlap, but nothing
      // about the parse should depend on that.
      const event = { Title: "Bin day", StartTime: "2026-08-11T06:00:00Z" };
      const parsed = parseOrThrow({
        dashboard: {},
        calendars: [{ events: [event] }, { events: [event] }],
        users,
        now: Now,
        timeZone: "Europe/London",
      });

      expect(parsed.upcoming.map((entry) => entry.title)).toEqual(["Bin day"]);
    });

    test("takes today and the week from whichever calendar carries them", () => {
      const parsed = parseOrThrow({
        dashboard: {},
        calendars: [
          { events: [{ Title: "Dentist", StartTime: "2026-08-10T13:00:00Z" }] },
          { events: [{ Title: "Book club", StartTime: "2026-08-13T18:00:00Z" }] },
        ],
        users,
        now: Now,
        timeZone: "Europe/London",
      });

      expect(parsed.today.map((entry) => entry.title)).toEqual(["Dentist"]);
      expect(parsed.upcoming.map((entry) => entry.title)).toEqual(["Book club"]);
    });
  });

  describe("awkward payloads", () => {
    test("an empty dashboard parses to a quiet household", () => {
      expect(parseOrThrow(request({}))).toEqual({
        choresDueToday: [],
        overdueChoreCount: 0,
        today: [],
        upcoming: [],
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
