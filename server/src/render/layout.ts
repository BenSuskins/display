import type { Departure } from "../domain/departure";
import type { Result } from "../domain/result";
import type { SourceFailure } from "../sources/departureSource";
import { PanelHeight, PanelWidth } from "./packMonochrome";

export type FrameView = {
  readonly renderedAt: Date;
  readonly timeZone: string;
  readonly destination: string;
  readonly departures: Result<readonly Departure[], SourceFailure>;
  readonly batteryVolts?: number;
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
  if (!view.departures.ok) {
    return `<p class="unavailable">Train times unavailable
      (${escapeHtml(view.departures.failure.kind)})</p>`;
  }
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
    grid-template-rows: 64px 1fr 104px 32px;
    -webkit-font-smoothing: none;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 20px; border-bottom: 3px solid #000;
    font-size: 26px; font-weight: bold; letter-spacing: 1px;
  }
  main { display: grid; grid-template-columns: 340px 1fr; }
  section { padding: 16px 20px; }
  section + section { border-left: 3px solid #000; }
  h2 {
    margin: 0 0 12px; font-size: 18px; letter-spacing: 2px;
    text-transform: uppercase; border-bottom: 1px solid #000;
    padding-bottom: 6px;
  }
  .train {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 9px 0; border-bottom: 1px dotted #000;
  }
  .time { font-size: 40px; font-weight: bold; font-variant-numeric: tabular-nums; }
  .state { font-size: 19px; font-weight: bold; }
  .state.cancelled, .state.delayedWithoutEstimate {
    background: #000; color: #fff; padding: 3px 8px;
  }
  .unavailable, .pending { font-size: 18px; font-style: italic; }
  .bands { display: grid; grid-template-columns: 340px 1fr; border-top: 3px solid #000; }
  footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 20px; border-top: 1px solid #000; font-size: 15px;
  }
</style>

<header>
  <span>${escapeHtml(dateIn(view.renderedAt, view.timeZone))}</span>
  <span class="pending">weather not wired yet</span>
</header>

<main>
  <section>
    <h2>Trains &rarr; ${escapeHtml(view.destination)}</h2>
    ${departureRows(view)}
  </section>
  <section>
    <h2>Today</h2>
    <p class="pending">Calendar not wired yet</p>
  </section>
</main>

<div class="bands">
  <section><h2>Dinner</h2><p class="pending">Not wired yet</p></section>
  <section><h2>Chores</h2><p class="pending">Not wired yet</p></section>
</div>

<footer>
  <span>rendered ${timeIn(view.renderedAt, view.timeZone)}</span>
  <span>${
    view.batteryVolts === undefined
      ? "battery unknown"
      : `battery ${view.batteryVolts.toFixed(2)}V`
  }</span>
</footer>
`;
