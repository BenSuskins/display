import type { DepartureConfig } from "./config";
import { selectCatchableDepartures } from "./domain/departure";
import { fail, succeed, type Result } from "./domain/result";
import { renderFrameHtml } from "./render/layout";
import type { FrameBytes } from "./render/packMonochrome";
import type { RasterFailure, Rasteriser } from "./render/rasteriser";
import type { DepartureSource } from "./sources/departureSource";

export type Frame = {
  readonly bytes: FrameBytes;
  /** Identifies the image so an unchanged Frame can be answered with a 304 and
   * the Device can skip the 12 s refresh guard entirely — see ADR-0002. */
  readonly etag: string;
};

export type FrameRequest = {
  readonly now: Date;
  readonly batteryVolts?: number;
};

export type FrameComposer = {
  readonly compose: (
    request: FrameRequest,
  ) => Promise<Result<Frame, RasterFailure>>;
  readonly previewHtml: (request: FrameRequest) => Promise<string>;
};

export type FrameComposerParts = {
  readonly departureSource: DepartureSource;
  readonly departures: DepartureConfig;
  readonly rasteriser: Rasteriser;
  readonly timeZone: string;
};

export const frameComposer = ({
  departureSource,
  departures: departureConfig,
  rasteriser,
  timeZone,
}: FrameComposerParts): FrameComposer => {
  const buildHtml = async ({
    now,
    batteryVolts,
  }: FrameRequest): Promise<string> => {
    const board = await departureSource.board();

    return renderFrameHtml({
      renderedAt: now,
      timeZone,
      destination: departureConfig.destinationCrs,
      departures: board.ok
        ? succeed(
            selectCatchableDepartures({
              departures: board.value.departures,
              now,
              minimumLeadMinutes: departureConfig.minimumLeadMinutes,
              limit: departureConfig.shown,
            }),
          )
        : board,
      ...(batteryVolts === undefined ? {} : { batteryVolts }),
    });
  };

  return {
    previewHtml: buildHtml,

    compose: async (request) => {
      const rastered = await rasteriser.rasterise(await buildHtml(request));
      if (!rastered.ok) return fail(rastered.failure);

      return succeed({
        bytes: rastered.value,
        etag: `"${Bun.hash(rastered.value).toString(16)}"`,
      });
    },
  };
};
