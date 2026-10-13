#include <FS.h>
#include <LittleFS.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// --- Varsayılan Ayarlar (Kullanıcı arayüzünden güncellenebilir) ---
char device_id[64]   = "glacio-node-01";
char api_key[128]    = "glacio-super-secret-key-2026";
char api_url[128]    = "https://glacio.vercel.app/api/telemetry";
char temp_offset[16]  = "0.0";
char temp_offset2[16] = "0.0";
char bat_ratio[16]    = "0.00440"; // R1=100k, R2=100k kalibrasyon katsayısı

bool shouldSaveConfig = false;

// Pin Tanımları
#define ONE_WIRE_BUS 4       // DS18B20 Data pini (D2 = GPIO 4) - Her iki sensör de bu pine paralel bağlanır!
#define BATTERY_PIN  A0      // 18650 Pil gerilim bölücü giriş pini (A0)
const int ledPin       = 2;  // Dahili mavi LED (GPIO 2 / D4)
const int resetBtnPin  = 0;  // FLASH Butonu (GPIO 0) - Ayarları sıfırlayıp AP moduna geçmek için

// DS18B20 Sensör Nesneleri
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Zamanlayıcı
unsigned long lastPostTime = 0;
const unsigned long POST_INTERVAL = 15000; // 15 saniye (Stabil telemetri)

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
          strcpy(temp_offset2, json["temp_offset2"] | temp_offset2);
          strcpy(bat_ratio, json["bat_ratio"] | bat_ratio);
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
  json["device_id"]    = device_id;
  json["api_key"]      = api_key;
  json["api_url"]      = api_url;
  json["temp_offset"]  = temp_offset;
  json["temp_offset2"] = temp_offset2;
  json["bat_ratio"]    = bat_ratio;

  File configFile = LittleFS.open("/config.json", "w");
  if (configFile) {
    serializeJson(json, configFile);
    configFile.close();
    Serial.println("[FS] Yeni ayarlar LittleFS'e kaydedildi.");
  }
}

// Çift Sensör Sıcaklık Okuma Fonksiyonu (DS18B20)
bool readTemperatures(float &t1, float &t2) {
  sensors.begin(); // Temassızlık sonrası hattı yeniden tara
  int devCount = sensors.getDeviceCount();

  if (devCount == 0) {
    Serial.println("[SENSOR] Sensor bulunamadi (0 adet)! Baglantilari kontrol edin.");
    t1 = -999.0;
    t2 = -999.0;
    return false;
  }

  sensors.requestTemperatures();
  delay(800); // 12-bit dönüşüm süresi

  // 1. Sensör Okuma
  float raw1 = sensors.getTempCByIndex(0);
  if (raw1 != DEVICE_DISCONNECTED_C && raw1 > -100.0 && raw1 != 85.0) {
    t1 = raw1 + atof(temp_offset);
  } else {
    t1 = -999.0;
  }

  // 2. Sensör Okuma (Eğer 2 veya daha fazla sensör takılıysa)
  if (devCount >= 2) {
    float raw2 = sensors.getTempCByIndex(1);
    if (raw2 != DEVICE_DISCONNECTED_C && raw2 > -100.0 && raw2 != 85.0) {
      t2 = raw2 + atof(temp_offset2);
    } else {
      t2 = -999.0;
    }
  } else {
    t2 = -999.0; // İkinci sensör takılı değil
  }

  return (t1 != -999.0 || t2 != -999.0);
}

// Pil Voltajı Okuma (A0)
float readBatteryVoltage() {
  int rawTotal = 0;
  for (int i = 0; i < 10; i++) {
    rawTotal += analogRead(BATTERY_PIN);
    delay(5);
  }
  float rawAverage = rawTotal / 10.0;
  float ratio = atof(bat_ratio);
  if (ratio <= 0.0) ratio = 0.00440;
  return rawAverage * ratio;
}

// 18650 Pil Yüzdesi Hesaplama (4.20V = %100, 3.30V = %0)
int calculateBatteryPercentage(float voltage) {
  if (voltage >= 4.20) return 100;
  if (voltage <= 3.30) return 0;
  int percentage = (int)(((voltage - 3.30) / (4.20 - 3.30)) * 100);
  return constrain(percentage, 0, 100);
}

// Telemetri Gönderme (Çift Sensör ve Pil Destekli)
void sendTelemetryData(float t1, float t2, float vBat, int batPercent) {
  WiFiClientSecure client;
  client.setInsecure(); // SSL sertifika kontrolünü atla

  HTTPClient http;
  if (http.begin(client, api_url)) {
    http.setTimeout(15000); // Vercel cold-start toleransı
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", api_key);

    String payload = "{\"deviceId\":\"" + String(device_id) + "\"";
    if (t1 != -999.0) {
      payload += ",\"temperature\":" + String(t1, 2);
    }
    if (t2 != -999.0) {
      payload += ",\"temperature2\":" + String(t2, 2);
    }
    payload += ",\"batteryVoltage\":" + String(vBat, 2);
    payload += ",\"batteryPercentage\":" + String(batPercent);
    payload += "}";

    Serial.print("[HTTP] POST: ");
    Serial.println(payload);

    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      Serial.printf("[HTTP] Kod: %d\n", httpCode);
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
  delay(1500); // Seri monitörün bağlanması için bekle
  pinMode(ledPin, OUTPUT);
  pinMode(resetBtnPin, INPUT_PULLUP);
  digitalWrite(ledPin, HIGH); // LED sönük

  Serial.println("\n=== Glacio Baslatiliyor (DS18B20) ===");

  // DS18B20 Sensörlerini Başlat
  sensors.begin();
  int devCount = sensors.getDeviceCount();
  Serial.printf("[SENSOR] Baslangicta Algilanan DS18B20: %d adet\n", devCount);
  
  for (int i = 0; i < devCount; i++) {
    DeviceAddress sensorAddr;
    if (sensors.getAddress(sensorAddr, i)) {
      Serial.printf("[SENSOR] Sensor #%d ROM Adresi: ", i + 1);
      for (uint8_t b = 0; b < 8; b++) {
        if (sensorAddr[b] < 16) Serial.print("0");
        Serial.print(sensorAddr[b], HEX);
      }
      Serial.println();
    }
  }

  // 1. Dosya Sisteminden Ayarları Yükle
  loadConfig();

  // 2. WiFiManager Kurulumu
  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  // Web portalına özel giriş kutuları ekle
  WiFiManagerParameter custom_device_id("device_id", "Cihaz ID (Örn: glacio-01)", device_id, 64);
  WiFiManagerParameter custom_api_key("api_key", "API Secret Key", api_key, 128);
  WiFiManagerParameter custom_api_url("api_url", "Vercel API URL", api_url, 128);
  WiFiManagerParameter custom_temp_offset("temp_offset", "Kalibrasyon Ofseti 1 (°C)", temp_offset, 16);
  WiFiManagerParameter custom_temp_offset2("temp_offset2", "Kalibrasyon Ofseti 2 (°C)", temp_offset2, 16);
  WiFiManagerParameter custom_bat_ratio("bat_ratio", "Pil Katsayisi (Orn: 0.00440)", bat_ratio, 16);

  wm.addParameter(&custom_device_id);
  wm.addParameter(&custom_api_key);
  wm.addParameter(&custom_api_url);
  wm.addParameter(&custom_temp_offset);
  wm.addParameter(&custom_temp_offset2);
  wm.addParameter(&custom_bat_ratio);

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
    strcpy(temp_offset2, custom_temp_offset2.getValue());
    strcpy(bat_ratio, custom_bat_ratio.getValue());
    
    Serial.println("\n[AYARLAR] Portal'dan gelen yeni degerler:");
    Serial.print("Device ID: "); Serial.println(device_id);
    Serial.print("API Key: "); Serial.println(api_key);
    
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
    float t1 = -999.0;
    float t2 = -999.0;

    readTemperatures(t1, t2);

    // 18650 Pil Ölçümü
    float vBat = readBatteryVoltage();
    int batPercent = calculateBatteryPercentage(vBat);
    Serial.printf("[BATTERY] Voltaj: %.2f V | Pil: %%%d (Ham ADC: %d)\n", vBat, batPercent, analogRead(BATTERY_PIN));

    if (t1 != -999.0 || t2 != -999.0) {
      if (t1 != -999.0 && t2 != -999.0) {
        Serial.printf("[SENSOR] Sensor 1: %.1f °C | Sensor 2: %.1f °C\n", t1, t2);
      } else if (t1 != -999.0) {
        Serial.printf("[SENSOR] Sensor 1: %.1f °C (Sensor 2 yok)\n", t1);
      } else {
        Serial.printf("[SENSOR] Sensor 2: %.1f °C (Sensor 1 yok)\n", t2);
      }
      sendTelemetryData(t1, t2, vBat, batPercent);
    } else {
      Serial.println("[SENSOR] Sicaklik okuma hatasi! (Pil verisi gonderilmedi)");
    }
  }

  delay(10);
}