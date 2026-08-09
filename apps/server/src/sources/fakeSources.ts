import {
  inCalendarOrder,
  inDayOrder,
  type Household,
} from "../domain/household";
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
  upcoming: [],
};

export const fakeHouseholdSource = (
  state: {
    household?: Partial<Household>;
    failure?: SourceFailure;
    /** Only the ordering of the week ahead depends on this. */
    timeZone?: string;
  } = {},
): HouseholdSource => ({
  household: async () => {
    if (state.failure !== undefined) return fail(state.failure);

    const household = { ...QuietHousehold, ...state.household };
    // The real source orders both lists before returning them. A fake that
    // skips that is not standing in for it — it is quietly describing a
    // different contract, and the difference only shows up on the panel.
    return succeed({
      ...household,
      today: inDayOrder(household.today),
      upcoming: inCalendarOrder(
        household.upcoming,
        state.timeZone ?? "Europe/London",
      ),
    });
  },
});
