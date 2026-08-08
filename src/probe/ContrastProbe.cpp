#include <GxEPD2_BW.h>

#include "DisplayPins.h"

// Localises the pale vertical band that shows up on a solid black field.
//
// E-ink drives rows sequentially and columns simultaneously, so a full-height
// vertical band is a source-driver symptom: a contiguous run of columns being
// underdriven for every row. Two causes fit, and they need opposite fixes:
//
//   Data dependent. Columns containing white content have to switch drive level
//   while columns sitting at constant black do not, so they draw more current.
//   A supply that cannot sustain that leaves those columns pale down the whole
//   height, not just where the white content is. Points at the power path.
//
//   Physical. A damaged COG bond or stressed glass leaves a band fixed to the
//   panel regardless of what is drawn. Points at the panel or its connector.
//
// The pages below separate the two by sweeping an identical white box across
// three positions. If the band follows the box it is data dependent and the
// supply is the problem. If it stays put -- and in particular if it is still
// there on the page with no white content at all -- it is physical.

constexpr uint32_t ViewingMilliseconds = 15000;

GxEPD2_BW<GxEPD2_426_GDEQ0426T82, GxEPD2_426_GDEQ0426T82::HEIGHT> display(
    GxEPD2_426_GDEQ0426T82(DisplayPins::ChipSelect, DisplayPins::DataCommand,
                           DisplayPins::Reset, DisplayPins::Busy));

constexpr uint16_t Black = 0x0000;
constexpr uint16_t White = 0xFFFF;
constexpr int16_t ScreenWidth = 800;
constexpr int16_t ScreenHeight = 480;

// Identical at every position, so the three pages differ only in where the
// switching columns fall.
constexpr int16_t BoxWidth = 240;
constexpr int16_t BoxHeight = 60;
constexpr int16_t BoxTop = 210;
constexpr int16_t BoxEdgeInset = 40;

uint32_t refreshCount = 0;

void drawWhiteBox(int16_t left, const char *label) {
  display.fillRect(left, BoxTop, BoxWidth, BoxHeight, White);
  display.setTextColor(Black);
  display.setCursor(left + 12, BoxTop + 20);
  display.print(label);
  display.setCursor(left + 12, BoxTop + 38);
  display.printf("refresh %lu", refreshCount);
}

void renderPureBlack() {
  display.fillScreen(Black);
  // The control: no white anywhere near the centre. The registration mark is
  // kept small and hard against the top left corner so it cannot be mistaken
  // for the band under test, while still proving the render landed.
  display.fillRect(8, 8, 24, 24, White);
}

void renderBoxLeft() {
  display.fillScreen(Black);
  drawWhiteBox(BoxEdgeInset, "BOX LEFT");
}

void renderBoxCentre() {
  display.fillScreen(Black);
  drawWhiteBox((ScreenWidth - BoxWidth) / 2, "BOX CENTRE");
}

void renderBoxRight() {
  display.fillScreen(Black);
  drawWhiteBox(ScreenWidth - BoxWidth - BoxEdgeInset, "BOX RIGHT");
}

void renderPureWhite() {
  display.fillScreen(White);
  display.setTextColor(Black);
  display.setCursor(40, 40);
  display.print("PURE WHITE - separator, clears the previous field");
  display.setCursor(40, 60);
  display.printf("refresh %lu   built " __DATE__ " " __TIME__, refreshCount);
}

struct ProbePage {
  const char *name;
  void (*render)();
};

// A white field between each black one, so ghosting from the previous page
// cannot be mistaken for a band in the current one.
const ProbePage ProbePages[] = {
    {"pure black (control)", renderPureBlack}, {"white separator", renderPureWhite},
    {"box left", renderBoxLeft},               {"white separator", renderPureWhite},
    {"box centre", renderBoxCentre},           {"white separator", renderPureWhite},
    {"box right", renderBoxRight},             {"white separator", renderPureWhite},
};
constexpr size_t ProbePageCount = sizeof(ProbePages) / sizeof(ProbePages[0]);

size_t currentPageIndex = 0;

void renderAndRefresh(const ProbePage &page) {
  const uint32_t startedAt = millis();
  display.setRotation(0);
  display.setFullWindow();
  display.firstPage();
  do {
    display.setFont(nullptr);
    display.setTextSize(1);
    display.setTextWrap(false);
    page.render();
  } while (display.nextPage());
  refreshCount++;
  Serial.printf("refresh %lu  %s  issued in %lu ms\n", refreshCount, page.name,
                millis() - startedAt);
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(DisplayPins::PanelPower, OUTPUT);
  digitalWrite(DisplayPins::PanelPower, HIGH);
  delay(100);

  display.init(115200);
  Serial.println("band probe: does the pale band follow the white box?");
}

void loop() {
  renderAndRefresh(ProbePages[currentPageIndex]);
  currentPageIndex = (currentPageIndex + 1) % ProbePageCount;
  delay(ViewingMilliseconds);
}
