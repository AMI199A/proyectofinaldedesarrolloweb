#include <Adafruit_BME280.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* NODE_RED_URL = "http://192.168.1.10:5173/esp32/telemetry";
const char* DEVICE_ID = "esp32-01";
const char* DEVICE_KEY = "SET_IOT_DEVICE_INGEST_KEY";

constexpr unsigned long SEND_INTERVAL_MS = 30000;

Adafruit_BME280 sensor;
unsigned long lastSendAt = 0;

void setup() {
  Serial.begin(115200);

  if (!sensor.begin(0x76) && !sensor.begin(0x77)) {
    Serial.println("No se detecta el sensor BME280.");
    while (true) delay(1000);
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando al Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nESP32 conectado: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (millis() - lastSendAt < SEND_INTERVAL_MS) {
    delay(100);
    return;
  }
  lastSendAt = millis();

  JsonDocument reading;
  reading["deviceId"] = DEVICE_ID;
  reading["temperature"] = sensor.readTemperature();
  reading["humidity"] = sensor.readHumidity();
  reading["pressure"] = sensor.readPressure() / 100.0F;

  String payload;
  serializeJson(reading, payload);

  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, NODE_RED_URL)) {
    Serial.println("No se pudo iniciar la conexión HTTP.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  const int status = http.POST(payload);
  Serial.printf("POST Node-RED: HTTP %d\n", status);
  if (status > 0) {
    Serial.println(http.getString());
  } else {
    Serial.printf("Error HTTP: %s\n", http.errorToString(status).c_str());
  }
  http.end();
}
