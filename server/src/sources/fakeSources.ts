import type { Household } from "../domain/household";
import { fail, succeed } from "../domain/result";
import type { Weather } from "../domain/weather";
import type { SourceFailure } from "./departureSource";
import type { HouseholdSource } from "./householdSource";
import type { WeatherSource } from "./weatherSource";

export const SettledWeather: Weather = {
  temperatureCelsius: 18,
  condition: "cloudy",
  label: "Cloudy",
  maximumCelsius: 21,
  minimumCelsius: 13,
};

export const fakeWeatherSource = (
  state: { weather?: Weather; failure?: SourceFailure } = {},
): WeatherSource => ({
  weather: async () =>
    state.failure !== undefined
      ? fail(state.failure)
      : succeed(state.weather ?? SettledWeather),
});

export const QuietHousehold: Household = {
  choresDueToday: [],
  overdueChoreCount: 0,
  today: [],
};

export const fakeHouseholdSource = (
  state: { household?: Partial<Household>; failure?: SourceFailure } = {},
): HouseholdSource => ({
  household: async () =>
    state.failure !== undefined
      ? fail(state.failure)
      : succeed({ ...QuietHousehold, ...state.household }),
});
