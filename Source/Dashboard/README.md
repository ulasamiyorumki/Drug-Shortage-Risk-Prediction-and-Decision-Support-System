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

## Büyük veri dosyalarını Streamlit Cloud'a dağıtma

`Datasets/` içindeki dosyalar Git LFS ile izlenir. Streamlit Community Cloud, GitHub deposundaki LFS dosyalarını uygulama ortamına alabilir. LFS kurulumu yapılmadan dosyaları commit etmeyin; aksi hâlde `drugs.json` normal Git dosya sınırını aşar.

Mac'te Git LFS'i bir kez kurup etkinleştirin:

```bash
brew install git-lfs
git lfs install
```

Sonra proje kökünde LFS ayarlarını ve verileri Git'e ekleyip commit ederek GitHub'a gönderin:

```bash
git add .gitattributes .gitignore
git add Datasets
git commit -m "Track dashboard datasets with Git LFS"
git push
```

Streamlit Community Cloud uygulamasını yeniden dağıtın veya yeniden başlatın. Git LFS kullanım kotası GitHub hesabına bağlıdır; çok sayıda uygulama indirmesi aylık bant genişliği kotasını tüketebilir.
