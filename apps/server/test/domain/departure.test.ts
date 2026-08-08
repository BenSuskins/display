import { describe, expect, test } from "bun:test";

import {
  earliestPossibleDeparture,
  selectCatchableDepartures,
  type Departure,
} from "../../src/domain/departure";

const at = (time: `${number}:${number}`): Date =>
  new Date(`2026-08-10T${time}:00.000Z`);

const onTime = (scheduled: `${number}:${number}`): Departure => ({
  scheduledAt: at(scheduled),
  destination: "London Liverpool Street",
  state: { kind: "onTime" },
});

const delayed = (
  scheduled: `${number}:${number}`,
  expected: `${number}:${number}`,
): Departure => ({
  scheduledAt: at(scheduled),
  destination: "London Liverpool Street",
  state: { kind: "delayed", expectedAt: at(expected) },
});

const cancelled = (scheduled: `${number}:${number}`): Departure => ({
  scheduledAt: at(scheduled),
  destination: "London Liverpool Street",
  state: { kind: "cancelled" },
});

const delayedWithoutEstimate = (
  scheduled: `${number}:${number}`,
): Departure => ({
  scheduledAt: at(scheduled),
  destination: "London Liverpool Street",
  state: { kind: "delayedWithoutEstimate" },
});

const select = (departures: readonly Departure[], now: Date) =>
  selectCatchableDepartures({
    departures,
    now,
    minimumLeadMinutes: 15,
    limit: 3,
  });

describe("earliestPossibleDeparture", () => {
  test("is the scheduled time when a train is on time", () => {
    expect(earliestPossibleDeparture(onTime("07:16"))).toEqual(at("07:16"));
  });

  test("is the expected time when a train is delayed", () => {
    expect(earliestPossibleDeparture(delayed("07:16", "07:36"))).toEqual(
      at("07:36"),
    );
  });

  test("is the scheduled time when a train is cancelled", () => {
    expect(earliestPossibleDeparture(cancelled("07:16"))).toEqual(at("07:16"));
  });

  test("is the scheduled time when a delay has no estimate yet", () => {
    // Darwin says "Delayed" with no time when it does not know how late a train
    // will be. It cannot leave before it was booked to, so that is the bound.
    expect(earliestPossibleDeparture(delayedWithoutEstimate("07:16"))).toEqual(
      at("07:16"),
    );
  });
});

describe("selectCatchableDepartures", () => {
  test("keeps a departure leaving further ahead than the lead time", () => {
    expect(select([onTime("07:16")], at("06:40"))).toEqual([onTime("07:16")]);
  });

  test("drops a departure leaving sooner than the lead time", () => {
    expect(select([onTime("07:16")], at("07:05"))).toEqual([]);
  });

  test("keeps a departure leaving exactly at the lead time", () => {
    expect(select([onTime("07:16")], at("07:01"))).toEqual([onTime("07:16")]);
  });

  test("drops a departure that has already left", () => {
    expect(select([onTime("07:16")], at("07:30"))).toEqual([]);
  });

  test("keeps a delayed departure the delay has made catchable again", () => {
    const train = delayed("07:16", "07:50");

    expect(select([train], at("07:10"))).toEqual([train]);
  });

  test("keeps a departure delayed by an unknown amount", () => {
    const train = delayedWithoutEstimate("07:16");

    expect(select([train], at("06:40"))).toEqual([train]);
  });

  test("drops a delay with no estimate once its booked time is too close", () => {
    // Without an estimate we cannot claim the delay has bought you time.
    expect(select([delayedWithoutEstimate("07:16")], at("07:05"))).toEqual([]);
  });

  test("keeps cancelled departures, because not going is worth knowing", () => {
    const train = cancelled("07:16");

    expect(select([train], at("06:40"))).toEqual([train]);
  });

  test("returns at most the requested limit", () => {
    const departures = [
      onTime("07:16"),
      onTime("07:31"),
      onTime("07:46"),
      onTime("08:01"),
    ];

    expect(select(departures, at("06:40"))).toEqual([
      onTime("07:16"),
      onTime("07:31"),
      onTime("07:46"),
    ]);
  });

  test("orders by when each train will actually leave, not when it was booked to", () => {
    const heavilyDelayed = delayed("07:16", "07:55");
    const punctual = onTime("07:31");

    expect(select([heavilyDelayed, punctual], at("06:40"))).toEqual([
      punctual,
      heavilyDelayed,
    ]);
  });

  test("is empty when nothing is catchable", () => {
    expect(select([onTime("07:16"), onTime("07:20")], at("07:10"))).toEqual([]);
  });
});
