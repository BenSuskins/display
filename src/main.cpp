#include <Arduino.h>
#include <esp_sleep.h>
#include <gdeq/GxEPD2_426_GDEQ0426T82.h>

#include "DisplayPins.h"
#include "Frame.h"
#include "FrameClient.h"
#include "OfflineMarker.h"

// The whole of the Device's behaviour. It owns no layout, no schedule and no
// household data — it fetches a Frame, shows it, and sleeps for as long as the
// Render Service tells it to. See docs/adr/0001 and 0002.

// Caught here rather than at runtime: an unset environment variable expands to
// an empty string, and a device flashed with one fails in a way that looks like
// a network fault from across the room.
static_assert(sizeof(WIFI_SSID) > 1, "WIFI_SSID must be set when building");
static_assert(sizeof(WIFI_PASSWORD) > 1,
              "WIFI_PASSWORD must be set when building");
static_assert(sizeof(FRAME_URL) > 1, "FRAME_URL must be set when building");
static_assert(sizeof(DEVICE_TOKEN) > 1,
              "DEVICE_TOKEN must be set when building");

// Bisected on working hardware: 4 s truncates a full refresh and blanks the
// screen, 8 s completes it. Well above the observed edge, because e-ink slows
// as it cools and a truncated refresh fails silently.
constexpr uint32_t FullRefreshGuardMilliseconds = 12000;

// PROVISIONAL. The library claims 600 ms for a partial refresh, but BUSY tells
// us nothing on this HAT so it has never been bisected here. Run the
// partial_probe environment and replace this with a measured number before
// trusting the Offline Marker.
constexpr uint32_t PartialRefreshGuardMilliseconds = 3000;

constexpr uint32_t FailuresBeforeOfflineMarker = 3;
constexpr uint32_t FallbackSleepSeconds = 1800;
constexpr uint32_t MaximumSleepSeconds = 3600;

// Survives deep sleep. The etag is what makes a 304 possible, and losing it
// costs one unnecessary redraw, nothing worse.
RTC_DATA_ATTR char shownEtag[Frame::EtagCapacity] = {0};
RTC_DATA_ATTR uint32_t consecutiveFailures = 0;
RTC_DATA_ATTR bool offlineMarkerShown = false;
RTC_DATA_ATTR uint32_t wakeCount = 0;

// 48 KB in .bss. Talking to the driver directly rather than through GxEPD2_BW
// avoids a second buffer of the same size that we would never draw into.
static uint8_t frameBuffer[Frame::ByteLength];

GxEPD2_426_GDEQ0426T82 panel(DisplayPins::ChipSelect, DisplayPins::DataCommand,
                             DisplayPins::Reset, DisplayPins::Busy);

void powerPanelUp() {
  pinMode(DisplayPins::PanelPower, OUTPUT);
  digitalWrite(DisplayPins::PanelPower, HIGH);
  delay(100);
  panel.init(115200, true, 2, false);
}

void showFrame() {
  panel.writeImage(frameBuffer, 0, 0, Frame::Width, Frame::Height);
  panel.refresh(false);
  delay(FullRefreshGuardMilliseconds);
  // Leaves the controller's previous buffer equal to its current one, which is
  // what a later partial refresh differentiates against.
  panel.writeImageAgain(frameBuffer, 0, 0, Frame::Width, Frame::Height);
}

void stampOfflineMarker() {
  panel.writeImage(OfflineMarker::Bitmap, OfflineMarker::X, OfflineMarker::Y,
                   OfflineMarker::Width, OfflineMarker::Height);
  panel.refresh(OfflineMarker::X, OfflineMarker::Y, OfflineMarker::Width,
                OfflineMarker::Height);
  delay(PartialRefreshGuardMilliseconds);
  panel.writeImageAgain(OfflineMarker::Bitmap, OfflineMarker::X,
                        OfflineMarker::Y, OfflineMarker::Width,
                        OfflineMarker::Height);
  offlineMarkerShown = true;
  Serial.println("panel: offline marker stamped");
}

void sleepFor(uint32_t seconds) {
  const uint32_t bounded =
      seconds == 0 ? FallbackSleepSeconds
                   : (seconds > MaximumSleepSeconds ? MaximumSleepSeconds
                                                    : seconds);

  panel.hibernate();
  digitalWrite(DisplayPins::PanelPower, LOW);

  // A Requested Wake: the button pulls D3 low.
  pinMode(DisplayPins::WakeButton, INPUT_PULLUP);
  esp_deep_sleep_enable_gpio_wakeup(1ULL << DisplayPins::WakeButton,
                                    ESP_GPIO_WAKEUP_GPIO_LOW);
  esp_sleep_enable_timer_wakeup(static_cast<uint64_t>(bounded) * 1000000ULL);

  Serial.printf("sleeping %lu s (awake %lu ms)\n", bounded, millis());
  Serial.flush();
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);

  wakeCount += 1;
  const bool buttonWake =
      esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_GPIO;
  Serial.printf("\nwake %lu (%s) build %s %s\n", wakeCount,
                buttonWake ? "button" : "timer", __DATE__, __TIME__);

  if (!FrameClient::joinNetwork(WIFI_SSID, WIFI_PASSWORD)) {
    consecutiveFailures += 1;
    powerPanelUp();
    if (consecutiveFailures >= FailuresBeforeOfflineMarker &&
        !offlineMarkerShown) {
      stampOfflineMarker();
    }
    sleepFor(FallbackSleepSeconds);
  }

  const FrameResponse response = FrameClient::fetchFrame(
      FRAME_URL, DEVICE_TOKEN, shownEtag, frameBuffer, Frame::ByteLength);
  FrameClient::leaveNetwork();

  switch (response.outcome) {
    case FetchOutcome::Rendered:
      consecutiveFailures = 0;
      powerPanelUp();
      showFrame();
      strlcpy(shownEtag, response.etag, Frame::EtagCapacity);
      offlineMarkerShown = false;
      break;

    case FetchOutcome::Unchanged:
      // The cheap path, and the common one: no panel power, no refresh guard.
      consecutiveFailures = 0;
      Serial.println("panel: unchanged, skipping refresh");
      break;

    case FetchOutcome::Failed:
      consecutiveFailures += 1;
      Serial.printf("fetch failed (%lu in a row)\n", consecutiveFailures);
      if (consecutiveFailures >= FailuresBeforeOfflineMarker &&
          !offlineMarkerShown) {
        powerPanelUp();
        stampOfflineMarker();
      }
      break;
  }

  sleepFor(response.nextWakeSeconds);
}

void loop() {}
