#pragma once

#include <Arduino.h>

#include "Frame.h"

// Everything the Device does over the network: join Wi-Fi, ask for a Frame,
// come back with either a Frame, a "you already have it", or a failure.
namespace FrameClient {

bool joinNetwork(const char *ssid, const char *password);
void leaveNetwork();

// Fills buffer only when the outcome is Rendered. Refuses anything that is not
// exactly bufferLength bytes: a short Frame renders as garbage the Panel would
// then hold indefinitely.
FrameResponse fetchFrame(const char *url, const char *deviceToken,
                         const char *currentEtag, uint8_t *buffer,
                         size_t bufferLength);

}  // namespace FrameClient
