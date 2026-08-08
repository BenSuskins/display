#include "FrameClient.h"

#include <HTTPClient.h>
#include <WiFi.h>

namespace {

constexpr uint32_t WiFiConnectTimeoutMilliseconds = 15000;
constexpr uint16_t HttpTimeoutMilliseconds = 20000;

FrameResponse failure(int status) {
  FrameResponse response{};
  response.outcome = FetchOutcome::Failed;
  response.status = status;
  response.nextWakeSeconds = 0;
  response.etag[0] = '\0';
  return response;
}

uint32_t readNextWakeSeconds(HTTPClient &http) {
  const String header = http.header("X-Next-Wake-Seconds");
  return header.isEmpty() ? 0 : static_cast<uint32_t>(header.toInt());
}

void copyEtag(HTTPClient &http, FrameResponse &response) {
  const String etag = http.header("ETag");
  strlcpy(response.etag, etag.c_str(), Frame::EtagCapacity);
}

}  // namespace

bool FrameClient::joinNetwork(const char *ssid, const char *password) {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startedAt > WiFiConnectTimeoutMilliseconds) {
      Serial.println("wifi: timed out");
      return false;
    }
    delay(100);
  }

  Serial.printf("wifi: %s, %ld dBm, %lu ms\n", WiFi.localIP().toString().c_str(),
                WiFi.RSSI(), millis() - startedAt);
  return true;
}

void FrameClient::leaveNetwork() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

FrameResponse FrameClient::fetchFrame(const char *url, const char *deviceToken,
                                      const char *currentEtag, uint8_t *buffer,
                                      size_t bufferLength) {
  HTTPClient http;
  http.setTimeout(HttpTimeoutMilliseconds);
  http.setConnectTimeout(HttpTimeoutMilliseconds);

  if (!http.begin(url)) return failure(-1);

  // Asking for these two by name is required: HTTPClient discards every
  // response header it was not told to keep.
  const char *interestingHeaders[] = {"ETag", "X-Next-Wake-Seconds"};
  http.collectHeaders(interestingHeaders, 2);

  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  if (currentEtag != nullptr && currentEtag[0] != '\0') {
    http.addHeader("If-None-Match", currentEtag);
  }

  const int status = http.GET();
  if (status <= 0) {
    Serial.printf("http: transport failure %d\n", status);
    http.end();
    return failure(status);
  }

  FrameResponse response{};
  response.status = status;
  response.nextWakeSeconds = readNextWakeSeconds(http);
  copyEtag(http, response);

  if (status == HTTP_CODE_NOT_MODIFIED) {
    response.outcome = FetchOutcome::Unchanged;
    http.end();
    return response;
  }

  if (status != HTTP_CODE_OK) {
    Serial.printf("http: %d\n", status);
    http.end();
    response.outcome = FetchOutcome::Failed;
    return response;
  }

  const int contentLength = http.getSize();
  if (contentLength != static_cast<int>(bufferLength)) {
    // A short Frame would render as a band of garbage across the panel, and
    // e-ink keeps whatever it is given. Refusing is the safer failure.
    Serial.printf("http: expected %u bytes, was told %d\n",
                  static_cast<unsigned>(bufferLength), contentLength);
    http.end();
    response.outcome = FetchOutcome::Failed;
    return response;
  }

  WiFiClient *stream = http.getStreamPtr();
  size_t received = 0;
  const uint32_t startedAt = millis();

  while (received < bufferLength && http.connected()) {
    const int available = stream->available();
    if (available > 0) {
      received += stream->readBytes(buffer + received, bufferLength - received);
    } else if (millis() - startedAt > HttpTimeoutMilliseconds) {
      break;
    } else {
      delay(1);
    }
  }
  http.end();

  if (received != bufferLength) {
    Serial.printf("http: truncated at %u of %u bytes\n",
                  static_cast<unsigned>(received),
                  static_cast<unsigned>(bufferLength));
    response.outcome = FetchOutcome::Failed;
    return response;
  }

  Serial.printf("http: frame in %lu ms\n", millis() - startedAt);
  response.outcome = FetchOutcome::Rendered;
  return response;
}
