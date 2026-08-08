import { describe, expect, test } from "bun:test";

import { parseStationBoard } from "../../src/sources/huxley2DepartureSource";

const board = (
  services: readonly unknown[],
  generatedAt = "2026-08-10T16:40:00.0000000+01:00",
) => ({
  generatedAt,
  locationName: "Kelvedon",
  crs: "KEL",
  trainServices: services,
});

const service = (overrides: Record<string, unknown> = {}) => ({
  std: "16:50",
  etd: "On time",
  platform: "1",
  isCancelled: false,
  destination: [{ locationName: "London Liverpool Street", crs: "LST" }],
  ...overrides,
});

// 16:40 local on a BST day. The clock, not the board, decides where bare
// "HH:MM" times land.
const Now = new Date("2026-08-10T15:40:00Z");

const parseOrThrow = (payload: unknown, now: Date = Now) => {
  const result = parseStationBoard({
    payload,
    now,
    timeZone: "Europe/London",
  });
  if (!result.ok) {
    throw new Error(`expected a parsed board, got ${JSON.stringify(result)}`);
  }
  return result.value;
};

describe("parseStationBoard", () => {
  test("reads the board's origin", () => {
    expect(parseOrThrow(board([service()])).origin).toBe("Kelvedon");
  });

  test("places a departure at its station-local wall clock", () => {
    const [departure] = parseOrThrow(board([service()])).departures;

    // 16:50 local on a BST day is 15:50 UTC.
    expect(departure?.scheduledAt).toEqual(new Date("2026-08-10T15:50:00Z"));
    expect(departure?.destination).toBe("London Liverpool Street");
  });

  test("is not thrown an hour out by a generatedAt with no offset", () => {
    // The bug this replaces: Huxley2 passes through a .NET DateTime that can
    // serialise without an offset. Reading the offset off that string gave
    // zero while JavaScript had already parsed it as local time, so every
    // departure landed an hour late during British Summer Time — a 16:22
    // train showing as 17:22.
    const offsetless = parseOrThrow(
      board([service({ std: "16:22" })], "2026-08-10T16:04:00.1234567"),
    );
    const offset = parseOrThrow(
      board([service({ std: "16:22" })], "2026-08-10T16:04:00.0000000+01:00"),
    );

    expect(offsetless.departures[0]?.scheduledAt).toEqual(
      new Date("2026-08-10T15:22:00Z"),
    );
    expect(offset.departures[0]?.scheduledAt).toEqual(
      offsetless.departures[0]?.scheduledAt,
    );
  });

  test("ignores the board's clock entirely, however wrong it is", () => {
    const skewed = parseOrThrow(
      board([service({ std: "16:50" })], "1999-01-01T00:00:00Z"),
    );

    expect(skewed.departures[0]?.scheduledAt).toEqual(
      new Date("2026-08-10T15:50:00Z"),
    );
  });

  test("reads the same wall clock as a different instant in winter", () => {
    const parsed = parseOrThrow(
      board([service({ std: "16:50" })]),
      new Date("2026-01-12T16:40:00Z"), // 16:40 local, GMT
    );

    expect(parsed.departures[0]?.scheduledAt).toEqual(
      new Date("2026-01-12T16:50:00Z"),
    );
  });

  describe("departure state", () => {
    test("'On time' is on time", () => {
      expect(parseOrThrow(board([service()])).departures[0]?.state).toEqual({
        kind: "onTime",
      });
    });

    test("an estimated time is a delay to that time", () => {
      const parsed = parseOrThrow(board([service({ etd: "17:06" })]));

      expect(parsed.departures[0]?.state).toEqual({
        kind: "delayed",
        expectedAt: new Date("2026-08-10T16:06:00.000Z"),
      });
    });

    test("'Delayed' with no time is a delay without an estimate", () => {
      const parsed = parseOrThrow(board([service({ etd: "Delayed" })]));

      expect(parsed.departures[0]?.state).toEqual({
        kind: "delayedWithoutEstimate",
      });
    });

    test("'Cancelled' is cancelled", () => {
      const parsed = parseOrThrow(board([service({ etd: "Cancelled" })]));

      expect(parsed.departures[0]?.state).toEqual({ kind: "cancelled" });
    });

    test("the isCancelled flag wins over a stale estimated time", () => {
      const parsed = parseOrThrow(
        board([service({ etd: "17:06", isCancelled: true })]),
      );

      expect(parsed.departures[0]?.state).toEqual({ kind: "cancelled" });
    });

    test("'No report' is treated as a delay without an estimate", () => {
      const parsed = parseOrThrow(board([service({ etd: "No report" })]));

      expect(parsed.departures[0]?.state).toEqual({
        kind: "delayedWithoutEstimate",
      });
    });
  });

  describe("awkward payloads", () => {
    test("a board with no services parses to no departures", () => {
      expect(parseOrThrow(board([])).departures).toEqual([]);
    });

    test("a null trainServices parses to no departures", () => {
      const parsed = parseOrThrow({
        generatedAt: "2026-08-10T06:40:00.0000000+01:00",
        locationName: "Kelvedon",
        trainServices: null,
      });

      expect(parsed.departures).toEqual([]);
    });

    test("a service with no scheduled time is skipped, not fatal", () => {
      const parsed = parseOrThrow(
        board([service({ std: null }), service({ std: "17:21" })]),
      );

      expect(parsed.departures).toHaveLength(1);
      expect(parsed.departures[0]?.scheduledAt).toEqual(
        new Date("2026-08-10T16:21:00.000Z"),
      );
    });

    test("a departure after midnight belongs to the following day", () => {
      const parsed = parseOrThrow(
        board([service({ std: "00:15" })]),
        new Date("2026-08-10T22:50:00Z"), // 23:50 local
      );

      expect(parsed.departures[0]?.scheduledAt).toEqual(
        new Date("2026-08-10T23:15:00.000Z"),
      );
    });

    test("a missing destination falls back rather than failing", () => {
      const parsed = parseOrThrow(board([service({ destination: null })]));

      expect(parsed.departures[0]?.destination).toBe("");
    });

    test("a payload that is not a board is a malformed failure", () => {
      expect(
        parseStationBoard({ payload: "nope", now: Now, timeZone: "Europe/London" }),
      ).toEqual({
        ok: false,
        failure: { kind: "malformed", detail: "response was not an object" },
      });
    });

    test("an unreadable generatedAt no longer costs the whole board", () => {
      // It is only reported now, not used to place departures.
      const parsed = parseOrThrow(board([service()], "not a date"));

      expect(parsed.departures).toHaveLength(1);
    });
  });
});
