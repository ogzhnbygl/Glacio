#include <FS.h>
#include <LittleFS.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

extern "C" {
  #include "user_interface.h"
}

/*
  =============================================================================
                          GLACIO ULTRA-LOW POWER NODE
  =============================================================================
  DONANIM BAGLANTISI (DEEP SLEEP ICIN SARTTIR):
  * D0 (GPIO 16) pini ile RST pini arasina bir jumper kablosu takilmalidir!
    (RTC dahili saati 60 saniye doldugunda D0 uzerinden RST'ye uyandirma sinyali gonderir)
  * ONEMLI NOT: Arduino IDE'den kodu ESP8266'ya yuklerken D0-RST kablosunu cikarin.
    Yukleme %100 tamamlandiktan sonra kabloyu takin ve kartin RST tusuna bir kez basin!

  CALISMA PRENSIBI:
  1. Cihaz 1 dakikada bir uyanir.
  2. Wi-Fi RADYOSU KAPALI (WAKE_RF_DISABLED) olarak sadece ~900ms uyanik kalir:
     - DS18B20 cift sensor sicakliklarini okur.
     - 18650 pil voltajini ve yuzdesini filtreli okur.
     - Olcumleri ESP8266'nin pil ile korunan RTC Kullanici Hafizasina (RAM) yazar.
     - Tekrar 60 saniyelik derin uykuya (Deep Sleep) gecer (~15 uA akim!).
  3. 4. dakikada sonraki uyanis icin RF sentezleyiciyi hazirlar (WAKE_RFCAL).
  4. 5. dakikada Wi-Fi acilir:
     - 5 olcumun tamami tek bir JSON paketinde Vercel Anycast IP'ye (76.76.21.21) gonderilir.
     - Geriye donuk ofsetler (-4 dk, -3 dk, -2 dk, -1 dk, 0 dk) ile sunucuya iletilir.
     - RTC hafizasi sifirlanir ve dongu yeniden baslar.
  5. 18650 pil omru: ~33 saatten -> ~90 - 120 GUNE cikar!

  CANLI TEST & AYAR MODU:
  * Cihaz acilirken veya resetlenirken FLASH (GPIO 0) tusuna basili tutulursa:
    Deep Sleep devre disi kalir! Surekli yayin ve Telnet (Port 23) modu acilir.
  =============================================================================
*/

// --- Varsayılan Ayarlar (Kullanıcı arayüzünden güncellenebilir) ---
char device_id[64]    = "glacio-node-01";
char api_key[128]     = "glacio-super-secret-key-2026";
char api_url[128]     = "https://glacio.vercel.app/api/telemetry";
char temp_offset[16]  = "0.0";
char temp_offset2[16] = "0.0";
char bat_ratio[16]    = "0.007159"; // 4.059V / 567 ADC multimetre kalibrasyon katsayısı

bool shouldSaveConfig = false;
bool isLiveTestMode   = false;

// Pin Tanımları
#define ONE_WIRE_BUS 4       // DS18B20 Data pini (D2 = GPIO 4) - Çift sensör paralel
#define BATTERY_PIN  A0      // 18650 Pil gerilim bölücü giriş pini (A0)
const int ledPin      = 2;   // Dahili mavi LED (GPIO 2 / D4)
const int resetBtnPin = 0;   // FLASH Butonu (GPIO 0) - Ayar veya Canlı Test Modu için

// DS18B20 Sensör Nesneleri ve Sabit ROM Adresleri
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
DeviceAddress sensor1Addr;
DeviceAddress sensor2Addr;
bool hasSensor1Addr = false;
bool hasSensor2Addr = false;

// Dinamik Wi-Fi verici gücü (Sweet-Point)
float currentTxPowerDbm = 20.5f;

// --- RTC HAFIZA YAPISI (Deep Sleep Boyunca Silinmeyen 120 Bayt) ---
struct SensorReading {
  float temp1;
  float temp2;
  float batteryVoltage;
  int16_t batteryPercent;
  int16_t padding; // 4-byte hizalama
};

struct RTCData {
  uint32_t magic;          // 0x474C4143 ("GLAC")
  uint8_t count;           // 0..5 (hafızadaki kayıtlı ölçüm sayısı)
  uint8_t hasSensor1;      // 1. sensör bulundu mu (1/0)
  uint8_t hasSensor2;      // 2. sensör bulundu mu (1/0)
  uint8_t reserved;        // 4-byte hizalama
  uint16_t crc;            // Bütünlük sağlama toplamı
  uint16_t padding;        // 4-byte hizalama
  uint8_t sensor1Addr[8];  // 1. sensörün 64-bit ROM adresi
  uint8_t sensor2Addr[8];  // 2. sensörün 64-bit ROM adresi
  float tempOffset1;       // Hızlı uyku için önbellek ofseti
  float tempOffset2;       // Hızlı uyku için önbellek ofseti
  float batRatio;          // Hızlı uyku için önbellek katsayısı
  SensorReading readings[5]; // 5 ölçümlük tampon bellek
};

// Telnet Sunucusu (Canlı Test Modu İçin - Port 23)
WiFiServer telnetServer(23);
WiFiClient telnetClient;

// Bütünlük Kontrol Toplamı (Fletcher CRC)
uint16_t calculateRtcCrc(const RTCData &data) {
  uint16_t crc = 0xAA55;
  const uint8_t *p = (const uint8_t*)&data;
  for (size_t i = 0; i < sizeof(RTCData); i++) {
    if (i == 8 || i == 9) continue; // CRC baytlarını atla
    crc = (crc << 5) | (crc >> 11);
    crc ^= p[i];
  }
  return crc;
}

bool loadRtcData(RTCData &data) {
  if (!ESP.rtcUserMemoryRead(0, (uint32_t*)&data, sizeof(data))) {
    return false;
  }
  if (data.magic != 0x474C4143) {
    return false;
  }
  if (data.crc != calculateRtcCrc(data)) {
    return false;
  }
  return true;
}

bool saveRtcData(RTCData &data) {
  data.magic = 0x474C4143;
  data.crc = calculateRtcCrc(data);
  return ESP.rtcUserMemoryWrite(0, (uint32_t*)&data, sizeof(data));
}

// Metin başındaki ve sonundaki boşlukları temizle
void trimCharBuffer(char *str, size_t maxLen) {
  String s = String(str);
  s.trim();
  strlcpy(str, s.c_str(), maxLen);
}

// WiFiManager kaydetme bayrağı
void saveConfigCallback() {
  Serial.println("[FS] Ayarlar kaydedilecek...");
  shouldSaveConfig = true;
}

// LittleFS Flash'a ayarları kaydet
void saveConfig() {
  trimCharBuffer(device_id, sizeof(device_id));
  trimCharBuffer(api_key, sizeof(api_key));
  trimCharBuffer(api_url, sizeof(api_url));

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

// LittleFS Flash'tan ayarları oku
void loadConfig() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/config.json")) {
      File configFile = LittleFS.open("/config.json", "r");
      if (configFile) {
        StaticJsonDocument<768> json;
        DeserializationError error = deserializeJson(json, configFile);
        configFile.close();

        if (!error) {
          strlcpy(device_id, json["device_id"] | device_id, sizeof(device_id));
          strlcpy(api_key, json["api_key"] | api_key, sizeof(api_key));
          strlcpy(api_url, json["api_url"] | api_url, sizeof(api_url));
          strlcpy(temp_offset, json["temp_offset"] | temp_offset, sizeof(temp_offset));
          strlcpy(temp_offset2, json["temp_offset2"] | temp_offset2, sizeof(temp_offset2));
          strlcpy(bat_ratio, json["bat_ratio"] | bat_ratio, sizeof(bat_ratio));

          trimCharBuffer(device_id, sizeof(device_id));
          trimCharBuffer(api_key, sizeof(api_key));
          trimCharBuffer(api_url, sizeof(api_url));

          float parsedRatio = atof(bat_ratio);
          if (parsedRatio <= 0.00705f) {
            strlcpy(bat_ratio, "0.007159", sizeof(bat_ratio));
            saveConfig();
            Serial.println("[FS] Pil kalibrasyon katsayisi 0.007159 olarak guncellendi.");
          }
          Serial.println("[FS] Kayitli ayarlar yuklendi.");
        }
      }
    }
  }
}

void printSensorAddress(const DeviceAddress addr) {
  for (uint8_t b = 0; b < 8; b++) {
    if (addr[b] < 16) Serial.print("0");
    Serial.print(addr[b], HEX);
  }
}

// Sensörlerin ROM adreslerini keşfet ve sabitle
void discoverSensors() {
  sensors.begin();
  sensors.setWaitForConversion(false);

  oneWire.reset_search();
  DeviceAddress addr;
  while (oneWire.search(addr)) {
    if (OneWire::crc8(addr, 7) != addr[7]) continue;

    if (!hasSensor1Addr) {
      if (!hasSensor2Addr || memcmp(addr, sensor2Addr, 8) != 0) {
        memcpy(sensor1Addr, addr, 8);
        hasSensor1Addr = true;
        Serial.print("[SENSOR] Sensor #1 ROM Adresi: ");
        printSensorAddress(sensor1Addr);
        Serial.println();
      }
    } else if (!hasSensor2Addr && memcmp(addr, sensor1Addr, 8) != 0) {
      memcpy(sensor2Addr, addr, 8);
      hasSensor2Addr = true;
      Serial.print("[SENSOR] Sensor #2 ROM Adresi: ");
      printSensorAddress(sensor2Addr);
      Serial.println();
    }
  }
}

bool isValidTempReading(float rawTemp) {
  return (rawTemp != DEVICE_DISCONNECTED_C && rawTemp > -100.0f && rawTemp != 85.0f);
}

float readSingleSensorWithRetry(const DeviceAddress addr) {
  float raw = sensors.getTempC(addr);
  if (isValidTempReading(raw)) {
    return raw;
  }
  delay(30);
  sensors.requestTemperaturesByAddress(addr);
  delay(750);
  return sensors.getTempC(addr);
}

// Çift Sensör Sıcaklık Okuma (RTC Önbellek Destekli Hızlı Okuma)
bool readTemperaturesFast(float &t1, float &t2, RTCData &rtc) {
  if (!rtc.hasSensor1 && !rtc.hasSensor2) {
    discoverSensors();
    rtc.hasSensor1 = hasSensor1Addr ? 1 : 0;
    rtc.hasSensor2 = hasSensor2Addr ? 1 : 0;
    if (hasSensor1Addr) memcpy(rtc.sensor1Addr, sensor1Addr, 8);
    if (hasSensor2Addr) memcpy(rtc.sensor2Addr, sensor2Addr, 8);
  } else {
    hasSensor1Addr = (rtc.hasSensor1 == 1);
    hasSensor2Addr = (rtc.hasSensor2 == 1);
    if (hasSensor1Addr) memcpy(sensor1Addr, rtc.sensor1Addr, 8);
    if (hasSensor2Addr) memcpy(sensor2Addr, rtc.sensor2Addr, 8);
    sensors.begin();
    sensors.setWaitForConversion(false);
  }

  if (!hasSensor1Addr && !hasSensor2Addr) {
    Serial.println("[SENSOR] Sensor bulunamadi! Baglantilari kontrol edin.");
    t1 = -999.0f;
    t2 = -999.0f;
    return false;
  }

  sensors.requestTemperatures();
  // 12-bit DS18B20 dönüşümü için 750ms bekle (Wi-Fi kapalıyken sadece ~15mA çeker)
  delay(750);

  if (hasSensor1Addr) {
    float raw1 = readSingleSensorWithRetry(sensor1Addr);
    t1 = isValidTempReading(raw1) ? (raw1 + rtc.tempOffset1) : -999.0f;
  } else {
    t1 = -999.0f;
  }

  if (hasSensor2Addr) {
    float raw2 = readSingleSensorWithRetry(sensor2Addr);
    t2 = isValidTempReading(raw2) ? (raw2 + rtc.tempOffset2) : -999.0f;
  } else {
    t2 = -999.0f;
  }

  return (t1 != -999.0f || t2 != -999.0f);
}

// Pil Voltajı Okuma (A0) - Kırpılmış Ortalama Filtreli (Wi-Fi gürültüsü olmadan tertemiz)
float readBatteryFast(float ratio, int &outAvgAdc) {
  const int SAMPLE_COUNT = 25;
  int samples[SAMPLE_COUNT];

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    samples[i] = analogRead(BATTERY_PIN);
    delay(2);
  }

  for (int i = 0; i < SAMPLE_COUNT - 1; i++) {
    for (int j = i + 1; j < SAMPLE_COUNT; j++) {
      if (samples[j] < samples[i]) {
        int temp = samples[i];
        samples[i] = samples[j];
        samples[j] = temp;
      }
    }
  }

  long trimmedSum = 0;
  for (int i = 5; i < SAMPLE_COUNT - 5; i++) {
    trimmedSum += samples[i];
  }
  float rawAverage = trimmedSum / 15.0f;
  outAvgAdc = (int)(rawAverage + 0.5f);

  if (ratio <= 0.0001f) ratio = 0.007159f;
  return (rawAverage * ratio);
}

// 18650 Li-Ion Gerçekçi Deşarj Eğrisi ile Yüzde Hesaplama
int calculateBatteryPercentage(float v) {
  if (v >= 4.18f) return 100;
  if (v <= 3.30f) return 0;

  float pct;
  if (v >= 4.00f) {
    pct = 80.0f + ((v - 4.00f) / (4.18f - 4.00f)) * 20.0f;
  } else if (v >= 3.80f) {
    pct = 50.0f + ((v - 3.80f) / (4.00f - 3.80f)) * 30.0f;
  } else if (v >= 3.60f) {
    pct = 18.0f + ((v - 3.60f) / (3.80f - 3.60f)) * 32.0f;
  } else {
    pct = ((v - 3.30f) / (3.60f - 3.30f)) * 18.0f;
  }

  return constrain((int)(pct + 0.5f), 0, 100);
}

// Router RSSI sinyaline göre Sweet-Point dBm ayarla
void calibrateWiFiTxPower() {
  if (WiFi.status() != WL_CONNECTED) return;

  long rssiSum = 0;
  for (int i = 0; i < 5; i++) {
    rssiSum += WiFi.RSSI();
    delay(20);
  }
  int avgRssi = (int)(rssiSum / 5);

  if (avgRssi >= -50) {
    currentTxPowerDbm = 16.0f;
  } else if (avgRssi >= -58) {
    currentTxPowerDbm = 18.0f;
  } else {
    currentTxPowerDbm = 20.5f;
  }

  WiFi.setOutputPower(currentTxPowerDbm);
  Serial.printf("[WiFi] Sinyal (RSSI): %d dBm -> Otomatik Sweet-Point Gucu: %.1f dBm\n",
                avgRssi, currentTxPowerDbm);
}

// Üniversite güvenlik duvarı ve bozuk okul DNS'ini aşan özel SSL istemcisi:
// Doğrudan Vercel Anycast IP'lerine (76.76.21.21 vb.) bağlanır ve TLS SNI gönderir!
class GlacioSecureCtx : public BearSSL::WiFiClientSecureCtx {
public:
  IPAddress connectedEdgeIp;

  bool connectToVercel(const char* host, uint16_t port) {
    if (strcmp(host, "glacio.vercel.app") == 0) {
      const IPAddress vercelSafeIps[] = {
        IPAddress(76, 76, 21, 21),
        IPAddress(76, 76, 21, 93),
        IPAddress(76, 76, 21, 142),
        IPAddress(216, 198, 79, 195)
      };
      for (int i = 0; i < 4; i++) {
        WiFiClient::setTimeout(4000);
        if (WiFiClient::connect(vercelSafeIps[i], port)) {
          connectedEdgeIp = vercelSafeIps[i];
          if (_connectSSL(host)) {
            return true;
          }
          stop();
        }
      }
    }
    if (BearSSL::WiFiClientSecureCtx::connect(host, port)) {
      connectedEdgeIp = remoteIP();
      return true;
    }
    return false;
  }
};

// 5 Ölçümü Vercel'e Toplu (Batch) Gönderen Fonksiyon
bool sendBatchTelemetryData(const RTCData &data) {
  StaticJsonDocument<1024> doc;
  doc["deviceId"] = device_id;
  JsonArray readingsArr = doc.createNestedArray("readings");

  if (WiFi.status() == WL_CONNECTED) {
    doc["rssi"] = WiFi.RSSI();
    doc["txPower"] = serialized(String(currentTxPowerDbm, 1));
  }

  int total = data.count;
  if (total > 5) total = 5;

  for (int i = 0; i < total; i++) {
    JsonObject r = readingsArr.createNestedObject();
    if (data.readings[i].temp1 > -990.0f) {
      r["temperature"] = serialized(String(data.readings[i].temp1, 2));
    }
    if (data.readings[i].temp2 > -990.0f) {
      r["temperature2"] = serialized(String(data.readings[i].temp2, 2));
    }
    r["batteryVoltage"] = serialized(String(data.readings[i].batteryVoltage, 2));
    r["batteryPercentage"] = data.readings[i].batteryPercent;
    if (i == total - 1 && WiFi.status() == WL_CONNECTED) {
      r["rssi"] = WiFi.RSSI();
      r["txPower"] = serialized(String(currentTxPowerDbm, 1));
    }
    // Zamansal geriye doğru ofset (dakika cinsinden):
    // Örn: total=5 için i=0 -> -4, i=1 -> -3, i=2 -> -2, i=3 -> -1, i=4 -> 0
    int offsetMin = -(total - 1 - i);
    r["offsetMinutes"] = offsetMin;
  }

  String payload;
  serializeJson(doc, payload);

  Serial.printf("[HTTP] Toplu (Batch) POST (%d olcum):\n", total);
  Serial.println(payload);

  int httpCode = -1;
  String httpErrStr = "";
  String usedIpStr = "";

  {
    GlacioSecureCtx client;
    client.setInsecure();
    client.setTimeout(8000);

    String urlStr = String(api_url);
    String host = "glacio.vercel.app";
    String path = "/api/telemetry";
    int protoEnd = urlStr.indexOf("://");
    if (protoEnd > 0) {
      int pathStart = urlStr.indexOf('/', protoEnd + 3);
      if (pathStart > 0) {
        host = urlStr.substring(protoEnd + 3, pathStart);
        path = urlStr.substring(pathStart);
      } else {
        host = urlStr.substring(protoEnd + 3);
      }
    }

    if (client.connectToVercel(host.c_str(), 443)) {
      usedIpStr = client.connectedEdgeIp.toString();
      String req = String("POST ") + path + " HTTP/1.1\r\n" +
                   "Host: " + host + "\r\n" +
                   "User-Agent: GlacioNode/1.0\r\n" +
                   "Content-Type: application/json\r\n" +
                   "x-api-key: " + String(api_key) + "\r\n" +
                   "Content-Length: " + String(payload.length()) + "\r\n" +
                   "Connection: close\r\n\r\n" +
                   payload;

      client.print(req);

      unsigned long waitStart = millis();
      while (!client.available() && client.connected() && (millis() - waitStart < 8000)) {
        delay(10);
      }
      if (client.available()) {
        String statusLine = client.readStringUntil('\n');
        statusLine.trim();
        int firstSpace = statusLine.indexOf(' ');
        if (firstSpace > 0 && statusLine.length() >= (unsigned int)(firstSpace + 4)) {
          httpCode = statusLine.substring(firstSpace + 1, firstSpace + 4).toInt();
        }
        if (httpCode <= 0) {
          httpErrStr = "Invalid HTTP response: " + statusLine;
        }
      } else {
        httpErrStr = "read Timeout";
      }
      client.stop();
    } else {
      httpErrStr = "connection failed";
    }
  }

  if (httpCode > 0) {
    Serial.printf("[HTTP] Kod: %d (IP: %s) -> %d olcum basariyla Vercel'e iletildi!\n",
                  httpCode, usedIpStr.c_str(), total);
    digitalWrite(ledPin, LOW); // Mavi LED kısa kırpma
    delay(100);
    digitalWrite(ledPin, HIGH);
    return true;
  } else {
    Serial.printf("[HTTP] Hata: %s\n", httpErrStr.c_str());
    return false;
  }
}

// =============================================================================
//                    CANLI TEST & AYAR MODU FONKSIYONLARI
//       (FLASH tusuna basili tutarak acilirsa kesintisiz calisir)
// =============================================================================
void handleTelnet() {
  if (telnetServer.hasClient()) {
    if (!telnetClient || !telnetClient.connected()) {
      if (telnetClient) telnetClient.stop();
      telnetClient = telnetServer.available();
      telnetClient.setNoDelay(true);
      telnetClient.setTimeout(100);
      telnetClient.println("\r\n==========================================");
      telnetClient.println("    Glacio Node - Canli Telnet Konsolu    ");
      telnetClient.println("==========================================\r\n");
    } else {
      WiFiClient rejectClient = telnetServer.available();
      rejectClient.stop();
    }
  }
  while (telnetClient && telnetClient.available()) {
    telnetClient.read();
  }
}

void logPrintln(const String &text = "") {
  Serial.println(text);
  if (telnetClient && telnetClient.connected()) {
    telnetClient.print(text + "\r\n");
  }
}

unsigned long lastLivePostTime = 0;
const unsigned long LIVE_POST_INTERVAL = 15000;

void setupLiveTestMode() {
  Serial.println("\n==================================================");
  Serial.println("  [MOD] CANLI TEST VE AYAR MODU BASLATILDI");
  Serial.println("  (Deep Sleep devre disi, Telnet ve 15s akis aktif)");
  Serial.println("==================================================");

  loadConfig();

  WiFi.persistent(true);
  WiFi.mode(WIFI_STA);
  currentTxPowerDbm = 20.5f;
  WiFi.setOutputPower(currentTxPowerDbm);

  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);
  wm.setConnectTimeout(30);
  wm.setConnectRetries(3);
  wm.setConfigPortalTimeout(180);

  WiFiManagerParameter custom_device_id("device_id", "Cihaz ID (Örn: glacio-01)", device_id, 64);
  WiFiManagerParameter custom_api_key("api_key", "API Secret Key", api_key, 128);
  WiFiManagerParameter custom_api_url("api_url", "Vercel API URL", api_url, 128);
  WiFiManagerParameter custom_temp_offset("temp_offset", "Kalibrasyon Ofseti 1 (°C)", temp_offset, 16);
  WiFiManagerParameter custom_temp_offset2("temp_offset2", "Kalibrasyon Ofseti 2 (°C)", temp_offset2, 16);
  WiFiManagerParameter custom_bat_ratio("bat_ratio", "Pil Katsayisi (Orn: 0.007159)", bat_ratio, 16);

  wm.addParameter(&custom_device_id);
  wm.addParameter(&custom_api_key);
  wm.addParameter(&custom_api_url);
  wm.addParameter(&custom_temp_offset);
  wm.addParameter(&custom_temp_offset2);
  wm.addParameter(&custom_bat_ratio);

  Serial.println("[WiFi] Baglanti kontrol ediliyor...");
  if (!wm.autoConnect("Glacio-Setup")) {
    Serial.println("[WiFi] Baglanti saglanamadi, yeniden baslatiliyor...");
    delay(2000);
    ESP.restart();
  }

  if (shouldSaveConfig) {
    strlcpy(device_id, custom_device_id.getValue(), sizeof(device_id));
    strlcpy(api_key, custom_api_key.getValue(), sizeof(api_key));
    strlcpy(api_url, custom_api_url.getValue(), sizeof(api_url));
    strlcpy(temp_offset, custom_temp_offset.getValue(), sizeof(temp_offset));
    strlcpy(temp_offset2, custom_temp_offset2.getValue(), sizeof(temp_offset2));
    strlcpy(bat_ratio, custom_bat_ratio.getValue(), sizeof(bat_ratio));
    saveConfig();
  }

  digitalWrite(ledPin, LOW); // LED sabit AÇIK
  Serial.printf("[WiFi] Baglandi! IP: %s\n", WiFi.localIP().toString().c_str());
  calibrateWiFiTxPower();

  telnetServer.begin();
  telnetServer.setNoDelay(true);
  Serial.println("[TELNET] Sunucu baslatildi! Port: 23");
}

void loopLiveTestMode() {
  handleTelnet();

  // FLASH Butonu (GPIO 0) 3 saniye basılı tutulursa Wi-Fi sıfırla
  if (digitalRead(resetBtnPin) == LOW) {
    delay(100);
    int holdCount = 0;
    while (digitalRead(resetBtnPin) == LOW) {
      delay(100);
      holdCount++;
      if (holdCount > 30) {
        logPrintln("\n[RESET] Kurulum moduna geciliyor, WiFi sifirlandi!");
        WiFiManager wm;
        wm.resetSettings();
        WiFi.disconnect(true);
        ESP.eraseConfig();
        delay(1000);
        ESP.restart();
      }
    }
  }

  if (millis() - lastLivePostTime >= LIVE_POST_INTERVAL) {
    lastLivePostTime = millis();

    RTCData dummyRtc;
    memset(&dummyRtc, 0, sizeof(dummyRtc));
    dummyRtc.tempOffset1 = atof(temp_offset);
    dummyRtc.tempOffset2 = atof(temp_offset2);
    dummyRtc.batRatio    = atof(bat_ratio);

    float t1 = -999.0f;
    float t2 = -999.0f;
    readTemperaturesFast(t1, t2, dummyRtc);

    int avgAdc = 0;
    float vBat = readBatteryFast(dummyRtc.batRatio, avgAdc);
    int batPercent = calculateBatteryPercentage(vBat);

    dummyRtc.readings[0].temp1 = t1;
    dummyRtc.readings[0].temp2 = t2;
    dummyRtc.readings[0].batteryVoltage = vBat;
    dummyRtc.readings[0].batteryPercent = batPercent;
    dummyRtc.count = 1;

    char logBuf[256];
    snprintf(logBuf, sizeof(logBuf),
             "[CANLI] Sensor 1: %.1f °C | Sensor 2: %.1f °C | Pil: %.2f V (%%%d) | WiFi: %d dBm\n",
             t1, t2, vBat, batPercent, WiFi.RSSI());
    logPrintln(logBuf);

    sendBatchTelemetryData(dummyRtc);
  }

  delay(10);
}

// =============================================================================
//                             ANA SETUP VE DONGU
// =============================================================================
void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  pinMode(resetBtnPin, INPUT_PULLUP);
  digitalWrite(ledPin, HIGH); // LED Sönük (Enerji tasarrufu)

  Serial.println("\n=== Glacio Node (Deep Sleep v2.0) ===");

  // 1. FLASH Butonuna Basıldı mı Kontrolü (Canlı Test & Kurulum Modu)
  if (digitalRead(resetBtnPin) == LOW) {
    delay(100);
    if (digitalRead(resetBtnPin) == LOW) {
      isLiveTestMode = true;
      setupLiveTestMode();
      return; // Canlı test modu için setup'tan çık, loop() çalışmaya başlasın
    }
  }

  // 2. RTC Hafızasını Yükle
  RTCData rtc;
  bool rtcValid = loadRtcData(rtc);

  // Eğer hafıza bozuksa veya ilk çalıştırmaysa (Cold Boot):
  if (!rtcValid) {
    Serial.println("[RTC] Ilk calistirma veya hafiza sifirlandi. Ayarlar LittleFS'ten aliniyor...");
    loadConfig();

    // Flash'ta kayıtlı Wi-Fi bilgisi yoksa zorunlu kurulum portalını aç:
    if (WiFi.SSID().length() == 0) {
      Serial.println("[WiFi] Kayitli Wi-Fi bulunamadi! Glacio-Setup portali baslatiliyor...");
      isLiveTestMode = true;
      setupLiveTestMode();
      return;
    }

    memset(&rtc, 0, sizeof(RTCData));
    rtc.magic = 0x474C4143;
    rtc.count = 0;
    rtc.tempOffset1 = atof(temp_offset);
    rtc.tempOffset2 = atof(temp_offset2);
    rtc.batRatio    = atof(bat_ratio);
    if (rtc.batRatio <= 0.0001f) rtc.batRatio = 0.007159f;

    discoverSensors();
    rtc.hasSensor1 = hasSensor1Addr ? 1 : 0;
    rtc.hasSensor2 = hasSensor2Addr ? 1 : 0;
    if (hasSensor1Addr) memcpy(rtc.sensor1Addr, sensor1Addr, 8);
    if (hasSensor2Addr) memcpy(rtc.sensor2Addr, sensor2Addr, 8);
  }

  // 3. Hızlı Sensör ve Pil Ölçümü (Wi-Fi radyosu tamamen KAPALI, ~15 mA akım)
  float t1 = -999.0f;
  float t2 = -999.0f;
  readTemperaturesFast(t1, t2, rtc);

  int avgAdc = 0;
  float vBat = readBatteryFast(rtc.batRatio, avgAdc);
  int batPercent = calculateBatteryPercentage(vBat);

  int currentIndex = rtc.count;
  if (currentIndex >= 5) currentIndex = 4;

  rtc.readings[currentIndex].temp1 = t1;
  rtc.readings[currentIndex].temp2 = t2;
  rtc.readings[currentIndex].batteryVoltage = vBat;
  rtc.readings[currentIndex].batteryPercent = batPercent;
  rtc.count = currentIndex + 1;

  Serial.printf("[OLCUM #%d/5] Sensor 1: %.1f °C | Sensor 2: %.1f °C | Pil: %.2f V (%%%d)\n",
                rtc.count, t1, t2, vBat, batPercent);

  // 4. Gönderim Kararı (5 ölçüm doldu mu?)
  if (rtc.count >= 5) {
    Serial.println("[WiFi] 5 olcum hafizada hazir. Wi-Fi baglantisi baslatiliyor...");
    loadConfig();

    WiFi.persistent(false); // Flash ömrünü korumak için yazmayı engelle
    WiFi.mode(WIFI_STA);
    WiFi.setOutputPower(20.5f);
    WiFi.begin();

    unsigned long startConn = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startConn < 12000) {
      delay(80);
      Serial.print(".");
    }
    Serial.println();

    bool sendSuccess = false;
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[WiFi] Baglandi! IP: %s\n", WiFi.localIP().toString().c_str());
      calibrateWiFiTxPower();
      sendSuccess = sendBatchTelemetryData(rtc);
    } else {
      Serial.println("[WiFi] Baglanti zaman asimina ugradi!");
    }

    if (sendSuccess) {
      rtc.count = 0; // Başarıyla iletildi, hafızayı sıfırla
      saveRtcData(rtc);
      Serial.println("[SLEEP] Veriler iletildi. 60 saniye Deep Sleep (Wi-Fi KAPALI) baslatiliyor...\n");
      ESP.deepSleep(60000000ULL, WAKE_RF_DISABLED);
    } else {
      // Gönderim başarısız olursa verileri koru, bir sonraki dakikada tekrar dene (RF'i açık tutarak uyu)
      saveRtcData(rtc);
      Serial.println("[SLEEP] Gonderim yapilamadi! Veriler korundu, 60 sn sonra tekrar denenecek (RF HAZIR)...\n");
      ESP.deepSleep(60000000ULL, WAKE_RFCAL);
    }
  } else {
    // 1, 2, 3 veya 4. ölçüm:
    saveRtcData(rtc);

    // 4. ölçüm kaydedildiyse, 5. uyanmada Wi-Fi açılacağı için RF'i önceden kalibre et (WAKE_RFCAL):
    if (rtc.count == 4) {
      Serial.println("[SLEEP] 4. olcum alindi. 5. uyanma icin Wi-Fi hazirlaniyor (WAKE_RFCAL)...\n");
      ESP.deepSleep(60000000ULL, WAKE_RFCAL);
    } else {
      Serial.printf("[SLEEP] %d. olcum hafizaya yazildi. 60 saniye Deep Sleep (Wi-Fi KAPALI) baslatiliyor...\n\n", rtc.count);
      ESP.deepSleep(60000000ULL, WAKE_RF_DISABLED);
    }
  }
}

void loop() {
  if (isLiveTestMode) {
    loopLiveTestMode();
  }
}