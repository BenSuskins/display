# display

> A fridge-mounted e-ink display showing the next trains, weather, today's calendar, tonight's dinner and outstanding chores.

## Overview

A Waveshare 4.26" 800×480 black/white panel on a Seeed XIAO ESP32-C3, stuck to
a fridge and running off a battery. It wakes on a schedule, fetches an image
that has already been laid out for it, writes it to the panel and goes back to
sleep.

The point of the split is that the device owns nothing. Every layout and data
decision lives on a server in the homelab, where changing it is a deploy rather
than unclipping a battery device off a fridge and finding a USB cable. See
[ADR-0001](adr/0001-server-renders-the-frame.md).

## Tech Stack

- **Firmware** — C++ on Arduino/ESP-IDF, ESP32-C3, built with PlatformIO
  (`espressif32@^6.9.0`); GxEPD2 + Adafruit GFX
- **Render Service** — TypeScript on Bun 1.3.13, no bundler, strict `tsconfig`
- **Rasterisation** — headless Chromium via Playwright 1.62.1
- **Deployment** — Docker image on `ghcr.io/bensuskins/display`, run in the
  homelab via Docker Compose

## Project Structure

```
apps/
  firmware/         PlatformIO project — the device
    src/            main.cpp, FrameClient.cpp
    src/demo/       the superseded 8-page layout prototype
    src/probe/      bring-up diagnostics (contrast, partial refresh)
    include/        shared firmware headers
  server/           the Render Service
    src/domain/     departures, weather, household, wake schedule
    src/render/     HTML layout, Chromium rasteriser, 1-bit packing
    src/sources/    Huxley2, Met Office, Family Hub adapters + fakes
    test/
docs/               this directory
  adr/              architecture decision records
plans/              working plans and bring-up records
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.3.13 — the Render Service
- [PlatformIO Core](https://platformio.org/install/cli) — the firmware
- A Darwin OpenLDBWS token for train times

### Setup

The Render Service is the half you can run without hardware:

```sh
git clone git@github.com:bensuskins/display.git
cd display/apps/server
bun install
bunx playwright install chromium
cp .env.example .env          # fill in DEVICE_TOKEN and DARWIN_ACCESS_TOKEN
bun run src/main.ts
```

Verify: open `http://localhost:8080/preview?token=<DEVICE_TOKEN>` — you should
see the 800×480 page in pure black and white, with train times in the left
column.

To render a Frame with no credentials at all:

```sh
bun run scripts/sampleFrame.ts
```

The firmware needs the panel wired up — see
[apps/firmware/README.md](../apps/firmware/README.md) for the wiring table and
switch positions.

## Environment Variables

Set on the Render Service. Ansible injects these in the homelab; nothing has a
secret as a default.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DEVICE_TOKEN` | Yes | — | Shared bearer the Device presents. Also accepted as `?token=` for `/preview` |
| `DARWIN_ACCESS_TOKEN` | Yes | — | Darwin OpenLDBWS token, passed through to Huxley2 |
| `HUXLEY_BASE_URL` | No | `https://huxley2.azurewebsites.net` | Huxley2 instance |
| `STATION_ORIGIN` | No | `KEL` | Origin CRS code |
| `STATION_DESTINATION` | No | `LST` | Destination CRS code |
| `DEPARTURE_MIN_LEAD_MINUTES` | No | `5` | How far ahead a departure must be to be Catchable |
| `COMMUTE_STARTS_AT` | No | `06:00` | Start of the commute Daypart, local wall clock |
| `COMMUTE_ENDS_AT` | No | `09:00` | End of it. Inside the window the Frame shows departures; outside it that zone shows weather. Also the window the Device wakes every 10 min for |
| `MET_ACCESS_TOKEN` | No | — | Met Office DataHub. Unset means the weather zone says so |
| `MET_BASE_URL` | No | `https://data.hub.api.metoffice.gov.uk` | Met Office DataHub base |
| `HOME_LATITUDE` | No | `51.8382` | Where the display lives |
| `HOME_LONGITUDE` | No | `0.7018` | Where the display lives |
| `HUB_ACCESS_TOKEN` | No | — | Family Hub. Both hub variables must be set or the household zones report themselves unconfigured |
| `HUB_BASE_URL` | No | — | Family Hub base URL |
| `TZ` | No | `Europe/London` | Drives the wake schedule and all wall-clock times |
| `PORT` | No | `8080` | Port inside the container |
| `DISPLAY_HOST_PORT` | No | `8080` | Port published on the host — the one `FRAME_URL` must use |

Firmware secrets come from the shell at build time rather than the repo:
`WIFI_SSID`, `WIFI_PASSWORD`, `FRAME_URL`, `DEVICE_TOKEN`. An unset variable
fails the build rather than flashing a device that cannot connect.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run check` | Typecheck and test the Render Service (run from `apps/server`) |
| `bun run src/main.ts` | Start the Render Service locally |
| `bun run scripts/sampleFrame.ts` | Render a Frame from fakes, no credentials needed |
| `bun run scripts/frameToPng.ts frame.bin frame.png` | Decode a Frame back to a viewable PNG |
| `pio run -e display -t upload` | Build and flash the firmware (run from `apps/firmware`) |
| `pio run -e contrast_probe -t upload` | Solid fields for judging panel contrast |
| `pio run -e partial_probe -t upload` | Bisect the partial-refresh guard delay |
| `pio run -e demo -t upload` | The superseded 8-page layout prototype |

## Testing

Tests live in `apps/server/test/`, mirroring `src/`, and run with `bun test`.
Always use `bun run check` (`tsc --noEmit && bun test`) — Bun strips types
without checking them, so `bun test` alone will pass code that does not compile.

Everything runs against fakes (`fakeDepartureSource`, `fakeSources`,
`fakeRasteriser`) except `test/render/rasteriser.test.ts`, which launches real
Chromium — the only way to catch a layout or bit-packing mistake.

The firmware has no unit tests. CI proves that all four PlatformIO environments
compile, and that the missing-secret `static_assert` guard still fails a build
with no credentials set.

## Deployment

Pushes to `main` build `ghcr.io/bensuskins/display:latest` and `:<sha7>`; `v*`
tags publish under the tag name. The homelab pulls the image and runs it with
`apps/server/docker-compose.yml`.

The Playwright version in `apps/server/Dockerfile` is pinned to the base image
tag. Bump both together or Chromium and the client go out of step.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the component breakdown, the
device/server protocol and the wake schedule.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — particularly the hardware
section, which is most of what bring-up cost.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](../LICENSE)
