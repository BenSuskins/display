#pragma once

#include <Arduino.h>

// One Frame: 800x480, one bit per pixel, most significant bit leftmost, a set
// bit meaning white. That is the panel controller's native RAM format, which is
// why the Device can hand it straight to writeImage without touching it.
namespace Frame {
constexpr int16_t Width = 800;
constexpr int16_t Height = 480;
constexpr size_t ByteLength = (Width / 8) * Height;  // 48000

// The Render Service returns a quoted entity tag, e.g. "52dd0b8e06e82b5b".
constexpr size_t EtagCapacity = 48;
}  // namespace Frame

enum class FetchOutcome {
  Rendered,   // a new Frame arrived and is in the buffer
  Unchanged,  // 304: the Panel already shows this Frame
  Failed,     // no Frame; leave whatever is on the Panel alone
};

struct FrameResponse {
  FetchOutcome outcome;
  uint32_t nextWakeSeconds;
  char etag[Frame::EtagCapacity];
  int status;
};
