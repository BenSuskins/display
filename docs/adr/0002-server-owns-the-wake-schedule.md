# The Render Service decides when the Device next wakes

The Device sleeps for however long the `X-Next-Wake-Seconds` response header
says, and holds no schedule of its own. This puts cadence — dense through the
06:30–08:00 commute window, sparse in the afternoon, minimal overnight — on the
side of the system that is cheap to change, and lets the schedule react to
things the Device cannot reason about, such as its own reported battery voltage.

Paired with it: the Device sends a hash of the Frame it is currently showing, and
the Render Service answers `304 Not Modified` when nothing has changed. The
Device then skips the Panel refresh entirely, turning a ~15 s Wake into a ~3 s
one.

## Consequences

- Sleeps stay short (~30 min maximum) because the ESP32-C3's deep-sleep timer
  runs off an internal RC oscillator that drifts by percent, not ppm. An
  8-hour overnight sleep would land ±10 minutes off, and 06:35 is the one wake
  of the day that has to be accurate. Short chained sleeps never accumulate that
  error, and conditional refresh makes the extra wakes almost free.
- Waking often is now cheaper than waking rarely used to be: ~45 Wakes a day
  producing ~12 actual redraws costs less battery than 30 unconditional redraws.
- The Panel gets far fewer full-refresh cycles, which is good for ghosting.
- The Device must retain the Frame hash across deep sleep, so it lives in RTC
  memory. Losing it costs one unnecessary redraw, nothing worse.
- The Render Service now needs a clock and a timezone (Europe/London) and is
  responsible for getting British Summer Time right.
