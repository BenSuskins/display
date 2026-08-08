# Household Display

A battery-powered e-ink panel on the fridge showing trains, weather, today's
calendar, meals and chores. A server composes the image; the panel only shows it.

## Language

### The physical thing

**Panel**:
The Waveshare 4.26" 800×480 black-and-white e-paper screen. Holds its last image
with no power and has no greys, only black and white pixels.
_Avoid_: screen, display (ambiguous with the project name)

**Device**:
The whole object — Panel, driver HAT, XIAO ESP32-C3 and battery in a magnetic
enclosure. Owns no layout knowledge and no household data.
_Avoid_: board, ESP, client

**Refresh Guard**:
The blind delay the Device waits after issuing a refresh, because this Panel's
BUSY line carries no information. 12 s for a full refresh.
_Avoid_: timeout, settle time

**Offline Marker**:
A small glyph the Device stamps into the footer by partial refresh after
repeated failed fetches. The only thing the Device knows how to draw.
_Avoid_: error screen, error state

### The image

**Frame**:
One rendered image ready for the Panel: 800×480, one bit per pixel, 48,000 bytes.
The unit of everything the Device receives.
_Avoid_: image, bitmap, screenshot, render

**Render Service**:
The server that turns household data into a Frame. A consumer of Family Hub in
the same way the iOS app is, holding an API token and no privileged access.
_Avoid_: backend, API, dashboard service

**Daypart**:
The period the Render Service uses to decide what a Frame contains. A Render
Service concept; the Device has no idea it exists.
_Avoid_: mode, time of day, profile

**Staleness**:
The gap between when a Frame was rendered and when a human reads it. Always
positive, because e-ink shows the last Frame indefinitely.
_Avoid_: cache age, lag

### The commute

**Catchable Departure**:
A departure leaving far enough ahead to be worth showing — currently 5 minutes.
Deliberately shorter than the ten minute walk to Kelvedon: a train you would
have to run for is still information, and only the reader knows whether they
would run.
_Avoid_: next train, upcoming departure

**Departure State**:
What a Catchable Departure is doing: on time, delayed to a stated time, or
cancelled. The only attribute shown besides the time — Kelvedon has one platform.
_Avoid_: status, etd

### Device activity

**Wake**:
One cycle of Device activity: leave deep sleep, join Wi-Fi, request a Frame,
possibly refresh the Panel, sleep again.
_Avoid_: poll, tick, cycle

**Scheduled Wake**:
A Wake the sleep timer fired. The Render Service sets how long that timer runs.

**Requested Wake**:
A Wake the button caused. Identical to a Scheduled Wake except in what started it.
_Avoid_: manual refresh, force refresh
