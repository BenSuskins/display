import type { Household } from "../domain/household";
import type { Result } from "../domain/result";
import type { SourceFailure } from "./departureSource";

export type HouseholdSource = {
  readonly household: (now: Date) => Promise<Result<Household, SourceFailure>>;
};
