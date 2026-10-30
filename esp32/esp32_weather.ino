#include <Wire.h>
#include <Adafruit_BME280.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClient.h>

// ================= Configuración de Red Wi-Fi =================
const char* WIFI_SSID = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_CONTRASEÑA_WIFI";

// ================= Configuración del Servidor y Node-RED ======
// En desarrollo local: IP local de tu PC (ej: http://192.168.0.139:5173/esp32/telemetry)
// En Azure VM: IP pública de tu máquina virtual (ej: http://20.x.x.x:5173/esp32/telemetry)
const char* NODE_RED_URL = "http://192.168.0.139:5173/esp32/telemetry";
const char* DEVICE_ID = "esp32-01";
const char* DEVICE_KEY = "change-iot-ingest-key";

// ================= Pines I2C para ESP32-S3 ====================
// En la mayoría de placas ESP32-S3: SDA = GPIO 8, SCL = GPIO 9 (ajusta según tu placa)
#define I2C_SDA 8
#define I2C_SCL 9

constexpr unsigned long SEND_INTERVAL_MS = 15000; // Envío cada 15 segundos

Adafruit_BME280 sensor;
bool sensorDetected = false;
unsigned long lastSendAt = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Iniciando ESP32-S3 Weather Client ---");

  // Iniciar bus I2C para ESP32-S3
  Wire.begin(I2C_SDA, I2C_SCL);

  if (sensor.begin(0x76, &Wire) || sensor.begin(0x77, &Wire)) {
    sensorDetected = true;
    Serial.println("[OK] Sensor BME280 detectado correctamente.");
  } else {
    sensorDetected = false;
    Serial.println("[AVISO] Sensor BME280 no detectado. Se enviarán datos simulados para pruebas.");
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Conectando a Wi-Fi: %s", WIFI_SSID);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[OK] ESP32-S3 conectado a la red. IP local: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[ERROR] No se pudo conectar a la red Wi-Fi. Verifica SSID y contraseña.");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Reconectando a Wi-Fi...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  if (millis() - lastSendAt < SEND_INTERVAL_MS) {
    delay(100);
    return;
  }
  lastSendAt = millis();

  float temperature = 0.0;
  float humidity = 0.0;
  float pressure = 0.0;

  if (sensorDetected) {
    temperature = sensor.readTemperature();
    humidity = sensor.readHumidity();
    pressure = sensor.readPressure() / 100.0F;
  } else {
    // Generar valores simulados realistas si el sensor físico aún no está cableado
    temperature = 22.0 + (random(0, 50) / 10.0);
    humidity = 60.0 + (random(0, 100) / 10.0);
    pressure = 1013.25 + (random(-50, 50) / 10.0);
  }

  JsonDocument reading;
  reading["deviceId"] = DEVICE_ID;
  reading["temperature"] = round(temperature * 100.0) / 100.0;
  reading["humidity"] = round(humidity * 100.0) / 100.0;
  reading["pressure"] = round(pressure * 100.0) / 100.0;

  String payload;
  serializeJson(reading, payload);

  Serial.println("\n-------------------------------------------");
  Serial.printf("Enviando telemetría a Node-RED: %s\n", payload.c_str());

  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, NODE_RED_URL)) {
    Serial.println("[ERROR] No se pudo inicializar la conexión HTTP con el servidor.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  const int status = http.POST(payload);
  Serial.printf("Respuesta HTTP del servidor: %d\n", status);

  if (status > 0) {
    String response = http.getString();
    Serial.printf("Cuerpo de respuesta: %s\n", response.c_str());
  } else {
    Serial.printf("[ERROR HTTP] %s\n", http.errorToString(status).c_str());
  }
  http.end();
}

