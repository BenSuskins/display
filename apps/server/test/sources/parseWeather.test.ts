import { describe, expect, test } from "bun:test";

import { parseWeather } from "../../src/sources/metOfficeWeatherSource";

const geoJson = (timeSeries: readonly unknown[]) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [0.5, 51.8] },
      properties: { location: { name: "Kelvedon" }, timeSeries },
    },
  ],
});

const hour = (
  time: string,
  screenTemperature: number,
  significantWeatherCode = 7,
  probOfPrecipitation = 0,
) => ({ time, screenTemperature, significantWeatherCode, probOfPrecipitation });

const Now = new Date("2026-08-10T12:30:00Z"); // 13:30 local, BST

const hourly = geoJson([
  hour("2026-08-10T11:00Z", 17.2, 7, 5),
  hour("2026-08-10T12:00Z", 18.4, 7, 10),
  hour("2026-08-10T13:00Z", 19.1, 12, 40),
  hour("2026-08-10T14:00Z", 19.8, 15, 70),
]);

const daily = geoJson([
  {
    time: "2026-08-10T00:00Z",
    dayMaxScreenTemperature: 21.4,
    nightMinScreenTemperature: 12.6,
  },
]);

const parseOrThrow = (
  overrides: Partial<Parameters<typeof parseWeather>[0]> = {},
) => {
  const result = parseWeather({
    hourly,
    daily,
    now: Now,
    timeZone: "Europe/London",
    ...overrides,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.failure));
  return result.value;
};

describe("parseWeather", () => {
  test("takes the temperature from the hour we are in, not the first hour available", () => {
    // 12:30 UTC sits in the 12:00 hour, not the 11:00 one the series starts at.
    expect(parseOrThrow().temperatureCelsius).toBe(18);
  });

  test("reads the condition from the significant weather code", () => {
    expect(parseOrThrow().label).toBe("Cloudy");
    expect(parseOrThrow().condition).toBe("cloudy");
  });

  test("reads the high and low from the daily product", () => {
    const weather = parseOrThrow();

    expect(weather.maximumCelsius).toBe(21);
    expect(weather.minimumCelsius).toBe(13);
  });

  describe("the rain outlook", () => {
    test("reports the next hour worth carrying a coat for", () => {
      expect(parseOrThrow().nextRain).toEqual({
        probabilityPercent: 40,
        at: new Date("2026-08-10T13:00Z"),
      });
    });

    test("ignores a low chance of rain, which is never absent from a forecast", () => {
      const quiet = geoJson([
        hour("2026-08-10T12:00Z", 18.4, 7, 10),
        hour("2026-08-10T13:00Z", 19.1, 7, 15),
      ]);

      expect(parseOrThrow({ hourly: quiet }).nextRain).toBeUndefined();
    });

    test("ignores rain that has already passed", () => {
      const passed = geoJson([
        hour("2026-08-10T11:00Z", 17.2, 15, 90),
        hour("2026-08-10T12:00Z", 18.4, 7, 5),
      ]);

      expect(parseOrThrow({ hourly: passed }).nextRain).toBeUndefined();
    });

    test("ignores rain that falls tomorrow", () => {
      const tomorrow = geoJson([
        hour("2026-08-10T12:00Z", 18.4, 7, 5),
        hour("2026-08-11T09:00Z", 16.0, 15, 95),
      ]);

      expect(parseOrThrow({ hourly: tomorrow }).nextRain).toBeUndefined();
    });
  });

  describe("degraded payloads", () => {
    test("falls back to hourly temperatures when the daily product is missing", () => {
      // Losing the high and low should not cost the whole weather zone.
      const weather = parseOrThrow({ daily: {} });

      expect(weather.temperatureCelsius).toBe(18);
      expect(weather.maximumCelsius).toBe(20);
      expect(weather.minimumCelsius).toBe(17);
    });

    test("an unknown weather code degrades to a dash, not a crash", () => {
      const odd = geoJson([hour("2026-08-10T12:00Z", 18.4, 99, 0)]);

      expect(parseOrThrow({ hourly: odd }).label).toBe("—");
    });

    test("a payload with no timeSeries is a malformed failure", () => {
      const result = parseWeather({
        hourly: { features: [] },
        daily,
        now: Now,
        timeZone: "Europe/London",
      });

      expect(result.ok).toBe(false);
    });

    test("an empty timeSeries is a malformed failure", () => {
      const result = parseWeather({
        hourly: geoJson([]),
        daily,
        now: Now,
        timeZone: "Europe/London",
      });

      expect(result.ok).toBe(false);
    });
  });
});
