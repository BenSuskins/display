#pragma once

#include <Arduino.h>

// Waveshare e-Paper Driver HAT -> Seeed XIAO ESP32-C3.
// DIN (HAT 19) and CLK (HAT 23) go to D10/D8, the XIAO's hardware SPI MOSI/SCK,
// so GxEPD2's default SPI instance needs no reconfiguration.
//
// Control lines deliberately avoid D0-D3: the ESP32-C3 only wakes from deep
// sleep on GPIO0-GPIO5, so those are reserved for buttons. D0 is left unused
// because GPIO2 is a boot strapping pin and a button pulling it low at reset
// can drop the chip into download mode.
namespace DisplayPins {
constexpr uint8_t ChipSelect = D7;   // HAT pin 24
constexpr uint8_t DataCommand = D6;  // HAT pin 22
constexpr uint8_t Reset = D5;        // HAT pin 11
constexpr uint8_t PanelPower = D4;   // HAT pin 12, rev2.3 power enable

// GxEPD2 must not poll BUSY: on this HAT it reads a constant low whenever the
// panel is powered, so polling returns in microseconds. Refresh completion is
// gated by a fixed delay instead. BusyLine is kept for probing only.
constexpr int16_t Busy = -1;
constexpr uint8_t BusyLine = D1;  // HAT pin 18

constexpr uint8_t WakeButton = D3;  // to GND, wake-capable
}  // namespace DisplayPins
