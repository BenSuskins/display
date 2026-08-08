# Firmware

The device half of [display](../../docs/README.md). Wakes, fetches a
pre-rendered Frame, writes it to the panel, sleeps for as long as it is told to.
Owns no layout and no data — see
[ADR-0001](../../docs/adr/0001-server-renders-the-frame.md).

A Waveshare 4.26" 800×480 black/white panel driven by a Seeed XIAO ESP32-C3
through a Waveshare e-Paper Driver HAT rev2.3.

## Status

| Area | State |
| --- | --- |
| Toolchain, build, flash | Working |
| Panel power (PWR on D4) | Working — required, see below |
| Rendering over SPI | Working |
| BUSY feedback | Abandoned — unusable on this hardware |
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

Run these from this directory.

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

`pio run -t upload` builds the default, which is `display`.

## Layout

```
platformio.ini
include/          headers shared by the firmware — Frame, FrameClient,
                  DisplayPins, OfflineMarker
src/
  main.cpp        wake, power, fetch, render, sleep
  FrameClient.cpp WiFi and the one HTTP call
  demo/           the superseded layout prototype, self-contained
  probe/          bring-up diagnostics, one file per environment
```

`demo/` and `probe/` are excluded from the `display` build. Everything else in
`src/` is included by default, so a new firmware file needs no config change.

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
silkscreen — see
[TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md#hardware) for why, and for
how to tell by behaviour instead.

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

MOSI/SCK land on the XIAO's hardware SPI pins, so GxEPD2's default SPI instance
needs no reconfiguration.

## Timing

A full refresh completes somewhere between 4 s and 8 s: 4 s truncates it and
blanks the screen, 8 s completes it. `RefreshCompletionMilliseconds` is set to
12 s — well above the observed edge, because e-ink slows as it cools and a
truncated refresh fails silently.

Awake time is ~14 s per wake, almost all of it that delay. It dominates the
battery budget. Partial refresh is much faster and worth using for frequently
changing content, reserving full refresh for periodic ghost clearing.

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

## When something is wrong

Most of bring-up went into a handful of traps — PWR floating, the Display Config
switch, GxEPD2's hidden refresh, BUSY carrying no information. They are written
up as symptom → cause → fix in
[docs/TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md). The full debugging
record is in [plans/eink-display.md](../../plans/eink-display.md).
