# E-ink display bring-up

Waveshare 4.26" 800x480 b/w panel on a Waveshare e-Paper Driver HAT rev2.3,
driven by a Seeed XIAO ESP32-C3 over PlatformIO/Arduino with GxEPD2.

## Wiring

Driver HAT uses the Raspberry Pi 40-pin header layout. Odd pins in one row,
even in the other, counted from the silkscreened pin 1.

| Signal     | HAT pin | Position      | XIAO | GPIO |
| ---------- | ------- | ------------- | ---- | ---- |
| VCC        | 1       | odd row, 1st  | 3V3  | —    |
| GND        | 6       | even row, 3rd | GND  | —    |
| RST        | 11      | odd row, 6th  | D5   | 7    |
| PWR        | 12      | even row, 6th | D4   | 6    |
| BUSY       | 18      | even row, 9th | D1   | 3    |
| DIN (MOSI) | 19      | odd row, 10th | D10  | 10   |
| DC         | 22      | even row 11th | D6   | 21   |
| CLK (SCK)  | 23      | odd row, 12th | D8   | 8    |
| CS         | 24      | even row 12th | D7   | 20   |
| Button     | —       | —             | D3   | 5    |

Control lines avoid D0–D3 so those stay available as deep-sleep wake sources.
D0 is left unused because GPIO2 is a boot strapping pin.

MOSI/SCK land on the XIAO's hardware SPI pins, so GxEPD2's default SPI instance
needs no reconfiguration.

## PWR is the one that bites

Driver HAT rev2.3 has a power-enable pin. Nothing on the panel works until it is
driven high, and a floating enable reads high or low depending on ambient
conditions — so the panel appears to work intermittently and every other symptom
becomes unreproducible. It is driven from D4 in `setup()` before `display.init()`,
with a 100 ms settle.

Symptoms seen while PWR was floating, all of which resolved once it was driven:

- BUSY held low but too weakly to beat a 45k internal pullup
- Full refresh appearing to take ~17.5 s
- Renders succeeding once and then never again with unchanged code
- `hibernate()` appearing to correlate with failure

Never let PWR go low mid-refresh — the image is left half-written. Dropping it
during deep sleep is fine once a refresh has completed; e-ink retains its image
unpowered.

## BUSY is unusable — settled

With the panel properly powered, BUSY goes low as `init()` runs and stays low
indefinitely. It is not shorted to ground (it reads high through a pullup when
the panel is unpowered) but it never changes state, so it carries no
information. GxEPD2 sees a level that is not its expected active-high and
returns in microseconds, hence `_Update_Full : 1`.

`DisplayPins::Busy` is therefore permanently `-1`, and refresh completion is
gated by `RefreshCompletionMilliseconds`. Do not try to re-enable polling.

## Config switches

Display Config is on **A**. Interface Config must be the 4-wire SPI position;
3-wire folds the DC bit into the data stream and GxEPD2 will not work.

Superseded: this file originally recorded B, on the grounds that A produced no
output. That was PWR floating, not the switch. Once PWR was driven, the contrast
probe showed A is the position that drives this panel properly — see
`docs/TROUBLESHOOTING.md`.

## Debugging notes

- E-ink retains its last image with no power, so an unchanged screen is never
  evidence that a render succeeded. Put a build timestamp or counter on screen.
- `pio device monitor` needs a real TTY. Running it through a non-interactive
  shell fails with `termios.error: (19, 'Operation not supported by device')`.
- GxEPD2's `_waitWhileBusy` prints elapsed time in **microseconds**. A value of
  `1` means it never saw BUSY assert and returned immediately.
- A pin toggling on a ~20 ms period is 50 Hz mains hum, i.e. floating. Single
  point reads of such a pin are coin flips and prove nothing.

## Refresh timing

Bisected on working hardware: 4 s truncates the refresh and blanks the screen,
8 s completes it. Committed value is 12 s, deliberately well above the observed
edge — e-ink slows as it cools and a truncated refresh fails silently, leaving a
stale image with nothing in the logs.

Awake time is ~14 s per wake, almost entirely that delay.

## Open

- Button wake on D3 is wired but not enabled. Needs
  `esp_deep_sleep_enable_gpio_wakeup()`.
- Partial refresh for frequently changing content; full refresh is slow enough
  to dominate the battery budget.
- Measure actual deep-sleep current before sizing a battery.
