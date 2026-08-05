#pragma once

#include <Adafruit_GFX.h>
#include <stddef.h>

// Renderers take the plain Adafruit_GFX surface, not the GxEPD2 template, so
// page layout code stays independent of the panel and its paging loop.
using PageRenderer = void (*)(Adafruit_GFX &canvas);

struct DemoPage {
  const char *name;
  PageRenderer render;
};

extern const DemoPage DemoPages[];
extern const size_t DemoPageCount;

namespace Ink {
// GxEPD2_BW treats 0 as black and any other value as white.
constexpr uint16_t Black = 0x0000;
constexpr uint16_t White = 0xFFFF;

constexpr int16_t ScreenWidth = 800;
constexpr int16_t ScreenHeight = 480;

// Every page ends with an identifying strip: an unchanged e-ink screen is never
// evidence that a render happened, so the build timestamp always ships with it.
constexpr int16_t FooterHeight = 20;
constexpr int16_t ContentBottom = ScreenHeight - FooterHeight;
}  // namespace Ink

void renderPageFooter(Adafruit_GFX &canvas, size_t pageIndex);
