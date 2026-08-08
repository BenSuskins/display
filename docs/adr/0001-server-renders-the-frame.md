# The Render Service composes the Frame; the Device only shows it

The Device is battery-powered and lives on a fridge, so reflashing it is a
physical errand — and layout is the part of this project most likely to change.
We therefore put all composition on the server: it aggregates Family Hub, the Met
Office and train departures, lays the page out in HTML/CSS, rasterises it in
headless Chromium and returns 48,000 bytes of packed 1-bit pixels. The Device
fetches those bytes, writes them to the Panel and sleeps.

## Consequences

- Every design change is a container deploy, not a reflash. Firmware should
  approach zero change after bring-up, which is why we deferred OTA (ADR-0003).
- The ASCII 0x20–0x7E limit and the 24pt ceiling of the bundled Adafruit GFX
  fonts stop applying. Any typeface, any size, real text wrapping, and no drawn
  substitutes for symbols the fonts lack.
- The Family Hub API token lives on the server, never on a magnet someone can
  lift off the fridge. This matters because Family Hub has no read-only token
  scope: a display token can create and delete chores, meals and inventory.
- **The Device cannot draw anything.** With the Render Service unreachable it has
  no way to compose a message, which is why the Offline Marker exists as the one
  deliberate exception — a fixed glyph stamped by partial refresh.
- The existing `src/DemoPages.cpp` renderers and the host preview harness become
  bring-up scaffolding rather than the foundation of the product.
