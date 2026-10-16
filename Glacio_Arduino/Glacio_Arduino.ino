#include <FS.h>
#include <LittleFS.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// --- Varsayılan Ayarlar (Kullanıcı arayüzünden güncellenebilir) ---
char device_id[64]    = "glacio-node-01";
char api_key[128]     = "glacio-super-secret-key-2026";
char api_url[128]     = "https://glacio.vercel.app/api/telemetry";
char temp_offset[16]  = "0.0";
char temp_offset2[16] = "0.0";
char bat_ratio[16]    = "0.007159"; // 4.059V / 567 ADC multimetre kalibrasyon katsayısı

bool shouldSaveConfig = false;

// Pin Tanımları
#define ONE_WIRE_BUS 4       // DS18B20 Data pini (D2 = GPIO 4) - Her iki sensör de bu pine paralel bağlanır!
#define BATTERY_PIN  A0      // 18650 Pil gerilim bölücü giriş pini (A0)
const int ledPin      = 2;   // Dahili mavi LED (GPIO 2 / D4)
const int resetBtnPin = 0;   // FLASH Butonu (GPIO 0) - Ayarları sıfırlayıp AP moduna geçmek için

// DS18B20 Sensör Nesneleri ve Sabit ROM Adresleri
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
DeviceAddress sensor1Addr;
DeviceAddress sensor2Addr;
bool hasSensor1Addr = false;
bool hasSensor2Addr = false;

// Pil ölçümü yumuşatma (EMA) ve bağlantı hata sayacı
float smoothedBatteryVoltage = -1.0f;
int consecutiveHttpFailures = 0;

// Telnet Sunucusu (Wi-Fi Üzerinden Seri Monitör - Port 23)
WiFiServer telnetServer(23);
WiFiClient telnetClient;

void handleTelnet() {
  if (telnetServer.hasClient()) {
    if (!telnetClient || !telnetClient.connected()) {
      if (telnetClient) telnetClient.stop();
      telnetClient = telnetServer.available();
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

void logPrint(const String &text) {
  Serial.print(text);
  if (telnetClient && telnetClient.connected()) {
    telnetClient.print(text);
  }
}

void logPrintln(const String &text = "") {
  Serial.println(text);
  if (telnetClient && telnetClient.connected()) {
    telnetClient.print(text + "\r\n");
  }
}

void logPrintf(const char *format, ...) {
  char buf[256];
  va_list args;
  va_start(args, format);
  vsnprintf(buf, sizeof(buf), format, args);
  va_end(args);
  Serial.print(buf);
  if (telnetClient && telnetClient.connected()) {
    String s = String(buf);
    s.replace("\r\n", "\n");
    s.replace("\n", "\r\n");
    telnetClient.print(s);
  }
}

// Zamanlayıcılar
unsigned long lastPostTime = 0;
const unsigned long POST_INTERVAL = 15000; // 15 saniye (Stabil telemetri)
unsigned long lastWifiReconnectAttempt = 0;
const unsigned long WIFI_RECONNECT_INTERVAL = 20000; // 20 saniyede bir yeniden bağlanma tetiklemesi

// WiFiManager kaydetme bayrağı
void saveConfigCallback() {
  Serial.println("[FS] Ayarlar kaydedilecek...");
  shouldSaveConfig = true;
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

// Flash (LittleFS) üzerinden yapılandırmayı güvenli oku
void loadConfig() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/config.json")) {
      File configFile = LittleFS.open("/config.json", "r");
      if (configFile) {
        StaticJsonDocument<512> json;
        DeserializationError error = deserializeJson(json, configFile);
        configFile.close();

        if (!error) {
          strlcpy(device_id, json["device_id"] | device_id, sizeof(device_id));
          strlcpy(api_key, json["api_key"] | api_key, sizeof(api_key));
          strlcpy(api_url, json["api_url"] | api_url, sizeof(api_url));
          strlcpy(temp_offset, json["temp_offset"] | temp_offset, sizeof(temp_offset));
          strlcpy(temp_offset2, json["temp_offset2"] | temp_offset2, sizeof(temp_offset2));
          strlcpy(bat_ratio, json["bat_ratio"] | bat_ratio, sizeof(bat_ratio));

          // Eski varsayılan katsayılar (0.00440 veya 0.006986) kayıtlıysa yeni 4.059V/567 kalibrasyonuna güncelle
          float parsedRatio = atof(bat_ratio);
          if (parsedRatio <= 0.00705f) {
            strlcpy(bat_ratio, "0.007159", sizeof(bat_ratio));
            saveConfig();
            Serial.println("[FS] Pil kalibrasyon katsayisi 0.007159 olarak guncellendi.");
          }
          Serial.println("[FS] Kayitli ayarlar yuklendi.");
        } else {
          Serial.println("[FS] config.json okunamadi (JSON hatasi)!");
        }
      }
    }
  } else {
    Serial.println("[FS] LittleFS baslatilamadi!");
  }
}

void printSensorAddress(const DeviceAddress addr) {
  for (uint8_t b = 0; b < 8; b++) {
    if (addr[b] < 16) Serial.print("0");
    Serial.print(addr[b], HEX);
  }
}

// Sensörlerin ROM adreslerini keşfet ve sabitle (1. sensör koparsa 2. sensör 1. sıraya kaymasın)
void discoverSensors() {
  sensors.begin();
  sensors.setWaitForConversion(false); // Bloklamayan sıcaklık dönüşümü

  oneWire.reset_search();
  DeviceAddress addr;
  while (oneWire.search(addr)) {
    if (OneWire::crc8(addr, 7) != addr[7]) continue;

    if (!hasSensor1Addr) {
      if (!hasSensor2Addr || memcmp(addr, sensor2Addr, 8) != 0) {
        memcpy(sensor1Addr, addr, 8);
        hasSensor1Addr = true;
        Serial.print("[SENSOR] Sensor #1 ROM Adresi sabitlendi: ");
        printSensorAddress(sensor1Addr);
        Serial.println();
      }
    } else if (!hasSensor2Addr && memcmp(addr, sensor1Addr, 8) != 0) {
      memcpy(sensor2Addr, addr, 8);
      hasSensor2Addr = true;
      Serial.print("[SENSOR] Sensor #2 ROM Adresi sabitlendi: ");
      printSensorAddress(sensor2Addr);
      Serial.println();
    }
  }
}

bool isValidTempReading(float rawTemp) {
  return (rawTemp != DEVICE_DISCONNECTED_C && rawTemp > -100.0f && rawTemp != 85.0f);
}

// Çift Sensör Sıcaklık Okuma Fonksiyonu (Sabit ROM Adresli & Tek Beklemeli)
bool readTemperatures(float &t1, float &t2) {
  if (!hasSensor1Addr || !hasSensor2Addr) {
    discoverSensors();
  }

  if (!hasSensor1Addr && !hasSensor2Addr) {
    logPrintln("[SENSOR] Sensor bulunamadi (0 adet)! Baglantilari kontrol edin.");
    t1 = -999.0;
    t2 = -999.0;
    return false;
  }

  sensors.requestTemperatures();

  // 12-bit dönüşüm için ~750ms bekle (Telnet ve Wi-Fi arka planda çalışmaya devam eder)
  unsigned long waitStart = millis();
  while (millis() - waitStart < 750) {
    handleTelnet();
    delay(10);
  }

  // 1. Sensör Okuma (Sabit ROM adresi ile)
  if (hasSensor1Addr) {
    float raw1 = sensors.getTempC(sensor1Addr);
    if (isValidTempReading(raw1)) {
      t1 = raw1 + atof(temp_offset);
    } else {
      t1 = -999.0;
    }
  } else {
    t1 = -999.0;
  }

  // 2. Sensör Okuma (Sabit ROM adresi ile)
  if (hasSensor2Addr) {
    float raw2 = sensors.getTempC(sensor2Addr);
    if (isValidTempReading(raw2)) {
      t2 = raw2 + atof(temp_offset2);
    } else {
      t2 = -999.0;
    }
  } else {
    t2 = -999.0;
  }

  return (t1 != -999.0 || t2 != -999.0);
}

// Pil Voltajı Okuma (A0) - Gürültü filtreli (Trimmed Mean + EMA)
float readBatteryVoltage(int &outAvgAdc) {
  const int SAMPLE_COUNT = 25;
  int samples[SAMPLE_COUNT];

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    samples[i] = analogRead(BATTERY_PIN);
    delay(4);
  }

  // Küçükten büyüğe sırala (Wi-Fi akım sıçramalarından kaynaklı uç değerleri atmak için)
  for (int i = 0; i < SAMPLE_COUNT - 1; i++) {
    for (int j = i + 1; j < SAMPLE_COUNT; j++) {
      if (samples[j] < samples[i]) {
        int temp = samples[i];
        samples[i] = samples[j];
        samples[j] = temp;
      }
    }
  }

  // En düşük 5 ve en yüksek 5 okumayı at, ortadaki 15 okumanın ortalamasını al
  long trimmedSum = 0;
  for (int i = 5; i < SAMPLE_COUNT - 5; i++) {
    trimmedSum += samples[i];
  }
  float rawAverage = trimmedSum / 15.0f;
  outAvgAdc = (int)(rawAverage + 0.5f);

  float ratio = atof(bat_ratio);
  if (ratio <= 0.0001f) ratio = 0.007159f;

  float instantVoltage = rawAverage * ratio;

  // Şarja takıp çıkarırken büyük voltaj değişimi varsa (>0.08V) hemen yakala, yoksa yumuşat (EMA)
  if (smoothedBatteryVoltage < 0.0f || abs(instantVoltage - smoothedBatteryVoltage) > 0.08f) {
    smoothedBatteryVoltage = instantVoltage;
  } else {
    smoothedBatteryVoltage = (smoothedBatteryVoltage * 0.65f) + (instantVoltage * 0.35f);
  }

  return smoothedBatteryVoltage;
}

// 18650 Li-Ion Gerçekçi Deşarj Eğrisi ile Yüzde Hesaplama
// (4.18V+ = %100, 4.06V ≈ %86, 3.85V ≈ %58, 3.70V ≈ %33, 3.30V = %0)
int calculateBatteryPercentage(float v) {
  if (v >= 4.18f) return 100;
  if (v <= 3.30f) return 0;

  // Parçalı doğrusal Li-Ion 18650 eğrisi
  float pct;
  if (v >= 4.00f) {
    // 4.00V (%80) -> 4.18V (%100)
    pct = 80.0f + ((v - 4.00f) / (4.18f - 4.00f)) * 20.0f;
  } else if (v >= 3.80f) {
    // 3.80V (%50) -> 4.00V (%80)
    pct = 50.0f + ((v - 3.80f) / (4.00f - 3.80f)) * 30.0f;
  } else if (v >= 3.60f) {
    // 3.60V (%18) -> 3.80V (%50)
    pct = 18.0f + ((v - 3.60f) / (3.80f - 3.60f)) * 32.0f;
  } else {
    // 3.30V (%0) -> 3.60V (%18)
    pct = ((v - 3.30f) / (3.60f - 3.30f)) * 18.0f;
  }

  return constrain((int)(pct + 0.5f), 0, 100);
}

// Şarj tak/çıkar sonrası askıda kalan Wi-Fi / TCP-IP yığınını tazele
void recoverWiFiConnection() {
  logPrintln("[WiFi] Baglanti katmani sifirlaniyor (Self-Healing)...");
  digitalWrite(ledPin, HIGH);
  WiFi.disconnect(false);
  delay(300);
  WiFi.begin();

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(ledPin, LOW);
    logPrint("[WiFi] Yeniden baglandi! IP: ");
    logPrintln(WiFi.localIP().toString());
  }
}

// Telemetri Gönderme (Çift Sensör ve Pil Destekli)
bool sendTelemetryData(float t1, float t2, float vBat, int batPercent) {
  WiFiClientSecure client;
  client.setInsecure(); // SSL sertifika kontrolünü atla
  client.setTimeout(12000);

  HTTPClient http;
  http.setReuse(false); // Askıda kalan soketleri tekrar kullanma

  if (http.begin(client, api_url)) {
    http.setTimeout(12000); // Vercel cold-start toleransı
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

    logPrint("[HTTP] POST: ");
    logPrintln(payload);

    int httpCode = http.POST(payload);
    http.end();

    if (httpCode > 0) {
      logPrintf("[HTTP] Kod: %d\n", httpCode);
      digitalWrite(ledPin, HIGH);
      delay(80);
      digitalWrite(ledPin, LOW);
      consecutiveHttpFailures = 0;
      return true;
    } else {
      consecutiveHttpFailures++;
      logPrintf("[HTTP] Hata (%d/5): %s\n", consecutiveHttpFailures, http.errorToString(httpCode).c_str());

      // Şarja takıp çıkarınca Wi-Fi bağlı görünse bile TCP/DNS kilitlenirse otomatik kurtar
      if (consecutiveHttpFailures == 2 || consecutiveHttpFailures == 4) {
        recoverWiFiConnection();
      } else if (consecutiveHttpFailures >= 5) {
        logPrintln("[WATCHDOG] Ust uste 5 HTTP hatasi! Cihaz otomatik yeniden baslatiliyor...");
        delay(500);
        ESP.restart();
      }
      return false;
    }
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(1500); // Seri monitörün bağlanması için bekle
  pinMode(ledPin, OUTPUT);
  pinMode(resetBtnPin, INPUT_PULLUP);
  digitalWrite(ledPin, HIGH); // LED sönük

  Serial.println("\n=== Glacio Baslatiliyor (DS18B20) ===");

  // DS18B20 Sensörlerini Başlat ve ROM Adreslerini Kaydet
  discoverSensors();
  Serial.printf("[SENSOR] Baslangicta Algilanan DS18B20: %d adet\n",
                (hasSensor1Addr ? 1 : 0) + (hasSensor2Addr ? 1 : 0));

  // 1. Dosya Sisteminden Ayarları Yükle
  loadConfig();

  // Şarj geçişlerinde voltaj dalgalanmasına karşı Wi-Fi uyku modunu kapat
  WiFi.setSleepMode(WIFI_NONE_SLEEP);

  // 2. WiFiManager Kurulumu
  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  // Web portalına özel giriş kutuları ekle
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

  // Eğer ağa bağlanamazsa 'Glacio-Setup' yayını başlatır ve web portalını açar
  wm.setConfigPortalTimeout(180); // 3 dakika işlem yapılmazsa yeniden dener

  Serial.println("[WiFi] Baglanti kontrol ediliyor...");
  if (!wm.autoConnect("Glacio-Setup")) {
    Serial.println("[WiFi] Baglanti saglanamadi, yeniden baslatiliyor...");
    delay(3000);
    ESP.restart();
  }

  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);

  // Kullanıcı yeni ayarları girdiyse güvenli şekilde güncelle ve Flash'a yaz
  if (shouldSaveConfig) {
    strlcpy(device_id, custom_device_id.getValue(), sizeof(device_id));
    strlcpy(api_key, custom_api_key.getValue(), sizeof(api_key));
    strlcpy(api_url, custom_api_url.getValue(), sizeof(api_url));
    strlcpy(temp_offset, custom_temp_offset.getValue(), sizeof(temp_offset));
    strlcpy(temp_offset2, custom_temp_offset2.getValue(), sizeof(temp_offset2));
    strlcpy(bat_ratio, custom_bat_ratio.getValue(), sizeof(bat_ratio));

    Serial.println("\n[AYARLAR] Portal'dan gelen yeni degerler:");
    Serial.print("Device ID: ");
    Serial.println(device_id);

    saveConfig();
  }

  digitalWrite(ledPin, LOW); // LED sabit yanar (Bağlantı Tamam)
  Serial.println("[WiFi] Baglandi! IP:");
  Serial.println(WiFi.localIP());

  // 3. Telnet Sunucusunu Başlat (Port 23)
  telnetServer.begin();
  telnetServer.setNoDelay(true);
  Serial.println("[TELNET] Sunucu baslatildi! Port: 23");
}

void loop() {
  // Telnet istemcilerini dinle
  handleTelnet();

  // FLASH Butonu Kontrolü (D3 / GPIO 0):
  if (digitalRead(resetBtnPin) == LOW) {
    delay(100);
    int holdCount = 0;
    while (digitalRead(resetBtnPin) == LOW) {
      delay(100);
      holdCount++;
      if (holdCount > 30) { // 3 saniye doldu
        logPrintln("\n[RESET] Kurulum moduna geciliyor, WiFi resetlendi!");
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
    if (millis() - lastWifiReconnectAttempt >= WIFI_RECONNECT_INTERVAL) {
      lastWifiReconnectAttempt = millis();
      Serial.println("[WiFi] Baglanti koptu, yeniden baglaniliyor...");
      WiFi.reconnect();
    }
    delay(100);
    return;
  } else if (digitalRead(ledPin) == HIGH) {
    digitalWrite(ledPin, LOW); // Bağlantı geri geldiğinde LED'i tekrar yak
  }

  // Telemetri Gönderimi (millis zamanlayıcı)
  if (millis() - lastPostTime >= POST_INTERVAL) {
    lastPostTime = millis();
    float t1 = -999.0;
    float t2 = -999.0;

    readTemperatures(t1, t2);

    // 18650 Pil Ölçümü (Gürültü Filtreli & 4.059V/567 Kalibreli)
    int avgAdc = 0;
    float vBat = readBatteryVoltage(avgAdc);
    int batPercent = calculateBatteryPercentage(vBat);
    logPrintf("[BATTERY] Voltaj: %.2f V | Pil: %%%d (Filtreli ADC: %d)\n", vBat, batPercent, avgAdc);

    if (t1 != -999.0 && t2 != -999.0) {
      logPrintf("[SENSOR] Sensor 1: %.1f °C | Sensor 2: %.1f °C\n", t1, t2);
    } else if (t1 != -999.0) {
      logPrintf("[SENSOR] Sensor 1: %.1f °C (Sensor 2 yok/okunamadi)\n", t1);
    } else if (t2 != -999.0) {
      logPrintf("[SENSOR] Sensor 2: %.1f °C (Sensor 1 yok/okunamadi)\n", t2);
    } else {
      logPrintln("[SENSOR] Sicaklik sensorleri okunamadi! Sadece pil ve durum bilgisi gonderiliyor.");
    }

    // Sensörlerde hata olsa bile cihazın çevrimiçi ve pil bilgisini sunucuya gönder
    sendTelemetryData(t1, t2, vBat, batPercent);
  }

  delay(10);
}