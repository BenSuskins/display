#pragma once

#include <Arduino.h>

// The only thing the Device knows how to draw.
//
// Server-side rendering leaves the Device mute when it cannot reach the Render
// Service: it has no fonts, no layout and no data, so it cannot compose a
// message saying so. Without this, a Frame hours out of date looks exactly like
// a fresh one, which is the failure mode this hardware is already prone to.
//
// A 16x16 black tile with a white exclamation mark, stamped by partial refresh
// so the rest of the Frame is left untouched. Bits follow the panel convention:
// a set bit is white.
//
// The firmware writes this blind at a fixed position, so the layout has to keep
// that corner clear — see the padding on the last band section in layout.ts.
// Move one and you must move the other.
namespace OfflineMarker {
constexpr int16_t Width = 16;
constexpr int16_t Height = 16;

// x and width must be multiples of 8 — the controller addresses RAM by byte.
constexpr int16_t X = 776;
constexpr int16_t Y = 456;

constexpr uint8_t Bitmap[] = {
    0xFF, 0xFF,  // margin
    0x80, 0x01, 0x80, 0x01,
    0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81,  // stem
    0x81, 0x81, 0x81, 0x81, 0x81, 0x81,
    0x80, 0x01,  // gap
    0x81, 0x81, 0x81, 0x81,  // dot
    0x80, 0x01, 0x80, 0x01,
    0xFF, 0xFF,  // margin
};

// A partial refresh is differential: it drives pixels from what the controller
// believes was there to what is there now. The marker is stamped on wakes where
// no frame was written, so the controller has just been powered up and its
// previous buffer is undefined. Declaring the previous state explicitly fixes
// that, and white is the truth — the marker sits on the footer's background,
// between the rendered time and the battery reading.
constexpr uint8_t WhiteTile[] = {
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
};

static_assert(sizeof(Bitmap) == (Width / 8) * Height,
              "marker bitmap must match its declared size");
static_assert(sizeof(WhiteTile) == sizeof(Bitmap),
              "the declared previous state must cover the same region");
}  // namespace OfflineMarker
