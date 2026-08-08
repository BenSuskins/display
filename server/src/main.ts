import { readConfig } from "./config";
import { fail } from "./domain/result";
import { frameComposer } from "./frame";
import { chromiumRasteriser } from "./render/rasteriser";
import { handleRequest } from "./server";
import { familyHubHouseholdSource } from "./sources/familyHubHouseholdSource";
import type { HouseholdSource } from "./sources/householdSource";
import { huxley2DepartureSource } from "./sources/huxley2DepartureSource";
import { metOfficeWeatherSource } from "./sources/metOfficeWeatherSource";
import type { WeatherSource } from "./sources/weatherSource";

const config = readConfig(Bun.env);

if (!config.ok) {
  console.error(`refusing to start: ${config.failure.detail}`);
  process.exit(1);
}

const { departures, weather, household, daypart, timeZone, port, deviceToken } =
  config.value;

/** A source with no credentials answers honestly rather than being absent, so
 * its zone can say why it is empty instead of the page pretending it is fine. */
const unconfigured = (name: string, variables: string) => ({
  kind: "unconfigured" as const,
  detail: `${name} needs ${variables}`,
});

const weatherSource: WeatherSource =
  weather === undefined
    ? { weather: async () => fail(unconfigured("weather", "MET_ACCESS_TOKEN")) }
    : metOfficeWeatherSource({ ...weather, timeZone });

const householdSource: HouseholdSource =
  household === undefined
    ? {
        household: async () =>
          fail(unconfigured("family hub", "HUB_ACCESS_TOKEN and HUB_BASE_URL")),
      }
    : familyHubHouseholdSource({ ...household, timeZone });

const asLocalTime = (minuteOfDay: number): string =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:` +
  `${String(minuteOfDay % 60).padStart(2, "0")}`;

const rasteriser = chromiumRasteriser();

const handler = await handleRequest({
  config: config.value,
  composer: frameComposer({
    departureSource: huxley2DepartureSource({
      baseUrl: departures.baseUrl,
      accessToken: departures.accessToken,
      originCrs: departures.originCrs,
      destinationCrs: departures.destinationCrs,
      rows: departures.rows,
      timeZone,
    }),
    weatherSource,
    householdSource,
    departures,
    rasteriser,
    daypart,
  }),
});

const server = Bun.serve({ port, fetch: handler });

console.log(
  `render service on :${server.port} — ${departures.originCrs} to ` +
    `${departures.destinationCrs}, ${timeZone}, ` +
    `trains ${asLocalTime(daypart.commuteStartsAtMinute)}–` +
    `${asLocalTime(daypart.commuteEndsAtMinute)}, ` +
    `weather ${weather === undefined ? "off" : "on"}, ` +
    `family hub ${household === undefined ? "off" : "on"}, ` +
    `device token ${deviceToken.length} chars`,
);

const shutDown = async () => {
  await server.stop();
  await rasteriser.close();
  process.exit(0);
};

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
