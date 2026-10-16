# DrugFlow — Drug Shortage Risk Prediction and Decision Support System

Endüstri Mühendisliği Tasarım Projesi kapsamında geliştirilen; FDA, NDC, CMS ve VA veri kaynaklarını birleştirerek ilaç tedarik zincirindeki krizleri, nedenleri ve maliyetleri analiz eden karar destek sistemi.

* **Canlı Site:** [https://shortage-analyzer.topr4k.com](https://shortage-analyzer.topr4k.com)
* **Geliştirici Ekip:** Ulaş · Cemre · Begüm · Melisa
* **Ders / Kapsam:** Industrial Engineering Design Project

---

## 📑 İçindekiler
1. [Proje Mimarisi](#-proje-mimarisi)
2. [FTP Bağlantı Bilgileri ve Dosya Aktarımı](#-ftp-bağlantı-bilgileri-ve-dosya-aktarımı)
3. [FTP ile Bağlanma Yöntemleri](#-ftp-ile-bağlanma-yöntemleri)
   - [A. FileZilla / Cyberduck (Grafik Arayüz)](#a-filezilla-veya-cyberduck-ile-bağlantı)
   - [B. VS Code (FTP Eklentisi)](#b-vs-code-ftp-eklentisi-ile-bağlantı)
   - [C. Python Terminali ile Hızlı Yükleme](#c-python-betiği-ile-otomatik-yükleme)
4. [Sunucu ve Yeniden Başlatma (Restart)](#-sunucu-ve-yeniden-başlatma-restart)
5. [Yerel Geliştirme (Local Development)](#-yerel-geliştirme-local-development)
6. [Dizin Yapısı](#-dizin-yapısı)

---

## 🏗️ Proje Mimarisi
* **Frontend:** Tek Sayfa Uygulaması (Vanilla JS SPA, HTML5, CSS3 Glassmorphism). `public/` dizininde yer alır.
* **Backend:** Node.js (v22+) & Express.js. API uç noktaları `main.js` üzerinde çalışır.
* **Veritabanı:** MySQL (Üretim ortamı) / SQLite (Veri aktarım kaynağı `Datasets/drug_data.sqlite3`).
* **Yapay Zeka (AI):** Groq API (`openai/gpt-oss-120b`) destekli veri asistanı chatbot.

---

## 🔐 FTP Bağlantı Bilgileri ve Dosya Aktarımı

Projeye uzaktan bağlanıp dosya yüklemek veya indirmek için gerekli FTP kimlik bilgileri:

| Parametre | Değer |
| :--- | :--- |
| **Sunucu (Host)** | `ftp.topr4k.com` (veya `shortage-analyzer.topr4k.com`) |
| **Protokol** | FTP (File Transfer Protocol) |
| **Port** | `21` |
| **Kullanıcı Adı** | `ulas@shortage-analyzer.topr4k.com` |
| **Şifre** | `your_ftp_password` |
| **Şifreleme (Encryption)** | Düz FTP kullan (Plain FTP / Güvenli olmayan FTP seçeneği) |

> [!WARNING]
> Şifreleme türü olarak **"Sadece düz FTP kullan (insecure)"** seçilmelidir; TLS sertifikası uyuşmazlığı durumunda bağlantının reddedilmesini önler.

---

## 🚀 FTP ile Bağlanma Yöntemleri

### A. FileZilla veya Cyberduck ile Bağlantı
1. **FileZilla** programını açın.
2. Üst menüden **Dosya > Site Yöneticisi** (`Ctrl + S` / `Cmd + S`) seçeneğine tıklayın.
3. **Yeni Site** butonuna basarak adı `DrugFlow Production` yapın.
4. Ayarları aşağıdaki gibi doldurun:
   - **İletişim Kuralı (Protocol):** FTP - Dosya Aktarım İletişim Kuralı
   - **Sunucu (Host):** `ftp.topr4k.com`
   - **Kapı Numarası (Port):** `21`
   - **Şifreleme (Encryption):** Yalnızca düz FTP kullanılsın (güvenli değil)
   - **Oturum Açma Türü:** Normal
   - **Kullanıcı (User):** `ulas@shortage-analyzer.topr4k.com`
   - **Parola (Password):** `your_ftp_password`
5. **Bağlan** butonuna tıklayın.
6. Sağ tarafta sunucu dosyaları listelenecektir:
   - Arayüz kodları: `/public/` klasörü (`app.js`, `index.html`, `overrides.css`, `style.css`)
   - Sunucu kodları: Ana dizindeki `main.js`

---

### B. VS Code FTP Eklentisi ile Bağlantı
VS Code üzerinden doğrudan sunucuya dosya kaydetmek için:
1. VS Code'da **"SFTP"** (Natizyskunk) eklentisini kurun.
2. Proje kökünde `.vscode/sftp.json` dosyası oluşturup şu ayarları yapıştırın:

```json
{
    "name": "DrugFlow Live Server",
    "host": "ftp.topr4k.com",
    "protocol": "ftp",
    "port": 21,
    "username": "ulas@shortage-analyzer.topr4k.com",
    "password": "your_ftp_password",
    "remotePath": "/",
    "uploadOnSave": false,
    "useTempFile": false,
    "openSsh": false
}
```
3. Dosyaya sağ tıklayıp **"Upload"** diyerek doğrudan sunucuya gönderebilirsiniz.

---

### C. Python Betiği ile Otomatik Yükleme
Terminalden tek satırla arayüz dosyalarını canlıya göndermek için terminalde şu komutu çalıştırabilirsiniz:

```bash
python3 -c "
import ftplib
ftp = ftplib.FTP('ftp.topr4k.com')
ftp.login('ulas@shortage-analyzer.topr4k.com', 'your_ftp_password')
for file in ['public/app.js', 'public/index.html', 'public/overrides.css']:
    with open(file, 'rb') as f:
        ftp.storbinary(f'STOR {file}', f)
print('Tüm dosyalar başarıyla canlı sunucuya yüklendi!')
ftp.quit()
"
```

---

## 🔄 Sunucu ve Yeniden Başlatma (Restart)

Sunucu cPanel üzerinde **Phusion Passenger / Node.js Selector** ile çalışmaktadır.

* **Frontend (`public/` dizini):** Yapılan değişiklikler (`app.js`, `overrides.css`, `index.html`) yüklendiği anda tarayıcıda canlıya geçer (Tarayıcıda önbelleği temizlemek için `Ctrl + F5` / `Cmd + Shift + R` yeterlidir).
* **Backend (`main.js`):** `main.js` dosyasında bir değişiklik yaptığınızda Node.js sürecinin yeniden başlaması için FTP'de `tmp/restart.txt` dosyası oluşturulmalı veya içeriği yenilenmelidir:

```python
# Passenger Node.js yeniden başlatma tetikleyicisi
import ftplib, io
ftp = ftplib.FTP('ftp.topr4k.com')
ftp.login('ulas@shortage-analyzer.topr4k.com', 'your_ftp_password')
ftp.storbinary('STOR tmp/restart.txt', io.BytesIO(b'restart\n'))
ftp.quit()
print('Node.js sunucusu yeniden başlatıldı!')
```

---

## 💻 Yerel Geliştirme (Local Development)

Projeyi kendi bilgisayarınızda çalıştırmak için:

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

2. **Çevre değişkenlerini (`.env`) hazırlayın:**
   Proje kökünde `.env` dosyası oluşturun:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=your_database_name
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   GROQ_API_KEY=your_groq_api_key
   PORT=3000
   ```

3. **Geliştirici modunda başlatın:**
   ```bash
   npm run dev
   ```
   Tarayıcınızda `http://localhost:3000` adresini açın.

---

## 📁 Dizin Yapısı

```text
├── main.js                 # Express.js REST API ve Chatbot sunucusu
├── package.json            # Bağımlılıklar ve Node komutları
├── DEPLOYMENT.md           # cPanel sunucu kurulum adımları
├── README.md               # Proje ve FTP bağlantı rehberi
├── database/
│   ├── schema.sql          # MySQL tablo şeması
│   └── expand-record-fields.sql
├── Datasets/
│   ├── drug_data.sqlite3   # Ham SQLite ilaç veritabanı (FDA, NDC, CMS, VA)
│   └── DrugsFDA/ ...
├── public/                 # Canlı web arayüzü dosyaları
│   ├── index.html          # Ana HTML iskeleti ve gezinti menüsü
│   ├── app.js              # İstemci tarafı SPA yönlendiricisi ve bileşenler
│   ├── overrides.css       # Mobil, tablet ve masaüstü duyarlı stil kuralları
│   └── style.css           # Temel glassmorphism tasarım sistemi
└── tmp/
    └── restart.txt         # Sunucu yeniden başlatma tetikleyicisi
```
