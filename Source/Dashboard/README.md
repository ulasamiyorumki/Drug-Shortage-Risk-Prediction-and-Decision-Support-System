# Modüler ilaç verisi panosu

Projeyi kök dizinden başlatın:

```bash
streamlit run Source/Dashboard/app.py
```

`app.py`, bu klasörde `PAGE_TITLE`, `PAGE_ICON` ve `render(st, context)` tanımlayan sayfaları otomatik bulur. Uygulama **Keşifsel Veri Analizi** sayfasında açılır; burada başlangıç terminoloji rehberi ve veri kümesi özeti bulunur.

## Sayfa ekleme

`app.py` yanına yeni bir Python dosyası ekleyip sayfa başlığı, simgesi ve `render(st, context)` işlevini tanımlayın. Ortak uygulama ayarları ve gezinme `app.py` içinde kalır; sayfa içeriği ve veriye özgü işler kendi dosyasında tutulur.

Mevcut sayfalar farklı işleri üstlenir: Keşifsel Veri Analizi, İlaç İnceleyici, Veri Kümesi İnceleyici, İlaç Karşılaştırma, Tedarik Sıkıntısı Analizi, Talep ve Maliyet, Tedarikçi Analizi.

İlaç İnceleyici; FDA ilaç ve tedarik sıkıntısı kayıtlarını, VA sözleşmelerini, NDC ürün/paket kayıtlarını ve CMS Medicare Part D verilerini arar. Kimlik bilgisiyle bulunan eşleşmeler ile ada göre sunulan olası eşleşmeleri ayrı etiketler.
