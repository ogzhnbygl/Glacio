#include <ESP8266WiFi.h>

// Wi-Fi Bilgileri
const char* ssid     = "OGUZHAN-BAYGUL";
const char* password = "05E241k/";

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

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ledPin, HIGH);
    Serial.println("Wi-Fi koptu, yeniden baglaniliyor...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  float temperatureC = readTemperature();

  if (temperatureC != -999.0) {
    Serial.print("Sicaklik: ");
    Serial.print(temperatureC, 1);
    Serial.println(" °C");
  } else {
    Serial.println("Sensor Hatasi!");
  }

  delay(2000);
}