# display

E-ink status display: a Waveshare 4.26" 800×480 black/white panel driven by a
Seeed XIAO ESP32-C3 through a Waveshare e-Paper Driver HAT rev2.3.

## Status

| Area | State |
| --- | --- |
| Toolchain, build, flash | Working |
| Panel power (PWR on D4) | Working — required, see below |
| Rendering over SPI | Working |
| Deep sleep, timer wake | Working at `a505344`, not in the current build |
| BUSY feedback | Abandoned — unusable on this hardware |
| Button wake | Wired to D3, not yet enabled |
| Layout prototype | Default build — 8 demo pages on a 15 s cycle |
| Contrast probe | `contrast_probe` env — solid fields for hardware bring-up |

The default build is the layout prototype: it stays awake and cycles through
eight pages exploring type, tone, symbols, density and charts, to work out what
reads well on this panel. See `plans/display-prototype.md`. The timer-driven
sleep loop is preserved in commit `a505344` and comes back once a layout is
chosen.

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

```sh
pio run -t upload                      # layout prototype, the default env
pio run -e contrast_probe -t upload    # solid fields for judging contrast
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
