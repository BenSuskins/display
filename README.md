# display

E-ink status display: a Waveshare 4.26" 800×480 black/white panel driven by a
Seeed XIAO ESP32-C3 through a Waveshare e-Paper Driver HAT rev2.3.

## Status

| Area | State |
| --- | --- |
| Toolchain, build, flash | Working |
| Panel power (PWR on D4) | Working — required, see below |
| Rendering over SPI | Working |
| Deep sleep, timer wake | Working — 60 s cycle |
| BUSY feedback | Abandoned — unusable on this hardware |
| Button wake | Wired to D3, not yet enabled |

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

```sh
pio run -t upload
pio device monitor
```

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

**BUSY carries no information here.** It reads a constant low whenever the panel
is powered. GxEPD2 expects active-high, sees low, and returns in microseconds —
that is what `_Update_Full : 1` means. Do not try to re-enable polling.

**A pin toggling on a ~20 ms period is 50 Hz mains hum**, i.e. floating. Single
reads of such a pin are coin flips.

**Intermittent Dupont crimps** produced most of the false leads during bring-up:
code that worked once and never again, with no change in between. Solder for
anything permanent.

See `plans/eink-display.md` for the full debugging record.
