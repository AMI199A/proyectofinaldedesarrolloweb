#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ================= WIFI =================
// Configura tu red Wi-Fi local (debe ser de 2.4 GHz):
const char* WIFI_SSID = "mm";
const char* WIFI_PASSWORD = "12345678";

// ================= SERVIDOR Y NODE-RED EN AZURE =================
// Para conectar con tu servidor en la nube de Azure:
// Se utiliza el puerto 5173 porque el proxy Nginx en el contenedor frontend
// reenvía la telemetría a Node-RED (puerto 1880) internamente,
// permitiendo atravesar el firewall de Azure sin abrir puertos adicionales.
// (Reemplaza 20.84.100.158 por la IP pública de tu máquina virtual si cambia)
const char* NODE_RED_URL = "http://20.84.100.158:5173/esp32/telemetry";

// Credenciales configuradas en el servidor (.env) y flujo Node-RED:
const char* DEVICE_ID = "esp32-01";
const char* DEVICE_KEY = "change-iot-ingest-key";

// ================= PINES (ESP32-S3) =================
// Puente H L298N (motor)
const int MOTOR_IN1_PIN = 5;    // IN1 del L298N
const int MOTOR_IN2_PIN = 6;    // IN2 del L298N
const int MOTOR_ENA_PIN = 7;    // ENA del L298N (PWM, velocidad)
const int MOTOR_SPEED = 100;    // 0 a 255 (velocidad de giro)

// LED parpadeante (el buzzer suena junto con el LED)
const int LED_PIN = 9;
const int BUZZER_PIN = 10;      // Buzzer HW-508 (pasivo, señal)
const int BUZZER_FREQ = 2000;   // Frecuencia del tono en Hz

// Sensor DHT11 (temperatura y humedad)
const int DHT_PIN = 11;
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// ================= TIEMPOS =================
constexpr unsigned long SEND_INTERVAL_MS = 15000;       // Envío cada 15s
constexpr unsigned long STATUS_INTERVAL_MS = 10000;     // Reporte cada 10s
constexpr unsigned long RECONNECT_INTERVAL_MS = 15000;  // Reintento Wi-Fi cada 15s
constexpr unsigned long LED_BLINK_INTERVAL_MS = 500;    // Parpadeo cada 500ms

// ================= ESTADO =================
bool ledState = false;

unsigned long lastSendAt = 0;
unsigned long lastStatusAt = 0;
unsigned long lastReconnectAt = 0;
unsigned long lastLedAt = 0;

unsigned long sendAttempts = 0;
unsigned long successfulResponses = 0;

int lastHttpCode = 0;
int previousWifiStatus = -1;

String commandBuffer;

// ================= ESTADO GENERAL =================
void showStatus() {
  Serial.println("\n========== ESTADO ==========");

  Serial.printf(
    "Tiempo encendido: %lu segundos\n",
    millis() / 1000UL
  );

  Serial.printf("Sensor: DHT11 (GPIO %d)\n", DHT_PIN);
  Serial.printf("Motor: ENCENDIDO FIJO (velocidad %d/255)\n", MOTOR_SPEED);
  Serial.printf("LED y buzzer: parpadeo cada %lu ms\n", LED_BLINK_INTERVAL_MS);

  Serial.printf(
    "Wi-Fi: %s\n",
    WiFi.status() == WL_CONNECTED
      ? "CONECTADO"
      : "DESCONECTADO"
  );

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Red: %s\n", WiFi.SSID().c_str());

    Serial.printf(
      "IP ESP32-S3: %s\n",
      WiFi.localIP().toString().c_str()
    );

    Serial.printf("Senal: %d dBm\n", WiFi.RSSI());
  }

  Serial.printf("Dispositivo: %s\n", DEVICE_ID);
  Serial.printf("Destino: %s\n", NODE_RED_URL);
  Serial.printf("Envio: automatico cada %lu segundos\n", SEND_INTERVAL_MS / 1000UL);

  Serial.printf("Intentos de envio: %lu\n", sendAttempts);

  Serial.printf(
    "Envios exitosos: %lu\n",
    successfulResponses
  );

  if (sendAttempts > 0) {
    Serial.printf("Ultimo codigo HTTP: %d\n", lastHttpCode);
  } else {
    Serial.println("Servidor: pendiente de envio");
  }

  Serial.println("============================\n");
}

// ================= ESCANEO DE REDES =================
void scanNetworks() {
  Serial.println("\n[SCAN] Buscando redes Wi-Fi...");

  int n = WiFi.scanNetworks();

  if (n == 0) {
    Serial.println("[SCAN] No se encontro ninguna red.");
  } else {
    for (int i = 0; i < n; i++) {
      Serial.printf(
        "%d: %s (%d dBm) %s\n",
        i + 1,
        WiFi.SSID(i).c_str(),
        WiFi.RSSI(i),
        WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "abierta" : "protegida"
      );
    }
  }

  WiFi.scanDelete();
  Serial.println();
}

// ================= WIFI =================
void startWifi() {
  Serial.printf(
    "\n[WIFI] Conectando a: %s\n",
    WIFI_SSID
  );

  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lastReconnectAt = millis();
}

void maintainWifi() {
  int currentStatus = (int)WiFi.status();

  if (currentStatus != previousWifiStatus) {
    previousWifiStatus = currentStatus;

    if (currentStatus == WL_CONNECTED) {
      Serial.println("\n[OK] Wi-Fi conectado.");

      Serial.printf(
        "[WIFI] IP del ESP32-S3: %s\n",
        WiFi.localIP().toString().c_str()
      );

      Serial.printf(
        "[WIFI] Intensidad: %d dBm\n",
        WiFi.RSSI()
      );
    } else {
      Serial.printf(
        "[WIFI] Sin conexion. Estado: %d\n",
        currentStatus
      );
    }
  }

  if (currentStatus != WL_CONNECTED &&
      millis() - lastReconnectAt >= RECONNECT_INTERVAL_MS) {
    lastReconnectAt = millis();

    Serial.println("[WIFI] Reintentando conexion...");
    WiFi.reconnect();
  }
}

// ================= LECTURA DEL SENSOR =================
// Devuelve false si el DHT11 no responde.
// Incluye un micro-reintento para evitar fallos por interrupciones del Wi-Fi en ESP32.
bool generateReading(
  float &temperature,
  float &humidity
) {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    delay(200);
    t = dht.readTemperature();
    h = dht.readHumidity();
  }

  if (isnan(t) || isnan(h)) {
    return false;
  }

  temperature = t;
  humidity = h;

  return true;
}

void printReading(
  float temperature,
  float humidity
) {
  Serial.println("\n========== DATOS DEL SENSOR ==========");

  Serial.printf(
    "Temperatura: %.2f C\n",
    temperature
  );

  Serial.printf(
    "Humedad: %.2f %%\n",
    humidity
  );

  Serial.println("======================================");
}

// ================= ENVIO A NODE-RED =================
// Envia la lectura capturada del DHT11 al flujo de Node-RED en Azure.
void sendReading(
  float temperature,
  float humidity
) {
  printReading(temperature, humidity);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ENVIO FALLIDO] Sin Wi-Fi. Dato no enviado.");
    return;
  }

  JsonDocument document;

  document["deviceId"] = DEVICE_ID;
  document["temperature"] = round(temperature * 100.0) / 100.0;
  document["humidity"] = round(humidity * 100.0) / 100.0;
  // Presión estándar de referencia a nivel del mar para que la pantalla de
  // comparación meteorológica y Node Clima muestre el gráfico completo:
  document["pressure"] = 1013.25;

  String payload;
  serializeJson(document, payload);

  sendAttempts++;

  Serial.println("\n----------- ENVIO -----------");
  Serial.printf("[ENVIO] Lectura #%lu\n", sendAttempts);
  Serial.printf("[ENVIO] Destino: %s\n", NODE_RED_URL);
  Serial.printf("[ENVIO] JSON: %s\n", payload.c_str());

  WiFiClient client;
  HTTPClient http;

  // Tiempos de espera optimizados para conexiones en la nube (Azure):
  http.setConnectTimeout(8000);
  http.setTimeout(10000);

  if (!http.begin(client, NODE_RED_URL)) {
    Serial.println("[ENVIO FALLIDO] No se pudo iniciar HTTP.");
    Serial.println("-----------------------------\n");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  unsigned long startedAt = millis();

  lastHttpCode = http.POST(payload);

  unsigned long elapsed = millis() - startedAt;

  Serial.printf("[HTTP] Codigo: %d\n", lastHttpCode);
  Serial.printf("[HTTP] Tiempo: %lu ms\n", elapsed);

  if (lastHttpCode > 0) {
    String response = http.getString();

    Serial.println("[HTTP] Respuesta del servidor:");
    Serial.println(response);

    if (lastHttpCode >= 200 && lastHttpCode < 300) {
      successfulResponses++;

      Serial.printf(
        "[ENVIADO OK] Lectura #%lu | Temp: %.2f C | Hum: %.2f %% | HTTP %d\n",
        sendAttempts,
        temperature,
        humidity,
        lastHttpCode
      );
      Serial.println("Verifica los datos en la pantalla 'Node Clima'.");

    } else {
      Serial.printf(
        "[ENVIO FALLIDO] Lectura #%lu | HTTP %d\n",
        sendAttempts,
        lastHttpCode
      );

      if (lastHttpCode == 401 || lastHttpCode == 403) {
        Serial.println("Revisa DEVICE_KEY y la autorizacion del servidor.");
      } else if (lastHttpCode == 404) {
        Serial.println("Ruta no encontrada. Revisa IP, puerto 5173 y /esp32/telemetry.");
      } else if (lastHttpCode == 400) {
        Serial.println("Datos rechazados. Revisa la validacion en Node-RED.");
      } else if (lastHttpCode >= 500) {
        Serial.println("Fallo del servidor. Revisa los contenedores Docker en Azure.");
      } else {
        Serial.println("La respuesta no confirma exito.");
      }
    }

  } else {
    Serial.printf(
      "[ENVIO FALLIDO] Lectura #%lu | %s\n",
      sendAttempts,
      HTTPClient::errorToString(lastHttpCode).c_str()
    );
    Serial.println("Revisa conexion a internet o que el puerto 5173 este accesible en Azure.");
  }

  Serial.println("-----------------------------\n");

  http.end();
}

// Lee el DHT11 y, si la lectura es valida, la envia a Node-RED.
void sendSensorReading() {
  float temperature;
  float humidity;

  if (!generateReading(temperature, humidity)) {
    Serial.println("[ERROR] El DHT11 no responde. Revisa su conexion.");
    return;
  }

  sendReading(temperature, humidity);
}

// ================= LED Y BUZZER =================
// El LED parpadea y el buzzer suena solo cuando el LED esta encendido.
void updateLedAndBuzzer() {
  if (millis() - lastLedAt >= LED_BLINK_INTERVAL_MS) {
    lastLedAt = millis();
    ledState = !ledState;

    digitalWrite(LED_PIN, ledState ? HIGH : LOW);

    if (ledState) {
      tone(BUZZER_PIN, BUZZER_FREQ);
    } else {
      noTone(BUZZER_PIN);
    }
  }
}

// ================= COMANDOS SERIALES =================
void processCommand(String command) {
  command.trim();
  command.toLowerCase();

  if (command.length() == 0) {
    return;
  }

  Serial.printf("\n> %s\n", command.c_str());

  if (command == "estado") {
    showStatus();

  } else if (command == "wifi") {
    startWifi();

  } else if (command == "scan") {
    scanNetworks();

  } else if (command == "leer") {
    float temperature;
    float humidity;

    if (generateReading(temperature, humidity)) {
      printReading(temperature, humidity);
      Serial.println("[INFO] Estos datos no se enviaron.");
    } else {
      Serial.println("[ERROR] El DHT11 no responde. Revisa su conexion.");
    }

  } else {
    Serial.println(
      "[ERROR] Comando desconocido. Comandos: estado, wifi, scan, leer"
    );
  }
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    char character = (char)Serial.read();

    if (character == '\n' || character == '\r') {
      if (commandBuffer.length() > 0) {
        processCommand(commandBuffer);
        commandBuffer = "";
      }
    } else if (commandBuffer.length() < 80) {
      commandBuffer += character;
    }
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  commandBuffer.reserve(80);

  Serial.println("\n======================================");
  Serial.println(" ESP32-S3 - MONITOR AMBIENTAL CON MOTOR");
  Serial.println(" ESP32-S3 -> Node-RED -> API -> PostgreSQL (Azure)");
  Serial.println("======================================");

  // Motor: giro fijo en un sentido a velocidad configurada
  pinMode(MOTOR_IN1_PIN, OUTPUT);
  pinMode(MOTOR_IN2_PIN, OUTPUT);
  digitalWrite(MOTOR_IN1_PIN, HIGH);
  digitalWrite(MOTOR_IN2_PIN, LOW);
  ledcAttach(MOTOR_ENA_PIN, 1000, 8);   // 1 kHz, 8 bits
  ledcWrite(MOTOR_ENA_PIN, MOTOR_SPEED);
  Serial.println("[INICIO] Motor encendido de forma fija.");

  // LED y buzzer (juntos)
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // DHT11
  dht.begin();
  Serial.println("[INICIO] Sensor DHT11 iniciado.");

  Serial.printf("[INICIO] Envio automatico a Node-RED cada %lu segundos.\n",
                SEND_INTERVAL_MS / 1000UL);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  scanNetworks();
  startWifi();

  lastSendAt = millis();   // El primer envio ocurre 15 segundos despues de iniciar
}

// ================= LOOP =================
void loop() {
  readSerialCommands();
  maintainWifi();
  updateLedAndBuzzer();

  if (millis() - lastStatusAt >= STATUS_INTERVAL_MS) {
    lastStatusAt = millis();

    Serial.printf(
      "[ESTADO] WiFi=%s | Sensor=DHT11 | Envio=cada %lus\n",
      WiFi.status() == WL_CONNECTED ? "OK" : "NO",
      SEND_INTERVAL_MS / 1000UL
    );
  }

  if (millis() - lastSendAt >= SEND_INTERVAL_MS) {
    lastSendAt = millis();

    if (WiFi.status() == WL_CONNECTED) {
      sendSensorReading();
    } else {
      Serial.println("\n[ENVIO OMITIDO] Sin Wi-Fi. Se reintentara en 15 segundos.");
    }
  }

  delay(5);
}
