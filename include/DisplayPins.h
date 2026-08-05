#pragma once

#include <Arduino.h>

// Waveshare e-Paper Driver HAT -> Seeed XIAO ESP32-C3.
// HAT pins 19 (DIN) and 23 (CLK) go to D10/D8, which are the XIAO's hardware
// SPI MOSI/SCK, so GxEPD2's default SPI instance needs no reconfiguration.
namespace DisplayPins {
constexpr uint8_t ChipSelect = D1;   // HAT pin 24
constexpr uint8_t DataCommand = D2;  // HAT pin 22
constexpr uint8_t Reset = D3;        // HAT pin 11

// GxEPD2 must not poll BUSY: it returns in microseconds even with the panel
// properly powered, so the refresh is gated by a measured delay instead.
constexpr int16_t Busy = -1;

constexpr uint8_t BusyLine = D4;  // HAT pin 18

// Driver HAT rev2.3 power enable, HAT pin 12. Must be high before the panel
// responds to anything, and must stay high until a refresh has finished.
constexpr uint8_t PanelPower = D5;
}  // namespace DisplayPins
