# Firmware is updated over USB, not OTA

The Device ships with the default single-app partition scheme and no
over-the-air update path. Because the Render Service owns layout, data, daypart
logic and the wake schedule (ADR-0001, ADR-0002), firmware has almost nothing
left to change — so OTA would be insurance against a problem we have designed
out, at the cost of an OTA partition scheme that halves usable flash, rollback
handling, and a new way to brick a device we would then have to retrieve
physically anyway.

Reversing this means switching partition schemes, which erases NVS and requires
one USB reflash to apply. That is the whole cost, and it is small — but it is
the reason to note the decision rather than leave a future reader wondering.

Revisit if firmware turns out to change more than a handful of times after
bring-up. The two open experiments most likely to force changes are the
partial-refresh guard timing behind the Offline Marker, and real deep-sleep
current measurement.
