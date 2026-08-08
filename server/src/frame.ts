import type { DepartureConfig } from "./config";
import { selectCatchableDepartures } from "./domain/departure";
import { fail, succeed, type Result } from "./domain/result";
import {
  renderFrameHtml,
  renderFrameIdentityHtml,
  type FrameView,
} from "./render/layout";
import type { FrameBytes } from "./render/packMonochrome";
import type { RasterFailure, Rasteriser } from "./render/rasteriser";
import type { DepartureSource } from "./sources/departureSource";
import type { HouseholdSource } from "./sources/householdSource";
import type { WeatherSource } from "./sources/weatherSource";

export type Frame = {
  readonly bytes: FrameBytes;
  /** Identifies the image so an unchanged Frame can be answered with a 304 and
   * the Device can skip the 12 s refresh guard entirely — see ADR-0002. */
  readonly etag: string;
};

export type FrameRequest = {
  readonly now: Date;
};

export type FrameComposer = {
  readonly compose: (
    request: FrameRequest,
  ) => Promise<Result<Frame, RasterFailure>>;
  readonly previewHtml: (request: FrameRequest) => Promise<string>;
};

export type FrameComposerParts = {
  readonly departureSource: DepartureSource;
  readonly weatherSource: WeatherSource;
  readonly householdSource: HouseholdSource;
  readonly departures: DepartureConfig;
  readonly rasteriser: Rasteriser;
  readonly timeZone: string;
};

export const frameComposer = ({
  departureSource,
  weatherSource,
  householdSource,
  departures: departureConfig,
  rasteriser,
  timeZone,
}: FrameComposerParts): FrameComposer => {
  const buildView = async ({ now }: FrameRequest): Promise<FrameView> => {
    // Fetched together and kept as Results, so one dead upstream costs its own
    // zone and nothing else.
    const [board, weather, household] = await Promise.all([
      departureSource.board(now),
      weatherSource.weather(now),
      householdSource.household(now),
    ]);

    return {
      renderedAt: now,
      timeZone,
      destination: departureConfig.destinationCrs,
      weather,
      household,
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
    };
  };

  return {
    previewHtml: async (request) => renderFrameHtml(await buildView(request)),

    compose: async (request) => {
      const view = await buildView(request);

      const rastered = await rasteriser.rasterise(renderFrameHtml(view));
      if (!rastered.ok) return fail(rastered.failure);

      // Deliberately not a hash of the Frame's bytes. Those include a footer
      // clock that ticks every minute, which would make every Wake a redraw.
      return succeed({
        bytes: rastered.value,
        etag: `"${Bun.hash(renderFrameIdentityHtml(view)).toString(16)}"`,
      });
    },
  };
};
