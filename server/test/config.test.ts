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

  test("defaults the lead time to the walk to Kelvedon plus slack", () => {
    expect(configOrThrow(complete).departures.minimumLeadMinutes).toBe(15);
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

  test("defaults the wake schedule to the commute window", () => {
    const { wake } = configOrThrow(complete);

    expect(wake.denseWindowStartsAtMinute).toBe(6 * 60 + 30);
    expect(wake.denseWindowEndsAtMinute).toBe(8 * 60);
    expect(wake.denseIntervalMinutes).toBe(10);
    expect(wake.timeZone).toBe("Europe/London");
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
  });
});
