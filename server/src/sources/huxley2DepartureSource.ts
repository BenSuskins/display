import type { Departure, DepartureState } from "../domain/departure";
import { fail, succeed, type Result } from "../domain/result";
import type {
  DepartureBoard,
  DepartureSource,
  SourceFailure,
} from "./departureSource";

const MinutesPerDay = 24 * 60;
const MillisecondsPerMinute = 60_000;
/**
 * A departure board looks forward, not back. A scheduled time this far behind
 * the current clock is tomorrow's, not one that left hours ago.
 */
const RolloverToleranceMinutes = 180;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const parseWallClock = (value: string): number | undefined => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2]) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;

  return hours * 60 + minutes;
};

const localMinuteOfDay = (moment: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(moment);

  const valueOf = (type: "hour" | "minute"): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return valueOf("hour") * 60 + valueOf("minute");
};

/**
 * Turns a bare "HH:MM" station-local time into an instant.
 *
 * Anchored on the caller's clock rather than the board's own `generatedAt`.
 * Huxley2 passes through a .NET DateTime that may serialise with no UTC offset
 * at all, and an offsetless timestamp is parsed as local time by JavaScript —
 * so reading the offset off that string gave zero while the instant had already
 * absorbed it, putting every departure an hour out during British Summer Time.
 *
 * The offset is never handled directly here: the difference between two local
 * wall clocks is added to a real instant, so the zone's rules do the work.
 */
const instantOfWallClock = (
  wallClockMinutes: number,
  now: Date,
  timeZone: string,
): Date => {
  const anchor =
    Math.floor(now.getTime() / MillisecondsPerMinute) * MillisecondsPerMinute;

  const minutesAhead = wallClockMinutes - localMinuteOfDay(now, timeZone);
  const dayRollover =
    minutesAhead < -RolloverToleranceMinutes ? MinutesPerDay : 0;

  return new Date(anchor + (minutesAhead + dayRollover) * MillisecondsPerMinute);
};

const parseState = (
  service: Record<string, unknown>,
  toInstant: (wallClockMinutes: number) => Date,
): DepartureState => {
  if (service["isCancelled"] === true) return { kind: "cancelled" };

  const estimated = readString(service["etd"]);
  if (estimated === undefined) return { kind: "delayedWithoutEstimate" };
  if (estimated === "On time" || estimated === "Starts here") {
    return { kind: "onTime" };
  }
  if (estimated === "Cancelled") return { kind: "cancelled" };

  const expectedMinutes = parseWallClock(estimated);
  // Covers "Delayed" and "No report": Darwin knows it is not right, but not by
  // how much. Treated the same because neither lets us promise you a time.
  return expectedMinutes === undefined
    ? { kind: "delayedWithoutEstimate" }
    : { kind: "delayed", expectedAt: toInstant(expectedMinutes) };
};

const parseDestination = (service: Record<string, unknown>): string => {
  const destinations = service["destination"];
  if (!Array.isArray(destinations)) return "";

  const first = destinations[0];
  return isRecord(first) ? (readString(first["locationName"]) ?? "") : "";
};

const parseService = (
  candidate: unknown,
  now: Date,
  timeZone: string,
): Departure | undefined => {
  if (!isRecord(candidate)) return undefined;

  const scheduled = readString(candidate["std"]);
  const scheduledMinutes =
    scheduled === undefined ? undefined : parseWallClock(scheduled);
  if (scheduledMinutes === undefined) return undefined;

  const toInstant = (wallClockMinutes: number): Date =>
    instantOfWallClock(wallClockMinutes, now, timeZone);

  return {
    scheduledAt: toInstant(scheduledMinutes),
    destination: parseDestination(candidate),
    state: parseState(candidate, toInstant),
  };
};

export type ParseBoardRequest = {
  readonly payload: unknown;
  /** The clock the bare "HH:MM" times are resolved against. */
  readonly now: Date;
  readonly timeZone: string;
};

/**
 * Every field here is treated as untrusted. A board that is partly unreadable
 * should cost us the unreadable services, not the whole commute zone.
 *
 * `generatedAt` is reported but never used to place departures in time — see
 * instantOfWallClock for why that anchor was wrong.
 */
export const parseStationBoard = ({
  payload,
  now,
  timeZone,
}: ParseBoardRequest): Result<DepartureBoard, SourceFailure> => {
  if (!isRecord(payload)) {
    return fail({ kind: "malformed", detail: "response was not an object" });
  }

  const generatedAtText = readString(payload["generatedAt"]);
  const generatedAt =
    generatedAtText === undefined ? now : new Date(generatedAtText);
  const services = payload["trainServices"];

  return succeed({
    generatedAt: Number.isNaN(generatedAt.getTime()) ? now : generatedAt,
    origin: readString(payload["locationName"]) ?? "",
    departures: (Array.isArray(services) ? services : []).flatMap(
      (candidate) => {
        const departure = parseService(candidate, now, timeZone);
        return departure === undefined ? [] : [departure];
      },
    ),
  });
};

export type Huxley2Config = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly originCrs: string;
  readonly destinationCrs: string;
  readonly rows: number;
  readonly timeZone: string;
  readonly fetch?: typeof globalThis.fetch;
};

export const huxley2DepartureSource = ({
  baseUrl,
  accessToken,
  originCrs,
  destinationCrs,
  rows,
  timeZone,
  fetch = globalThis.fetch,
}: Huxley2Config): DepartureSource => ({
  board: async (now) => {
    const url = new URL(
      `/all/${originCrs}/to/${destinationCrs}/${rows}`,
      baseUrl,
    );
    url.searchParams.set("accessToken", accessToken);

    const response = await fetch(url).catch((cause: unknown) =>
      cause instanceof Error ? cause : new Error(String(cause)),
    );

    if (response instanceof Error) {
      return fail({ kind: "unreachable", detail: response.message });
    }
    if (!response.ok) {
      return fail({ kind: "rejected", status: response.status });
    }

    const payload = await response
      .json()
      .catch((): undefined => undefined);

    return payload === undefined
      ? fail({ kind: "malformed", detail: "response was not JSON" })
      : parseStationBoard({ payload, now, timeZone });
  },
});
