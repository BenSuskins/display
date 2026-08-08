export type DepartureState =
  | { readonly kind: "onTime" }
  | { readonly kind: "delayed"; readonly expectedAt: Date }
  /** Darwin reports "Delayed" with no time when it cannot yet say how late. */
  | { readonly kind: "delayedWithoutEstimate" }
  | { readonly kind: "cancelled" };

export type Departure = {
  readonly scheduledAt: Date;
  readonly destination: string;
  readonly state: DepartureState;
};

/**
 * A delayed train leaves later than booked, and a delay can be revised down but
 * never below the scheduled time. So this is the earliest the train can leave —
 * the moment a Catchable Departure has to be measured against.
 */
export const earliestPossibleDeparture = (departure: Departure): Date =>
  departure.state.kind === "delayed"
    ? departure.state.expectedAt
    : departure.scheduledAt;

const minutesBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / 60_000;

export type CatchableDepartureQuery = {
  readonly departures: readonly Departure[];
  readonly now: Date;
  readonly minimumLeadMinutes: number;
  readonly limit: number;
};

/**
 * The next few departures you could still make if you left the house now.
 *
 * A train leaving in less time than it takes to walk to the station is not
 * information, it is clutter — there is no version of events in which you are
 * on it. Cancelled trains are kept: not going is worth knowing.
 */
export const selectCatchableDepartures = ({
  departures,
  now,
  minimumLeadMinutes,
  limit,
}: CatchableDepartureQuery): readonly Departure[] =>
  departures
    .filter(
      (departure) =>
        minutesBetween(now, earliestPossibleDeparture(departure)) >=
        minimumLeadMinutes,
    )
    .sort(
      (left, right) =>
        earliestPossibleDeparture(left).getTime() -
        earliestPossibleDeparture(right).getTime(),
    )
    .slice(0, limit);
