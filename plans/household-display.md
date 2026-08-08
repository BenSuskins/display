# Household display — plan

A battery e-ink panel on the fridge showing the next trains from Kelvedon,
weather, today's calendar, tonight's dinner and outstanding chores. A server
composes the image; the panel only shows it.

Vocabulary is in [`CONTEXT.md`](../CONTEXT.md). The three architectural
decisions are in [`docs/adr/`](../docs/adr/).

## Shape

```
  Device (XIAO ESP32-C3 + 4.26" Panel + 5000 mAh)
      |  GET /frame?battery=3.71   Bearer <device token>
      |  If-None-Match: <hash of Frame currently shown>
      v
  Render Service (TypeScript, container, ghcr.io/bensuskins/display)
      |            |              |
      |            |              +--> Huxley2 public -> Darwin  (KEL -> LST)
      |            +-------------------> Met Office DataHub
      +--------------------------------> Family Hub  /api/dashboard
                                                      /api/calendar?view=day
                                                      /api/meals?week=
```

The Device sends its battery voltage and the hash of what it is showing. It gets
back either 48,000 bytes of packed 1-bit pixels plus `X-Next-Wake-Seconds`, or a
`304` telling it to skip the refresh and sleep. That is the entire protocol.

## Firmware

Everything the Device does, in full:

1. Wake (timer or button on D3).
2. Drive `PanelPower` high, join Wi-Fi.
3. `GET /frame` with battery voltage and the stored Frame hash.
4. `200` → write the bytes, full refresh, wait out the 12 s Refresh Guard, store
   the new hash in RTC memory. `304` → do nothing.
5. Deep sleep for `X-Next-Wake-Seconds`.

Plus one exception: after three consecutive failed fetches, stamp the Offline
Marker into the footer by partial refresh. This is the only thing the Device
knows how to draw, and it exists because ADR-0001 leaves it otherwise mute.

Wi-Fi credentials and the device token come from PlatformIO build flags
(`-D WIFI_SSID=\"${sysenv.WIFI_SSID}\"`), so nothing lands in the repo.
Updates are by USB (ADR-0003).

`src/DemoPages.cpp` and the eight demo pages stay until the real layout is on
glass, then go. They answered their question.

## Render Service

TypeScript. React `renderToStaticMarkup` + Tailwind for the page, Playwright to
screenshot 800×480 in headless Chromium, sharp to threshold to 1-bit and pack.

Design in pure black and white in CSS — no greys to dither, so the threshold is
deterministic and the browser preview is pixel-identical to what the Panel shows.

Three source adapters behind interfaces, each with a fake:
`DepartureSource`, `WeatherSource`, `HouseholdSource`. Contract tests run the
same suite against fake and real. Per-source failure degrades that zone of the
Frame only — a dead Met Office does not cost you the train times.

A `GET /preview` route serving the same HTML on a dev port, so layout iteration
is a browser reload rather than a 15-second round trip to the Panel.

### Frame content

Fixed zones. Content within them varies by Daypart; the shape never moves.

```
+-------------------------------------------------------------+
| SATURDAY 8 AUGUST                    18` Cloudy   H21 L13   |
+---------------------------+---------------------------------+
| TRAINS -> LONDON LIV ST   | TODAY                           |
|                           |                                 |
|  07:16        ON TIME     |  09:00  Standup                 |
|  07:31        EXP 07:36   |  13:00  Dentist                 |
|  07:46        CANCELLED   |  16:30  Ellie swimming lesson   |
|                           |  19:00  Book club               |
|  rain 30% at 15:00        |                                 |
+---------------------------+---------------------------------+
| DINNER                    | CHORES  3 due                   |
| Chicken traybake          | Bins - Ben   Hoover - Sam       |
|                           | ! 2 overdue                     |
+-------------------------------------------------------------+
| rendered 08:31                               battery 78%    |
+-------------------------------------------------------------+
```

Trains show the next three **Catchable** departures — time and Departure State
only. No platform; Kelvedon has one. Five are fetched so the filter has room.

### Wake schedule

| Window | Interval | Why |
| --- | --- | --- |
| 06:30–08:00 | 10 min | The 06:40 wake-up to 07:16 train window |
| 08:00–22:00 | 30 min | Ambient |
| 22:00–06:30 | 30 min | Almost all `304`, so nearly free, and no long sleep to drift |

Never longer than 30 minutes, per ADR-0002. Estimated ~45 Wakes producing ~12
redraws a day, ~7 mAh/day — comfortably over a year on 5000 mAh, subject to the
deep-sleep measurement below.

## Configuration

All environment variables, injected by Ansible at deploy.

| Variable | Notes |
| --- | --- |
| `FAMILY_HUB_BASE_URL`, `FAMILY_HUB_TOKEN` | Token from `POST /api/tokens` |
| `METOFFICE_API_KEY`, `HOME_LATITUDE`, `HOME_LONGITUDE` | 360 calls/day free tier |
| `HUXLEY_BASE_URL`, `DARWIN_ACCESS_TOKEN` | Public instance to start |
| `STATION_ORIGIN=KEL`, `STATION_DESTINATION=LST` | Both CRS codes verified |
| `DEPARTURE_MIN_LEAD_MINUTES=15` | 10 min walk plus slack |
| `DEVICE_TOKEN` | Shared bearer for the Device |
| `TZ=Europe/London` | The Render Service owns BST |

## Build and deploy

Mirrors family-hub exactly: GitHub Actions on `v*` tags builds and pushes
`ghcr.io/bensuskins/display`; Ansible pulls and runs it with the secrets above.
Firmware builds locally with PlatformIO and is not in CI.

## Order of work

1. **Measure deep-sleep current.** Already open in `plans/eink-display.md`, and
   the only number that can invalidate the schedule above. Do it first.
2. **Bisect a partial-refresh guard.** The Offline Marker depends on it. If it
   proves unreliable, the marker falls back to doing nothing and the footer
   timestamp carries the load alone.
3. **Render Service skeleton** — fakes for all three sources, the layout above,
   `/preview`, 1-bit pipeline, golden-image tests on the packed output.
4. **Real adapters** — Family Hub, Met Office, Huxley2, with contract tests.
5. **`/frame`** — auth, hashing and `304`, `X-Next-Wake-Seconds`, Daypart logic.
6. **Firmware rewrite** — the five steps above, replacing the demo cycle.
7. **Container, CI, Ansible.**
8. **Offline Marker**, once step 2 has an answer.

## Known risks

- **Huxley2's public instance.** Its own README: "zero guarantees of uptime. It
  can (and regularly does) go down or break." Behind `DepartureSource`, so
  self-hosting is a base-URL change. Self-host when it annoys you.
- **The Darwin token is non-renewable in practice.** National Rail's self-service
  portal was retired in early 2026; a replacement means registering on the Rail
  Data Marketplace at raildata.org.uk. Do not lose the one you have.
- **The 15-minute rule drops the 07:16 at 07:01.** Correct as specified, wrong if
  you would jog for it. `DEPARTURE_MIN_LEAD_MINUTES` exists so you can find out.
- **Staleness in the morning** is capped at 10 minutes by the schedule, not
  eliminated. The button is the authoritative answer on the way out of the door.
- **Family Hub has no read-only token scope.** The display token can write. It
  never leaves the server, which is the mitigation.
