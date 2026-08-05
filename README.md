# display

E-ink status display: a Waveshare 4.26" 800×480 black/white panel driven by a
Seeed XIAO ESP32-C3 through a Waveshare e-Paper Driver HAT rev2.3.

## Status

Bring-up, not yet working end to end.

| Area | State |
| --- | --- |
| Toolchain, build, flash | Working |
| Panel power (PWR on D5) | Working — required, see below |
| Panel responds to refresh | Working — screen clears |
| Image data over SPI | **Broken** — `fillScreen(BLACK)` still lands on white |
| BUSY feedback | Abandoned — unusable on this hardware |
| Deep sleep / button wake | Not started |

`src/main.cpp` is currently a crude `fillScreen(GxEPD_BLACK)` diagnostic rather
than the real sketch. It exists to answer one question: can the ESP make every
pixel change colour. Until that passes, nothing else is worth debugging.

## Hardware

- Seeed XIAO ESP32-C3
- Waveshare e-Paper Driver HAT rev2.3 (Raspberry Pi 40-pin header layout)
- Waveshare 4.26" 800×480 b/w panel (GxEPD2 class `GxEPD2_426_GDEQ0426T82`)

Display Config switch on **B**. Interface Config must be the 4-wire SPI
position — 3-wire folds the DC bit into the data stream and GxEPD2 will not
work.

## Wiring

| Signal | HAT pin | XIAO | GPIO |
| --- | --- | --- | --- |
| VCC | 1 | 3V3 | — |
| GND | 6 | GND | — |
| RST | 11 | D3 | 5 |
| PWR | 12 | D5 | 7 |
| BUSY | 18 | D4 | 6 |
| DIN (MOSI) | 19 | D10 | 10 |
| DC | 22 | D2 | 4 |
| CLK (SCK) | 23 | D8 | 8 |
| CS | 24 | D1 | 3 |

HAT pins are Raspberry Pi header numbering: odd pins in one row, even in the
other, counted from the silkscreened pin 1. Pin 20 (GND) sits next to pin 18
(BUSY) and pin 25 (GND) next to pin 23 (CLK) — the easy one-position slips.

MOSI and SCK land on the XIAO's hardware SPI pins, so GxEPD2's default SPI
instance needs no reconfiguration.

## Build

```sh
pio run -t upload
pio device monitor
```

`pio device monitor` needs a real TTY. Run it in a terminal, not through a
non-interactive shell, or it fails with
`termios.error: (19, 'Operation not supported by device')`.

If upload cannot connect once deep sleep is in use, hold the BOOT button while
plugging in the USB cable.

## Things that will waste your time

**An unchanged e-ink screen proves nothing.** The panel holds its last image
with no power, so a failed render looks identical to a successful one. Always
put a build timestamp or counter on screen — `__DATE__ " " __TIME__` works.

**PWR must be driven high.** The rev2.3 HAT has a power-enable pin. Floating, it
reads high or low depending on ambient conditions, so the panel works
intermittently and every other symptom becomes unreproducible. Most of the
bring-up was spent chasing symptoms of this.

**BUSY carries no information here.** It reads a constant low whenever the panel
is powered. GxEPD2 expects active-high, sees low, and returns in microseconds —
that is what `_Update_Full : 1` means. Refresh completion is gated by a fixed
delay instead. Do not try to re-enable polling.

**A pin toggling on a ~20 ms period is 50 Hz mains hum**, i.e. floating. Single
reads of such a pin are coin flips.

See `plans/eink-display.md` for the full debugging record.
