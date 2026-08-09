import { describe, expect, test } from "bun:test";

import { readConfig, type Config } from "../src/config";
import { frameComposer } from "../src/frame";
import { fakeRasteriser } from "../src/render/fakeRasteriser";
import {
  fakeHouseholdSource,
  fakeWeatherSource,
  SettledWeather,
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
    daypart: config.daypart,
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

// 06:40 and 14:00 local on the same summer day.
const DuringTheCommute = new Date("2026-08-10T05:40:00Z");
const AfterTheCommute = new Date("2026-08-10T13:00:00Z");

const BinDay = new Date("2026-08-11T06:00:00Z");

describe("dayparts", () => {
  test("shows the trains during the commute window", async () => {
    const html = await composerFor([SevenSixteen]).previewHtml({
      now: DuringTheCommute,
    });

    expect(html).toContain("07:16");
    expect(html).toContain("Trains");
    expect(html).not.toContain("No rain expected today");
  });

  test("gives the zone to the weather once the window has closed", async () => {
    const html = await composerFor([SevenSixteen]).previewHtml({
      now: AfterTheCommute,
    });

    expect(html).toContain("Weather");
    expect(html).not.toContain("Trains");
    expect(html).not.toContain("07:16");
  });

  test("shows the week ahead in both, since it is not the zone that varies", async () => {
    const composer = frameComposer({
      departureSource: fakeDepartureSource(),
      weatherSource: fakeWeatherSource(),
      householdSource: fakeHouseholdSource({
        household: {
          upcoming: [
            { title: "Bin day", startsAt: BinDay, allDay: false },
          ],
        },
      }),
      departures: configOrThrow().departures,
      rasteriser: fakeRasteriser(),
      daypart: configOrThrow().daypart,
    });

    for (const now of [DuringTheCommute, AfterTheCommute]) {
      const html = await composer.previewHtml({ now });

      expect(html).toContain("Next 7 days");
      expect(html).toContain("Bin day");
    }
  });

  test("gives tomorrow's weather to the weather zone, not the commute one", async () => {
    // The commute Frame's weather is one line in the header, and tomorrow is
    // not a question anyone is asking on the way out of the door.
    const composer = frameComposer({
      departureSource: fakeDepartureSource(),
      weatherSource: fakeWeatherSource({
        weather: {
          ...SettledWeather,
          tomorrow: {
            condition: "rain",
            label: "Heavy showers",
            maximumCelsius: 23,
            minimumCelsius: 14,
            rainProbabilityPercent: 70,
          },
        },
      }),
      householdSource: fakeHouseholdSource(),
      departures: configOrThrow().departures,
      rasteriser: fakeRasteriser(),
      daypart: configOrThrow().daypart,
    });

    const day = await composer.previewHtml({ now: AfterTheCommute });
    expect(day).toContain("Tomorrow");
    expect(day).toContain("Heavy showers");
    expect(day).toContain("rain 70%");

    const commute = await composer.previewHtml({ now: DuringTheCommute });
    expect(commute).not.toContain("Heavy showers");
  });

  test("keeps the rest of the page where it was", async () => {
    // The plan's rule: fixed zones, varying content. Nothing but the left
    // column may differ between the two.
    const composer = composerFor([SevenSixteen]);

    const day = await composer.previewHtml({ now: AfterTheCommute });

    expect(day).toContain("Today");
    expect(day).toContain("Dinner");
    expect(day).toContain("Chores");
  });

  test("does not ask Huxley2 for a board it would not show", async () => {
    const config = configOrThrow();
    let boardsFetched = 0;

    const composer = frameComposer({
      departureSource: {
        board: async (now) => {
          boardsFetched += 1;
          return fakeDepartureSource({ board: { departures: [] } }).board(now);
        },
      },
      weatherSource: fakeWeatherSource(),
      householdSource: fakeHouseholdSource(),
      departures: config.departures,
      rasteriser: fakeRasteriser(),
      daypart: config.daypart,
    });

    await composer.previewHtml({ now: DuringTheCommute });
    expect(boardsFetched).toBe(1);

    await composer.previewHtml({ now: AfterTheCommute });
    expect(boardsFetched).toBe(1);
  });

  test("says so when the weather is missing rather than leaving the zone blank", async () => {
    const config = configOrThrow();

    const composer = frameComposer({
      departureSource: fakeDepartureSource(),
      weatherSource: fakeWeatherSource({
        failure: { kind: "unreachable", detail: "no route to host" },
      }),
      householdSource: fakeHouseholdSource(),
      departures: config.departures,
      rasteriser: fakeRasteriser(),
      daypart: config.daypart,
    });

    const html = await composer.previewHtml({ now: AfterTheCommute });

    expect(html).toContain("Weather unavailable");
  });
});

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

  test("changes when something is added to the week ahead", async () => {
    // The zone renders from data, not from the clock, so it is covered by the
    // stripped page the identity is hashed from — which is the rule that lets
    // a zone be added without touching `renderFrameIdentityHtml`.
    const config = configOrThrow();

    const withWeek = (upcoming: Parameters<typeof fakeHouseholdSource>[0]) =>
      frameComposer({
        departureSource: fakeDepartureSource(),
        weatherSource: fakeWeatherSource(),
        householdSource: fakeHouseholdSource(upcoming),
        departures: config.departures,
        rasteriser: fakeRasteriser(),
        daypart: config.daypart,
      });

    const empty = await etagOf(withWeek({}), AfterTheCommute);
    const busy = await etagOf(
      withWeek({
        household: { upcoming: [{ title: "Bin day", startsAt: BinDay, allDay: false }] },
      }),
      AfterTheCommute,
    );

    expect(busy).not.toBe(empty);
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
        daypart: config.daypart,
      });

    const onTime = await etagOf(withState({ kind: "onTime" }), now);
    const delayed = await etagOf(
      withState({ kind: "delayed", expectedAt: SevenThirtyOne }),
      now,
    );

    expect(delayed).not.toBe(onTime);
  });

  test("changes when the commute window closes", async () => {
    // The one clock-driven redraw worth paying for: the Frame genuinely stops
    // being about trains at 09:00.
    const composer = composerFor([SevenSixteen, SevenThirtyOne]);

    const lastCommuteFrame = await etagOf(
      composer,
      new Date("2026-08-10T07:55:00Z"), // 08:55 local
    );
    const firstDayFrame = await etagOf(
      composer,
      new Date("2026-08-10T08:05:00Z"), // 09:05 local
    );

    expect(firstDayFrame).not.toBe(lastCommuteFrame);
  });

  test("is unchanged as the afternoon wears on", async () => {
    // Nothing in the day Daypart ticks either, so the Device keeps getting a
    // 304 right through to the evening.
    const composer = composerFor([SevenSixteen]);

    expect(await etagOf(composer, new Date("2026-08-10T13:00:00Z"))).toBe(
      await etagOf(composer, new Date("2026-08-10T16:20:00Z")),
    );
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
      // Three minutes before the 07:16, so it is gone under the five minute rule.
      new Date("2026-08-10T06:13:00Z"),
    );

    expect(oneCatchable).not.toBe(bothCatchable);
  });
});
