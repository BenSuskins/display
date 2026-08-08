import { describe, expect, test } from "bun:test";

import {
  secondsUntilNextWake,
  type WakeSchedule,
} from "../../src/domain/wakeSchedule";

// The dense window is the commute window — config derives one from the other,
// so trains are never on the Panel without dense wakes keeping them fresh.
const schedule: WakeSchedule = {
  timeZone: "Europe/London",
  denseWindowStartsAtMinute: 6 * 60,
  denseWindowEndsAtMinute: 9 * 60,
  denseIntervalMinutes: 10,
  defaultIntervalMinutes: 30,
  lowBatteryVolts: 3.5,
  lowBatteryIntervalMinutes: 120,
};

const utc = (iso: string): Date => new Date(iso);

const minutesUntilNextWake = (now: Date, batteryVolts = 3.9): number =>
  secondsUntilNextWake({ now, batteryVolts, schedule }) / 60;

describe("secondsUntilNextWake", () => {
  test("wakes every ten minutes inside the commute window", () => {
    expect(minutesUntilNextWake(utc("2026-08-10T05:40:00Z"))).toBe(10);
  });

  test("wakes every thirty minutes outside it", () => {
    expect(minutesUntilNextWake(utc("2026-08-10T13:00:00Z"))).toBe(30);
  });

  test("wakes overnight too, so no single sleep is long enough to drift", () => {
    expect(minutesUntilNextWake(utc("2026-08-10T23:00:00Z"))).toBe(30);
  });

  test("lands on the start of the commute window rather than sleeping past it", () => {
    // 04:45 UTC is 05:45 local. A default 30 minute sleep would wake at 06:15,
    // a quarter of an hour into the window and after the first look at the
    // display.
    expect(minutesUntilNextWake(utc("2026-08-10T04:45:00Z"))).toBe(15);
  });

  test("does not shorten a sleep that already ends before the window", () => {
    expect(minutesUntilNextWake(utc("2026-08-10T04:00:00Z"))).toBe(30);
  });

  describe("British Summer Time", () => {
    test("treats 06:30 local as the commute window in summer", () => {
      expect(minutesUntilNextWake(utc("2026-08-10T05:30:00Z"))).toBe(10);
    });

    test("treats the same UTC instant as outside it in winter", () => {
      // 05:30 UTC is 05:30 local in January — half an hour before the window
      // opens, so a full default sleep still lands on it.
      expect(minutesUntilNextWake(utc("2026-01-12T05:30:00Z"))).toBe(30);
    });

    test("treats 06:30 local as the commute window in winter", () => {
      expect(minutesUntilNextWake(utc("2026-01-12T06:30:00Z"))).toBe(10);
    });
  });

  describe("low battery", () => {
    test("stretches the interval once the battery is low", () => {
      expect(minutesUntilNextWake(utc("2026-08-10T13:00:00Z"), 3.4)).toBe(120);
    });

    test("stretches it during the commute window too", () => {
      expect(minutesUntilNextWake(utc("2026-08-10T05:40:00Z"), 3.4)).toBe(120);
    });

    test("does not stretch it at exactly the threshold", () => {
      expect(minutesUntilNextWake(utc("2026-08-10T13:00:00Z"), 3.5)).toBe(30);
    });

    test("still wakes normally when the device reports no battery reading", () => {
      expect(
        secondsUntilNextWake({
          now: utc("2026-08-10T13:00:00Z"),
          schedule,
        }) / 60,
      ).toBe(30);
    });
  });
});
