# Modüler ilaç verisi panosu

Projeyi kök dizinden başlatın:

```bash
streamlit run Source/Dashboard/app.py
```

`app.py`, bu klasörde `PAGE_TITLE`, `PAGE_ICON` ve `render(st, context)` tanımlayan sayfaları otomatik bulur. Uygulama **Keşifsel Veri Analizi** sayfasında açılır; burada başlangıç terminoloji rehberi ve veri kümesi özeti bulunur.

## Sayfa ekleme

`app.py` yanına yeni bir Python dosyası ekleyip sayfa başlığı, simgesi ve `render(st, context)` işlevini tanımlayın. Ortak uygulama ayarları ve gezinme `app.py` içinde kalır; sayfa içeriği ve veriye özgü işler kendi dosyasında tutulur.

Mevcut sayfalar farklı işleri üstlenir: Keşifsel Veri Analizi, İlaç İnceleyici, Veri Kümesi İnceleyici, İlaç Karşılaştırma, Tedarik Sıkıntısı Analizi, Talep ve Maliyet, Tedarikçi Analizi.

## SQLite veri kataloğu

Uygulama, proje kökündeki `Datasets/drug_data.sqlite3` kataloğu varsa kaynak kayıtlarını SQLite'tan sayfalı okur. GitHub/Streamlit dağıtımı için sıkıştırılmış `Datasets/drug_data.sqlite3.gz` dosyası kullanılır; uygulama bunu ilk açılışta geçici diske çıkarır. Kaynak tabloları her sayfada RAM'e yüklenmez. Yerelde ham dosyalar mevcutsa kataloğu yeniden üretmek için proje kökünden `python Source/Dashboard/build_sqlite.py` çalıştırın. Bu işlem SQLite kataloğunu ve dağıtım kopyasını oluşturur.

Katalog kaynak kayıtlarının özgün alanlarını korur. Yeni kaynak verisi geldiğinde kataloğu yeniden üretip `.gz` dosyasını dağıtım deposuna ekleyin. Yerel, sıkıştırılmamış SQLite dosyası `.gitignore` içindedir.

İlaç İnceleyici; FDA ilaç ve tedarik sıkıntısı kayıtlarını, VA sözleşmelerini, NDC ürün/paket kayıtlarını ve CMS Medicare Part D verilerini arar. Kimlik bilgisiyle bulunan eşleşmeler ile ada göre sunulan olası eşleşmeleri ayrı etiketler.

## Groq destekli sayfa asistanı

Asistan, sayfanın sol altındaki sabit sohbet düğmesinden açılıp kapanır; konuşma geçmişi aynı oturumda sayfalar arasında korunur. Groq'ta `openai/gpt-oss-120b` modeli kullanılır. Sohbet penceresi Streamlit'in seçili açık/koyu temasına uyar. API anahtarını kaynak koda veya GitHub'a koymayın.

Yerelde, proje kökünde `.env.example` dosyasını `.env` adıyla kopyalayın ve `GROQ_API_KEY` değerini kendi anahtarınızla doldurun. `.env` `.gitignore` içindedir; Git'e eklenmez.

Streamlit Community Cloud'da uygulamanın **Settings → Secrets** alanına şunu ekleyin:

```toml
GROQ_API_KEY = "Groq anahtarınızı buraya yapıştırın"
```

Bu secret Streamlit tarafından uygulamaya sağlanır; GitHub deposuna gönderilmez. Anahtarı değiştirdikten sonra Streamlit Cloud'da uygulamayı yeniden başlatın.

## Büyük veri dosyalarını Streamlit Cloud'a dağıtma

Uygulama dağıtımında ham JSON, CSV, TXT ve Excel kaynaklarını Git'e göndermeyin. Bunlar `.gitignore` ile yerelde korunur; uygulamanın ihtiyacı olan kaynak kayıtları `Datasets/drug_data.sqlite3.gz` içindedir. Böylece Streamlit Cloud yüzlerce megabaytlık ayrı kaynak dosyalarını çekmez. Sıkıştırılmış katalog Git LFS ile izlenir.

Mac'te Git LFS'i bir kez kurup etkinleştirin:

```bash
brew install git-lfs
git lfs install
```

Sonra proje kökünde yalnızca sıkıştırılmış SQLite kataloğunu Git LFS'e ekleyip GitHub'a gönderin:

```bash
git add .gitattributes .gitignore
git add Datasets/drug_data.sqlite3.gz
git add -u Datasets
git add Source/Dashboard requirements.txt
git commit -m "Move dashboard records to compressed SQLite catalog"
git push
```

`git add -u Datasets`, repoda daha önce izlenen ham kaynak dosyalarını Git'ten kaldırır; yerel dosyaları silmez. Yeniden katalog üretmek için ham kaynakları bu bilgisayarda tutun ve `python Source/Dashboard/build_sqlite.py` çalıştırın. Streamlit Community Cloud'u yeniden dağıtınca yalnızca SQLite kataloğu indirilecektir. Git LFS kullanım kotası GitHub hesabına bağlıdır.
