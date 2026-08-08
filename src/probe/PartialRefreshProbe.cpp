#include <Arduino.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeSansBold12pt7b.h>

#include "DisplayPins.h"

// Bisects the guard delay a partial refresh needs on this hardware.
//
// BUSY carries no signal on this HAT, so every refresh is followed by a blind
// wait. That number is bisected for full refresh (4 s truncates, 8 s completes,
// 12 s committed) but has never been measured for partial refresh, and the
// Offline Marker depends on it.
//
// Draws a row of labelled boxes with one full refresh, then fills each box with
// a partial refresh followed by a different guard delay. A box whose guard was
// too short is cut off, streaked or blank; the shortest clean box is the
// answer. Add margin to it — e-ink slows as it cools.
//
//   pio run -e partial_probe -t upload && pio device monitor

constexpr uint32_t GuardCandidatesMilliseconds[] = {100, 200,  300,  500,
                                                    700, 1000, 1500, 2500};
constexpr size_t CandidateCount =
    sizeof(GuardCandidatesMilliseconds) / sizeof(GuardCandidatesMilliseconds[0]);

constexpr uint32_t FullRefreshGuardMilliseconds = 12000;

constexpr int16_t BoxWidth = 88;   // multiple of 8: the controller addresses
constexpr int16_t BoxLeft = 16;    // RAM by byte, so x and w must align
constexpr int16_t BoxTop = 200;
constexpr int16_t BoxHeight = 120;
constexpr int16_t BoxGap = 8;

GxEPD2_BW<GxEPD2_426_GDEQ0426T82, GxEPD2_426_GDEQ0426T82::HEIGHT> display(
    GxEPD2_426_GDEQ0426T82(DisplayPins::ChipSelect, DisplayPins::DataCommand,
                           DisplayPins::Reset, DisplayPins::Busy));

int16_t boxLeftOf(size_t index) {
  return BoxLeft + static_cast<int16_t>(index) * (BoxWidth + BoxGap);
}

void drawLegend() {
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeSansBold12pt7b);

    display.setCursor(16, 40);
    display.print("Partial refresh guard probe");
    display.setCursor(16, 70);
    display.print("Shortest CLEANLY FILLED box is the guard. Add margin.");
    display.setCursor(16, 100);
    display.print(__DATE__ " " __TIME__);

    for (size_t index = 0; index < CandidateCount; index += 1) {
      const int16_t left = boxLeftOf(index);
      display.drawRect(left, BoxTop, BoxWidth, BoxHeight, GxEPD_BLACK);
      display.setCursor(left + 4, BoxTop + BoxHeight + 30);
      display.printf("%lu", GuardCandidatesMilliseconds[index]);
    }
  } while (display.nextPage());

  delay(FullRefreshGuardMilliseconds);
}

void fillBoxes() {
  for (size_t index = 0; index < CandidateCount; index += 1) {
    const uint32_t guard = GuardCandidatesMilliseconds[index];
    const int16_t left = boxLeftOf(index);

    Serial.printf("box %u: filling, then waiting %lu ms\n",
                  static_cast<unsigned>(index + 1), guard);

    display.setPartialWindow(left, BoxTop, BoxWidth, BoxHeight);
    display.firstPage();
    do {
      display.fillRect(left, BoxTop, BoxWidth, BoxHeight, GxEPD_BLACK);
    } while (display.nextPage());

    // The measurement: nextPage returns immediately because BUSY says nothing,
    // so this delay is the entire guard. The next box's refresh is issued the
    // moment it expires, truncating this one if it was too short.
    delay(guard);
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(DisplayPins::PanelPower, OUTPUT);
  digitalWrite(DisplayPins::PanelPower, HIGH);
  delay(100);

  display.init(115200);
  Serial.println("\npartial refresh guard probe");

  drawLegend();
  fillBoxes();

  Serial.println("done. Read the panel: shortest cleanly filled box wins.");
}

void loop() {}
