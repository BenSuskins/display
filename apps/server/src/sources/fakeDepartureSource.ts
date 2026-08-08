import type { Departure } from "../domain/departure";
import { fail, succeed } from "../domain/result";
import type {
  DepartureBoard,
  DepartureSource,
  SourceFailure,
} from "./departureSource";

export type FakeDepartureSourceState = {
  readonly board?: Partial<DepartureBoard>;
  readonly failure?: SourceFailure;
};

/**
 * Stands in for Huxley2 in tests and in local development without a Darwin
 * token. Contract tests run against this and the real source alike.
 */
export const fakeDepartureSource = (
  state: FakeDepartureSourceState = {},
): DepartureSource => ({
  board: async (now) =>
    state.failure !== undefined
      ? fail(state.failure)
      : succeed({
          generatedAt: state.board?.generatedAt ?? now,
          origin: state.board?.origin ?? "Kelvedon",
          departures: state.board?.departures ?? [],
        }),
});

export const departureAt = (
  scheduledAt: Date,
  state: Departure["state"] = { kind: "onTime" },
): Departure => ({
  scheduledAt,
  destination: "London Liverpool Street",
  state,
});
