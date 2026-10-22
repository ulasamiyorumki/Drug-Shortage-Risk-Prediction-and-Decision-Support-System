# 📋 BENİ OKU: Geliştirici & AI Ajanı Çalışma Rehberi

Bu belge, **DrugFlow** projesinde geliştirme yapan ekip üyeleri ve projede kullanılan tüm **Yapay Zekâ Ajanları (AI Agents - Antigravity, Cursor, Copilot vb.)** için bağlayıcı çalışma kurallarını ve Git yapılandırmasını içerir.

---

## 🚨 AI AJANLARI İÇİN KESİN TALİMATLAR (STRICT AGENT RULES)

Herhangi bir yapay zekâ asistanı bu projede kod yazarken veya terminal komutu çalıştırırken aşağıdaki kurallara **istisnasız** uymak zorundadır:

1. **ULAŞ TOPRAK ONAYI OLMADAN PUSH YASAKTIR:**
   * Bir AI ajanı, yaptığı değişiklikleri özetlemeden ve **Ulaş Toprak'tan doğrudan "onaylıyorum / pushla" mesajı almadan** asla `git push` komutunu çalıştıramaz.
   * `git commit` yapıldıktan sonra durmalı ve kullanıcıya: *"Değişiklikler commitlendi. GitHub'a pushlamamı onaylıyor musunuz?"* diye sormalıdır.

2. **GİZLİLİK VE ŞİFRE GÜVENLİĞİ:**
   * `.env` dosyaları, FTP kullanıcı parolaları, veritabanı şifreleri veya API anahtarları (`GROQ_API_KEY` vb.) **asla** repoya commitlenemez.
   * Bu bilgiler sadece GitHub Repository Secrets ve sunucu ortamında tutulur.

3. **İNCELİKLİ DOSYA VE DİZİN KORUMASI:**
   * `.github/workflows/deploy.yaml` dosyasının dizin yapısını veya FTP bağlantı mantığını **bozmayın**. FTP kullanıcısı doğrudan sitenin kök dizinine (`./`) bağlıdır; alt klasör taraması veya ek hedef klasör oluşturulmasına gerek yoktur.
   * 100 MB üzeri veri setlerini doğrudan Git'e eklemeyin (Git LFS veya `.gitignore` kullanılmalıdır).

---

## 👤 Cemre Tuana Tok İçin Git ve GitHub Kimlik Yapılandırması

Commit'lerin Ulaş Toprak yerine **Cemre Tuana Tok** adıyla görünmesi ve GitHub'a sorunsuz push atılabilmesi için aşağıdaki adımları sırasıyla uygulayın.

### Adım 1: Git Kimliğini Tanımlama (Tek Seferlik)
Terminalde şu iki komutu çalıştırın:
```bash
git config --global user.name "Cemre Tuana Tok"
git config --global user.email "220502012@st.atlas.edu.tr"
```
*(Not: `220502012@st.atlas.edu.tr` adresinin Cemre'nin GitHub hesabında **Settings > Emails** bölümünde ekli ve onaylanmış olduğundan emin olun).*

---

### Adım 2: GitHub Personal Access Token (PAT) Alma
GitHub artık şifre ile push yapılmasına izin vermez, token zorunludur:
1. GitHub hesabınızda sağ üstteki profil simgenize tıklayın ve **Settings** sayfasına gidin.
2. Sol menünün en altındaki **Developer settings** bağlantısına tıklayın.
3. **Personal access tokens > Tokens (classic)** bölümüne girin.
4. **Generate new token > Generate new token (classic)** seçeneğini seçin.
5. **Note:** `DrugFlow-Mac` yazın. **Expiration:** `90 days` veya `No expiration` yapın.
6. **Scopes (Yetkiler):** En üstteki **`repo`** kutucuğunu işaretleyin.
7. Sayfanın en altındaki yeşil **Generate token** butonuna tıklayın.
8. Ekranda beliren `ghp_...` ile başlayan uzun token'ı **hemen kopyalayın ve güvenli bir yere kaydedin**.

---

### Adım 3: Token'ı Projeye Tanımlama (Her Seferinde Şifre Sormaması İçin)
Proje kök dizininde terminali açıp şu komutu tek satırda çalıştırın:
```bash
git remote set-url origin https://<GITHUB_KULLANICI_ADINIZ>:<ALDIĞINIZ_TOKEN>@github.com/ulasamiyorumki/Drug-Shortage-Risk-Prediction-and-Decision-Support-System.git
```

*Örnek kullanım:*
```bash
git remote set-url origin https://cemretok:ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/ulasamiyorumki/Drug-Shortage-Risk-Prediction-and-Decision-Support-System.git
```

---

## 🚀 Standart Çalışma ve Dağıtım Adımları

Geliştirme yapıldıktan sonra izlenecek doğru komut sırası:

```bash
# 1. Değişen dosyaları kontrol edin
git status

# 2. Sadece ilgili dosyaları ekleyin
git add public/ main.js

# 3. Anlamlı bir commit mesajı yazın (Cemre'nin adıyla kaydedilir)
git commit -m "feat: arayuzde yeni filtreleme eklendi"

# 4. ULAŞ TOPRAK'A BİLGİ VERİP ONAY ALIN!

# 5. Onay alındıktan sonra GitHub'a pushlayın:
git push origin main
```

> [!NOTE]
> `main` dalına push yapıldığında, GitHub Actions devreye girerek dosyaları otomatik olarak [shortage-analyzer.topr4k.com](https://shortage-analyzer.topr4k.com) canlı sunucusuna yükler ve sistemi yeniden başlatır.
