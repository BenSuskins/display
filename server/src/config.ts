import type { DaypartSchedule } from "./domain/daypart";
import { fail, succeed, type Result } from "./domain/result";
import type { WakeSchedule } from "./domain/wakeSchedule";

export type ConfigFailure = {
  readonly kind: "missing" | "invalid";
  readonly detail: string;
};

export type DepartureConfig = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly originCrs: string;
  readonly destinationCrs: string;
  /** How many the board is asked for — more than are shown, so the Catchable
   * filter still has candidates left after discarding the imminent ones. */
  readonly rows: number;
  readonly shown: number;
  readonly minimumLeadMinutes: number;
};

/** Absent means the source is not set up; its zone says so and the rest of the
 * Frame is unaffected. Refusing to boot would take the working zones down too. */
export type WeatherConfig = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly latitude: number;
  readonly longitude: number;
};

export type HouseholdConfig = {
  readonly baseUrl: string;
  readonly accessToken: string;
};

export type Config = {
  readonly port: number;
  readonly deviceToken: string;
  readonly timeZone: string;
  readonly departures: DepartureConfig;
  readonly weather?: WeatherConfig;
  readonly household?: HouseholdConfig;
  readonly daypart: DaypartSchedule;
  readonly wake: WakeSchedule;
};

type Environment = Record<string, string | undefined>;

const required = (
  env: Environment,
  name: string,
): Result<string, ConfigFailure> => {
  const value = env[name];
  return value === undefined || value === ""
    ? fail({ kind: "missing", detail: `${name} is required` })
    : succeed(value);
};

const positiveNumber = (
  env: Environment,
  name: string,
  fallback: number,
): Result<number, ConfigFailure> => {
  const value = env[name];
  if (value === undefined || value === "") return succeed(fallback);

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? succeed(parsed)
    : fail({
        kind: "invalid",
        detail: `${name} must be a positive number, got "${value}"`,
      });
};

const LocalTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A local wall-clock time like `06:00`, as minutes past midnight. */
const minuteOfDay = (
  env: Environment,
  name: string,
  fallback: number,
): Result<number, ConfigFailure> => {
  const value = env[name];
  if (value === undefined || value === "") return succeed(fallback);

  const match = LocalTimePattern.exec(value);
  const [, hour, minute] = match ?? [];

  return hour === undefined || minute === undefined
    ? fail({
        kind: "invalid",
        detail: `${name} must be a local time like "06:00", got "${value}"`,
      })
    : succeed(Number(hour) * 60 + Number(minute));
};

const DefaultTimeZone = "Europe/London";

/**
 * 06:00–09:00 local. One window with two consumers: it decides when the Frame
 * shows trains, and when the Device wakes densely enough to keep that board
 * worth reading. Deriving the second from the first is deliberate — a Panel
 * showing departures it only refreshes every half hour is worse than one
 * showing something else.
 */
const DefaultCommuteWindow = {
  startsAtMinute: 6 * 60,
  endsAtMinute: 9 * 60,
} as const;

const WakeIntervals = {
  denseIntervalMinutes: 10,
  defaultIntervalMinutes: 30,
  lowBatteryVolts: 3.5,
  lowBatteryIntervalMinutes: 120,
} as const satisfies Omit<
  WakeSchedule,
  "timeZone" | "denseWindowStartsAtMinute" | "denseWindowEndsAtMinute"
>;

/**
 * Everything the Render Service needs, from the environment. Ansible injects
 * these at deploy; nothing here has a secret as a default.
 */
export const readConfig = (env: Environment): Result<Config, ConfigFailure> => {
  const deviceToken = required(env, "DEVICE_TOKEN");
  if (!deviceToken.ok) return deviceToken;

  const accessToken = required(env, "DARWIN_ACCESS_TOKEN");
  if (!accessToken.ok) return accessToken;

  const minimumLeadMinutes = positiveNumber(
    env,
    "DEPARTURE_MIN_LEAD_MINUTES",
    5,
  );
  if (!minimumLeadMinutes.ok) return minimumLeadMinutes;

  const port = positiveNumber(env, "PORT", 8080);
  if (!port.ok) return port;

  const commuteStartsAt = minuteOfDay(
    env,
    "COMMUTE_STARTS_AT",
    DefaultCommuteWindow.startsAtMinute,
  );
  if (!commuteStartsAt.ok) return commuteStartsAt;

  const commuteEndsAt = minuteOfDay(
    env,
    "COMMUTE_ENDS_AT",
    DefaultCommuteWindow.endsAtMinute,
  );
  if (!commuteEndsAt.ok) return commuteEndsAt;

  // A window that ends before it starts would leave the Frame with no Daypart
  // it could ever be in, and the Device waking densely for a window it never
  // enters. Cheaper to refuse than to explain later.
  if (commuteEndsAt.value <= commuteStartsAt.value) {
    return fail({
      kind: "invalid",
      detail: "COMMUTE_ENDS_AT must be later in the day than COMMUTE_STARTS_AT",
    });
  }

  // Kelvedon. Only a starting point — override for wherever the display lives.
  const latitude = positiveNumber(env, "HOME_LATITUDE", 51.8382);
  if (!latitude.ok) return latitude;
  const longitude = positiveNumber(env, "HOME_LONGITUDE", 0.7018);
  if (!longitude.ok) return longitude;

  const metToken = env["MET_ACCESS_TOKEN"];
  const hubToken = env["HUB_ACCESS_TOKEN"];
  const hubBaseUrl = env["HUB_BASE_URL"];
  const timeZone = env["TZ"] ?? DefaultTimeZone;

  return succeed({
    port: port.value,
    deviceToken: deviceToken.value,
    timeZone,
    departures: {
      baseUrl: env["HUXLEY_BASE_URL"] ?? "https://huxley2.azurewebsites.net",
      accessToken: accessToken.value,
      originCrs: env["STATION_ORIGIN"] ?? "KEL",
      destinationCrs: env["STATION_DESTINATION"] ?? "LST",
      rows: 8,
      shown: 3,
      minimumLeadMinutes: minimumLeadMinutes.value,
    },
    ...(metToken === undefined || metToken === ""
      ? {}
      : {
          weather: {
            baseUrl:
              env["MET_BASE_URL"] ?? "https://data.hub.api.metoffice.gov.uk",
            accessToken: metToken,
            latitude: latitude.value,
            longitude: longitude.value,
          },
        }),
    ...(hubToken === undefined ||
    hubToken === "" ||
    hubBaseUrl === undefined ||
    hubBaseUrl === ""
      ? {}
      : { household: { baseUrl: hubBaseUrl, accessToken: hubToken } }),
    daypart: {
      timeZone,
      commuteStartsAtMinute: commuteStartsAt.value,
      commuteEndsAtMinute: commuteEndsAt.value,
    },
    wake: {
      ...WakeIntervals,
      timeZone,
      // The dense window is the commute window, not a second opinion about it.
      denseWindowStartsAtMinute: commuteStartsAt.value,
      denseWindowEndsAtMinute: commuteEndsAt.value,
    },
  });
};
