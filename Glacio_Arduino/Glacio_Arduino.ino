#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>

// Wi-Fi Bilgileri
const char* ssid     = "OGUZHAN-BAYGUL";
const char* password = "05E241k/";

// Glacio API Bilgileri
const char* api_url  = "https://glacio.vercel.app/api/telemetry";
const char* api_key  = "glacio-super-secret-key-2026";
const char* device_id = "glacio-node-01";

// Veri Gönderim Süresi
unsigned long lastPostTime = 0;
const unsigned long POST_INTERVAL = 30000; // Şimdilik test için 30 saniyede bir gönder

// Pin Tanımları
const int ntcPin = A0;
const int ledPin = 2; // Dahili mavi LED (GPIO 2 / D4)

// 100k NTC Parametreleri (B3950)
const float B_COEFFICIENT   = 3950.0;
const float ROOM_TEMP       = 298.15;   // 25°C (Kelvin)
const float ROOM_RESISTANCE = 100000.0; // 25°C referans direnç (100k)

// Devre Direnç Parametresi:
// A0-GND arasına 100k harici taktığınızda, dahili dirençle paralel eşdeğeri ~76.000 ohm civarına denk gelir.
const float R_EQUIVALENT    = 76200.0; 

// İnce Kalibrasyon Ofseti (Örn: Kod 23 gösterirken oda 20 ise burayı -3.0 yapabilirsiniz)
const float TEMP_OFFSET     = 0.0; 

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH); // Başlangıçta sönük

  delay(100);
  Serial.println("\n--- Sistem Baslatiliyor ---");

  // Wi-Fi Baglantisi
  Serial.print("Wi-Fi Agina Baglaniliyor: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ledPin, LOW);
    delay(200);
    digitalWrite(ledPin, HIGH);
    delay(200);
    Serial.print(".");
  }

  digitalWrite(ledPin, LOW); // Baglanti basarili -> LED sabit yanar
  Serial.println("\nWi-Fi Baglantisi Basarili!");
  Serial.print("IP Adresi: ");
  Serial.println(WiFi.localIP());
}

float readTemperature() {
  // Gürültüyü önlemek için 20 okuma ortalaması
  float rawADC = 0;
  for (int i = 0; i < 20; i++) {
    rawADC += analogRead(ntcPin);
    delay(5);
  }
  rawADC /= 20.0;

  // Bağlantı kontrolü
  if (rawADC < 15.0 || rawADC > 1010.0) {
    return -999.0;
  }

  // Eşdeğer direnç üzerinden NTC direnci hesabı
  float ntcResistance = R_EQUIVALENT * ((1023.0 / rawADC) - 1.0);

  // Steinhart-Hart dönüşümü
  float steinhart;
  steinhart = ntcResistance / ROOM_RESISTANCE;
  steinhart = log(steinhart);
  steinhart /= B_COEFFICIENT;
  steinhart += 1.0 / ROOM_TEMP;
  steinhart = 1.0 / steinhart;

  float finalTemp = (steinhart - 273.15) + TEMP_OFFSET;
  return finalTemp;
}

void sendTelemetryData(float temp) {
  WiFiClientSecure client;
  client.setInsecure(); // HTTPS için sertifika doğrulamasını atla (NodeMCU için en kolayı)
  
  HTTPClient http;
  
  Serial.print("[HTTP] Baglaniliyor: ");
  Serial.println(api_url);
  
  if (http.begin(client, api_url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", api_key);
    
    // JSON oluştur: {"deviceId": "glacio-node-01", "temperature": 4.5}
    String payload = "{\"deviceId\":\"" + String(device_id) + "\",\"temperature\":" + String(temp, 2) + "}";
    
    Serial.print("[HTTP] POST ediliyor: ");
    Serial.println(payload);
    
    int httpCode = http.POST(payload);
    
    if (httpCode > 0) {
      Serial.printf("[HTTP] POST... kod: %d\n", httpCode);
      if (httpCode == HTTP_CODE_OK) {
        String response = http.getString();
        Serial.println("[HTTP] Yanit:");
        Serial.println(response);
        
        // Başarılı gönderimde bildirim LED'ini hızlıca yak-söndür (LOW yanar, HIGH söner)
        digitalWrite(ledPin, HIGH); // Söndür
        delay(100);
        digitalWrite(ledPin, LOW);  // Tekrar yak
      }
    } else {
      Serial.printf("[HTTP] POST basarisiz, hata: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
  } else {
    Serial.println("[HTTP] Baglanti kurulamadi!");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ledPin, HIGH);
    Serial.println("Wi-Fi koptu, yeniden baglaniliyor...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  float temperatureC = readTemperature();

  // Sürekli ekrana yazmak yerine millis() ile belirli aralıklarla gönder (Örn: 30sn)
  if (millis() - lastPostTime >= POST_INTERVAL) {
    lastPostTime = millis();
    
    if (temperatureC != -999.0) {
      Serial.print("\n--- Yeni Olcum ---");
      Serial.print("\nGuncel Sicaklik: ");
      Serial.print(temperatureC, 1);
      Serial.println(" °C");
      
      // Vercel API'ye Gönder
      sendTelemetryData(temperatureC);
    } else {
      Serial.println("\nSensor Hatasi! Veri gonderilemedi.");
    }
  }

  // WDT (Watchdog) reset önlemek için çok ufak bir bekleme
  delay(10);
}