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
 *   bun run scripts/sampleFrame.ts sample.bin          # 06:40, the commute view
 *   bun run scripts/sampleFrame.ts day.bin 14:00       # after 09:00, the day view
 */
const [, , outputPath = "sample.bin", localTime = "06:40"] = Bun.argv;

const config = readConfig({
  DARWIN_ACCESS_TOKEN: "sample",
  DEVICE_TOKEN: "sample",
});
if (!config.ok) throw new Error(config.failure.detail);

// The sample day is in British Summer Time, so local is UTC+1 throughout and
// `at` takes the UTC side of that.
const at = (time: string) => new Date(`2026-08-10T${time}:00Z`);
const now = new Date(at(localTime).getTime() - 60 * 60_000);

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
      // Taken from a real feed: a long chore name plus a full name is what
      // pushed the overdue count out of the band.
      choresDueToday: [
        { name: "Clean Top of Cupboards", assignedTo: "Ben Suskins" },
        { name: "Hoover downstairs", assignedTo: "Sam Suskins" },
      ],
      overdueChoreCount: 10,
      dinner: "Chicken traybake",
      today: [
        { title: "Bank holiday", startsAt: at("00:00"), allDay: true },
        { title: "Tottenham Hotspur - Getafe", startsAt: at("14:00"), allDay: false },
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
  daypart: config.value.daypart,
});

const frame = await composer.compose({ now });
await rasteriser.close();

if (!frame.ok) throw new Error(frame.failure.detail);

await Bun.write(outputPath, frame.value.bytes);
console.log(`${outputPath}: ${frame.value.bytes.length} bytes, etag ${frame.value.etag}`);
