#include "DemoPage.h"

#include <Arduino.h>
#include <Fonts/FreeMono12pt7b.h>
#include <Fonts/FreeMono9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSans18pt7b.h>
#include <Fonts/FreeSans24pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSerif18pt7b.h>
#include <math.h>
#include <stdarg.h>

namespace {

constexpr int16_t Margin = 12;
constexpr int16_t ContentLeft = Margin;
constexpr int16_t ContentRight = Ink::ScreenWidth - Margin;
constexpr int16_t ContentWidth = ContentRight - ContentLeft;
constexpr int16_t HeadingRuleY = 32;
constexpr int16_t ContentTop = 42;

// ---------------------------------------------------------------------------
// Text placement
//
// The built-in 5x7 font positions the cursor at the glyph top; GFX fonts
// position it at the baseline. getTextBounds reports both consistently, so
// every helper here takes a top edge and works with either kind of font.
// ---------------------------------------------------------------------------

struct TextExtent {
  int16_t inkLeft;
  int16_t inkTop;
  uint16_t width;
  uint16_t height;
};

TextExtent measureText(Adafruit_GFX &canvas, const char *text) {
  TextExtent extent{};
  canvas.getTextBounds(text, 0, 0, &extent.inkLeft, &extent.inkTop, &extent.width,
                       &extent.height);
  return extent;
}

void useBuiltinFont(Adafruit_GFX &canvas, uint8_t scale) {
  canvas.setFont(nullptr);
  canvas.setTextSize(scale);
}

void useFont(Adafruit_GFX &canvas, const GFXfont *font, uint8_t scale = 1) {
  canvas.setFont(font);
  canvas.setTextSize(scale);
}

int16_t printAtTop(Adafruit_GFX &canvas, int16_t x, int16_t top, const char *text) {
  const TextExtent extent = measureText(canvas, text);
  canvas.setCursor(x - extent.inkLeft, top - extent.inkTop);
  canvas.print(text);
  return extent.height;
}

void printRightAlignedAtTop(Adafruit_GFX &canvas, int16_t right, int16_t top,
                            const char *text) {
  const TextExtent extent = measureText(canvas, text);
  printAtTop(canvas, right - extent.width, top, text);
}

void printCenteredAtTop(Adafruit_GFX &canvas, int16_t centerX, int16_t top,
                        const char *text) {
  const TextExtent extent = measureText(canvas, text);
  printAtTop(canvas, centerX - extent.width / 2, top, text);
}

void printFormattedAtTop(Adafruit_GFX &canvas, int16_t x, int16_t top,
                         const char *format, ...) {
  char text[96];
  va_list arguments;
  va_start(arguments, format);
  vsnprintf(text, sizeof(text), format, arguments);
  va_end(arguments);
  printAtTop(canvas, x, top, text);
}

void printCaption(Adafruit_GFX &canvas, int16_t x, int16_t top, const char *text) {
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, x, top, text);
}

// ---------------------------------------------------------------------------
// Tone: the panel is 1 bit deep, so every grey is a pattern. Levels run 0..16
// and the matrix is indexed in absolute screen coordinates, which keeps
// neighbouring patches in phase instead of showing a seam.
// ---------------------------------------------------------------------------

constexpr uint8_t BayerMatrix[4][4] = {
    {0, 8, 2, 10}, {12, 4, 14, 6}, {3, 11, 1, 9}, {15, 7, 13, 5}};

void fillDithered(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t width,
                  int16_t height, uint8_t level) {
  for (int16_t row = 0; row < height; row++) {
    for (int16_t column = 0; column < width; column++) {
      if (BayerMatrix[(y + row) & 3][(x + column) & 3] < level) {
        canvas.drawPixel(x + column, y + row, Ink::Black);
      }
    }
  }
}

enum class Hatch { Horizontal, Vertical, DiagonalForward, Cross, Checker };

void fillHatched(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t width,
                 int16_t height, Hatch pattern, int16_t spacing) {
  switch (pattern) {
    case Hatch::Horizontal:
      for (int16_t row = 0; row < height; row += spacing) {
        canvas.drawFastHLine(x, y + row, width, Ink::Black);
      }
      return;
    case Hatch::Vertical:
      for (int16_t column = 0; column < width; column += spacing) {
        canvas.drawFastVLine(x + column, y, height, Ink::Black);
      }
      return;
    case Hatch::DiagonalForward:
      for (int16_t offset = 0; offset < width + height; offset += spacing) {
        for (int16_t row = 0; row < height; row++) {
          const int16_t column = offset - row;
          if (column >= 0 && column < width) {
            canvas.drawPixel(x + column, y + row, Ink::Black);
          }
        }
      }
      return;
    case Hatch::Cross:
      fillHatched(canvas, x, y, width, height, Hatch::Horizontal, spacing);
      fillHatched(canvas, x, y, width, height, Hatch::Vertical, spacing);
      return;
    case Hatch::Checker:
      for (int16_t row = 0; row < height; row++) {
        for (int16_t column = 0; column < width; column++) {
          if (((row / spacing) + (column / spacing)) % 2 == 0) {
            canvas.drawPixel(x + column, y + row, Ink::Black);
          }
        }
      }
      return;
  }
}

// ---------------------------------------------------------------------------
// Primitives Adafruit_GFX does not provide
// ---------------------------------------------------------------------------

// Scan converted rather than stroked. Walking the angle and plotting points --
// whether as pixels or as radial spokes -- leaves rounding pinholes that read as
// moire once the band is more than a pixel thick. Testing every pixel in the
// bounding box against the radii instead is exact and gappless.
//
// Angles are degrees counter-clockwise from east, so a gauge sweeping clockwise
// from the top left runs -45 to 225.
void drawArc(Adafruit_GFX &canvas, int16_t centerX, int16_t centerY, int16_t radius,
             int16_t thickness, float startDegrees, float endDegrees) {
  const int16_t outerRadius = radius > 1 ? radius : 1;
  const int16_t innerEdge = outerRadius - thickness + 1;
  const int16_t innerRadius = innerEdge > 1 ? innerEdge : 1;
  // Bounds are half a pixel outside the nominal radii, measured to pixel centres,
  // so even a one pixel band stays continuous where it crosses the axes.
  const float outerBound = (outerRadius + 0.5f) * (outerRadius + 0.5f);
  const float innerBound = (innerRadius - 0.5f) * (innerRadius - 0.5f);
  // A closed ring needs no angle test, which keeps atan2f out of the icon paths.
  const bool isFullCircle = endDegrees - startDegrees >= 360.0f;

  const int16_t scanExtent = outerRadius + 1;
  for (int16_t offsetY = -scanExtent; offsetY <= scanExtent; offsetY++) {
    for (int16_t offsetX = -scanExtent; offsetX <= scanExtent; offsetX++) {
      const int32_t distanceSquared =
          static_cast<int32_t>(offsetX) * offsetX + static_cast<int32_t>(offsetY) * offsetY;
      if (distanceSquared > outerBound || distanceSquared < innerBound) {
        continue;
      }
      if (!isFullCircle) {
        float degrees = atan2f(-offsetY, offsetX) / static_cast<float>(DEG_TO_RAD);
        while (degrees < startDegrees) {
          degrees += 360.0f;
        }
        if (degrees > endDegrees) {
          continue;
        }
      }
      canvas.drawPixel(centerX + offsetX, centerY + offsetY, Ink::Black);
    }
  }
}

void drawRing(Adafruit_GFX &canvas, int16_t centerX, int16_t centerY, int16_t radius,
              int16_t thickness) {
  drawArc(canvas, centerX, centerY, radius, thickness, 0.0f, 360.0f);
}

void drawThickLine(Adafruit_GFX &canvas, int16_t fromX, int16_t fromY, int16_t toX,
                   int16_t toY, int16_t thickness) {
  const int16_t spread = thickness / 2;
  for (int16_t offset = -spread; offset <= spread; offset++) {
    canvas.drawLine(fromX, fromY + offset, toX, toY + offset, Ink::Black);
    canvas.drawLine(fromX + offset, fromY, toX + offset, toY, Ink::Black);
  }
}

void drawDashedHLine(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t width,
                     int16_t dashLength, int16_t gapLength) {
  for (int16_t offset = 0; offset < width; offset += dashLength + gapLength) {
    const int16_t remaining = width - offset;
    canvas.drawFastHLine(x + offset, y, remaining < dashLength ? remaining : dashLength,
                         Ink::Black);
  }
}

void drawThickRect(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t width,
                   int16_t height, int16_t thickness) {
  for (int16_t inset = 0; inset < thickness; inset++) {
    canvas.drawRect(x + inset, y + inset, width - 2 * inset, height - 2 * inset,
                    Ink::Black);
  }
}

// The bundled fonts stop at 0x7E, so there is no degree glyph to print.
void drawDegreeMark(Adafruit_GFX &canvas, int16_t centerX, int16_t centerY,
                    int16_t radius, int16_t thickness) {
  drawRing(canvas, centerX, centerY, radius, thickness);
}

// ---------------------------------------------------------------------------
// Icons. Each draws inside a square box of the given size so the same glyph can
// be compared across scales.
// ---------------------------------------------------------------------------

using IconRenderer = void (*)(Adafruit_GFX &canvas, int16_t x, int16_t y,
                              int16_t size);

int16_t scaled(int16_t size, float fraction) { return lroundf(size * fraction); }

struct Disc {
  int16_t centerX;
  int16_t centerY;
  int16_t radius;
};

bool isInsideLobes(const Disc *discs, size_t discCount, int16_t baseY, int16_t shrink,
                   int16_t pointX, int16_t pointY) {
  if (pointY > baseY - shrink) {
    return false;
  }
  for (size_t index = 0; index < discCount; index++) {
    const int32_t offsetX = pointX - discs[index].centerX;
    const int32_t offsetY = pointY - discs[index].centerY;
    const int32_t reach = discs[index].radius - shrink;
    if (reach > 0 && offsetX * offsetX + offsetY * offsetY <= reach * reach) {
      return true;
    }
  }
  return false;
}

// Strokes the silhouette of a union of discs cut off at a base line, knocking the
// interior out in white as it goes. Drawing each lobe as its own arc instead
// leaves the arcs that fall inside neighbouring lobes visible, which reads as a
// tangle rather than one cloud, and lets whatever is behind show through.
void drawLobedSilhouette(Adafruit_GFX &canvas, const Disc *discs, size_t discCount,
                         int16_t baseY, int16_t stroke) {
  int16_t left = discs[0].centerX - discs[0].radius;
  int16_t right = discs[0].centerX + discs[0].radius;
  int16_t top = discs[0].centerY - discs[0].radius;
  for (size_t index = 1; index < discCount; index++) {
    const Disc &disc = discs[index];
    if (disc.centerX - disc.radius < left) left = disc.centerX - disc.radius;
    if (disc.centerX + disc.radius > right) right = disc.centerX + disc.radius;
    if (disc.centerY - disc.radius < top) top = disc.centerY - disc.radius;
  }

  for (int16_t pointY = top; pointY <= baseY; pointY++) {
    for (int16_t pointX = left; pointX <= right; pointX++) {
      if (!isInsideLobes(discs, discCount, baseY, 0, pointX, pointY)) {
        continue;
      }
      const bool onEdge =
          !isInsideLobes(discs, discCount, baseY, stroke, pointX, pointY);
      canvas.drawPixel(pointX, pointY, onEdge ? Ink::Black : Ink::White);
    }
  }
}

void drawBatteryLevelIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size,
                          float chargeFraction) {
  const int16_t bodyWidth = scaled(size, 0.82f);
  const int16_t bodyHeight = scaled(size, 0.52f);
  const int16_t bodyTop = y + scaled(size, 0.24f);
  const int16_t stroke = size >= 32 ? 2 : 1;
  drawThickRect(canvas, x, bodyTop, bodyWidth, bodyHeight, stroke);
  canvas.fillRect(x + bodyWidth, bodyTop + scaled(size, 0.14f), scaled(size, 0.09f),
                  scaled(size, 0.24f), Ink::Black);

  const int16_t inset = stroke + 1;
  const int16_t trackWidth = bodyWidth - 2 * inset;
  canvas.fillRect(x + inset, bodyTop + inset, lroundf(trackWidth * chargeFraction),
                  bodyHeight - 2 * inset, Ink::Black);
}

void drawBatteryIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  drawBatteryLevelIcon(canvas, x, y, size, 0.7f);
}

void drawWifiIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t baseY = y + scaled(size, 0.88f);
  const int16_t thickness = size >= 32 ? 3 : 2;
  drawArc(canvas, centerX, baseY, scaled(size, 0.88f), thickness, 50.0f, 130.0f);
  drawArc(canvas, centerX, baseY, scaled(size, 0.60f), thickness, 45.0f, 135.0f);
  drawArc(canvas, centerX, baseY, scaled(size, 0.32f), thickness, 40.0f, 140.0f);
  canvas.fillCircle(centerX, baseY, scaled(size, 0.08f), Ink::Black);
}

void drawThermometerIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t stemWidth = scaled(size, 0.26f);
  const int16_t bulbRadius = scaled(size, 0.20f);
  const int16_t bulbY = y + scaled(size, 0.78f);
  const int16_t stroke = size >= 32 ? 2 : 1;
  for (int16_t inset = 0; inset < stroke; inset++) {
    canvas.drawRoundRect(centerX - stemWidth / 2 + inset, y + inset,
                         stemWidth - 2 * inset, scaled(size, 0.66f),
                         stemWidth / 2 - inset, Ink::Black);
    canvas.drawCircle(centerX, bulbY, bulbRadius - inset, Ink::Black);
  }
  canvas.fillCircle(centerX, bulbY, bulbRadius - stroke - 1, Ink::Black);
  canvas.fillRect(centerX - stemWidth / 4, y + scaled(size, 0.40f), stemWidth / 2,
                  scaled(size, 0.36f), Ink::Black);
}

void drawDropletIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t bodyRadius = scaled(size, 0.32f);
  const int16_t bodyY = y + scaled(size, 0.64f);
  canvas.fillCircle(centerX, bodyY, bodyRadius, Ink::Black);
  canvas.fillTriangle(centerX, y, centerX - bodyRadius, bodyY, centerX + bodyRadius,
                      bodyY, Ink::Black);
}

void drawSunIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t centerY = y + size / 2;
  canvas.fillCircle(centerX, centerY, scaled(size, 0.24f), Ink::Black);
  const int16_t rayStart = scaled(size, 0.32f);
  const int16_t rayEnd = scaled(size, 0.48f);
  const int16_t thickness = size >= 32 ? 3 : 1;
  for (int16_t degrees = 0; degrees < 360; degrees += 45) {
    const float radians = degrees * DEG_TO_RAD;
    drawThickLine(canvas, centerX + lroundf(cosf(radians) * rayStart),
                  centerY - lroundf(sinf(radians) * rayStart),
                  centerX + lroundf(cosf(radians) * rayEnd),
                  centerY - lroundf(sinf(radians) * rayEnd), thickness);
  }
}

void drawCloudIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  canvas.fillCircle(x + scaled(size, 0.30f), y + scaled(size, 0.58f),
                    scaled(size, 0.22f), Ink::Black);
  canvas.fillCircle(x + scaled(size, 0.54f), y + scaled(size, 0.44f),
                    scaled(size, 0.28f), Ink::Black);
  canvas.fillCircle(x + scaled(size, 0.76f), y + scaled(size, 0.60f),
                    scaled(size, 0.20f), Ink::Black);
  canvas.fillRect(x + scaled(size, 0.10f), y + scaled(size, 0.58f),
                  scaled(size, 0.80f), scaled(size, 0.22f), Ink::Black);
}

// Outlined for hero sizes: a 120px solid cloud is a very heavy block of ink.
void drawSunBehindCloudIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t stroke = size >= 60 ? 3 : 2;
  const int16_t sunCenterX = x + scaled(size, 0.74f);
  const int16_t sunCenterY = y + scaled(size, 0.52f);
  const int16_t sunRadius = scaled(size, 0.17f);
  drawRing(canvas, sunCenterX, sunCenterY, sunRadius, stroke);
  for (int16_t degrees = 0; degrees < 360; degrees += 45) {
    const float radians = degrees * DEG_TO_RAD;
    drawThickLine(canvas, sunCenterX + lroundf(cosf(radians) * (sunRadius + 5)),
                  sunCenterY - lroundf(sinf(radians) * (sunRadius + 5)),
                  sunCenterX + lroundf(cosf(radians) * (sunRadius + 12)),
                  sunCenterY - lroundf(sinf(radians) * (sunRadius + 12)), stroke);
  }

  // Lobes are centred on the base line, so the silhouette is their union clipped
  // to everything above it and the flat bottom comes out for free.
  const int16_t baseY = y + scaled(size, 0.90f);
  // The middle lobe is lifted clear of the shoulders: with all three on the base
  // line the union merges into one smooth mound that does not read as a cloud.
  const Disc lobes[] = {
      {static_cast<int16_t>(x + scaled(size, 0.26f)), baseY, scaled(size, 0.20f)},
      {static_cast<int16_t>(x + scaled(size, 0.48f)),
       static_cast<int16_t>(baseY - scaled(size, 0.13f)), scaled(size, 0.24f)},
      {static_cast<int16_t>(x + scaled(size, 0.70f)), baseY, scaled(size, 0.19f)},
  };
  drawLobedSilhouette(canvas, lobes, sizeof(lobes) / sizeof(lobes[0]), baseY, stroke);
}

void drawArrowUpIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t headBottom = y + scaled(size, 0.44f);
  canvas.fillTriangle(centerX, y, centerX - scaled(size, 0.30f), headBottom,
                      centerX + scaled(size, 0.30f), headBottom, Ink::Black);
  canvas.fillRect(centerX - scaled(size, 0.11f), headBottom, scaled(size, 0.22f),
                  scaled(size, 0.52f), Ink::Black);
}

void drawArrowDownIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t headTop = y + scaled(size, 0.52f);
  canvas.fillTriangle(centerX, y + size, centerX - scaled(size, 0.30f), headTop,
                      centerX + scaled(size, 0.30f), headTop, Ink::Black);
  canvas.fillRect(centerX - scaled(size, 0.11f), y + scaled(size, 0.04f),
                  scaled(size, 0.22f), scaled(size, 0.50f), Ink::Black);
}

void drawBellIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t domeY = y + scaled(size, 0.44f);
  const int16_t domeRadius = scaled(size, 0.25f);
  const int16_t skirtY = y + scaled(size, 0.74f);
  const int16_t skirtHalf = scaled(size, 0.34f);
  const int16_t stroke = size >= 32 ? 2 : 1;
  drawArc(canvas, centerX, domeY, domeRadius, stroke, 0.0f, 180.0f);
  drawThickLine(canvas, centerX - domeRadius, domeY, centerX - skirtHalf, skirtY,
                stroke);
  drawThickLine(canvas, centerX + domeRadius, domeY, centerX + skirtHalf, skirtY,
                stroke);
  for (int16_t inset = 0; inset < stroke; inset++) {
    canvas.drawFastHLine(centerX - skirtHalf, skirtY + inset, 2 * skirtHalf,
                         Ink::Black);
  }
  canvas.fillCircle(centerX, y + scaled(size, 0.16f), scaled(size, 0.07f), Ink::Black);
  canvas.fillCircle(centerX, skirtY + scaled(size, 0.14f), scaled(size, 0.09f),
                    Ink::Black);
}

void drawCheckIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t thickness = size >= 32 ? 4 : 2;
  drawThickLine(canvas, x + scaled(size, 0.12f), y + scaled(size, 0.54f),
                x + scaled(size, 0.38f), y + scaled(size, 0.82f), thickness);
  drawThickLine(canvas, x + scaled(size, 0.38f), y + scaled(size, 0.82f),
                x + scaled(size, 0.88f), y + scaled(size, 0.20f), thickness);
}

void drawCrossIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t thickness = size >= 32 ? 4 : 2;
  drawThickLine(canvas, x + scaled(size, 0.16f), y + scaled(size, 0.16f),
                x + scaled(size, 0.84f), y + scaled(size, 0.84f), thickness);
  drawThickLine(canvas, x + scaled(size, 0.84f), y + scaled(size, 0.16f),
                x + scaled(size, 0.16f), y + scaled(size, 0.84f), thickness);
}

void drawCalendarIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t bodyTop = y + scaled(size, 0.16f);
  const int16_t bodyHeight = scaled(size, 0.80f);
  const int16_t stroke = size >= 32 ? 2 : 1;
  for (int16_t inset = 0; inset < stroke; inset++) {
    canvas.drawRoundRect(x + inset, bodyTop + inset, size - 2 * inset,
                         bodyHeight - 2 * inset, 3, Ink::Black);
  }
  canvas.fillRect(x, bodyTop, size, scaled(size, 0.18f), Ink::Black);
  canvas.fillRect(x + scaled(size, 0.24f), y, scaled(size, 0.09f),
                  scaled(size, 0.20f), Ink::Black);
  canvas.fillRect(x + scaled(size, 0.67f), y, scaled(size, 0.09f),
                  scaled(size, 0.20f), Ink::Black);

  const int16_t dotSize = size >= 32 ? 3 : 2;
  for (int16_t row = 0; row < 2; row++) {
    for (int16_t column = 0; column < 3; column++) {
      canvas.fillRect(x + scaled(size, 0.18f) + column * scaled(size, 0.26f),
                      bodyTop + scaled(size, 0.34f) + row * scaled(size, 0.24f),
                      dotSize, dotSize, Ink::Black);
    }
  }
}

void drawClockIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t centerY = y + size / 2;
  const int16_t stroke = size >= 32 ? 2 : 1;
  drawRing(canvas, centerX, centerY, size / 2, stroke);
  drawThickLine(canvas, centerX, centerY, centerX, centerY - scaled(size, 0.30f),
                stroke);
  drawThickLine(canvas, centerX, centerY, centerX + scaled(size, 0.22f),
                centerY + scaled(size, 0.14f), stroke);
}

void drawPersonIcon(Adafruit_GFX &canvas, int16_t x, int16_t y, int16_t size) {
  const int16_t centerX = x + size / 2;
  const int16_t stroke = size >= 32 ? 2 : 1;
  drawRing(canvas, centerX, y + scaled(size, 0.26f), scaled(size, 0.20f), stroke);
  drawArc(canvas, centerX, y + size, scaled(size, 0.38f), stroke, 15.0f, 165.0f);
}

struct IconSample {
  const char *label;
  IconRenderer draw;
};

constexpr IconSample IconSamples[] = {
    {"battery", drawBatteryIcon},   {"wifi", drawWifiIcon},
    {"temp", drawThermometerIcon},  {"humidity", drawDropletIcon},
    {"sun", drawSunIcon},           {"cloud", drawCloudIcon},
    {"rising", drawArrowUpIcon},    {"falling", drawArrowDownIcon},
    {"alert", drawBellIcon},        {"done", drawCheckIcon},
    {"failed", drawCrossIcon},      {"calendar", drawCalendarIcon},
    {"clock", drawClockIcon},       {"person", drawPersonIcon},
};
constexpr size_t IconSampleCount = sizeof(IconSamples) / sizeof(IconSamples[0]);

// ---------------------------------------------------------------------------
// Chrome shared by the explanatory pages
// ---------------------------------------------------------------------------

void drawPageHeading(Adafruit_GFX &canvas, const char *title, const char *question) {
  useFont(canvas, &FreeSansBold12pt7b);
  printAtTop(canvas, ContentLeft, 8, title);
  useBuiltinFont(canvas, 1);
  printRightAlignedAtTop(canvas, ContentRight, 16, question);
  canvas.drawFastHLine(ContentLeft, HeadingRuleY, ContentWidth, Ink::Black);
}

void drawSectionHeading(Adafruit_GFX &canvas, int16_t x, int16_t top, int16_t width,
                        const char *text) {
  useBuiltinFont(canvas, 1);
  const int16_t height = printAtTop(canvas, x, top, text);
  canvas.drawFastHLine(x, top + height + 3, width, Ink::Black);
}

// ---------------------------------------------------------------------------
// Page 1: typography ladder
// ---------------------------------------------------------------------------

constexpr char TypographySample[] = "Meggy 12:34 88% jGQ";

struct FontSample {
  const char *label;
  const GFXfont *font;  // nullptr selects the built-in 5x7 font
  uint8_t scale;
};

constexpr FontSample FontSamples[] = {
    {"builtin 5x7 x1", nullptr, 1},
    {"builtin 5x7 x2", nullptr, 2},
    {"FreeSans 9pt", &FreeSans9pt7b, 1},
    {"FreeSans 12pt", &FreeSans12pt7b, 1},
    {"FreeSans 18pt", &FreeSans18pt7b, 1},
    {"FreeSans 24pt", &FreeSans24pt7b, 1},
    {"FreeSansBold 9pt", &FreeSansBold9pt7b, 1},
    {"FreeSansBold 12pt", &FreeSansBold12pt7b, 1},
    {"FreeSansBold 18pt", &FreeSansBold18pt7b, 1},
    {"FreeMono 12pt", &FreeMono12pt7b, 1},
    {"FreeMonoBold 12pt", &FreeMonoBold12pt7b, 1},
    {"FreeSerif 18pt", &FreeSerif18pt7b, 1},
};
constexpr size_t FontSampleCount = sizeof(FontSamples) / sizeof(FontSamples[0]);

void applyFontSample(Adafruit_GFX &canvas, const FontSample &sample) {
  if (sample.font == nullptr) {
    useBuiltinFont(canvas, sample.scale);
  } else {
    useFont(canvas, sample.font, sample.scale);
  }
}

void renderTypographyLadder(Adafruit_GFX &canvas) {
  drawPageHeading(canvas, "Typography ladder",
                  "same string in every bundled face, with measured ink height");

  constexpr int16_t LabelColumnX = ContentLeft;
  constexpr int16_t SampleColumnX = 150;
  constexpr int16_t RowGap = 10;

  int16_t rowTop = ContentTop;
  for (size_t index = 0; index < FontSampleCount; index++) {
    const FontSample &sample = FontSamples[index];
    applyFontSample(canvas, sample);
    const TextExtent extent = measureText(canvas, TypographySample);
    printAtTop(canvas, SampleColumnX, rowTop, TypographySample);

    useBuiltinFont(canvas, 1);
    printAtTop(canvas, LabelColumnX, rowTop, sample.label);
    printFormattedAtTop(canvas, LabelColumnX, rowTop + 10, "%u px tall", extent.height);

    rowTop += (extent.height > 12 ? extent.height : 12) + RowGap;
  }

  // Sits above the 24pt row, the only sample wide enough to reach this column.
  constexpr int16_t NoteLeft = 500;
  drawSectionHeading(canvas, NoteLeft, ContentTop, ContentRight - NoteLeft,
                     "WHAT IS AVAILABLE");
  const char *notes[] = {
      "Faces: FreeMono, FreeSans, FreeSerif",
      "Styles: regular, bold, oblique, bold-oblique",
      "Sizes: 9, 12, 18 and 24 pt only",
      "",
      "Glyphs: ASCII 0x20-0x7E and nothing else.",
      "No degree, arrows, box drawing or accents:",
      "every symbol on this display is drawn.",
      "",
      "setTextSize(n) scales any font by whole pixels.",
  };
  int16_t noteTop = ContentTop + 20;
  useBuiltinFont(canvas, 1);
  for (const char *note : notes) {
    printAtTop(canvas, NoteLeft, noteTop, note);
    noteTop += 14;
  }
}

// ---------------------------------------------------------------------------
// Page 2: getting a number bigger than 24pt
// ---------------------------------------------------------------------------

void renderBigNumberLadder(Adafruit_GFX &canvas) {
  drawPageHeading(canvas, "Big numbers",
                  "24pt is the largest bundled size; both routes past it compared");

  constexpr char Sample[] = "23.4";
  constexpr int16_t LeftColumnX = ContentLeft;
  constexpr int16_t RightColumnX = 420;

  drawSectionHeading(canvas, LeftColumnX, ContentTop, 380,
                     "BUILT-IN 5x7, SCALED - blocky, free");
  int16_t rowTop = ContentTop + 24;
  for (uint8_t scale : {3, 5, 7, 9}) {
    useBuiltinFont(canvas, scale);
    const TextExtent extent = measureText(canvas, Sample);
    printAtTop(canvas, LeftColumnX + 78, rowTop, Sample);
    useBuiltinFont(canvas, 1);
    printFormattedAtTop(canvas, LeftColumnX, rowTop, "x%u", scale);
    printFormattedAtTop(canvas, LeftColumnX, rowTop + 10, "%upx", extent.height);
    rowTop += extent.height + 12;
  }

  drawSectionHeading(canvas, RightColumnX, ContentTop, ContentRight - RightColumnX,
                     "GFX FONT, SCALED - smooth outline, chunky edges");
  struct ScaledFontSample {
    const char *label;
    const GFXfont *font;
    uint8_t scale;
  };
  constexpr ScaledFontSample ScaledSamples[] = {
      {"Bold24 x1", &FreeSansBold24pt7b, 1},
      {"Bold24 x2", &FreeSansBold24pt7b, 2},
      {"Sans24 x2", &FreeSans24pt7b, 2},
  };
  rowTop = ContentTop + 24;
  for (const ScaledFontSample &sample : ScaledSamples) {
    useFont(canvas, sample.font, sample.scale);
    const TextExtent extent = measureText(canvas, Sample);
    printAtTop(canvas, RightColumnX + 96, rowTop, Sample);
    useBuiltinFont(canvas, 1);
    printAtTop(canvas, RightColumnX, rowTop, sample.label);
    printFormattedAtTop(canvas, RightColumnX, rowTop + 10, "%upx", extent.height);
    rowTop += extent.height + 12;
  }

  useBuiltinFont(canvas, 1);
  printAtTop(canvas, ContentLeft, 292,
             "Matched at ~70 px the difference is stark: the built-in font quantises the");
  printAtTop(canvas, ContentLeft, 306,
             "letterforms themselves, while a scaled GFX font keeps its outline and only");
  printAtTop(canvas, ContentLeft, 320,
             "coarsens the edge. Cost of x2 is nothing: same font data, same flash.");

  canvas.drawFastHLine(ContentLeft, 340, ContentWidth, Ink::Black);
  drawSectionHeading(canvas, ContentLeft, 348, ContentWidth,
                     "CANDIDATE HEADLINE - FreeSansBold24pt at x2, read this from across the room");

  useFont(canvas, &FreeSansBold24pt7b, 2);
  const TextExtent clockExtent = measureText(canvas, "12:34");
  const int16_t clockLeft = 400 - clockExtent.width / 2;
  printAtTop(canvas, clockLeft, 376, "12:34");

  useFont(canvas, &FreeSansBold24pt7b);
  printAtTop(canvas, clockLeft + clockExtent.width + 30, 388, "23.4");
  useFont(canvas, &FreeSansBold18pt7b);
  printAtTop(canvas, clockLeft + clockExtent.width + 128, 392, "C");
  drawDegreeMark(canvas, clockLeft + clockExtent.width + 118, 394, 5, 2);
}

// ---------------------------------------------------------------------------
// Page 3: shapes and rules
// ---------------------------------------------------------------------------

void renderShapesAndRules(Adafruit_GFX &canvas) {
  drawPageHeading(canvas, "Shapes and rules",
                  "which primitives stay crisp at 218 ppi");

  constexpr int16_t Columns = 4;
  constexpr int16_t Rows = 3;
  constexpr int16_t Gutter = 10;
  constexpr int16_t CellWidth = (ContentWidth - (Columns - 1) * Gutter) / Columns;
  constexpr int16_t CellHeight = 132;
  constexpr int16_t CaptionHeight = 14;

  const char *captions[Columns * Rows] = {
      "drawLine fan",        "hairlines 1/2/3 px",  "drawRect + fillRect",
      "roundRect r=4/10/22", "circle + fillCircle", "triangle + fillTriangle",
      "dashed and dotted",   "rings t=1/3/6",       "arc gauge, 270 deg sweep",
      "nested strokes 1..4", "panel + dither shadow", "1 px grid at 8 and 16",
  };

  for (int16_t row = 0; row < Rows; row++) {
    for (int16_t column = 0; column < Columns; column++) {
      const int16_t index = row * Columns + column;
      const int16_t cellX = ContentLeft + column * (CellWidth + Gutter);
      const int16_t cellY = ContentTop + row * (CellHeight + 6);
      printCaption(canvas, cellX, cellY, captions[index]);

      const int16_t drawX = cellX;
      const int16_t drawY = cellY + CaptionHeight;
      const int16_t drawWidth = CellWidth;
      const int16_t drawHeight = CellHeight - CaptionHeight - 6;
      const int16_t centerX = drawX + drawWidth / 2;
      const int16_t centerY = drawY + drawHeight / 2;

      switch (index) {
        case 0:
          for (int16_t degrees = 0; degrees <= 90; degrees += 10) {
            const float radians = degrees * DEG_TO_RAD;
            canvas.drawLine(drawX, drawY + drawHeight,
                            drawX + lroundf(cosf(radians) * drawWidth),
                            drawY + drawHeight - lroundf(sinf(radians) * drawHeight),
                            Ink::Black);
          }
          break;
        case 1:
          for (int16_t thickness = 1; thickness <= 3; thickness++) {
            const int16_t barY = drawY + 16 + (thickness - 1) * 28;
            canvas.fillRect(drawX, barY, drawWidth - 40, thickness, Ink::Black);
            printCaption(canvas, drawX + drawWidth - 32, barY - 3,
                         thickness == 1 ? "1" : (thickness == 2 ? "2" : "3"));
          }
          break;
        case 2:
          canvas.drawRect(drawX, drawY, 78, drawHeight, Ink::Black);
          canvas.fillRect(drawX + 92, drawY, 78, drawHeight, Ink::Black);
          break;
        case 3:
          canvas.drawRoundRect(drawX, drawY, 54, drawHeight, 4, Ink::Black);
          canvas.drawRoundRect(drawX + 60, drawY, 54, drawHeight, 10, Ink::Black);
          canvas.fillRoundRect(drawX + 120, drawY, 54, drawHeight, 22, Ink::Black);
          break;
        case 4:
          canvas.drawCircle(drawX + 46, centerY, 44, Ink::Black);
          canvas.fillCircle(drawX + 138, centerY, 44, Ink::Black);
          break;
        case 5:
          canvas.drawTriangle(drawX + 44, drawY, drawX, drawY + drawHeight,
                              drawX + 88, drawY + drawHeight, Ink::Black);
          canvas.fillTriangle(drawX + 138, drawY, drawX + 94, drawY + drawHeight,
                              drawX + 182, drawY + drawHeight, Ink::Black);
          break;
        case 6:
          drawDashedHLine(canvas, drawX, drawY + 14, drawWidth, 12, 6);
          drawDashedHLine(canvas, drawX, drawY + 34, drawWidth, 6, 4);
          drawDashedHLine(canvas, drawX, drawY + 54, drawWidth, 2, 2);
          drawDashedHLine(canvas, drawX, drawY + 74, drawWidth, 1, 3);
          drawDashedHLine(canvas, drawX, drawY + 94, drawWidth, 24, 8);
          break;
        case 7:
          drawRing(canvas, drawX + 34, centerY, 32, 1);
          drawRing(canvas, drawX + 100, centerY, 32, 3);
          drawRing(canvas, drawX + 166, centerY, 32, 6);
          break;
        case 8: {
          constexpr int16_t Radius = 48;
          drawArc(canvas, centerX, centerY + 18, Radius, 2, -45.0f, 225.0f);
          drawArc(canvas, centerX, centerY + 18, Radius - 8, 8, -45.0f, 110.0f);
          useFont(canvas, &FreeSansBold12pt7b);
          printCenteredAtTop(canvas, centerX, centerY - 6, "62%");
          break;
        }
        case 9:
          for (int16_t thickness = 1; thickness <= 4; thickness++) {
            drawThickRect(canvas, drawX + (thickness - 1) * 46, drawY, 42, drawHeight,
                          thickness);
          }
          break;
        case 10:
          fillDithered(canvas, drawX + 8, drawY + 10, drawWidth - 20, drawHeight - 14,
                       8);
          canvas.fillRect(drawX, drawY, drawWidth - 20, drawHeight - 14, Ink::White);
          canvas.drawRect(drawX, drawY, drawWidth - 20, drawHeight - 14, Ink::Black);
          printCaption(canvas, drawX + 10, drawY + 10, "raised panel");
          break;
        case 11:
          for (int16_t offset = 0; offset <= drawWidth; offset += 8) {
            canvas.drawFastVLine(drawX + offset, drawY, drawHeight / 2 - 4, Ink::Black);
          }
          for (int16_t offset = 0; offset <= drawHeight / 2 - 4; offset += 8) {
            canvas.drawFastHLine(drawX, drawY + offset, drawWidth, Ink::Black);
          }
          for (int16_t offset = 0; offset <= drawWidth; offset += 16) {
            canvas.drawFastVLine(drawX + offset, drawY + drawHeight / 2 + 4,
                                 drawHeight / 2 - 4, Ink::Black);
          }
          for (int16_t offset = 0; offset <= drawHeight / 2 - 4; offset += 16) {
            canvas.drawFastHLine(drawX, drawY + drawHeight / 2 + 4 + offset, drawWidth,
                                 Ink::Black);
          }
          break;
        default:
          break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Page 4: tone and texture
// ---------------------------------------------------------------------------

void renderToneAndTexture(Adafruit_GFX &canvas) {
  drawPageHeading(canvas, "Tone and texture",
                  "1 bit deep: every grey is a pattern, so which ones read as flat");

  drawSectionHeading(canvas, ContentLeft, ContentTop, ContentWidth,
                     "ORDERED DITHER, 4x4 BAYER");
  constexpr int16_t PatchSize = 74;
  constexpr int16_t PatchStride = 86;
  constexpr int16_t PatchTop = ContentTop + 22;
  for (int16_t index = 0; index < 9; index++) {
    const uint8_t level = index * 2;
    const int16_t patchX = ContentLeft + index * PatchStride;
    fillDithered(canvas, patchX, PatchTop, PatchSize, PatchSize, level);
    canvas.drawRect(patchX, PatchTop, PatchSize, PatchSize, Ink::Black);
    printCaption(canvas, patchX, PatchTop + PatchSize + 4, "");
    printFormattedAtTop(canvas, patchX, PatchTop + PatchSize + 4, "%u/16  %u%%", level,
                        level * 100 / 16);
  }

  constexpr int16_t HatchTop = 168;
  drawSectionHeading(canvas, ContentLeft, HatchTop, ContentWidth,
                     "LINE TEXTURES - cheaper to draw, more prone to moire");
  struct HatchSample {
    const char *label;
    Hatch pattern;
    int16_t spacing;
  };
  constexpr HatchSample HatchSamples[] = {
      {"horiz 2px", Hatch::Horizontal, 2},      {"horiz 3px", Hatch::Horizontal, 3},
      {"vert 3px", Hatch::Vertical, 3},         {"diag 3px", Hatch::DiagonalForward, 3},
      {"cross 4px", Hatch::Cross, 4},           {"check 1px", Hatch::Checker, 1},
      {"check 3px", Hatch::Checker, 3},
  };
  constexpr int16_t HatchWidth = 100;
  constexpr int16_t HatchStride = 110;
  constexpr int16_t HatchPatchTop = HatchTop + 22;
  int16_t hatchIndex = 0;
  for (const HatchSample &sample : HatchSamples) {
    const int16_t patchX = ContentLeft + hatchIndex * HatchStride;
    fillHatched(canvas, patchX, HatchPatchTop, HatchWidth, 62, sample.pattern,
                sample.spacing);
    canvas.drawRect(patchX, HatchPatchTop, HatchWidth, 62, Ink::Black);
    printCaption(canvas, patchX, HatchPatchTop + 66, sample.label);
    hatchIndex++;
  }

  constexpr int16_t SweepTop = 278;
  drawSectionHeading(canvas, ContentLeft, SweepTop, ContentWidth,
                     "CONTINUOUS SWEEP - look for banding");
  constexpr int16_t SweepPatchTop = SweepTop + 22;
  for (int16_t offset = 0; offset < ContentWidth; offset++) {
    const uint8_t level = 1 + (offset * 16) / ContentWidth;
    fillDithered(canvas, ContentLeft + offset, SweepPatchTop, 1, 46, level);
  }
  canvas.drawRect(ContentLeft, SweepPatchTop, ContentWidth, 46, Ink::Black);

  constexpr int16_t ReverseTop = 358;
  drawSectionHeading(canvas, ContentLeft, ReverseTop, ContentWidth,
                     "TEXT ON TONE - white type needs how much contrast behind it");
  constexpr int16_t BlockWidth = 186;
  constexpr int16_t BlockStride = 194;
  constexpr int16_t BlockTop = ReverseTop + 24;
  constexpr int16_t BlockHeight = 56;
  int16_t blockIndex = 0;
  for (uint8_t level : {6, 10, 13, 16}) {
    const int16_t blockX = ContentLeft + blockIndex * BlockStride;
    fillDithered(canvas, blockX, BlockTop, BlockWidth, BlockHeight, level);
    canvas.setTextColor(Ink::White);
    useFont(canvas, &FreeSansBold12pt7b);
    printAtTop(canvas, blockX + 10, BlockTop + 8, "12:34 OK");
    useBuiltinFont(canvas, 1);
    printAtTop(canvas, blockX + 10, BlockTop + 38, "and 5x7 at this size");
    canvas.setTextColor(Ink::Black);
    printFormattedAtTop(canvas, blockX, BlockTop + BlockHeight + 6, "white on %u/16",
                        level);
    blockIndex++;
  }
}

// ---------------------------------------------------------------------------
// Page 5: drawn symbols, and proof of what the fonts contain
// ---------------------------------------------------------------------------

void renderSymbols(Adafruit_GFX &canvas) {
  drawPageHeading(canvas, "Symbols",
                  "no icon glyphs exist in these fonts, so every symbol is drawn");

  constexpr int16_t GlyphMapLeft = 546;

  drawSectionHeading(canvas, ContentLeft, ContentTop, GlyphMapLeft - ContentLeft - 20,
                     "SAME ICONS AT 48, 28 AND 16 PX - find the legibility floor");
  int16_t sizeRowTop = ContentTop + 24;
  for (int16_t size : {48, 28, 16}) {
    for (size_t index = 0; index < 6; index++) {
      IconSamples[index].draw(canvas, ContentLeft + 6 + static_cast<int16_t>(index) * 74,
                              sizeRowTop, size);
    }
    printCaption(canvas, ContentLeft + 6 + 6 * 74, sizeRowTop + size / 2 - 4,
                 size == 48 ? "48 px" : (size == 28 ? "28 px" : "16 px"));
    sizeRowTop += size + 14;
  }

  constexpr int16_t GridTop = 210;
  drawSectionHeading(canvas, ContentLeft, GridTop, GlyphMapLeft - ContentLeft - 20,
                     "FULL DRAWN SET AT 32 PX");
  constexpr int16_t IconStride = 74;
  constexpr int16_t IconSize = 32;
  for (size_t index = 0; index < IconSampleCount; index++) {
    const int16_t column = static_cast<int16_t>(index % 7);
    const int16_t row = static_cast<int16_t>(index / 7);
    const int16_t iconX = ContentLeft + 6 + column * IconStride;
    const int16_t iconY = GridTop + 26 + row * 82;
    IconSamples[index].draw(canvas, iconX, iconY, IconSize);
    printCaption(canvas, iconX, iconY + IconSize + 8, IconSamples[index].label);
  }

  canvas.drawFastVLine(GlyphMapLeft - 14, ContentTop, Ink::ContentBottom - ContentTop,
                       Ink::Black);
  drawSectionHeading(canvas, GlyphMapLeft, ContentTop, ContentRight - GlyphMapLeft,
                     "EVERY GLYPH IN FreeSans12pt7b");
  constexpr int16_t CellWidth = 30;
  constexpr int16_t CellHeight = 23;
  for (uint8_t code = 0x20; code <= 0x7E; code++) {
    const int16_t index = code - 0x20;
    const int16_t cellX = GlyphMapLeft + (index % 8) * CellWidth;
    const int16_t cellY = ContentTop + 26 + (index / 8) * CellHeight;
    const char glyph[2] = {static_cast<char>(code), '\0'};
    useFont(canvas, &FreeSans12pt7b);
    printAtTop(canvas, cellX + 4, cellY + 3, glyph);
  }
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, GlyphMapLeft, 352, "0x20 to 0x7E, 95 glyphs, that is all.");
  printAtTop(canvas, GlyphMapLeft, 366, "Missing and therefore drawn by hand:");
  printAtTop(canvas, GlyphMapLeft, 380, "degree, plus-minus, times, arrows,");
  printAtTop(canvas, GlyphMapLeft, 394, "bullets, box drawing, any accent.");
  useFont(canvas, &FreeSansBold12pt7b);
  printAtTop(canvas, GlyphMapLeft, 412, "23.4");
  drawDegreeMark(canvas, GlyphMapLeft + 52, 416, 4, 2);
  printAtTop(canvas, GlyphMapLeft + 60, 412, "C");
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, GlyphMapLeft, 438, "that degree mark is a drawn ring");
}

// ---------------------------------------------------------------------------
// Page 6: glanceable dashboard mockup
// ---------------------------------------------------------------------------

void renderDashboardHero(Adafruit_GFX &canvas) {
  useFont(canvas, &FreeSansBold12pt7b);
  printAtTop(canvas, ContentLeft, 10, "WEDNESDAY 5 AUGUST");
  useBuiltinFont(canvas, 1);
  printRightAlignedAtTop(canvas, 640, 16, "Bristol  updated 14:52");

  drawWifiIcon(canvas, 664, 8, 22);
  drawBatteryLevelIcon(canvas, 696, 8, 26, 0.84f);
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, 732, 16, "84%");
  canvas.drawFastHLine(ContentLeft, 44, ContentWidth, Ink::Black);

  useFont(canvas, &FreeSansBold24pt7b, 2);
  const TextExtent temperatureExtent = measureText(canvas, "23.4");
  printAtTop(canvas, ContentLeft + 8, 70, "23.4");
  const int16_t temperatureRight = ContentLeft + 8 + temperatureExtent.width;
  drawDegreeMark(canvas, temperatureRight + 18, 78, 8, 3);
  useFont(canvas, &FreeSansBold24pt7b);
  printAtTop(canvas, temperatureRight + 32, 76, "C");

  useFont(canvas, &FreeSans18pt7b);
  printAtTop(canvas, ContentLeft + 8, 156, "Partly cloudy");
  useBuiltinFont(canvas, 2);
  printAtTop(canvas, ContentLeft + 8, 196, "feels like 21.8");

  drawSunBehindCloudIcon(canvas, 560, 62, 150);

  canvas.drawFastHLine(ContentLeft, 244, ContentWidth, Ink::Black);

  struct Statistic {
    const char *label;
    const char *value;
    const char *unit;
    IconRenderer icon;
  };
  const Statistic statistics[] = {
      {"HUMIDITY", "64", "%", drawDropletIcon},
      {"WIND", "12", "mph", drawArrowUpIcon},
      {"PRESSURE", "1013", "hPa", drawThermometerIcon},
  };
  constexpr int16_t StatisticStride = ContentWidth / 3;
  for (int16_t index = 0; index < 3; index++) {
    const Statistic &statistic = statistics[index];
    const int16_t columnX = ContentLeft + index * StatisticStride;
    if (index > 0) {
      canvas.drawFastVLine(columnX - 8, 258, 76, Ink::Black);
    }
    statistic.icon(canvas, columnX + 4, 260, 26);
    useBuiltinFont(canvas, 1);
    printAtTop(canvas, columnX + 40, 262, statistic.label);
    useFont(canvas, &FreeSansBold24pt7b);
    const TextExtent valueExtent = measureText(canvas, statistic.value);
    printAtTop(canvas, columnX + 40, 282, statistic.value);
    useFont(canvas, &FreeSans12pt7b);
    printAtTop(canvas, columnX + 46 + valueExtent.width, 300, statistic.unit);
  }

  canvas.drawFastHLine(ContentLeft, 348, ContentWidth, Ink::Black);
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, ContentLeft, 356, "NEXT SIX HOURS");

  struct Forecast {
    const char *hour;
    const char *temperature;
    IconRenderer icon;
  };
  const Forecast forecasts[] = {
      {"15:00", "24", drawSunIcon},     {"16:00", "24", drawSunIcon},
      {"17:00", "23", drawCloudIcon},   {"18:00", "21", drawCloudIcon},
      {"19:00", "19", drawDropletIcon}, {"20:00", "17", drawDropletIcon},
  };
  constexpr int16_t ForecastStride = ContentWidth / 6;
  for (int16_t index = 0; index < 6; index++) {
    const Forecast &forecast = forecasts[index];
    const int16_t columnX = ContentLeft + index * ForecastStride;
    const int16_t columnCenterX = columnX + ForecastStride / 2 - 6;
    useBuiltinFont(canvas, 1);
    printCenteredAtTop(canvas, columnCenterX, 378, forecast.hour);
    forecast.icon(canvas, columnCenterX - 14, 392, 28);
    useFont(canvas, &FreeSansBold18pt7b);
    printCenteredAtTop(canvas, columnCenterX, 426, forecast.temperature);
  }
}

// ---------------------------------------------------------------------------
// Page 7: dense list mockup
// ---------------------------------------------------------------------------

void renderDashboardDense(Adafruit_GFX &canvas) {
  useFont(canvas, &FreeSansBold18pt7b);
  printAtTop(canvas, ContentLeft, 8, "Today");
  useFont(canvas, &FreeSans12pt7b);
  printRightAlignedAtTop(canvas, 560, 14, "5 August 2026");
  canvas.drawFastHLine(ContentLeft, 42, 548, Ink::Black);

  struct AgendaEntry {
    const char *time;
    const char *title;
    const char *tag;
  };
  const AgendaEntry entries[] = {
      {"08:30", "Standup", "team"},
      {"09:00", "Panel refresh timing review", "display"},
      {"10:15", "Pairing: partial refresh spike", "display"},
      {"11:00", "Battery budget numbers", "hardware"},
      {"12:00", "Lunch", ""},
      {"13:30", "Dashboard layout review", "design"},
      {"14:00", "Solder the driver HAT properly", "hardware"},
      {"15:00", "Deep sleep current measurement", "hardware"},
      {"16:00", "Write up the BUSY findings", "docs"},
      {"16:45", "Order a second panel", "admin"},
      {"17:30", "Walk", ""},
  };
  constexpr size_t EntryCount = sizeof(entries) / sizeof(entries[0]);
  constexpr int16_t RowHeight = 32;
  constexpr int16_t RowsLeft = ContentLeft;
  constexpr int16_t RowsWidth = 548;

  for (size_t index = 0; index < EntryCount; index++) {
    const AgendaEntry &entry = entries[index];
    const int16_t rowTop = 50 + static_cast<int16_t>(index) * RowHeight;
    if (index % 2 == 1) {
      fillDithered(canvas, RowsLeft, rowTop, RowsWidth, RowHeight - 1, 2);
    }
    useFont(canvas, &FreeMonoBold12pt7b);
    printAtTop(canvas, RowsLeft + 6, rowTop + 8, entry.time);
    useFont(canvas, &FreeSans12pt7b);
    printAtTop(canvas, RowsLeft + 92, rowTop + 8, entry.title);
    if (entry.tag[0] != '\0') {
      useBuiltinFont(canvas, 1);
      const TextExtent tagExtent = measureText(canvas, entry.tag);
      const int16_t tagWidth = tagExtent.width + 12;
      const int16_t tagX = RowsLeft + RowsWidth - tagWidth - 6;
      // Knocked out so the pill label does not have to compete with the row tone.
      canvas.fillRoundRect(tagX, rowTop + 8, tagWidth, 16, 8, Ink::White);
      canvas.drawRoundRect(tagX, rowTop + 8, tagWidth, 16, 8, Ink::Black);
      printAtTop(canvas, tagX + 6, rowTop + 12, entry.tag);
    }
    canvas.drawFastHLine(RowsLeft, rowTop + RowHeight - 1, RowsWidth, Ink::Black);
  }

  useBuiltinFont(canvas, 1);
  printAtTop(canvas, RowsLeft + 6, 50 + EntryCount * RowHeight + 8,
             "11 rows at 32 px fill the height. 24 px fits 15 and still reads.");

  constexpr int16_t RailLeft = 580;
  constexpr int16_t RailWidth = ContentRight - RailLeft;
  canvas.drawFastVLine(RailLeft - 16, 8, Ink::ContentBottom - 16, Ink::Black);

  struct StatisticCard {
    const char *label;
    const char *value;
    const char *note;
    IconRenderer icon;
  };
  const StatisticCard cards[] = {
      {"UNREAD", "17", "3 need a reply", drawBellIcon},
      {"MERGED TODAY", "4", "2 awaiting review", drawCheckIcon},
      {"BUILD", "PASS", "8 m 12 s ago", drawClockIcon},
  };
  for (int16_t index = 0; index < 3; index++) {
    const StatisticCard &card = cards[index];
    const int16_t cardTop = 8 + index * 116;
    canvas.drawRect(RailLeft, cardTop, RailWidth, 104, Ink::Black);
    // A dithered band behind 5x7 type is illegible — see the tone page. Rule only.
    canvas.drawFastHLine(RailLeft, cardTop + 22, RailWidth, Ink::Black);
    useBuiltinFont(canvas, 1);
    printAtTop(canvas, RailLeft + 10, cardTop + 8, card.label);
    card.icon(canvas, RailLeft + RailWidth - 32, cardTop + 4, 16);
    useFont(canvas, &FreeSansBold24pt7b);
    printAtTop(canvas, RailLeft + 10, cardTop + 34, card.value);
    useBuiltinFont(canvas, 1);
    printAtTop(canvas, RailLeft + 10, cardTop + 84, card.note);
  }

  canvas.drawRect(RailLeft, 356, RailWidth, 96, Ink::Black);
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, RailLeft + 10, 364, "SEVEN DAY LOAD");
  const uint8_t load[7] = {6, 9, 4, 11, 7, 2, 5};
  const char *dayInitials[7] = {"M", "T", "W", "T", "F", "S", "S"};
  for (int16_t index = 0; index < 7; index++) {
    const int16_t barX = RailLeft + 12 + index * 27;
    const int16_t barHeight = load[index] * 4;
    canvas.fillRect(barX, 430 - barHeight, 18, barHeight, Ink::Black);
    printAtTop(canvas, barX + 6, 436, dayInitials[index]);
  }
}

// ---------------------------------------------------------------------------
// Page 8: data marks
// ---------------------------------------------------------------------------

void renderCharts(Adafruit_GFX &canvas) {
  drawPageHeading(canvas, "Charts", "do data marks survive one bit per pixel");

  constexpr int16_t QuadrantWidth = 380;
  constexpr int16_t RightQuadrantX = 408;

  // Bars with a dashed gridline behind them.
  drawSectionHeading(canvas, ContentLeft, ContentTop, QuadrantWidth,
                     "BARS - 14 hourly buckets, solid fill");
  constexpr int16_t BarBaseline = 226;
  constexpr int16_t BarPlotHeight = 140;
  const uint8_t barValues[14] = {12, 18, 9, 24, 31, 27, 40, 36, 22, 15, 29, 33, 19, 8};
  for (int16_t gridValue = 10; gridValue <= 40; gridValue += 10) {
    const int16_t gridY = BarBaseline - gridValue * BarPlotHeight / 44;
    drawDashedHLine(canvas, ContentLeft + 26, gridY, QuadrantWidth - 26, 2, 4);
    printCaption(canvas, ContentLeft, gridY - 3, gridValue == 10 ? "10" : "");
    useBuiltinFont(canvas, 1);
    printFormattedAtTop(canvas, ContentLeft, gridY - 3, "%d", gridValue);
  }
  canvas.drawFastHLine(ContentLeft + 24, BarBaseline, QuadrantWidth - 24, Ink::Black);
  for (int16_t index = 0; index < 14; index++) {
    const int16_t barX = ContentLeft + 30 + index * 25;
    const int16_t barHeight = barValues[index] * BarPlotHeight / 44;
    canvas.fillRect(barX, BarBaseline - barHeight, 18, barHeight, Ink::Black);
  }
  printCaption(canvas, ContentLeft + 30, BarBaseline + 6, "00:00");
  printCaption(canvas, ContentLeft + 300, BarBaseline + 6, "13:00");

  // Sparkline with a dithered fill underneath.
  drawSectionHeading(canvas, RightQuadrantX, ContentTop, QuadrantWidth,
                     "SPARKLINE - 64 points, dithered area fill");
  constexpr int16_t SparkLeft = RightQuadrantX + 6;
  constexpr int16_t SparkWidth = 368;
  constexpr int16_t SparkTop = ContentTop + 30;
  constexpr int16_t SparkHeight = 150;
  int16_t previousX = SparkLeft;
  int16_t previousY = 0;
  int16_t peakX = SparkLeft;
  int16_t peakY = SparkTop + SparkHeight;
  for (int16_t index = 0; index < 64; index++) {
    const float sample = 0.5f + 0.32f * sinf(index * 0.18f) + 0.13f * sinf(index * 0.53f);
    const int16_t pointX = SparkLeft + index * SparkWidth / 63;
    const int16_t pointY = SparkTop + SparkHeight - lroundf(sample * SparkHeight);
    fillDithered(canvas, pointX, pointY, SparkWidth / 63 + 1,
                 SparkTop + SparkHeight - pointY, 4);
    if (index > 0) {
      drawThickLine(canvas, previousX, previousY, pointX, pointY, 2);
    }
    if (pointY < peakY) {
      peakY = pointY;
      peakX = pointX;
    }
    previousX = pointX;
    previousY = pointY;
  }
  canvas.drawFastHLine(SparkLeft, SparkTop + SparkHeight, SparkWidth, Ink::Black);
  canvas.fillCircle(peakX, peakY, 4, Ink::White);
  drawRing(canvas, peakX, peakY, 5, 2);
  useBuiltinFont(canvas, 1);
  printAtTop(canvas, peakX + 10, peakY - 4, "peak 94");

  // Progress bars, solid against dithered.
  drawSectionHeading(canvas, ContentLeft, 254, QuadrantWidth,
                     "PROGRESS - solid left, dithered right");
  struct Progress {
    const char *label;
    float fraction;
  };
  const Progress progresses[] = {
      {"battery", 0.84f}, {"storage", 0.61f}, {"quota", 0.37f}, {"sync", 0.12f}};
  int16_t progressTop = 282;
  for (const Progress &progress : progresses) {
    useBuiltinFont(canvas, 1);
    printAtTop(canvas, ContentLeft, progressTop + 5, progress.label);
    constexpr int16_t TrackWidth = 140;
    const int16_t solidX = ContentLeft + 60;
    canvas.drawRect(solidX, progressTop, TrackWidth, 18, Ink::Black);
    canvas.fillRect(solidX + 2, progressTop + 2, lroundf((TrackWidth - 4) * progress.fraction),
                    14, Ink::Black);

    const int16_t ditheredX = solidX + TrackWidth + 24;
    canvas.drawRect(ditheredX, progressTop, TrackWidth, 18, Ink::Black);
    fillDithered(canvas, ditheredX + 2, progressTop + 2,
                 lroundf((TrackWidth - 4) * progress.fraction), 14, 10);
    useBuiltinFont(canvas, 1);
    printFormattedAtTop(canvas, ditheredX + TrackWidth + 8, progressTop + 5, "%d%%",
                        lroundf(progress.fraction * 100));
    progressTop += 30;
  }

  // Ring gauges.
  drawSectionHeading(canvas, RightQuadrantX, 254, QuadrantWidth,
                     "RING GAUGES - 270 degree sweep");
  struct Gauge {
    const char *label;
    const char *value;
    float fraction;
    int16_t centerX;
    int16_t radius;
  };
  const Gauge gauges[] = {{"cpu", "62%", 0.62f, 484, 60},
                          {"ram", "38%", 0.38f, 622, 40},
                          {"disk", "81%", 0.81f, 730, 40}};
  for (const Gauge &gauge : gauges) {
    constexpr float StartDegrees = 225.0f;
    constexpr float SweepDegrees = 270.0f;
    constexpr int16_t GaugeCenterY = 360;
    drawArc(canvas, gauge.centerX, GaugeCenterY, gauge.radius, 2, -45.0f, 225.0f);
    drawArc(canvas, gauge.centerX, GaugeCenterY, gauge.radius - 5,
            gauge.radius > 50 ? 12 : 8, StartDegrees - SweepDegrees * gauge.fraction,
            StartDegrees);
    useFont(canvas, gauge.radius > 50 ? &FreeSansBold18pt7b : &FreeSansBold12pt7b);
    printCenteredAtTop(canvas, gauge.centerX, GaugeCenterY - 12, gauge.value);
    useBuiltinFont(canvas, 1);
    printCenteredAtTop(canvas, gauge.centerX, 434, gauge.label);
  }
}

}  // namespace

const DemoPage DemoPages[] = {
    {"Typography ladder", renderTypographyLadder},
    {"Big numbers", renderBigNumberLadder},
    {"Shapes and rules", renderShapesAndRules},
    {"Tone and texture", renderToneAndTexture},
    {"Symbols", renderSymbols},
    {"Dashboard: hero", renderDashboardHero},
    {"Dashboard: dense", renderDashboardDense},
    {"Charts", renderCharts},
};

const size_t DemoPageCount = sizeof(DemoPages) / sizeof(DemoPages[0]);

void renderPageFooter(Adafruit_GFX &canvas, size_t pageIndex) {
  canvas.setTextColor(Ink::Black);
  canvas.drawFastHLine(0, Ink::ContentBottom, Ink::ScreenWidth, Ink::Black);
  useBuiltinFont(canvas, 1);
  printFormattedAtTop(canvas, Margin, Ink::ContentBottom + 6, "%u/%u  %s",
                      static_cast<unsigned>(pageIndex + 1),
                      static_cast<unsigned>(DemoPageCount), DemoPages[pageIndex].name);
  printRightAlignedAtTop(canvas, ContentRight, Ink::ContentBottom + 6,
                         "built " __DATE__ " " __TIME__);
}
