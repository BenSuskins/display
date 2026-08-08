import type { Config } from "./config";
import { secondsUntilNextWake } from "./domain/wakeSchedule";
import type { FrameComposer } from "./frame";

export type ServerParts = {
  readonly config: Config;
  readonly composer: FrameComposer;
  readonly now?: () => Date;
};

const bearerOf = (request: Request): string | undefined =>
  request.headers.get("authorization")?.replace(/^Bearer /, "");

const readBatteryVolts = (url: URL): number | undefined => {
  const raw = url.searchParams.get("battery");
  if (raw === null) return undefined;

  const volts = Number(raw);
  return Number.isFinite(volts) && volts > 0 ? volts : undefined;
};

/**
 * The whole device-facing surface. A Wake is one GET: the Device reports its
 * battery and what it is currently showing, and is told what to show next and
 * how long to sleep.
 */
export const handleRequest = async ({
  config,
  composer,
  now = () => new Date(),
}: ServerParts): Promise<(request: Request) => Promise<Response>> => {
  const isAuthorised = (request: Request, url: URL): boolean =>
    bearerOf(request) === config.deviceToken ||
    url.searchParams.get("token") === config.deviceToken;

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return new Response("ok");
    }

    if (!isAuthorised(request, url)) {
      return new Response("unauthorised", { status: 401 });
    }

    const moment = now();
    const batteryVolts = readBatteryVolts(url);
    const frameRequest = batteryVolts === undefined ? { now: moment } : { now: moment, batteryVolts };

    // The same page the Frame is made from, for iterating on layout in a
    // browser instead of a 15 s round trip to the Panel.
    if (url.pathname === "/preview") {
      return new Response(await composer.previewHtml(frameRequest), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname !== "/frame") {
      return new Response("not found", { status: 404 });
    }

    const sleepSeconds = secondsUntilNextWake({
      now: moment,
      schedule: config.wake,
      ...(batteryVolts === undefined ? {} : { batteryVolts }),
    });
    const wakeHeaders = { "x-next-wake-seconds": String(sleepSeconds) };

    const frame = await composer.compose(frameRequest);
    if (!frame.ok) {
      // The Device leaves the last Frame up rather than showing something
      // wrong, and tries again after a normal sleep.
      return new Response(frame.failure.detail, {
        status: 503,
        headers: wakeHeaders,
      });
    }

    if (request.headers.get("if-none-match") === frame.value.etag) {
      return new Response(null, {
        status: 304,
        headers: { ...wakeHeaders, etag: frame.value.etag },
      });
    }

    return new Response(frame.value.bytes, {
      headers: {
        ...wakeHeaders,
        etag: frame.value.etag,
        "content-type": "application/octet-stream",
      },
    });
  };
};
