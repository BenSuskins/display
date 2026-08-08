import type { Departure } from "../domain/departure";
import type { Result } from "../domain/result";

export type SourceFailure =
  /** No credentials for this source, so it was never asked. */
  | { readonly kind: "unconfigured"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "rejected"; readonly status: number }
  | { readonly kind: "malformed"; readonly detail: string };

export type DepartureBoard = {
  readonly generatedAt: Date;
  readonly origin: string;
  /** Every departure the board reported. Filtering to Catchable is the domain's job. */
  readonly departures: readonly Departure[];
};

export type DepartureSource = {
  readonly board: () => Promise<Result<DepartureBoard, SourceFailure>>;
};
