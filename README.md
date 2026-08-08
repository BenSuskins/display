# display

A fridge-mounted e-ink display showing the next trains from Kelvedon, weather,
today's calendar, tonight's dinner and outstanding chores. A Waveshare 4.26"
800×480 black/white panel driven by a Seeed XIAO ESP32-C3 through a Waveshare
e-Paper Driver HAT rev2.3.

Two components:

- **Firmware** — this directory. Wakes, fetches a pre-rendered Frame, writes it
  to the panel, sleeps for as long as it is told to. Owns no layout and no data.
- **[Render Service](server/)** — a TypeScript container that aggregates the
  data, lays the page out in HTML/CSS and rasterises it to 48,000 bytes of
  packed 1-bit pixels.

The split is deliberate and is the reason firmware barely changes: every design
decision lives on the server, where changing it is a deploy rather than
unclipping a battery device off a fridge. See
[ADR-0001](docs/adr/0001-server-renders-the-frame.md), the vocabulary in
[CONTEXT.md](CONTEXT.md), and the plan in
[plans/household-display.md](plans/household-display.md).

## Status

| Area | State |
| --- | --- |
| Toolchain, build, flash | Working |
| Panel power (PWR on D4) | Working — required, see below |
| Rendering over SPI | Working |
| BUSY feedback | Abandoned — unusable on this hardware |
| Render Service | All zones wired: trains, weather, calendar, dinner, chores |
| Device firmware | Working on hardware — fetches a Frame and renders it |
| Deep sleep, timer wake | Working |
| Button wake | Off by default — use RESET, or fit a button and see below |
| Offline marker | Written, blocked on the partial-refresh guard below |
| Battery reporting | **Not implemented** — no divider wired, see below |
| Partial refresh guard | **Unmeasured.** `partial_probe` env bisects it |
| Deep sleep current | **Unmeasured.** The battery estimate rests on it |

Two bench measurements gate everything: real deep-sleep current, and the partial
refresh guard delay. Both are called out where they matter.

## Environments

```sh
pio run -e display -t upload         # the firmware (needs the env vars below)
pio run -e partial_probe -t upload   # bisect the partial refresh guard
pio run -e contrast_probe -t upload  # solid fields for judging contrast
pio run -e demo -t upload            # the old 8-page layout prototype
```

`display` takes its secrets from the environment so none of them land in the
repo. An unset variable fails the build rather than flashing a device that
cannot connect:

```sh
export WIFI_SSID=... WIFI_PASSWORD=... DEVICE_TOKEN=...
export FRAME_URL=http://homelab.local:8080/frame
pio run -e display -t upload
```

## Battery reporting is not wired

The Render Service already accepts `?battery=` and stretches the sleep interval
when the voltage is low, and tolerates its absence — but the XIAO ESP32-C3 has
no onboard divider from the battery pads to an ADC pin, so the firmware does not
send it. Wiring it means a resistor divider from BAT+ to an ADC input. **D1
(GPIO3) is the pin to use**: it is ADC1_CH3, and it is free because BUSY turned
out to be useless on this HAT.

Until that exists, a flat battery simply stops the display rather than
stretching its own schedule to survive longer.

## Hardware

- Seeed XIAO ESP32-C3
- Waveshare e-Paper Driver HAT rev2.3 (Raspberry Pi 40-pin header layout)
- Waveshare 4.26" 800×480 b/w panel (GxEPD2 class `GxEPD2_426_GDEQ0426T82`)

Display Config switch on **A**, Interface Config on **0**. Those are the
positions this panel works in, established on the bench. Do not trust the
silkscreen: it prints both options at either end of each switch and gives no
clue whether the slider selects the label it points at or the one it has moved
away from. The labels appear to say A is the 3 Ω resistor and 0 is 3-wire SPI,
and both readings are contradicted by how the hardware actually behaves.

## Wiring

| Signal | HAT pin | XIAO | GPIO |
| --- | --- | --- | --- |
| VCC | 1 | 3V3 | — |
| GND | 6 | GND | — |
| RST | 11 | D5 | 7 |
| PWR | 12 | D4 | 6 |
| BUSY | 18 | D1 | 3 |
| DIN (MOSI) | 19 | D10 | 10 |
| DC | 22 | D6 | 21 |
| CLK (SCK) | 23 | D8 | 8 |
| CS | 24 | D7 | 20 |
| Button | — | D3 | 5 |

HAT pins are Raspberry Pi header numbering: odd pins in one row, even in the
other, counted from the silkscreened pin 1. Pin 20 (GND) sits next to pin 18
(BUSY) and pin 25 (GND) next to pin 23 (CLK) — the easy one-position slips.

Control lines deliberately avoid D0–D3. The ESP32-C3 only wakes from deep sleep
on GPIO0–GPIO5, so those are reserved for buttons. **D0 is left unused**: GPIO2
is a boot strapping pin, and a button pulling it low at reset can drop the chip
into download mode. D2 is free for a second button.

## Timing

A full refresh completes somewhere between 4 s and 8 s: 4 s truncates it and
blanks the screen, 8 s completes it. `RefreshCompletionMilliseconds` is set to
12 s — well above the observed edge, because e-ink slows as it cools and a
truncated refresh fails silently.

Awake time is ~14 s per wake, almost all of it that delay. It dominates the
battery budget. Partial refresh is much faster and worth using for frequently
changing content, reserving full refresh for periodic ghost clearing.

## Build

Environments are listed above. `pio run -t upload` builds the default, which is
the firmware and needs the four environment variables.

`pio device monitor` needs a real TTY. Run it in a terminal, not through a
non-interactive shell, or it fails with
`termios.error: (19, 'Operation not supported by device')`.

If upload cannot connect while deep sleep is running, hold the BOOT button
while plugging in the USB cable.

## Things that will waste your time

**An unchanged e-ink screen proves nothing.** The panel holds its last image
with no power, so a failed render looks identical to a successful one. Always
put a build timestamp or counter on screen — `__DATE__ " " __TIME__` works.

**PWR must be driven high.** The rev2.3 HAT has a power-enable pin. Floating, it
reads high or low depending on ambient conditions, so the panel works
intermittently and every other symptom becomes unreproducible. Most of the
bring-up was spent chasing symptoms of this.

**Display Config must be A, not B.** That switch picks the current-limiting
resistor for the panel's boost converter, and a panel this size needs the lower
one. On B the booster is starved, the drive waveform is weak, and the whole
panel renders pale. Verify by position, not by the printed resistance: the
silkscreen reads as though A were the 3 Ω option, but A is empirically the one
that drives this panel properly. The switch is also small enough to get nudged
while handling the board, so check it before suspecting anything else.

**Two switch positions are proved by behaviour, not labels.** If the panel
renders recognisable content at all, Interface Config is in 4-wire mode, because
3-wire folds the DC bit into the data stream and GxEPD2 produces nothing. If
solid fills are properly black, Display Config is on the low resistor. Both
inferences are more reliable than reading the HAT.

**Weak drive kills fine detail first, solid fills last.** Hairlines, small text
and dither go faint while large black areas still look fine, so a mostly-white
layout hides the fault almost completely. A weak panel also shows a full-height
pale band on whichever columns contain switching content — those source drivers
draw the most current — which moves if you move the content. Both signatures are
invisible on the demo pages. Render solid fields instead:
`pio run -e contrast_probe -t upload` cycles a solid black page and the same
page with a white box swept across three positions, which is what made the band
and its dependence on content obvious.

**GxEPD2 will issue a refresh you did not ask for.** `init(bitrate, initial,
…)` with `initial = true` sets `_initial_write`, and the next `writeImage`
silently calls `clearScreen()` first — a full refresh to white. The library
waits `full_refresh_time` for it, which is 1600 ms, and this panel needs about
8 s. Your own refresh then lands mid-clear and both are lost, leaving a blank
screen and no clue in the logs. Pass `initial = false` when you are about to
overwrite every pixel. The same flag matters for partial refresh:
`refresh(x, y, w, h)` starts with `if (_initial_refresh) return refresh(false)`,
so a 16×16 update becomes a full-screen one.

The general trap: **any library call can hide a refresh, and every refresh on
this hardware needs a guard the library does not know about.** Its 1600 ms is
built for a panel whose BUSY line works.

**BUSY carries no information here.** It reads a constant low whenever the panel
is powered. GxEPD2 expects active-high, sees low, and returns in microseconds —
that is what `_Update_Full : 1` means. Do not try to re-enable polling.

**A pin toggling on a ~20 ms period is 50 Hz mains hum**, i.e. floating. Single
reads of such a pin are coin flips.

**The bundled fonts are ASCII 0x20–0x7E and nothing more.** No degree sign, no
arrows, no accents, no box drawing. Every symbol has to be drawn as primitives.

**Do not stroke arcs by walking the angle.** Plotting points around a circle
leaves rounding pinholes that read as moiré at any thickness above one pixel.
Scan convert the annulus instead — see `drawArc` in `src/DemoPages.cpp`.

**Intermittent Dupont crimps** produced most of the false leads during bring-up:
code that worked once and never again, with no change in between. Solder for
anything permanent.

See `plans/eink-display.md` for the full debugging record.

## Refreshing it by hand

Press **RESET** on the XIAO. It pulls EN low, so the chip boots straight into a
fetch and a render — a manual refresh with nothing wired. The reset also clears
the RTC domain, so the stored frame identity is lost and the device always
redraws rather than getting a `304`. That is the right behaviour for a button
you pressed on purpose.

**BOOT cannot be used for this.** It is GPIO9, outside the GPIO0–GPIO5 range the
ESP32-C3 can wake from deep sleep on, and holding it at reset selects download
mode instead of running the firmware.

If you later fit a button between **D3 and GND**, uncomment `-D
WAKE_BUTTON_WIRED` in `platformio.ini`. It is off by default because arming a
deep-sleep wake on an unconnected pin invites spurious wakes, and a spurious
wake costs battery for nothing. Note that the pullup has to be held explicitly
across deep sleep — `pinMode(INPUT_PULLUP)` alone does not survive it, and the
C3 has no `rtc_gpio_pullup_en`; the mechanism is `gpio_hold_en` plus
`gpio_deep_sleep_hold_en`.
