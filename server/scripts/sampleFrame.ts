import { readConfig } from "../src/config";
import { frameComposer } from "../src/frame";
import { chromiumRasteriser } from "../src/render/rasteriser";
import { departureAt, fakeDepartureSource } from "../src/sources/fakeDepartureSource";
import { fakeHouseholdSource, fakeWeatherSource } from "../src/sources/fakeSources";

/**
 * Renders a Frame from invented but realistic data, so layout can be judged
 * without credentials or a panel. Every zone is populated and the awkward cases
 * are present on purpose: a cancelled train, a long event title, an overdue
 * chore count.
 *
 *   bun run scripts/sampleFrame.ts sample.bin
 */
const [, , outputPath = "sample.bin"] = Bun.argv;

const config = readConfig({
  DARWIN_ACCESS_TOKEN: "sample",
  DEVICE_TOKEN: "sample",
});
if (!config.ok) throw new Error(config.failure.detail);

const now = new Date("2026-08-10T05:40:00Z"); // 06:40 local, BST
const at = (time: string) => new Date(`2026-08-10T${time}:00Z`);

const rasteriser = chromiumRasteriser();

const composer = frameComposer({
  departureSource: fakeDepartureSource({
    board: {
      departures: [
        departureAt(at("06:16")),
        departureAt(at("06:31"), { kind: "delayed", expectedAt: at("06:36") }),
        departureAt(at("06:46"), { kind: "cancelled" }),
      ],
    },
  }),
  weatherSource: fakeWeatherSource({
    weather: {
      temperatureCelsius: 18,
      condition: "cloudy",
      label: "Cloudy",
      maximumCelsius: 21,
      minimumCelsius: 13,
      nextRain: { probabilityPercent: 40, at: at("14:00") },
    },
  }),
  householdSource: fakeHouseholdSource({
    household: {
      choresDueToday: [
        { name: "Bins", assignedTo: "Ben" },
        { name: "Hoover", assignedTo: "Sam" },
      ],
      overdueChoreCount: 2,
      dinner: "Chicken traybake",
      today: [
        { title: "Bank holiday", startsAt: at("00:00"), allDay: true },
        { title: "Standup", startsAt: at("08:00"), allDay: false },
        { title: "Dentist", startsAt: at("12:00"), allDay: false },
        {
          title: "Ellie swimming lesson at Riverside",
          startsAt: at("15:30"),
          allDay: false,
        },
        { title: "Book club", startsAt: at("18:00"), allDay: false },
      ],
    },
  }),
  departures: config.value.departures,
  rasteriser,
  timeZone: config.value.wake.timeZone,
});

const frame = await composer.compose({ now });
await rasteriser.close();

if (!frame.ok) throw new Error(frame.failure.detail);

await Bun.write(outputPath, frame.value.bytes);
console.log(`${outputPath}: ${frame.value.bytes.length} bytes, etag ${frame.value.etag}`);
