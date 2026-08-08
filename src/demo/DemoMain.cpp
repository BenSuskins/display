#include <GxEPD2_BW.h>

#include "DemoPage.h"
#include "DisplayPins.h"

// The layout prototype, preserved. It never sleeps: holding PanelPower high for
// the whole session removes the truncated-refresh failure mode entirely, so
// pages follow each other as fast as they are readable.
//
// Superseded by server-side rendering — the Device no longer composes anything.
// Kept so the type, tone and symbol comparisons behind
// plans/display-prototype.md can be reproduced on the bench.
constexpr uint32_t PageViewingMilliseconds = 15000;

GxEPD2_BW<GxEPD2_426_GDEQ0426T82, GxEPD2_426_GDEQ0426T82::HEIGHT> display(
    GxEPD2_426_GDEQ0426T82(DisplayPins::ChipSelect, DisplayPins::DataCommand,
                           DisplayPins::Reset, DisplayPins::Busy));

size_t currentPageIndex = 0;

void renderPage(size_t pageIndex) {
  const DemoPage &page = DemoPages[pageIndex];
  const uint32_t startedAt = millis();

  display.setRotation(0);
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(Ink::White);
    display.setTextColor(Ink::Black);
    display.setTextWrap(false);
    page.render(display);
    renderPageFooter(display, pageIndex);
  } while (display.nextPage());

  Serial.printf("page %u/%u %s issued in %lu ms\n",
                static_cast<unsigned>(pageIndex + 1),
                static_cast<unsigned>(DemoPageCount), page.name,
                millis() - startedAt);
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(DisplayPins::PanelPower, OUTPUT);
  digitalWrite(DisplayPins::PanelPower, HIGH);
  delay(100);

  display.init(115200);
  Serial.printf("cycling %u demo pages every %lu ms\n",
                static_cast<unsigned>(DemoPageCount), PageViewingMilliseconds);
}

void loop() {
  renderPage(currentPageIndex);
  currentPageIndex = (currentPageIndex + 1) % DemoPageCount;
  delay(PageViewingMilliseconds);
}
