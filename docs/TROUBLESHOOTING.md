# Troubleshooting

> Common issues and fixes for `display`. Organised by symptom.

## How to use this doc

Search by symptom — the bold question line — before reading top to bottom. If
you fix something not listed here, add it; the bar is "would future-me have
wanted this written down?". Keep entries short: symptom → cause → fix.

The hardware section is the expensive one. Almost all of bring-up was spent on
the first two entries.

---

## Hardware

**An unchanged screen after a flash, and no way to tell whether anything ran.**

Cause: e-ink holds its last image with no power, so a failed render looks
identical to a successful one. An unchanged screen is never evidence.

Fix: always put a build timestamp or counter on screen. `__DATE__ " " __TIME__`
works.

**The panel works intermittently, and every other symptom is unreproducible.**

Cause: PWR is floating. The Driver HAT rev2.3 has a power-enable pin, and
floating it reads high or low depending on ambient conditions.

Fix: drive PWR (D4, HAT pin 12) high in `setup()` before `display.init()`, with
a 100 ms settle. Never let it go low mid-refresh — that leaves the image
half-written. Dropping it during deep sleep is fine; e-ink retains unpowered.

Symptoms that all resolved once PWR was driven: BUSY held low but too weakly to
beat a 45k internal pullup; full refresh appearing to take ~17.5 s; renders
succeeding once and never again with unchanged code; `hibernate()` appearing to
correlate with failure.

**The whole panel renders pale. Hairlines, small text and dither go faint while
large black areas still look fine.**

Cause: the Display Config switch is on B, which starves the boost converter. A
panel this size needs the lower current-limiting resistor.

Fix: move Display Config to **A**. Verify by position, not by the printed
resistance — the silkscreen reads as though A were the 3 Ω option, but A is
empirically the one that drives this panel properly. The switch is small enough
to get nudged while handling the board, so check it before suspecting anything
else.

A weak panel also shows a full-height pale band on whichever columns contain
switching content — those source drivers draw the most current — and the band
moves if you move the content. Both signatures are nearly invisible on a
mostly-white layout. Render solid fields instead:
`pio run -e contrast_probe -t upload`.

**You cannot tell which way the config switches are actually set.**

Cause: the silkscreen prints both options at either end of each switch and gives
no clue whether the slider selects the label it points at or the one it has
moved away from.

Fix: infer from behaviour, which is more reliable than reading the HAT. If the
panel renders recognisable content at all, Interface Config is in 4-wire mode —
3-wire folds the DC bit into the data stream and GxEPD2 produces nothing. If
solid fills are properly black, Display Config is on the low resistor.

**The screen goes blank and the logs show nothing wrong.**

Cause: GxEPD2 issued a refresh you did not ask for. `init(bitrate, initial, …)`
with `initial = true` sets `_initial_write`, and the next `writeImage` silently
calls `clearScreen()` first — a full refresh to white. The library waits
`full_refresh_time`, 1600 ms; this panel needs about 8 s. Your own refresh lands
mid-clear and both are lost.

Fix: pass `initial = false` when you are about to overwrite every pixel. The
same flag matters for partial refresh: `refresh(x, y, w, h)` starts with
`if (_initial_refresh) return refresh(false)`, so a 16×16 update becomes a
full-screen one.

The general trap: **any library call can hide a refresh, and every refresh on
this hardware needs a guard the library does not know about.** GxEPD2's 1600 ms
is built for a panel whose BUSY line works.

**`_waitWhileBusy` returns in microseconds and BUSY never changes state.**

Cause: BUSY reads a constant low on this HAT whenever the panel is powered. It
is not shorted — it reads high through a pullup when unpowered — but it carries
no information. GxEPD2 expects active-high, sees low, and returns immediately.
That is what `_Update_Full : 1` means.

Fix: none. `DisplayPins::Busy` is permanently `-1` and refresh completion is
gated by `RefreshCompletionMilliseconds` (12 s). Do not try to re-enable
polling. Note that GxEPD2 prints elapsed time in microseconds, so a value of `1`
means it never saw BUSY assert.

**A GPIO reads a value that toggles on roughly a 20 ms period.**

Cause: that is 50 Hz mains hum — the pin is floating.

Fix: drive or pull the pin. Single reads of a floating pin are coin flips and
prove nothing.

**Text renders but a degree sign, arrow or accent comes out as a blank box.**

Cause: the bundled Adafruit GFX fonts are ASCII 0x20–0x7E and nothing more.

Fix: draw the symbol as primitives. And do not stroke arcs by walking the angle
— plotting points around a circle leaves rounding pinholes that read as moiré at
any thickness above one pixel. Scan convert the annulus instead; see `drawArc`
in `apps/firmware/src/demo/DemoPages.cpp`.

**Code that worked once and never again, with no change in between.**

Cause: intermittent Dupont crimps. These produced most of the false leads during
bring-up.

Fix: solder anything permanent.

## Setup

**`pio device monitor` fails with `termios.error: (19, 'Operation not supported
by device')`.**

Cause: it needs a real TTY.

Fix: run it in a terminal, not through a non-interactive shell or an agent.

**`pio run -t upload` cannot connect to the board.**

Cause: deep sleep is running, so the USB CDC device disappears between wakes.

Fix: hold the BOOT button while plugging in the USB cable.

**The firmware build fails with `DEVICE_TOKEN must be set when building`.**

Cause: working as intended. An unset secret expands to an empty string, and
`main.cpp` `static_assert`s against that rather than letting you flash a device
that cannot connect.

Fix: export all four before building, from `apps/firmware`:

```sh
export WIFI_SSID=... WIFI_PASSWORD=... DEVICE_TOKEN=...
export FRAME_URL=http://homelab.local:8080/frame
pio run -e display -t upload
```

**The Render Service exits immediately with `refusing to start:`.**

Cause: `DEVICE_TOKEN` or `DARWIN_ACCESS_TOKEN` is missing. Neither has a
default.

Fix: `cp .env.example .env` in `apps/server` and fill both in. Weather and
Family Hub are optional — their zones report themselves unconfigured rather than
blocking startup.

## Runtime

**Tests pass with `bun test` but the service will not run.**

Cause: Bun strips types without checking them, so `bun test` alone happily
passes code that does not compile.

Fix: always use `bun run check` (`tsc --noEmit && bun test`).

**`bun run check` fails only in `test/render/rasteriser.test.ts`.**

Cause: Chromium is not installed. That test deliberately launches a real
browser; everything else runs against fakes.

Fix: `bunx playwright install --with-deps chromium`.

**A zone on the display says it is unavailable but everything else is fine.**

Cause: working as intended. Sources fail one zone at a time — every source
returns a `Result`, so a dead Met Office costs the weather, not the trains.

Fix: check the service logs for that source. If the zone says it needs a
variable, the credential is unset rather than the upstream being down.

**The display is showing a stale Frame with a small black exclamation mark in
the bottom-right corner.**

Cause: that is the Offline Marker. The device could not reach the Render Service
and left the last Frame up, since it has no fonts or layout of its own to
compose a message with.

Fix: check the service is reachable at the device's `FRAME_URL` from the
device's network, and that `DISPLAY_HOST_PORT` matches the port in that URL.

**The device redraws on every wake instead of getting 304s.**

Cause: the ETag is derived from the page's identity, not its bytes — a footer
clock ticking every minute would otherwise force a redraw every wake. If it
still redraws, something genuinely changing is inside
`renderFrameIdentityHtml`'s output.

Fix: diff two consecutive `renderFrameIdentityHtml` results for the value that
is moving. Note that pressing RESET always redraws by design: it clears the RTC
domain, so the stored frame identity is lost.

**A colour or grey in the layout renders unpredictably.**

Cause: the rasteriser thresholds at mid grey. Anything that is not `#000` or
`#fff` is a guess about which side it lands on.

Fix: draw only in pure black and white. Then the browser preview and the panel
agree exactly.

## Deployment

**Chromium fails to launch in the container after a Playwright bump.**

Cause: the Playwright client version and the base image tag drifted apart.

Fix: `apps/server/Dockerfile` pins
`mcr.microsoft.com/playwright:v1.62.1-noble`. Bump that tag and the `playwright`
dependency in `package.json` together.

**A variable set in `.env` has no effect in the homelab.**

Cause: `apps/server/docker-compose.yml` passes an explicit list. A variable that
`config.ts` reads is not automatically forwarded.

Fix: add it to the `environment:` block in `docker-compose.yml` as well.
