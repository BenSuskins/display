import { describe, expect, test } from "bun:test";

import { readConfig } from "../src/config";

const complete = {
  HUXLEY_BASE_URL: "https://huxley2.azurewebsites.net",
  DARWIN_ACCESS_TOKEN: "a-token",
  STATION_ORIGIN: "KEL",
  STATION_DESTINATION: "LST",
  DEVICE_TOKEN: "device-secret",
};

const configOrThrow = (env: Record<string, string | undefined>) => {
  const result = readConfig(env);
  if (!result.ok) throw new Error(result.failure.detail);
  return result.value;
};

describe("readConfig", () => {
  test("reads the departure settings", () => {
    const config = configOrThrow(complete);

    expect(config.departures.originCrs).toBe("KEL");
    expect(config.departures.destinationCrs).toBe("LST");
    expect(config.departures.accessToken).toBe("a-token");
  });

  test("defaults the lead time short enough to include a train worth running for", () => {
    expect(configOrThrow(complete).departures.minimumLeadMinutes).toBe(5);
  });

  test("lets the lead time be overridden", () => {
    const config = configOrThrow({
      ...complete,
      DEPARTURE_MIN_LEAD_MINUTES: "25",
    });

    expect(config.departures.minimumLeadMinutes).toBe(25);
  });

  test("over-fetches departures so the lead time filter has room", () => {
    expect(configOrThrow(complete).departures.rows).toBeGreaterThan(
      configOrThrow(complete).departures.shown,
    );
  });

  test("defaults the commute window to 06:00–09:00", () => {
    const { daypart } = configOrThrow(complete);

    expect(daypart.commuteStartsAtMinute).toBe(6 * 60);
    expect(daypart.commuteEndsAtMinute).toBe(9 * 60);
    expect(daypart.timeZone).toBe("Europe/London");
  });

  test("wakes densely for exactly the window that shows trains", () => {
    // Two settings that must never disagree, so only one of them is a setting.
    const { wake, daypart } = configOrThrow(complete);

    expect(wake.denseWindowStartsAtMinute).toBe(daypart.commuteStartsAtMinute);
    expect(wake.denseWindowEndsAtMinute).toBe(daypart.commuteEndsAtMinute);
    expect(wake.denseIntervalMinutes).toBe(10);
    expect(wake.timeZone).toBe("Europe/London");
  });

  test("lets the commute window be moved, and moves the dense wakes with it", () => {
    const { wake, daypart } = configOrThrow({
      ...complete,
      COMMUTE_STARTS_AT: "07:15",
      COMMUTE_ENDS_AT: "10:00",
    });

    expect(daypart.commuteStartsAtMinute).toBe(7 * 60 + 15);
    expect(daypart.commuteEndsAtMinute).toBe(10 * 60);
    expect(wake.denseWindowStartsAtMinute).toBe(7 * 60 + 15);
    expect(wake.denseWindowEndsAtMinute).toBe(10 * 60);
  });

  test("takes the time zone for both schedules from TZ", () => {
    const config = configOrThrow({ ...complete, TZ: "Europe/Dublin" });

    expect(config.timeZone).toBe("Europe/Dublin");
    expect(config.daypart.timeZone).toBe("Europe/Dublin");
    expect(config.wake.timeZone).toBe("Europe/Dublin");
  });

  test("never schedules a sleep long enough to drift", () => {
    const { wake } = configOrThrow(complete);

    expect(wake.defaultIntervalMinutes).toBeLessThanOrEqual(30);
  });

  describe("refusals", () => {
    test("refuses to start without a device token", () => {
      const result = readConfig({ ...complete, DEVICE_TOKEN: undefined });

      expect(result).toEqual({
        ok: false,
        failure: { kind: "missing", detail: "DEVICE_TOKEN is required" },
      });
    });

    test("refuses to start without a Darwin token", () => {
      const result = readConfig({
        ...complete,
        DARWIN_ACCESS_TOKEN: undefined,
      });

      expect(result.ok).toBe(false);
    });

    test("refuses a lead time that is not a number", () => {
      const result = readConfig({
        ...complete,
        DEPARTURE_MIN_LEAD_MINUTES: "soon",
      });

      expect(result.ok).toBe(false);
    });

    test("refuses a negative lead time", () => {
      const result = readConfig({
        ...complete,
        DEPARTURE_MIN_LEAD_MINUTES: "-5",
      });

      expect(result.ok).toBe(false);
    });

    test("refuses a commute window time that is not a clock time", () => {
      expect(readConfig({ ...complete, COMMUTE_STARTS_AT: "6am" }).ok).toBe(
        false,
      );
      expect(readConfig({ ...complete, COMMUTE_STARTS_AT: "25:00" }).ok).toBe(
        false,
      );
      expect(readConfig({ ...complete, COMMUTE_ENDS_AT: "09:70" }).ok).toBe(
        false,
      );
    });

    test("refuses a commute window that ends before it starts", () => {
      const result = readConfig({
        ...complete,
        COMMUTE_STARTS_AT: "09:00",
        COMMUTE_ENDS_AT: "06:00",
      });

      expect(result).toEqual({
        ok: false,
        failure: {
          kind: "invalid",
          detail:
            "COMMUTE_ENDS_AT must be later in the day than COMMUTE_STARTS_AT",
        },
      });
    });

    test("refuses a commute window of no length at all", () => {
      const result = readConfig({
        ...complete,
        COMMUTE_STARTS_AT: "07:00",
        COMMUTE_ENDS_AT: "07:00",
      });

      expect(result.ok).toBe(false);
    });
  });
});
