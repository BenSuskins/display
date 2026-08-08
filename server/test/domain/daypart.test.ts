import { describe, expect, test } from "bun:test";

import { daypartAt, type DaypartSchedule } from "../../src/domain/daypart";

const schedule: DaypartSchedule = {
  timeZone: "Europe/London",
  commuteStartsAtMinute: 6 * 60,
  commuteEndsAtMinute: 9 * 60,
};

const at = (iso: string) => daypartAt(new Date(iso), schedule);

describe("daypartAt", () => {
  test("is the commute through the morning window", () => {
    expect(at("2026-08-10T06:00:00Z")).toBe("commute"); // 07:00 local
  });

  test("is the day before the window opens", () => {
    expect(at("2026-08-10T04:30:00Z")).toBe("day"); // 05:30 local
  });

  test("is the day for the whole afternoon and evening", () => {
    expect(at("2026-08-10T13:00:00Z")).toBe("day");
    expect(at("2026-08-10T21:30:00Z")).toBe("day");
  });

  describe("the edges of the window", () => {
    test("opens on the start minute", () => {
      expect(at("2026-08-10T05:00:00Z")).toBe("commute"); // 06:00 local
    });

    test("is still the commute a minute before the end", () => {
      expect(at("2026-08-10T07:59:00Z")).toBe("commute"); // 08:59 local
    });

    test("closes on the end minute rather than a minute later", () => {
      // Half open on purpose: by 09:00 the board's first train has gone.
      expect(at("2026-08-10T08:00:00Z")).toBe("day"); // 09:00 local
    });
  });

  describe("British Summer Time", () => {
    test("reads 07:00 local as the commute in summer", () => {
      expect(at("2026-08-10T06:00:00Z")).toBe("commute");
    });

    test("reads the same UTC instant as the commute in winter too", () => {
      // 06:00 UTC is 06:00 local in January — the window has just opened.
      expect(at("2026-01-12T06:00:00Z")).toBe("commute");
    });

    test("reads 05:30 UTC as before the window in winter", () => {
      expect(at("2026-01-12T05:30:00Z")).toBe("day");
    });

    test("but as inside it in summer, when it is 06:30 local", () => {
      expect(at("2026-08-10T05:30:00Z")).toBe("commute");
    });
  });

  test("honours a window someone has moved", () => {
    const later: DaypartSchedule = {
      ...schedule,
      commuteStartsAtMinute: 7 * 60,
      commuteEndsAtMinute: 10 * 60,
    };

    // 06:30 local, inside the default window and outside this one.
    expect(daypartAt(new Date("2026-08-10T05:30:00Z"), later)).toBe("day");
    expect(daypartAt(new Date("2026-08-10T08:30:00Z"), later)).toBe("commute");
  });
});
