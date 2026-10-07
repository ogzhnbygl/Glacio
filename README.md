# Glacio - Laboratuvar Sıcaklık İzleme Sistemi

Glacio, laboratuvar buzdolapları ve dondurucularının gerçek zamanlı sıcaklık takibi ve yönetimi için tasarlanmış uçtan uca bir IoT (Nesnelerin İnterneti) çözümüdür. Hassas medikal ve araştırma materyallerinin güvenli sıcaklık sınırları içinde saklanmasını sağlar.

## 🚀 Özellikler

- **Gerçek Zamanlı İzleme:** Sensörlerden gelen sıcaklık verilerini anlık olarak takip edin.
- **Cihaz Yönetimi:** Yeni cihazları sisteme dahil edin (claim), sahiplik durumunu yönetin ve farklı dolap tipleri (+4°C, -20°C, -80°C) için hedef sıcaklık aralıklarını belirleyin.
- **Zaman Serisi Verileri (Time Series):** Telemetri verileri MongoDB'de yüksek performanslı Time Series koleksiyonlarında saklanır ve 30 gün sonra otomatik olarak temizlenir.
- **Akıllı Uyarılar:** Sıcaklıklar belirlenen güvenli aralığın dışına çıktığında panel üzerinde görsel alarmlar (ve yakında eklenecek olan Telegram bildirimleri) ile bilgilendirme sağlar.
- **Kolay Donanım Kurulumu:** Cihaz ilk açıldığında oluşturulan "Glacio-Setup" Wi-Fi ağı üzerinden captive portal ile kolayca ağa bağlanır ve API ayarları yapılandırılır.

## 🛠️ Kullanılan Teknolojiler

**Web Uygulaması:**
- **Framework:** Next.js (App Router)
- **Tasarım:** Tailwind CSS, Lucide React
- **Veritabanı:** MongoDB & Mongoose
- **Kimlik Doğrulama:** NextAuth.js

**Donanım (IoT) Düğümü:**
- **Mikrodenetleyici:** ESP8266
- **Sensörler:** NTC Termistör (Gelecekte DS18B20 veya PT100 eklenebilir)
- **Kütüphaneler/Özellikler:** WiFiManager (Kurulum arayüzü), LittleFS (Dahili yapılandırma hafızası), ArduinoOTA (Kablosuz kod güncelleme)

## 📦 Kurulum ve Çalıştırma (Yazılım)

### Gereksinimler

- Node.js (v18+)
- Geçerli bir MongoDB veritabanı (Atlas veya lokal)

### Ortam Değişkenleri (.env)

Proje dizininde bir `.env` (veya `.env.local`) dosyası oluşturun ve aşağıdaki değişkenleri tanımlayın:

```env
MONGODB_URI=mongodb+srv://<kullanici>:<sifre>@cluster.mongodb.net/glacio?retryWrites=true&w=majority
NEXTAUTH_SECRET=gizli_bir_nextauth_anahtari_olusturun
NEXTAUTH_URL=http://localhost:3000
```

### Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
# veya
yarn install
```

2. Geliştirme sunucusunu başlatın:
```bash
npm run dev
```

3. Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine gidin.

## 🔌 Donanım Kurulumu (ESP8266)

Arduino/ESP8266 kodları `Glacio_Arduino/` dizini altındadır.

1. `Glacio_Arduino.ino` dosyasını Arduino IDE ile açın.
2. Gerekli kütüphaneleri (Library Manager üzerinden) kurun: `WiFiManager`, `ArduinoJson`.
3. Kodu ESP8266 kartınıza yükleyin (Flash).
4. Cihaz ilk başlatıldığında (veya resetlendiğinde) **"Glacio-Setup"** adında bir Wi-Fi ağı yayınlayacaktır.
5. Telefonunuz veya bilgisayarınızla bu ağa bağlanın. Karşınıza çıkan ekrandan Wi-Fi şifrenizi, Cihaz ID'sini ve Vercel/Lokal API bilgilerinizi girerek kurulumu tamamlayın.
