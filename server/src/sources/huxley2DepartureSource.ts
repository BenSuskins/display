import type { Departure, DepartureState } from "../domain/departure";
import { fail, succeed, type Result } from "../domain/result";
import type {
  DepartureBoard,
  DepartureSource,
  SourceFailure,
} from "./departureSource";

const MinutesPerDay = 24 * 60;
/**
 * A departure board looks forward, not back. A scheduled time this far behind
 * the board's own clock is tomorrow's, not one that left hours ago.
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

/**
 * Huxley2 gives scheduled times as bare "HH:MM" in station-local time, and the
 * board's own `generatedAt` carries the offset that was in force. Reusing that
 * offset is exact for every departure on the board except across the two DST
 * changeovers a year, which happen at 01:00 when there is barely a service.
 */
const instantFromWallClock = (
  generatedAt: Date,
  generatedOffsetMinutes: number,
  wallClockMinutes: number,
): Date => {
  const generatedWallClockMinutes =
    (generatedAt.getTime() / 60_000 + generatedOffsetMinutes) % MinutesPerDay;

  const minutesAhead = wallClockMinutes - generatedWallClockMinutes;
  const dayRollover =
    minutesAhead < -RolloverToleranceMinutes ? MinutesPerDay : 0;

  return new Date(
    generatedAt.getTime() + (minutesAhead + dayRollover) * 60_000,
  );
};

const offsetMinutesOf = (isoTimestamp: string): number => {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(isoTimestamp);
  if (!match?.[2] || !match[3]) return 0;

  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
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
  generatedAt: Date,
  offsetMinutes: number,
): Departure | undefined => {
  if (!isRecord(candidate)) return undefined;

  const scheduled = readString(candidate["std"]);
  const scheduledMinutes =
    scheduled === undefined ? undefined : parseWallClock(scheduled);
  if (scheduledMinutes === undefined) return undefined;

  const toInstant = (wallClockMinutes: number): Date =>
    instantFromWallClock(generatedAt, offsetMinutes, wallClockMinutes);

  return {
    scheduledAt: toInstant(scheduledMinutes),
    destination: parseDestination(candidate),
    state: parseState(candidate, toInstant),
  };
};

/**
 * Every field here is treated as untrusted. A board that is partly unreadable
 * should cost us the unreadable services, not the whole commute zone.
 */
export const parseStationBoard = (
  payload: unknown,
): Result<DepartureBoard, SourceFailure> => {
  if (!isRecord(payload)) {
    return fail({ kind: "malformed", detail: "response was not an object" });
  }

  const generatedAtText = readString(payload["generatedAt"]);
  if (generatedAtText === undefined) {
    return fail({ kind: "malformed", detail: "no generatedAt on the board" });
  }

  const generatedAt = new Date(generatedAtText);
  if (Number.isNaN(generatedAt.getTime())) {
    return fail({
      kind: "malformed",
      detail: `unreadable generatedAt: ${generatedAtText}`,
    });
  }

  const offsetMinutes = offsetMinutesOf(generatedAtText);
  const services = payload["trainServices"];

  return succeed({
    generatedAt,
    origin: readString(payload["locationName"]) ?? "",
    departures: (Array.isArray(services) ? services : []).flatMap(
      (candidate) => {
        const departure = parseService(candidate, generatedAt, offsetMinutes);
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
  readonly fetch?: typeof globalThis.fetch;
};

export const huxley2DepartureSource = ({
  baseUrl,
  accessToken,
  originCrs,
  destinationCrs,
  rows,
  fetch = globalThis.fetch,
}: Huxley2Config): DepartureSource => ({
  board: async () => {
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
      : parseStationBoard(payload);
  },
});
