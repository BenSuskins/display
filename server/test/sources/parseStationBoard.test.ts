import { describe, expect, test } from "bun:test";

import { parseStationBoard } from "../../src/sources/huxley2DepartureSource";

const board = (
  services: readonly unknown[],
  generatedAt = "2026-08-10T06:40:00.0000000+01:00",
) => ({
  generatedAt,
  locationName: "Kelvedon",
  crs: "KEL",
  trainServices: services,
});

const service = (overrides: Record<string, unknown> = {}) => ({
  std: "07:16",
  etd: "On time",
  platform: "1",
  isCancelled: false,
  destination: [{ locationName: "London Liverpool Street", crs: "LST" }],
  ...overrides,
});

const parseOrThrow = (payload: unknown) => {
  const result = parseStationBoard(payload);
  if (!result.ok) {
    throw new Error(`expected a parsed board, got ${JSON.stringify(result)}`);
  }
  return result.value;
};

describe("parseStationBoard", () => {
  test("reads the board's origin and generation time", () => {
    const parsed = parseOrThrow(board([service()]));

    expect(parsed.origin).toBe("Kelvedon");
    expect(parsed.generatedAt).toEqual(new Date("2026-08-10T05:40:00.000Z"));
  });

  test("reads a scheduled time as a London wall clock instant", () => {
    const [departure] = parseOrThrow(board([service()])).departures;

    // 07:16 local on a BST day is 06:16 UTC.
    expect(departure?.scheduledAt).toEqual(
      new Date("2026-08-10T06:16:00.000Z"),
    );
    expect(departure?.destination).toBe("London Liverpool Street");
  });

  test("reads the same wall clock as a different instant in winter", () => {
    const parsed = parseOrThrow(
      board([service()], "2026-01-12T06:40:00.0000000+00:00"),
    );

    expect(parsed.departures[0]?.scheduledAt).toEqual(
      new Date("2026-01-12T07:16:00.000Z"),
    );
  });

  describe("departure state", () => {
    test("'On time' is on time", () => {
      expect(parseOrThrow(board([service()])).departures[0]?.state).toEqual({
        kind: "onTime",
      });
    });

    test("an estimated time is a delay to that time", () => {
      const parsed = parseOrThrow(board([service({ etd: "07:36" })]));

      expect(parsed.departures[0]?.state).toEqual({
        kind: "delayed",
        expectedAt: new Date("2026-08-10T06:36:00.000Z"),
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
        board([service({ etd: "07:36", isCancelled: true })]),
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
        board([service({ std: null }), service({ std: "07:31" })]),
      );

      expect(parsed.departures).toHaveLength(1);
      expect(parsed.departures[0]?.scheduledAt).toEqual(
        new Date("2026-08-10T06:31:00.000Z"),
      );
    });

    test("a departure after midnight belongs to the following day", () => {
      const parsed = parseOrThrow(
        board([service({ std: "00:15" })], "2026-08-10T23:50:00.0000000+01:00"),
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
      expect(parseStationBoard("nope")).toEqual({
        ok: false,
        failure: { kind: "malformed", detail: "response was not an object" },
      });
    });

    test("a board with an unreadable generatedAt is a malformed failure", () => {
      const result = parseStationBoard(board([service()], "not a date"));

      expect(result.ok).toBe(false);
    });
  });
});
