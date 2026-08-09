import { dateDaysAfter, localDateIn } from "../domain/localTime";
import { fail, succeed, type Result } from "../domain/result";
import {
  meaningOfWeatherCode,
  RainWorthMentioningPercent,
  type DayOutlook,
  type RainOutlook,
  type Weather,
} from "../domain/weather";
import type { SourceFailure } from "./departureSource";
import type { WeatherSource } from "./weatherSource";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * Met Office DataHub returns GeoJSON: one Feature whose properties carry a
 * timeSeries. Only the first Feature is ever populated for a point request.
 */
const timeSeriesOf = (payload: unknown): readonly unknown[] | undefined => {
  if (!isRecord(payload)) return undefined;

  const features = payload["features"];
  if (!Array.isArray(features)) return undefined;

  const first = features[0];
  if (!isRecord(first)) return undefined;

  const properties = first["properties"];
  if (!isRecord(properties)) return undefined;

  const series = properties["timeSeries"];
  return Array.isArray(series) ? series : undefined;
};

type HourlyPoint = {
  readonly at: Date;
  readonly temperatureCelsius: number;
  readonly weatherCode: number;
  readonly rainProbabilityPercent: number;
};

const readHourlyPoint = (entry: unknown): HourlyPoint | undefined => {
  if (!isRecord(entry)) return undefined;

  const time = typeof entry["time"] === "string" ? new Date(entry["time"]) : undefined;
  if (time === undefined || Number.isNaN(time.getTime())) return undefined;

  const temperature = readNumber(entry["screenTemperature"]);
  if (temperature === undefined) return undefined;

  return {
    at: time,
    temperatureCelsius: temperature,
    weatherCode: readNumber(entry["significantWeatherCode"]) ?? -1,
    rainProbabilityPercent: readNumber(entry["probOfPrecipitation"]) ?? 0,
  };
};

/**
 * The daily product's entry for one calendar date, if it carries one. Its
 * `time` is midnight UTC, which is the same local date everywhere the Render
 * Service is ever going to run.
 */
const dailyRecordFor = (
  daily: unknown,
  isoDate: string,
  timeZone: string,
): Record<string, unknown> | undefined => {
  const found = timeSeriesOf(daily)?.find(
    (entry) =>
      isRecord(entry) &&
      typeof entry["time"] === "string" &&
      localDateIn(new Date(entry["time"]), timeZone) === isoDate,
  );

  return isRecord(found) ? found : undefined;
};

/**
 * A day's summary from the daily product. The high and low are what make the
 * summary worth printing, so a record missing either is no summary at all —
 * better an absent zone than "— H NaN".
 */
const readDayOutlook = (
  record: Record<string, unknown> | undefined,
): DayOutlook | undefined => {
  if (record === undefined) return undefined;

  const maximum = readNumber(record["dayMaxScreenTemperature"]);
  const minimum = readNumber(record["nightMinScreenTemperature"]);
  if (maximum === undefined || minimum === undefined) return undefined;

  const meaning = meaningOfWeatherCode(
    readNumber(record["daySignificantWeatherCode"]) ?? -1,
  );
  const rain = readNumber(record["dayProbabilityOfPrecipitation"]) ?? 0;

  return {
    condition: meaning.condition,
    label: meaning.label,
    maximumCelsius: Math.round(maximum),
    minimumCelsius: Math.round(minimum),
    ...(rain < RainWorthMentioningPercent
      ? {}
      : { rainProbabilityPercent: Math.round(rain) }),
  };
};

export type ParseWeatherRequest = {
  readonly hourly: unknown;
  readonly daily: unknown;
  readonly now: Date;
  readonly timeZone: string;
};

export const parseWeather = ({
  hourly,
  daily,
  now,
  timeZone,
}: ParseWeatherRequest): Result<Weather, SourceFailure> => {
  const hourlySeries = timeSeriesOf(hourly);
  if (hourlySeries === undefined) {
    return fail({ kind: "malformed", detail: "no hourly timeSeries" });
  }

  const points = hourlySeries.flatMap((entry) => {
    const point = readHourlyPoint(entry);
    return point === undefined ? [] : [point];
  });

  // The hour we are in, not the first hour the forecast happens to start at.
  const currentIndex = points.findLastIndex((point) => point.at <= now);
  const current = points[currentIndex === -1 ? 0 : currentIndex];
  if (current === undefined) {
    return fail({ kind: "malformed", detail: "hourly forecast was empty" });
  }

  const todayDate = localDateIn(now, timeZone);
  const isToday = (moment: Date) => localDateIn(moment, timeZone) === todayDate;

  const nextRain = points
    .filter(
      (point) =>
        point.at > now &&
        isToday(point.at) &&
        point.rainProbabilityPercent >= RainWorthMentioningPercent,
    )
    .at(0);

  const dailyRecord = dailyRecordFor(daily, todayDate, timeZone) ?? {};
  const tomorrow = readDayOutlook(
    dailyRecordFor(daily, dateDaysAfter(todayDate, 1), timeZone),
  );

  const restOfToday = points.filter((point) => isToday(point.at));
  const temperatures = restOfToday.map((point) => point.temperatureCelsius);

  const meaning = meaningOfWeatherCode(current.weatherCode);

  return succeed({
    temperatureCelsius: Math.round(current.temperatureCelsius),
    condition: meaning.condition,
    label: meaning.label,
    // Fall back to the hourly figures when the daily product is unavailable,
    // rather than losing the whole zone over a missing high and low.
    maximumCelsius: Math.round(
      readNumber(dailyRecord["dayMaxScreenTemperature"]) ??
        Math.max(...temperatures, current.temperatureCelsius),
    ),
    minimumCelsius: Math.round(
      readNumber(dailyRecord["nightMinScreenTemperature"]) ??
        Math.min(...temperatures, current.temperatureCelsius),
    ),
    ...(nextRain === undefined
      ? {}
      : {
          nextRain: {
            probabilityPercent: Math.round(nextRain.rainProbabilityPercent),
            at: nextRain.at,
          } satisfies RainOutlook,
        }),
    ...(tomorrow === undefined ? {} : { tomorrow }),
  });
};

export type MetOfficeConfig = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZone: string;
  readonly fetch?: typeof globalThis.fetch;
};

export const metOfficeWeatherSource = ({
  baseUrl,
  accessToken,
  latitude,
  longitude,
  timeZone,
  fetch = globalThis.fetch,
}: MetOfficeConfig): WeatherSource => {
  const get = async (period: "hourly" | "daily"): Promise<unknown> => {
    const url = new URL(`/sitespecific/v0/point/${period}`, baseUrl);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("excludeParameterMetadata", "true");

    const response = await fetch(url, {
      headers: { apikey: accessToken, accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`met office answered ${response.status} for ${period}`);
    }
    return response.json();
  };

  return {
    weather: async (now) => {
      try {
        // Two products: hourly carries the current conditions and the rain
        // outlook, daily carries the high and low.
        const [hourly, daily] = await Promise.all([get("hourly"), get("daily")]);
        return parseWeather({ hourly, daily, now, timeZone });
      } catch (cause) {
        return fail({
          kind: "unreachable",
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
};
