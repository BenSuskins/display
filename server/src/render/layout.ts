import type { Departure } from "../domain/departure";
import type { CalendarEntry, Household } from "../domain/household";
import type { Result } from "../domain/result";
import type { Weather } from "../domain/weather";
import type { SourceFailure } from "../sources/departureSource";
import { PanelHeight, PanelWidth } from "./packMonochrome";

export type FrameView = {
  readonly renderedAt: Date;
  readonly timeZone: string;
  readonly destination: string;
  readonly departures: Result<readonly Departure[], SourceFailure>;
  readonly weather: Result<Weather, SourceFailure>;
  readonly household: Result<Household, SourceFailure>;
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

const timeIn = (moment: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(moment);

const dateIn = (moment: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(moment)
    .toUpperCase();

/** Why a zone is empty, in words meant for someone standing at a fridge. */
const reasonFor = (failure: SourceFailure): string =>
  failure.kind === "unconfigured" ? "not set up" : "unavailable";

const missing = (what: string, failure: SourceFailure): string =>
  `<p class="unavailable">${what} ${reasonFor(failure)}</p>`;

const stateLabel = (departure: Departure, timeZone: string): string => {
  switch (departure.state.kind) {
    case "onTime":
      return "ON TIME";
    case "delayed":
      return `EXP ${timeIn(departure.state.expectedAt, timeZone)}`;
    case "delayedWithoutEstimate":
      return "DELAYED";
    case "cancelled":
      return "CANCELLED";
  }
};

const departureRows = (view: FrameView): string => {
  if (!view.departures.ok) return missing("Train times", view.departures.failure);
  if (view.departures.value.length === 0) {
    return `<p class="unavailable">No trains you could still catch</p>`;
  }

  return view.departures.value
    .map(
      (departure) => `
        <div class="train">
          <span class="time">${timeIn(departure.scheduledAt, view.timeZone)}</span>
          <span class="state ${departure.state.kind}">${stateLabel(departure, view.timeZone)}</span>
        </div>`,
    )
    .join("");
};

const weatherSummary = (view: FrameView): string => {
  if (!view.weather.ok) {
    return `<span class="unavailable">Weather ${reasonFor(view.weather.failure)}</span>`;
  }

  const { temperatureCelsius, label, maximumCelsius, minimumCelsius } =
    view.weather.value;

  return `<span>${temperatureCelsius}&deg; ${escapeHtml(label)}
    <span class="muted">H${maximumCelsius} L${minimumCelsius}</span></span>`;
};

const rainLine = (view: FrameView): string => {
  if (!view.weather.ok || view.weather.value.nextRain === undefined) return "";

  const { probabilityPercent, at } = view.weather.value.nextRain;
  return `<p class="rain">Rain ${probabilityPercent}% at ${timeIn(at, view.timeZone)}</p>`;
};

const entryTime = (entry: CalendarEntry, timeZone: string): string =>
  entry.allDay ? "all day" : timeIn(entry.startsAt, timeZone);

const agendaRows = (view: FrameView): string => {
  if (!view.household.ok) return missing("Calendar", view.household.failure);

  const { today } = view.household.value;
  if (today.length === 0) {
    return `<p class="unavailable">Nothing on today</p>`;
  }

  return today
    .slice(0, 7)
    .map(
      (entry) => `
        <div class="entry">
          <span class="at">${entryTime(entry, view.timeZone)}</span>
          <span class="what">${escapeHtml(entry.title)}</span>
        </div>`,
    )
    .join("");
};

const dinnerLine = (view: FrameView): string => {
  if (!view.household.ok) return missing("Meals", view.household.failure);

  const { dinner } = view.household.value;
  return dinner === undefined
    ? `<p class="unavailable">Nothing planned</p>`
    : `<p class="dinner">${escapeHtml(dinner)}</p>`;
};

/** Surnames are noise on a household display, and they are what pushed the
 * chore pills wide enough to evict the overdue count. */
const firstNameOf = (fullName: string): string => fullName.split(" ")[0] ?? fullName;

/**
 * The overdue count sits in the heading, not among the chore pills.
 *
 * The band has a fixed height, so anything sharing a wrapping row with the
 * chores can be pushed onto a second line and clipped — which is exactly what
 * a real chore called "Clean Top of Cupboards" assigned to someone with a
 * surname did. In the heading its position cannot be affected by the content.
 */
const choreHeading = (view: FrameView): string => {
  const overdue =
    view.household.ok && view.household.value.overdueChoreCount > 0
      ? `<span class="overdue">! ${view.household.value.overdueChoreCount} overdue</span>`
      : "";

  return `<h2 class="withCount"><span>Chores</span>${overdue}</h2>`;
};

const choreLines = (view: FrameView): string => {
  if (!view.household.ok) return missing("Chores", view.household.failure);

  const { choresDueToday } = view.household.value;
  if (choresDueToday.length === 0) {
    return `<p class="unavailable">None due today</p>`;
  }

  return `<div class="chores">${choresDueToday
    .slice(0, 3)
    .map(
      (chore) =>
        `<span class="chore">${escapeHtml(chore.name)}${
          chore.assignedTo === undefined
            ? ""
            : ` &ndash; ${escapeHtml(firstNameOf(chore.assignedTo))}`
        }</span>`,
    )
    .join("")}</div>`;
};

const startOfLocalDay = (moment: Date, timeZone: string): Date => {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(moment);

  return new Date(`${isoDate}T00:00:00Z`);
};

/**
 * The same page with the one thing that ticks on its own held still: the
 * rendered clock in the header. Hashing this rather than the real page is what makes a 304 possible —
 * otherwise the Frame's identity changes every minute and the Device redraws on
 * every Wake, which is the entire battery argument in ADR-0002.
 *
 * The date survives, so a Frame still changes when the day rolls over.
 *
 * This is derived from the page itself rather than from a hand-listed set of
 * fields, so a zone added later is covered automatically. The one rule that
 * keeps that true: a zone must render from data passed into the view, never
 * from `view.renderedAt` directly, or its changes will be invisible here.
 */
export const renderFrameIdentityHtml = (view: FrameView): string =>
  renderFrameHtml({
    ...view,
    renderedAt: startOfLocalDay(view.renderedAt, view.timeZone),
  });

/**
 * The Frame's page. Pure black and white by design: the rasteriser thresholds
 * at mid grey, so avoiding greys entirely makes the browser preview and the
 * Panel show byte-identical results.
 */
export const renderFrameHtml = (view: FrameView): string => `
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${PanelWidth}px; height: ${PanelHeight}px;
    background: #fff; color: #000;
    font-family: Helvetica, Arial, sans-serif;
    display: grid;
    grid-template-rows: 64px 1fr 136px;
    -webkit-font-smoothing: none;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 20px; border-bottom: 3px solid #000;
    font-size: 26px; font-weight: bold; letter-spacing: 1px;
  }
  header .muted { font-weight: normal; font-size: 18px; }
  header .rendered { font-weight: normal; font-size: 15px; }
  main { display: grid; grid-template-columns: 340px 1fr; min-height: 0; }
  section { padding: 14px 20px; min-height: 0; overflow: hidden; }
  section + section { border-left: 3px solid #000; }
  h2 {
    margin: 0 0 10px; font-size: 17px; letter-spacing: 2px;
    text-transform: uppercase; border-bottom: 1px solid #000;
    padding-bottom: 5px;
  }
  h2.withCount {
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px;
  }
  .train {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 7px 0; border-bottom: 1px dotted #000;
  }
  .time { font-size: 38px; font-weight: bold; font-variant-numeric: tabular-nums; }
  .state { font-size: 18px; font-weight: bold; }
  .state.cancelled, .state.delayedWithoutEstimate {
    background: #000; color: #fff; padding: 3px 8px;
  }
  .rain { margin: 12px 0 0; font-size: 18px; font-weight: bold; }
  .entry { display: flex; gap: 14px; align-items: baseline; padding: 5px 0; }
  .entry + .entry { border-top: 1px dotted #000; }
  .at {
    font-size: 21px; font-weight: bold; min-width: 86px;
    font-variant-numeric: tabular-nums;
  }
  .what {
    font-size: 21px; flex: 1;
    /* A flex child will not shrink below its content without this, so
       overflow never engages and long titles run off the panel. */
    min-width: 0;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .dinner { margin: 0; font-size: 26px; font-weight: bold; }
  .chores { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .chore {
    font-size: 19px; border: 2px solid #000; padding: 2px 8px;
    max-width: 100%; overflow: hidden; white-space: nowrap;
    text-overflow: ellipsis;
  }
  .overdue {
    font-size: 15px; font-weight: bold; letter-spacing: 0;
    background: #000; color: #fff; padding: 3px 9px;
    white-space: nowrap; flex: none;
  }
  .unavailable { margin: 0; font-size: 17px; font-style: italic; }
  .bands { display: grid; grid-template-columns: 340px 1fr; border-top: 3px solid #000; }
  /* The firmware stamps the Offline Marker blind into the bottom right corner
     (x 776, y 456, 16x16). Nothing may render there or it will be overdrawn. */
  .bands section:last-child { padding-right: 44px; }
</style>

<header>
  <span>${escapeHtml(dateIn(view.renderedAt, view.timeZone))}
    <span class="rendered">&middot; ${timeIn(view.renderedAt, view.timeZone)}</span></span>
  ${weatherSummary(view)}
</header>

<main>
  <section>
    <h2>Trains &rarr; ${escapeHtml(view.destination)}</h2>
    ${departureRows(view)}
    ${rainLine(view)}
  </section>
  <section>
    <h2>Today</h2>
    ${agendaRows(view)}
  </section>
</main>

<div class="bands">
  <section><h2>Dinner</h2>${dinnerLine(view)}</section>
  <section>${choreHeading(view)}${choreLines(view)}</section>
</div>
`;
