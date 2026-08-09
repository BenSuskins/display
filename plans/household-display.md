# Household display — plan

A battery e-ink panel on the fridge showing the next trains from Kelvedon,
weather, today's calendar, tonight's dinner and outstanding chores. A server
composes the image; the panel only shows it.

Vocabulary is in [`CONTEXT.md`](../docs/CONTEXT.md). The three architectural
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
                                                      /api/calendar?view=week
                                                      /api/users
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

`apps/firmware/src/demo/` and the eight demo pages stay until the real layout is on
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
Exactly one zone — the left column of the middle band — is Daypart-dependent.

The **commute** Daypart, 06:00–09:00 local:

```
+-------------------------------------------------------------+
| SATURDAY 8 AUGUST                    18` Cloudy   H21 L13   |
+---------------------------+---------------------------------+
| TRAINS -> LST             | TODAY                  +1 more  |
|                           |  09:00  Standup                 |
|  07:16        ON TIME     |  13:00  Dentist                 |
|  07:31        EXP 07:36   |  16:30  Ellie swimming lesson   |
|  07:46        CANCELLED   |  19:00  Book club               |
|                           +---------------------------------+
|  rain 30% at 15:00        | NEXT 7 DAYS            +1 day   |
|                           |  SUN  07:00 Bin day             |
|                           |  TUE  15:30 Swimming lesson     |
|                           |  THU  Sam away for work         |
+---------------------------+---------------------------------+
| DINNER                    | CHORES                ! 2 over  |
| Chicken traybake          | Bins - Ben   Hoover - Sam       |
+-------------------------------------------------------------+
```

The **day** Daypart, every other hour. The trains have gone, so the zone goes
to the weather at the size the departures had — and the header drops its
weather line rather than print the same three numbers twice:

```
+-------------------------------------------------------------+
| SATURDAY 8 AUGUST                                           |
+---------------------------+---------------------------------+
| WEATHER                   | TODAY                  +1 more  |
|  18`                      |  09:00  Standup                 |
|                           |  13:00  Dentist                 |
|  Cloudy                   |  16:30  Ellie swimming lesson   |
|  H21  L13                 |  19:00  Book club               |
|  Rain 30% at 15:00        +---------------------------------+
|  -----------------------  | NEXT 7 DAYS            +1 day   |
|  TOMORROW       H23 L14   |  SUN  07:00 Bin day             |
|  Heavy showers - rain 70% |  TUE  15:30 Swimming lesson     |
|                           |  THU  Sam away for work         |
+---------------------------+---------------------------------+
| DINNER                    | CHORES                ! 2 over  |
| Chicken traybake          | Bins - Ben   Hoover - Sam       |
+-------------------------------------------------------------+
```

Trains show the next three **Catchable** departures — time and Departure State
only. No platform; Kelvedon has one. Eight are fetched so the filter has room.
Outside the commute window no board is fetched at all: nothing would show it,
and Huxley2 is the flakiest thing we depend on.

The rain line states the negative in the day Daypart ("No rain expected today")
and stays silent in the commute one. A blank space is ambiguous when the zone is
about the weather and merely quiet when it is about trains.

Both data columns run "now" over "next". Today's entries sit above the next
seven days; the current temperature sits above tomorrow's. The lower half of
each is terser on purpose — a line per day rather than a row per event, and a
high, a low and a chance of rain rather than a second big number. What did not
fit is counted in the heading, which is the one place in a fixed-height zone the
content cannot push around.

### Wake schedule

The dense window *is* the commute window — `COMMUTE_STARTS_AT` and
`COMMUTE_ENDS_AT` set both, so the Panel can never show a board it is not
waking often enough to keep worth reading.

| Window | Interval | Why |
| --- | --- | --- |
| 06:00–09:00 | 10 min | The commute Daypart: departures are on the Panel, so staleness is capped at 10 min |
| 09:00–22:00 | 30 min | Ambient |
| 22:00–06:00 | 30 min | Almost all `304`, so nearly free, and no long sleep to drift |

Never longer than 30 minutes, per ADR-0002. Estimated ~45 Wakes producing ~12
redraws a day, ~7 mAh/day — comfortably over a year on 5000 mAh, subject to the
deep-sleep measurement below.

Widening the dense window from 06:30–08:00 to the full commute Daypart costs
~9 more Wakes a day, plus a handful more redraws — a board that has moved is a
changed Frame, so those extra Wakes are not all `304`s. A few percent of the
budget above, and the reason it is worth paying is that the alternative is a
departure board on the fridge that is half an hour out of date.

## Configuration

All environment variables, injected by Ansible at deploy.

| Variable | Notes |
| --- | --- |
| `FAMILY_HUB_BASE_URL`, `FAMILY_HUB_TOKEN` | Token from `POST /api/tokens` |
| `METOFFICE_API_KEY`, `HOME_LATITUDE`, `HOME_LONGITUDE` | 360 calls/day free tier |
| `HUXLEY_BASE_URL`, `DARWIN_ACCESS_TOKEN` | Public instance to start |
| `STATION_ORIGIN=KEL`, `STATION_DESTINATION=LST` | Both CRS codes verified |
| `DEPARTURE_MIN_LEAD_MINUTES=15` | 10 min walk plus slack |
| `COMMUTE_STARTS_AT=06:00`, `COMMUTE_ENDS_AT=09:00` | The commute Daypart, and the dense Wake window with it |
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
