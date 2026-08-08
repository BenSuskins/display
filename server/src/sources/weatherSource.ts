import type { Weather } from "../domain/weather";
import type { Result } from "../domain/result";
import type { SourceFailure } from "./departureSource";

export type WeatherSource = {
  readonly weather: (now: Date) => Promise<Result<Weather, SourceFailure>>;
};
