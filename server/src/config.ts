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

export type Config = {
  readonly port: number;
  readonly deviceToken: string;
  readonly departures: DepartureConfig;
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

const DefaultWakeSchedule = {
  timeZone: "Europe/London",
  denseWindowStartsAtMinute: 6 * 60 + 30,
  denseWindowEndsAtMinute: 8 * 60,
  denseIntervalMinutes: 10,
  defaultIntervalMinutes: 30,
  lowBatteryVolts: 3.5,
  lowBatteryIntervalMinutes: 120,
} as const satisfies WakeSchedule;

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
    15,
  );
  if (!minimumLeadMinutes.ok) return minimumLeadMinutes;

  const port = positiveNumber(env, "PORT", 8080);
  if (!port.ok) return port;

  return succeed({
    port: port.value,
    deviceToken: deviceToken.value,
    departures: {
      baseUrl: env["HUXLEY_BASE_URL"] ?? "https://huxley2.azurewebsites.net",
      accessToken: accessToken.value,
      originCrs: env["STATION_ORIGIN"] ?? "KEL",
      destinationCrs: env["STATION_DESTINATION"] ?? "LST",
      rows: 8,
      shown: 3,
      minimumLeadMinutes: minimumLeadMinutes.value,
    },
    wake: {
      ...DefaultWakeSchedule,
      timeZone: env["TZ"] ?? DefaultWakeSchedule.timeZone,
    },
  });
};
