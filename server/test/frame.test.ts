import { describe, expect, test } from "bun:test";

import { readConfig, type Config } from "../src/config";
import { frameComposer } from "../src/frame";
import { fakeRasteriser } from "../src/render/fakeRasteriser";
import {
  fakeHouseholdSource,
  fakeWeatherSource,
} from "../src/sources/fakeSources";
import {
  departureAt,
  fakeDepartureSource,
} from "../src/sources/fakeDepartureSource";

const configOrThrow = (): Config => {
  const result = readConfig({
    DARWIN_ACCESS_TOKEN: "a-token",
    DEVICE_TOKEN: "device-secret",
  });
  if (!result.ok) throw new Error(result.failure.detail);
  return result.value;
};

const composerFor = (departures: readonly Date[]) => {
  const config = configOrThrow();

  return frameComposer({
    departureSource: fakeDepartureSource({
      board: { departures: departures.map((at) => departureAt(at)) },
    }),
    weatherSource: fakeWeatherSource(),
    householdSource: fakeHouseholdSource(),
    departures: config.departures,
    rasteriser: fakeRasteriser(),
    timeZone: config.wake.timeZone,
  });
};

const etagOf = async (
  composer: ReturnType<typeof frameComposer>,
  now: Date,
): Promise<string> => {
  const frame = await composer.compose({ now });
  if (!frame.ok) throw new Error(frame.failure.detail);
  return frame.value.etag;
};

const SevenSixteen = new Date("2026-08-10T06:16:00Z");
const SevenThirtyOne = new Date("2026-08-10T06:31:00Z");

describe("frame identity", () => {
  test("is unchanged as the clock advances with the same data", async () => {
    // The whole battery argument for waking often rests on this: an unchanged
    // frame is a 304, and the device skips the 12 s refresh guard. A frame
    // identity that ticks with the wall clock would redraw on every wake.
    const composer = composerFor([SevenSixteen, SevenThirtyOne]);

    const early = await etagOf(composer, new Date("2026-08-10T05:40:00Z"));
    const later = await etagOf(composer, new Date("2026-08-10T05:41:00Z"));

    expect(later).toBe(early);
  });

  test("changes when the date rolls over", async () => {
    // Holding the clock still for identity must not go so far as to hide a new
    // day: the header prints the date.
    const composer = composerFor([]);

    const lateTonight = await etagOf(composer, new Date("2026-08-10T21:00:00Z"));
    const earlyTomorrow = await etagOf(
      composer,
      new Date("2026-08-11T21:00:00Z"),
    );

    expect(earlyTomorrow).not.toBe(lateTonight);
  });

  test("is unchanged across a British Summer Time midnight", async () => {
    // 23:30 UTC is already the 11th in London during BST, so both of these are
    // the same local day and must agree.
    const composer = composerFor([]);

    expect(await etagOf(composer, new Date("2026-08-10T23:30:00Z"))).toBe(
      await etagOf(composer, new Date("2026-08-11T09:00:00Z")),
    );
  });

  test("changes when a departure is added", async () => {
    const now = new Date("2026-08-10T05:40:00Z");

    const one = await etagOf(composerFor([SevenSixteen]), now);
    const two = await etagOf(
      composerFor([SevenSixteen, SevenThirtyOne]),
      now,
    );

    expect(two).not.toBe(one);
  });

  test("changes when a train becomes delayed", async () => {
    const config = configOrThrow();
    const now = new Date("2026-08-10T05:40:00Z");

    const withState = (state: Parameters<typeof departureAt>[1]) =>
      frameComposer({
        departureSource: fakeDepartureSource({
          board: { departures: [departureAt(SevenSixteen, state)] },
        }),
        weatherSource: fakeWeatherSource(),
        householdSource: fakeHouseholdSource(),
        departures: config.departures,
        rasteriser: fakeRasteriser(),
        timeZone: config.wake.timeZone,
      });

    const onTime = await etagOf(withState({ kind: "onTime" }), now);
    const delayed = await etagOf(
      withState({ kind: "delayed", expectedAt: SevenThirtyOne }),
      now,
    );

    expect(delayed).not.toBe(onTime);
  });

  test("changes when a train drops out of reach as time passes", async () => {
    // Not a clock tick for its own sake — the content genuinely differs, because
    // the 07:16 is no longer catchable.
    const composer = composerFor([SevenSixteen, SevenThirtyOne]);

    const bothCatchable = await etagOf(
      composer,
      new Date("2026-08-10T05:40:00Z"),
    );
    const oneCatchable = await etagOf(
      composer,
      new Date("2026-08-10T06:05:00Z"),
    );

    expect(oneCatchable).not.toBe(bothCatchable);
  });
});
