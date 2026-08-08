import { readConfig } from "./config";
import { frameComposer } from "./frame";
import { chromiumRasteriser } from "./render/rasteriser";
import { handleRequest } from "./server";
import { huxley2DepartureSource } from "./sources/huxley2DepartureSource";

const config = readConfig(Bun.env);

if (!config.ok) {
  console.error(`refusing to start: ${config.failure.detail}`);
  process.exit(1);
}

const { departures, wake, port, deviceToken } = config.value;

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
    }),
    departures,
    rasteriser,
    timeZone: wake.timeZone,
  }),
});

const server = Bun.serve({ port, fetch: handler });

console.log(
  `render service on :${server.port} — ${departures.originCrs} to ` +
    `${departures.destinationCrs}, ${wake.timeZone}, ` +
    `device token ${deviceToken.length} chars`,
);

const shutDown = async () => {
  await server.stop();
  await rasteriser.close();
  process.exit(0);
};

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
