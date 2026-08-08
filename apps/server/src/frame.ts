import type { DepartureConfig } from "./config";
import { daypartAt, type DaypartSchedule } from "./domain/daypart";
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
  readonly daypart: DaypartSchedule;
};

export const frameComposer = ({
  departureSource,
  weatherSource,
  householdSource,
  departures: departureConfig,
  rasteriser,
  daypart: daypartSchedule,
}: FrameComposerParts): FrameComposer => {
  const buildView = async ({ now }: FrameRequest): Promise<FrameView> => {
    const daypart = daypartAt(now, daypartSchedule);

    // Fetched together and kept as Results, so one dead upstream costs its own
    // zone and nothing else. Outside the commute window the board is not asked
    // for at all: nothing on the Frame would show it, and Huxley2's public
    // instance is the flakiest thing we depend on.
    const [board, weather, household] = await Promise.all([
      daypart === "commute" ? departureSource.board(now) : undefined,
      weatherSource.weather(now),
      householdSource.household(now),
    ]);

    return {
      renderedAt: now,
      timeZone: daypartSchedule.timeZone,
      daypart,
      destination: departureConfig.destinationCrs,
      weather,
      household,
      ...(board === undefined
        ? {}
        : {
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
          }),
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
