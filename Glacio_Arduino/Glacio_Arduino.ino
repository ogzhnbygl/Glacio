#include <FS.h>
#include <LittleFS.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>

// --- Varsayılan Ayarlar (Kullanıcı arayüzünden güncellenebilir) ---
char device_id[32]  = "glacio-node-01";
char api_key[64]    = "glacio-super-secret-key-2026";
char api_url[128]   = "https://glacio.vercel.app/api/telemetry";
char temp_offset[8] = "0.0";

bool shouldSaveConfig = false;

// Pin Tanımları
const int ntcPin       = A0;
const int ledPin       = 2; // Dahili mavi LED (GPIO 2 / D4)
const int resetBtnPin  = 0; // FLASH Butonu (GPIO 0) - Ayarları sıfırlayıp AP moduna geçmek için

// Sensör Parametreleri
const float B_COEFFICIENT   = 3950.0;
const float ROOM_TEMP       = 298.15;   // 25°C
const float ROOM_RESISTANCE = 100000.0; // 100k
const float R_EQUIVALENT    = 76200.0;  // 100k paralel eşdeğer direnç

// Zamanlayıcı
unsigned long lastPostTime = 0;
const unsigned long POST_INTERVAL = 30000; // 30 saniye

// WiFiManager kaydetme bayrağı
void saveConfigCallback() {
  Serial.println("[FS] Ayarlar kaydedilecek...");
  shouldSaveConfig = true;
}

// Flash (LittleFS) üzerinden yapılandırmayı oku
void loadConfig() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/config.json")) {
      File configFile = LittleFS.open("/config.json", "r");
      if (configFile) {
        size_t size = configFile.size();
        std::unique_ptr<char[]> buf(new char[size]);
        configFile.readBytes(buf.get(), size);
        configFile.close();

        StaticJsonDocument<512> json;
        DeserializationError error = deserializeJson(json, buf.get());
        if (!error) {
          strcpy(device_id, json["device_id"] | device_id);
          strcpy(api_key, json["api_key"] | api_key);
          strcpy(api_url, json["api_url"] | api_url);
          strcpy(temp_offset, json["temp_offset"] | temp_offset);
          Serial.println("[FS] Kayitli ayarlar yuklendi.");
        }
      }
    }
  } else {
    Serial.println("[FS] LittleFS baslatilamadi!");
  }
}

// Flash (LittleFS) içine yapılandırmayı kaydet
void saveConfig() {
  StaticJsonDocument<512> json;
  json["device_id"]   = device_id;
  json["api_key"]     = api_key;
  json["api_url"]     = api_url;
  json["temp_offset"] = temp_offset;

  File configFile = LittleFS.open("/config.json", "w");
  if (configFile) {
    serializeJson(json, configFile);
    configFile.close();
    Serial.println("[FS] Yeni ayarlar LittleFS'e kaydedildi.");
  }
}

// Sıcaklık Okuma Fonksiyonu
float readTemperature() {
  float rawADC = 0;
  for (int i = 0; i < 20; i++) {
    rawADC += analogRead(ntcPin);
    delay(5);
  }
  rawADC /= 20.0;

  if (rawADC < 15.0 || rawADC > 1010.0) return -999.0;

  float ntcResistance = R_EQUIVALENT * ((1023.0 / rawADC) - 1.0);
  float steinhart = ntcResistance / ROOM_RESISTANCE;
  steinhart = log(steinhart);
  steinhart /= B_COEFFICIENT;
  steinhart += 1.0 / ROOM_TEMP;
  steinhart = 1.0 / steinhart;

  float offsetVal = atof(temp_offset);
  return (steinhart - 273.15) + offsetVal;
}

// Telemetri Gönderme
void sendTelemetryData(float temp) {
  WiFiClientSecure client;
  client.setInsecure(); // SSL sertifika kontrolünü atla

  HTTPClient http;
  if (http.begin(client, api_url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", api_key);

    String payload = "{\"deviceId\":\"" + String(device_id) + "\",\"temperature\":" + String(temp, 2) + "}";
    Serial.print("[HTTP] POST: ");
    Serial.println(payload);

    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      Serial.printf("[HTTP] Kod: %d\n", httpCode);
      // LED flaş uyarısı (başarılı gönderim)
      digitalWrite(ledPin, HIGH);
      delay(80);
      digitalWrite(ledPin, LOW);
    } else {
      Serial.printf("[HTTP] Hata: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  pinMode(resetBtnPin, INPUT_PULLUP);
  digitalWrite(ledPin, HIGH); // LED sönük

  delay(100);
  Serial.println("\n=== Glacio Baslatiliyor ===");

  // 1. Dosya Sisteminden Ayarları Yükle
  loadConfig();

  // 2. WiFiManager Kurulumu
  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  // Web portalına özel giriş kutuları ekle
  WiFiManagerParameter custom_device_id("device_id", "Cihaz ID (Örn: glacio-01)", device_id, 32);
  WiFiManagerParameter custom_api_key("api_key", "API Secret Key", api_key, 64);
  WiFiManagerParameter custom_api_url("api_url", "Vercel API URL", api_url, 128);
  WiFiManagerParameter custom_temp_offset("temp_offset", "Kalibrasyon Ofseti (°C)", temp_offset, 8);

  wm.addParameter(&custom_device_id);
  wm.addParameter(&custom_api_key);
  wm.addParameter(&custom_api_url);
  wm.addParameter(&custom_temp_offset);

  // Eğer ağa bağlanamazsa 'Glacio-Setup' yayını başlatır ve web portalını açar
  wm.setConfigPortalTimeout(180); // 3 dakika işlem yapılmazsa yeniden dener

  Serial.println("[WiFi] Baglanti kontrol ediliyor...");
  if (!wm.autoConnect("Glacio-Setup")) {
    Serial.println("[WiFi] Baglanti saglanamadi, yeniden baslatiliyor...");
    delay(3000);
    ESP.restart();
  }

  // Kullanıcı yeni ayarları girdiyse güncelle ve Flash'a yaz
  if (shouldSaveConfig) {
    strcpy(device_id, custom_device_id.getValue());
    strcpy(api_key, custom_api_key.getValue());
    strcpy(api_url, custom_api_url.getValue());
    strcpy(temp_offset, custom_temp_offset.getValue());
    saveConfig();
  }

  digitalWrite(ledPin, LOW); // LED sabit yanar (Bağlantı Tamam)
  Serial.println("[WiFi] Baglandi! IP:");
  Serial.println(WiFi.localIP());

  // 3. OTA (Kablosuz Güncelleme) Başlatma
  ArduinoOTA.setHostname(device_id);
  ArduinoOTA.onStart([]() {
    Serial.println("[OTA] Guncelleme basladi...");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Tamamlandi!");
  });
  ArduinoOTA.begin();
}

void loop() {
  // OTA isteklerini dinle (Wi-Fi üzerinden kod atmak için)
  ArduinoOTA.handle();

  // FLASH Butonu Kontrolü (D3 / GPIO 0):
  // 3 saniye basılı tutulursa ayarları sıfırlar ve tekrar kurulum (AP) moduna geçer
  if (digitalRead(resetBtnPin) == LOW) {
    delay(100);
    int holdCount = 0;
    while (digitalRead(resetBtnPin) == LOW) {
      delay(100);
      holdCount++;
      if (holdCount > 30) { // 3 saniye doldu
        Serial.println("\n[RESET] Kurulum moduna geciliyor, WiFi resetlendi!");
        WiFiManager wm;
        wm.resetSettings();
        delay(1000);
        ESP.restart();
      }
    }
  }

  // Wi-Fi Kontrolü
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ledPin, HIGH);
    Serial.println("[WiFi] Koptu, baglaniliyor...");
    WiFi.reconnect();
    delay(5000);
    return;
  }

  // Telemetri Gönderimi (millis zamanlayıcı)
  if (millis() - lastPostTime >= POST_INTERVAL) {
    lastPostTime = millis();
    float temp = readTemperature();

    if (temp != -999.0) {
      Serial.printf("[SENSOR] Sicaklik: %.1f °C\n", temp);
      sendTelemetryData(temp);
    } else {
      Serial.println("[SENSOR] Okuma hatasi!");
    }
  }

  delay(10);
}