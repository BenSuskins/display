#pragma once

#include <Arduino.h>

// The only thing the Device knows how to draw.
//
// Server-side rendering leaves the Device mute when it cannot reach the Render
// Service: it has no fonts, no layout and no data, so it cannot compose a
// message saying so. Without this, a Frame hours out of date looks exactly like
// a fresh one, which is the failure mode this hardware is already prone to.
//
// A 16x16 black tile with a white exclamation mark, stamped into the footer by
// partial refresh so the rest of the Frame is left untouched. Bits follow the
// panel convention: a set bit is white.
namespace OfflineMarker {
constexpr int16_t Width = 16;
constexpr int16_t Height = 16;

// x and width must be multiples of 8 — the controller addresses RAM by byte.
constexpr int16_t X = 384;
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

static_assert(sizeof(Bitmap) == (Width / 8) * Height,
              "marker bitmap must match its declared size");
}  // namespace OfflineMarker
