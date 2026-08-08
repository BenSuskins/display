export type WakeSchedule = {
  readonly timeZone: string;
  /** Local wall-clock minutes past midnight, so `6 * 60 + 30` is 06:30. */
  readonly denseWindowStartsAtMinute: number;
  readonly denseWindowEndsAtMinute: number;
  readonly denseIntervalMinutes: number;
  readonly defaultIntervalMinutes: number;
  readonly lowBatteryVolts: number;
  readonly lowBatteryIntervalMinutes: number;
};

export type NextWakeQuery = {
  readonly now: Date;
  readonly batteryVolts?: number;
  readonly schedule: WakeSchedule;
};

const SecondsPerMinute = 60;

const localMinuteOfDay = (moment: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(moment);

  const valueOf = (type: "hour" | "minute"): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return valueOf("hour") * 60 + valueOf("minute");
};

/**
 * How long the Device should sleep before its next Wake.
 *
 * The Render Service owns this rather than the firmware so that cadence is a
 * deploy rather than a reflash, and so it can react to a low battery — see
 * ADR-0002. Everything is whole minutes: the answer becomes an HTTP header the
 * firmware parses, and no sleep is long enough for the ESP32-C3's RC oscillator
 * to drift meaningfully.
 */
export const secondsUntilNextWake = ({
  now,
  batteryVolts,
  schedule,
}: NextWakeQuery): number => {
  if (batteryVolts !== undefined && batteryVolts < schedule.lowBatteryVolts) {
    return schedule.lowBatteryIntervalMinutes * SecondsPerMinute;
  }

  const minuteOfDay = localMinuteOfDay(now, schedule.timeZone);
  const insideDenseWindow =
    minuteOfDay >= schedule.denseWindowStartsAtMinute &&
    minuteOfDay < schedule.denseWindowEndsAtMinute;

  const intervalMinutes = insideDenseWindow
    ? schedule.denseIntervalMinutes
    : schedule.defaultIntervalMinutes;

  // Waking a few minutes early beats sleeping through the start of the commute
  // window and missing the first look at the display.
  const minutesUntilWindowOpens =
    schedule.denseWindowStartsAtMinute - minuteOfDay;
  const shouldWaitForWindow =
    minutesUntilWindowOpens > 0 && minutesUntilWindowOpens < intervalMinutes;

  const sleepMinutes = shouldWaitForWindow
    ? minutesUntilWindowOpens
    : intervalMinutes;

  return sleepMinutes * SecondsPerMinute;
};
