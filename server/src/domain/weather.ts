export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "rain"
  | "sleet"
  | "snow"
  | "fog"
  | "thunder"
  | "unknown";

export type RainOutlook = {
  readonly probabilityPercent: number;
  readonly at: Date;
};

export type Weather = {
  readonly temperatureCelsius: number;
  readonly condition: WeatherCondition;
  readonly label: string;
  readonly maximumCelsius: number;
  readonly minimumCelsius: number;
  /** The next hour today worth carrying a coat for, if there is one. */
  readonly nextRain?: RainOutlook;
};

type CodeMeaning = {
  readonly condition: WeatherCondition;
  readonly label: string;
};

/**
 * Met Office significant weather codes. Day and night variants collapse to the
 * same words — the Panel is black and white and read at a glance, so "Sunny"
 * versus "Clear night" is more precision than the display can use.
 */
const SignificantWeatherCodes: Readonly<Record<number, CodeMeaning>> = {
  0: { condition: "clear", label: "Clear" },
  1: { condition: "clear", label: "Sunny" },
  2: { condition: "cloudy", label: "Part cloudy" },
  3: { condition: "cloudy", label: "Part cloudy" },
  5: { condition: "fog", label: "Mist" },
  6: { condition: "fog", label: "Fog" },
  7: { condition: "cloudy", label: "Cloudy" },
  8: { condition: "cloudy", label: "Overcast" },
  9: { condition: "rain", label: "Light showers" },
  10: { condition: "rain", label: "Light showers" },
  11: { condition: "rain", label: "Drizzle" },
  12: { condition: "rain", label: "Light rain" },
  13: { condition: "rain", label: "Heavy showers" },
  14: { condition: "rain", label: "Heavy showers" },
  15: { condition: "rain", label: "Heavy rain" },
  16: { condition: "sleet", label: "Sleet showers" },
  17: { condition: "sleet", label: "Sleet showers" },
  18: { condition: "sleet", label: "Sleet" },
  19: { condition: "sleet", label: "Hail showers" },
  20: { condition: "sleet", label: "Hail showers" },
  21: { condition: "sleet", label: "Hail" },
  22: { condition: "snow", label: "Light snow" },
  23: { condition: "snow", label: "Light snow" },
  24: { condition: "snow", label: "Light snow" },
  25: { condition: "snow", label: "Heavy snow" },
  26: { condition: "snow", label: "Heavy snow" },
  27: { condition: "snow", label: "Heavy snow" },
  28: { condition: "thunder", label: "Thunder showers" },
  29: { condition: "thunder", label: "Thunder showers" },
  30: { condition: "thunder", label: "Thunder" },
};

const Unknown: CodeMeaning = { condition: "unknown", label: "—" };

export const meaningOfWeatherCode = (code: number): CodeMeaning =>
  SignificantWeatherCodes[code] ?? Unknown;

/** Below this a mention of rain is noise; the forecast is never certain. */
export const RainWorthMentioningPercent = 25;
