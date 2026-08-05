#include <GxEPD2_BW.h>

#include "DemoPage.h"
#include "DisplayPins.h"

// The prototype deliberately never sleeps. Deep sleep drops PanelPower, and
// cutting the rail mid-refresh leaves a half-written image — the whole reason
// the sleeping build needs a 12 s guard delay. Holding the rail up removes that
// failure mode, so pages can follow each other as fast as they are readable.
// The timer-driven sleep loop is preserved in commit a505344.
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
