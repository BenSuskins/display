import { beforeEach, describe, expect, test } from "bun:test";

import { readConfig, type Config } from "../src/config";
import { frameComposer } from "../src/frame";
import { fakeRasteriser } from "../src/render/fakeRasteriser";
import {
  fakeHouseholdSource,
  fakeWeatherSource,
} from "../src/sources/fakeSources";
import { FrameByteLength } from "../src/render/packMonochrome";
import {
  departureAt,
  fakeDepartureSource,
} from "../src/sources/fakeDepartureSource";
import { handleRequest } from "../src/server";

const DeviceToken = "device-secret";

const configOrThrow = (): Config => {
  const result = readConfig({
    DARWIN_ACCESS_TOKEN: "a-token",
    DEVICE_TOKEN: DeviceToken,
  });
  if (!result.ok) throw new Error(result.failure.detail);
  return result.value;
};

const morning = new Date("2026-08-10T05:40:00Z"); // 06:40 local, BST

const buildHandler = async (
  options: { readonly departures?: readonly Date[] } = {},
) => {
  const config = configOrThrow();

  return handleRequest({
    config,
    now: () => morning,
    composer: frameComposer({
      departureSource: fakeDepartureSource({
        board: {
          departures: (options.departures ?? []).map((at) => departureAt(at)),
        },
      }),
      weatherSource: fakeWeatherSource(),
      householdSource: fakeHouseholdSource(),
      departures: config.departures,
      rasteriser: fakeRasteriser(),
      timeZone: config.wake.timeZone,
    }),
  });
};

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://display.local${path}`, { headers });

const authorised = (path: string, headers: Record<string, string> = {}) =>
  get(path, { authorization: `Bearer ${DeviceToken}`, ...headers });

describe("the device-facing surface", () => {
  let handler: Awaited<ReturnType<typeof handleRequest>>;

  beforeEach(async () => {
    handler = await buildHandler({
      departures: [
        new Date("2026-08-10T06:16:00Z"), // 07:16 local
        new Date("2026-08-10T06:31:00Z"),
      ],
    });
  });

  test("answers the health probe without a token", async () => {
    expect((await handler(get("/healthz"))).status).toBe(200);
  });

  test("refuses a frame without a token", async () => {
    expect((await handler(get("/frame"))).status).toBe(401);
  });

  test("refuses a frame with the wrong token", async () => {
    const response = await handler(
      get("/frame", { authorization: "Bearer nope" }),
    );

    expect(response.status).toBe(401);
  });

  test("serves exactly one panel's worth of bytes", async () => {
    const response = await handler(authorised("/frame"));
    const body = await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(body.byteLength).toBe(FrameByteLength);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
  });

  test("tells the device how long to sleep", async () => {
    const response = await handler(authorised("/frame"));

    // 06:40 local is inside the commute window, so ten minutes.
    expect(response.headers.get("x-next-wake-seconds")).toBe("600");
  });

  test("stretches the sleep when the device reports a flat battery", async () => {
    const response = await handler(authorised("/frame?battery=3.2"));

    expect(response.headers.get("x-next-wake-seconds")).toBe("7200");
  });

  describe("skipping unchanged frames", () => {
    test("answers 304 when the device already shows this frame", async () => {
      const first = await handler(authorised("/frame"));
      const etag = first.headers.get("etag") ?? "";

      const second = await handler(authorised("/frame", { "if-none-match": etag }));

      expect(second.status).toBe(304);
      expect((await second.arrayBuffer()).byteLength).toBe(0);
    });

    test("still says when to wake next on a 304", async () => {
      const first = await handler(authorised("/frame"));
      const second = await handler(
        authorised("/frame", {
          "if-none-match": first.headers.get("etag") ?? "",
        }),
      );

      expect(second.headers.get("x-next-wake-seconds")).toBe("600");
    });

    test("sends a new frame when the departures have changed", async () => {
      const original = await handler(authorised("/frame"));

      const changed = await buildHandler({
        departures: [new Date("2026-08-10T06:46:00Z")],
      });
      const response = await changed(
        authorised("/frame", {
          "if-none-match": original.headers.get("etag") ?? "",
        }),
      );

      expect(response.status).toBe(200);
    });
  });

  test("serves the same page as HTML for previewing in a browser", async () => {
    const response = await handler(authorised("/preview"));
    const html = await response.text();

    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("07:16");
    expect(html).toContain("ON TIME");
  });

  test("accepts the token in the query, so a browser can preview", async () => {
    const response = await handler(get(`/preview?token=${DeviceToken}`));

    expect(response.status).toBe(200);
  });

  test("does not invent trains when the source is down", async () => {
    const config = configOrThrow();
    const broken = await handleRequest({
      config,
      now: () => morning,
      composer: frameComposer({
        departureSource: fakeDepartureSource({
          failure: { kind: "unreachable", detail: "no route to host" },
        }),
        weatherSource: fakeWeatherSource(),
        householdSource: fakeHouseholdSource(),
        departures: config.departures,
        rasteriser: fakeRasteriser(),
        timeZone: config.wake.timeZone,
      }),
    });

    const html = await (await broken(authorised("/preview"))).text();

    expect(html).toContain("Train times unavailable");
  });

  test("is a 404 for anything else", async () => {
    expect((await handler(authorised("/nope"))).status).toBe(404);
  });
});
