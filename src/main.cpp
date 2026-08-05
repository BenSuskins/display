#include <Fonts/FreeMonoBold9pt7b.h>
#include <GxEPD2_BW.h>

#include "DisplayPins.h"

constexpr unsigned long RefreshCompletionMilliseconds = 18000;

GxEPD2_BW<GxEPD2_426_GDEQ0426T82, GxEPD2_426_GDEQ0426T82::HEIGHT> display(
    GxEPD2_426_GDEQ0426T82(DisplayPins::ChipSelect, DisplayPins::DataCommand,
                           DisplayPins::Reset, DisplayPins::Busy));

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("render start");

  pinMode(DisplayPins::PanelPower, OUTPUT);
  digitalWrite(DisplayPins::PanelPower, HIGH);
  delay(100);

  display.init(115200);
  display.epd2.selectSPI(SPI, SPISettings(1000000, MSBFIRST, SPI_MODE0));
  display.setRotation(0);
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_BLACK);
  } while (display.nextPage());

  delay(RefreshCompletionMilliseconds);
  Serial.println("render done");
}

void loop() {}
