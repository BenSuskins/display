#include <Fonts/FreeMonoBold9pt7b.h>
#include <GxEPD2_BW.h>
#include <esp_sleep.h>

#include "DisplayPins.h"

// Measured: 4s truncates the refresh and blanks the screen, 8s completes it.
// Set well above the observed edge because e-ink slows as it cools and a
// truncated refresh fails silently, leaving a stale image and no error.
constexpr unsigned long RefreshCompletionMilliseconds = 12000;
constexpr uint64_t SleepDurationMicroseconds = 60ULL * 1000000ULL;

RTC_DATA_ATTR uint32_t wakeCount = 0;

GxEPD2_BW<GxEPD2_426_GDEQ0426T82, GxEPD2_426_GDEQ0426T82::HEIGHT> display(
    GxEPD2_426_GDEQ0426T82(DisplayPins::ChipSelect, DisplayPins::DataCommand,
                           DisplayPins::Reset, DisplayPins::Busy));

const char *describeWakeReason(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_TIMER:
      return "timer";
    case ESP_SLEEP_WAKEUP_GPIO:
      return "button";
    default:
      return "power on";
  }
}

void renderStatus(const char *wakeReason) {
  display.setRotation(0);
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeMonoBold9pt7b);
    display.setCursor(20, 40);
    display.print("Hello, Meggy!");
    display.setCursor(20, 70);
    display.printf("wake %lu via %s", wakeCount, wakeReason);
    display.setCursor(20, 100);
    display.printf("up %lu s", millis() / 1000);
    display.setCursor(20, 130);
    display.print("built " __DATE__ " " __TIME__);
  } while (display.nextPage());
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  wakeCount++;
  const char *wakeReason = describeWakeReason(esp_sleep_get_wakeup_cause());
  Serial.printf("wake %lu via %s\n", wakeCount, wakeReason);

  pinMode(DisplayPins::PanelPower, OUTPUT);
  digitalWrite(DisplayPins::PanelPower, HIGH);
  delay(100);

  display.init(115200);
  renderStatus(wakeReason);

  // The panel drives the refresh itself once commanded, but cutting PanelPower
  // partway leaves the image half written, so the rail has to stay up until the
  // refresh has finished. Deep sleep drops the pin, which is what ends it.
  delay(RefreshCompletionMilliseconds);

  esp_sleep_enable_timer_wakeup(SleepDurationMicroseconds);
  Serial.println("entering deep sleep");
  Serial.flush();
  esp_deep_sleep_start();
}

void loop() {}
