const page = document.querySelector('#page');
const sourceNames = {
  'FDA Drugs': 'FDA Drugs@FDA',
  'Drug Shortages': 'FDA Tedarik Sıkıntıları',
  'NDC Products': 'NDC Ürün Dizini',
  'NDC Packages': 'NDC Paket Dizini',
  'CMS Medicare Part D': 'CMS Medicare Part D',
  'VA Contracts': 'VA Sözleşmeleri'
};
const state = { query: '', dataset: 'FDA Drugs', page: 1, comparison: [], activeScenario: 'scenario1' };
const esc = value => String(value ?? 'Mevcut değil').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const api = async url => { const res = await fetch(url); const data = await res.json(); if (!res.ok) throw new Error(data.message || 'İstek tamamlanamadı.'); return data; };
const label = record => record.generic_name || record.brand_name || record.raw_json?.['Drug / product'] || 'İlaç kaydı';
const field = (name, value, source) => `<div class="detail-field"><small>${esc(name)} · ${esc(source)}</small><b>${esc(value)}</b></div>`;
const header = (title, intro, eyebrow = 'DRUGFLOW / KARAR DESTEK') => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="page-intro">${intro}</p></div></div>`;
const sourceLabel = source => sourceNames[source] || source;

function badge(status) {
  if (!status) return '<span class="badge neutral">Mevcut değil</span>';
  const current = String(status).toLowerCase() === 'current';
  return `<span class="badge ${current ? 'current' : 'resolved'}">${current ? 'Güncel' : esc(status)}</span>`;
}

// --- Endüstri Mühendisliği Sayfa Rehberi Banner Bileşeni ---
const guideBanner = (what, explains, how) => `
  <div class="guide-banner">
    <div class="guide-badge">📌 Sayfa Rehberi & Endüstri Mühendisliği Analiz Çerçevesi</div>
    <div class="guide-grid">
      <div class="guide-col"><b class="guide-title">Bu Sayfa Nedir?</b><p>${what}</p></div>
      <div class="guide-col"><b class="guide-title">Ne Anlatır?</b><p>${explains}</p></div>
      <div class="guide-col"><b class="guide-title">Nasıl Kullanılır?</b><p>${how}</p></div>
    </div>
  </div>`;

// --- Kök Neden Haritalama Sözlüğü ---
const shortageReasonsMap = {
  "ropivacaine": "Demand increase for the drug",
  "fentanyl": "Demand increase for the drug",
  "carboplatin": "Requirements related to complying with good manufacturing practices",
  "flurazepam": "Regulatory delay",
  "metronidazole": "Discontinuation of the manufacture of the drug",
  "lorazepam": "Demand increase for the drug",
  "remifentanil": "Demand increase for the drug",
  "rifampin": "Discontinuation of the manufacture of the drug",
  "lidocaine": "Demand increase for the drug",
  "midazolam": "Demand increase for the drug",
  "bupivacaine": "Delay in shipping of the drug",
  "epinephrine": "Demand increase for the drug",
  "ketorolac": "Delay in shipping of the drug",
  "cefotaxime": "Demand increase for the drug",
  "amphetamine": "Shortage of an active ingredient",
  "dextroamphetamine": "Shortage of an active ingredient",
  "lisdexamfetamine": "Delay in shipping of the drug",
  "hydromorphone": "Demand increase for the drug",
  "ifosfamide": "Demand increase for the drug",
  "methylphenidate": "Discontinuation of the manufacture of the drug",
  "methylprednisolone": "Shortage of an active ingredient",
  "quinapril": "Discontinuation of the manufacture of the drug",
  "dexmedetomidine": "Delay in shipping of the drug",
  "sufentanil": "Discontinuation of the manufacture of the drug",
  "liraglutide": "Demand increase for the drug",
  "rocuronium": "Delay in shipping of the drug",
  "conivaptan": "Delay in shipping of the drug",
  "azacitidine": "Demand increase for the drug",
  "clonazepam": "Aktif Kriz (Diğer Neden)",
  "riluzole": "Requirements related to complying with good manufacturing practices",
  "furosemide": "Demand increase for the drug",
  "desmopressin": "Requirements related to complying with good manufacturing practices",
  "amino acid": "Shortage of an inactive ingredient component",
  "diclofenac": "To Be Discontinued",
  "ketamine": "To Be Discontinued",
  "phenobarbital": "To Be Discontinued",
  "etomidate": "Demand increase for the drug"
};

function getShortageReason(r) {
  if (r.shortage_reason && r.shortage_reason.trim()) return r.shortage_reason.trim();
  const text = ((r.generic_name || '') + ' ' + (r.brand_name || '')).toLowerCase();
  for (const [key, val] of Object.entries(shortageReasonsMap)) {
    if (text.includes(key)) return val;
  }
  if (r.source === 'Drug Shortages') {
    const st = String(r.shortage_status || '').toLowerCase();
    if (st.includes('discontinu')) return 'Discontinuation of the manufacture of the drug';
    return 'Belirtilmemiş (FDA Kaydı)';
  }
  return null;
}

const greenMeds = /pregabalin|alprazolam|lorazepam|diclofenac|tramadol|midazolam|diazepam|thiopental|tiyopental|ketamine|ketamin|phenobarbital|fenobarbital|zopiclone|zopiklon|tianeptine|tianeptin|clonazepam|klonazepam|clorazepate|klorazepat|biperiden|clidinium|etomidate|etomidat|methylphenidate|metilfenidat|mefenamic acid|xanax|ativan|concerta|rivotril|dormicum|diazem|nervium|contramal|ultracet|lyrica|galara|alyse|ketalar|ekipental|luminaletten|imovane|akineton|hypnomidate|stablon/i;

function recordRows(rows, selectable = false, isExplorer = false) {
  return rows.map(r => {
    const isGreen = greenMeds.test(r.generic_name || '') || greenMeds.test(r.brand_name || '');
    const gb = isGreen ? ' <span class="green-rx-symbol" title="TİTCK / SUT Kalkanı Resmi Yeşil Reçeteli İlaç (Kontrole Tabi)">🟢 YEŞİL REÇETE</span>' : '';
    const reason = getShortageReason(r);
    const reasonBadge = reason ? `<span class="reason-badge">${esc(reason)}</span>` : '<span style="color:var(--muted)">—</span>';
    if (isExplorer) {
      return `<tr ${selectable ? `data-id="${r.id}" class="selectable"` : ''}><td class="drug-cell"><b>${esc(label(r))}${gb}</b><small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small></td><td>${esc(r.manufacturer || r.vendor || '—')}</td><td>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</td><td>${reasonBadge}</td></tr>`;
    }
    return `<tr ${selectable ? `data-id="${r.id}" class="selectable"` : ''}><td class="drug-cell"><b>${esc(label(r))}${gb}</b><small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small></td><td>${esc(r.manufacturer || r.vendor || '—')}</td><td>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</td><td>${esc(r.report_year || '—')}</td><td>${badge(r.shortage_status)}</td><td>${reasonBadge}</td><td>${esc(sourceLabel(r.source))}</td></tr>`;
  }).join('');
}

function chart(items = []) {
  const top = Math.max(...items.map(x => Number(x.value) || 0), 1);
  return `<div class="chart">${items.map(x => `<div class="bar" title="${esc(x.label)}: ${esc(x.value)}" style="height:${Math.max(8, Math.round(x.value / top * 100))}%"></div>`).join('')}</div><div class="bar-labels"><span>${esc(items[0]?.label || '—')}</span><span>${esc(items.at(-1)?.label || '—')}</span></div>`;
}

// ==========================================================================
// 1. DASHBOARD
// ==========================================================================
async function dashboard() {
  const guide = guideBanner(
    "FDA, NDC, CMS ve VA veri kaynaklarındaki 600.000+ ilaç ve tedarik kaydının genel durumunu sunan merkezi komuta panosudur.",
    "Tedarik zincirinin makro sağlığını, FDA'de aktif olan ilaç krizlerini, VA tedarikçi yoğunlaşmasını ve kayıt dağılımlarını özetler.",
    "Metrik kartlarıyla sistemdeki dengeleri inceleyin; grafiklere tıklayarak doğrudan derinlemesine analiz sayfalarına geçin."
  );

  page.innerHTML = header('Tedarik Görünümü', 'FDA, NDC, CMS ve VA kaynaklarındaki ilaç tedarik verilerine tek yerden erişin.') + guide + '<div class="empty glass">Veriler yükleniyor…</div>';
  try {
    const [overview, shortages, suppliers] = await Promise.all([api('/api/overview'), api('/api/analytics/shortages'), api('/api/analytics/suppliers')]);
    const count = Object.fromEntries(overview.counts.map(x => [x.source, x.count]));
    page.innerHTML = header('Tedarik Görünümü', 'FDA, NDC, CMS ve VA kaynaklarındaki ilaç tedarik verilerine tek yerden erişin.') + guide + `
      <section class="grid stats">
        <article class="glass stat"><span class="stat-label">Toplam İlaç Kayıtları</span><strong>${Object.values(count).reduce((a, b) => a + Number(b), 0).toLocaleString('tr-TR')}</strong><small>Altı veri kaynağı</small><span class="trend">↗</span></article>
        <article class="glass stat"><span class="stat-label">Güncel Tedarik Sıkıntısı</span><strong>${Number(overview.currentShortages).toLocaleString('tr-TR')}</strong><small>FDA Drug Shortages</small><span class="trend red">↗</span></article>
        <article class="glass stat"><span class="stat-label">VA Tedarikçileri</span><strong>${Number(overview.vendors).toLocaleString('tr-TR')}</strong><small>Aktif sözleşme kayıtları</small><span class="trend">↗</span></article>
        <article class="glass stat"><span class="stat-label">CMS Part D Kayıtları</span><strong>${Number(count['CMS Medicare Part D'] || 0).toLocaleString('tr-TR')}</strong><small>Talep göstergesi</small><span class="trend">↗</span></article>
      </section>
      <section class="grid main-grid">
        <article class="glass panel">
          <div class="panel-head"><h2>Güncel Tedarik Sıkıntısı Dağılımı</h2><button class="panel-link" data-go="shortages">Tüm kayıtlar →</button></div>
          ${chart(shortages.status)}
          <div class="notice" style="margin-top:12px;">FDA’nın bildirdiği tedarik krizleridir. Kök nedenler aktif hammadde eksikliği, üretim kesintisi ve sevkiyat gecikmeleridir.</div>
        </article>
        <article class="glass panel">
          <div class="panel-head"><h2>En Yoğun VA Tedarikçileri</h2><button class="panel-link" data-go="suppliers">Analize git →</button></div>
          ${chart(suppliers.vendors)}
        </article>
      </section>
      <section class="grid main-grid">
        <article class="glass panel">
          <div class="panel-head"><h2>Entegre Veri Kaynakları</h2><button class="panel-link" data-go="datasets">Kayıtları incele →</button></div>
          <div class="source-list">${Object.entries(count).map(([source, value]) => `<div class="source-item"><span class="source-icon">${source === 'VA Contracts' ? '⌘' : source === 'Drug Shortages' ? '⚠' : '◌'}</span><b>${esc(sourceLabel(source))}</b><small>${Number(value).toLocaleString('tr-TR')} kayıt</small></div>`).join('')}</div>
        </article>
        <article class="glass panel">
          <h2>Endüstri Mühendisi Hızlı Başlangıç</h2>
          <p class="page-intro">Tedarik riski analizi yapmak için 3 adımlı iş akışını izleyin:</p>
          <div class="detail-grid" style="margin-top:16px">
            ${field('1. Yeşil Reçete Kapsamı', 'Türkiye portföyü ve İmal/İthal risklerini süzün', 'Yeşil Reçete')}
            ${field('2. Lojistik ve Ticaret', 'TÜİK ve IMF PortWatch boğaz geçişlerini inceleyin', 'Lojistik')}
            ${field('3. Kriz Simülasyonu', 'Senaryo testiyle emniyet stoku ve ikame belirleyin', 'Simülasyon')}
          </div>
        </article>
      </section>`;
  } catch (error) { page.innerHTML = header('Tedarik Görünümü', '') + guide + dbMessage(error); }
}

function dbMessage(error) {
  return `<div class="empty glass"><b>Veritabanı henüz hazır değil.</b><p>${esc(error.message)}</p><p>Önce <code>database/schema.sql</code> dosyasını çalıştırıp ardından SQLite içe aktarmasını başlatın.</p></div>`;
}

// ==========================================================================
// 2. TÜRKİYE YEŞİL REÇETE & SGK PORTFÖYÜ (CASES)
// ==========================================================================
const defaultRiskWeights = {
  w_import: 30,       // Menşe / İthalat Bağımlılığı (%)
  w_generic: 25,      // Yerli Muadil / İkame Eksikliği (%)
  w_fda: 20,          // Küresel Tedarik Kesintisi / FDA Shortage (%)
  w_logistics: 15,    // Lojistik & Deniz Boğazı Darboğazı (%)
  w_concentration: 10 // Pazar & Tek Tedarikçi Yoğunlaşması (%)
};

state.riskWeights = { ...defaultRiskWeights };

function calculateDrugScore(m, weights = state.riskWeights) {
  const c1 = m.origin === 'İTHAL' ? 100 : (m.origin.includes('İTHAL') ? 60 : 20);
  
  let c2 = 10;
  if (m.localEquivCount === 0) c2 = 100;
  else if (m.localEquivCount === 1) c2 = 75;
  else if (m.localEquivCount === 2) c2 = 50;
  else if (m.localEquivCount <= 4) c2 = 30;
  else c2 = 10;

  let c3 = 10;
  if (m.fdaShortage.includes('Active')) c3 = 100;
  else if (m.yurtDisiList.includes('Evet')) c3 = 70;
  else c3 = 15;

  const c4 = m.origin.includes('İTHAL') ? 85 : 65;
  const c5 = m.localEquivCount <= 1 ? 90 : (m.localEquivCount <= 3 ? 50 : 20);

  const totalW = (weights.w_import + weights.w_generic + weights.w_fda + weights.w_logistics + weights.w_concentration) || 1;
  const score = (
    c1 * weights.w_import +
    c2 * weights.w_generic +
    c3 * weights.w_fda +
    c4 * weights.w_logistics +
    c5 * weights.w_concentration
  ) / totalW;

  return Math.round(score);
}

const turkeyGreenMeds = [
  { name: 'LORAZEPAM', brand: 'ATIVAN 1 MG / 2.5 MG', barcode: '8699532010018', atc: 'N05BA06', origin: 'İTHAL', manufacturer: 'PFIZER İLAÇLARI A.Ş.', equivGroup: 'N05BA06-A1', localEquivCount: 0, yurtDisiList: 'Evet (Ek-1)', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase for the drug', cms: 31, va: 25, short: 11, fda: 221 },
  { name: 'METHYLPHENIDATE', brand: 'CONCERTA 18/27/36/54 MG', barcode: '8699593015112', atc: 'N06BA04', origin: 'İTHAL', manufacturer: 'JOHNSON & JOHNSON / JANSSEN', equivGroup: 'N06BA04-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'Discontinuation of manufacture', cms: 85, va: 42, short: 38, fda: 312 },
  { name: 'ALPRAZOLAM', brand: 'XANAX 0.5 MG / 1 MG', barcode: '8699532011244', atc: 'N05BA12', origin: 'İTHAL', manufacturer: 'PFIZER İLAÇLARI A.Ş.', equivGroup: 'N05BA12-A1', localEquivCount: 0, yurtDisiList: 'Evet (Dönemsel)', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 63, va: 18, short: 0, fda: 179 },
  { name: 'CLONAZEPAM', brand: 'RIVOTRIL 2 MG TABLET / DAMLA', barcode: '8699508010116', atc: 'N05BA09', origin: 'İTHAL', manufacturer: 'CHEPLAPHARM / DEVA DAĞITIM', equivGroup: 'N05BA09-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Regulatory & shipping delay', cms: 18, va: 5, short: 40, fda: 250 },
  { name: 'MIDAZOLAM', brand: 'DORMICUM 5 MG/5 ML AMPUL', barcode: '8699508750012', atc: 'N05CD08', origin: 'İMAL / İTHAL', manufacturer: 'DEVA HOLDİNG / ROCHE', equivGroup: 'N05CD08-A1', localEquivCount: 3, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase for the drug', cms: 24, va: 16, short: 27, fda: 126 },
  { name: 'DIAZEPAM', brand: 'DIAZEM 2 MG / 5 MG / 10 MG AMPUL', barcode: '8699525091234', atc: 'N05BA01', origin: 'İMAL', manufacturer: 'DEVA HOLDİNG A.Ş.', equivGroup: 'N05BA01-A1', localEquivCount: 4, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Yerli Üretim Yüksek', cms: 35, va: 12, short: 0, fda: 210 },
  { name: 'TRAMADOL', brand: 'CONTRAMAL 50 MG / 100 MG RETARD', barcode: '8699514092110', atc: 'N02AX02', origin: 'İMAL', manufacturer: 'ABDİ İBRAHİM İLAÇ SAN.', equivGroup: 'N02AX02-A1', localEquivCount: 5, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Yerli Üretim Kapasitesi Yüksek', cms: 52, va: 9, short: 0, fda: 198 },
  { name: 'PREGABALIN', brand: 'LYRICA 75/150/300 MG (VE GALARA)', barcode: '8699532150028', atc: 'N03AX16', origin: 'İMAL / İTHAL', manufacturer: 'PFIZER / NOBEL / İLKO', equivGroup: 'N03AX16-A1', localEquivCount: 8, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Çoklu Yerli Üretici', cms: 26, va: 28, short: 0, fda: 597 },
  { name: 'KETAMINE', brand: 'KETALAR 50 MG/ML FLAKON', barcode: '8699532750013', atc: 'N01AX03', origin: 'İTHAL', manufacturer: 'PFIZER İLAÇLARI A.Ş.', equivGroup: 'N01AX03-A1', localEquivCount: 1, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Discontinuation & API delay', cms: 6, va: 5, short: 1, fda: 65 },
  { name: 'THIOPENTAL', brand: 'EKİPENTAL 0.5 G / 1 G FLAKON', barcode: '8699638790114', atc: 'N01AF03', origin: 'İMAL', manufacturer: 'TÜM EKİP İLAÇ A.Ş.', equivGroup: 'N01AF03-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Ulusal Tek Üretici', cms: 4, va: 2, short: 0, fda: 18 },
  { name: 'PHENOBARBITAL', brand: 'LUMINALETTEN / PHENOBARBITAL', barcode: '8699546010042', atc: 'N03AA02', origin: 'İTHAL', manufacturer: 'DESITIN / BAYER', equivGroup: 'N03AA02-A1', localEquivCount: 0, yurtDisiList: 'Evet (Dönemsel)', fdaShortage: 'Active Shortage', fdaReason: 'To Be Discontinued', cms: 18, va: 1, short: 8, fda: 43 },
  { name: 'ZOPICLONE', brand: 'IMOVANE 7.5 MG TABLET', barcode: '8699809010029', atc: 'N05CF01', origin: 'İTHAL', manufacturer: 'SANOFI SAĞLIK ÜRÜNLERİ', equivGroup: 'N05CF01-A1', localEquivCount: 0, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Tek İthal Tedarikçi', cms: 15, va: 4, short: 0, fda: 123 },
  { name: 'BIPERIDEN', brand: 'AKINETON 2 MG TAB / 5 MG AMPUL', barcode: '8699546011124', atc: 'N04AA02', origin: 'İMAL', manufacturer: 'LABORATUAR İLAÇ SAN.', equivGroup: 'N04AA02-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Yerli Üretim', cms: 12, va: 3, short: 0, fda: 35 },
  { name: 'ETOMIDATE', brand: 'HYPNOMIDATE 20 MG/10 ML AMPUL', barcode: '8699593750013', atc: 'N01AX07', origin: 'İTHAL', manufacturer: 'JANSSEN-CILAG', equivGroup: 'N01AX07-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase for the drug', cms: 0, va: 0, short: 12, fda: 126 },
  { name: 'TIANEPTINE', brand: 'STABLON 12.5 MG TABLET', barcode: '8699552010210', atc: 'N06AX14', origin: 'İTHAL', manufacturer: 'SERVİER İLAÇ VE ARAŞTIRMA A.Ş.', equivGroup: 'N06AX14-A1', localEquivCount: 0, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Tek İthal Tedarikçi Bağımlılığı (0 Muadil)', cms: 8, va: 2, short: 0, fda: 14 }
];

const greenAliases = {
  'TIANEPTIN': 'TIANEPTINE',
  'KLONAZEPAM': 'CLONAZEPAM',
  'FENOBARBITAL': 'PHENOBARBITAL',
  'TIYOPENTAL': 'THIOPENTAL',
  'ZOPIKLON': 'ZOPICLONE',
  'METILFENIDAT': 'METHYLPHENIDATE',
  'ETOMIDAT': 'ETOMIDATE',
  'KETAMIN': 'KETAMINE'
};

function normalizeMedText(str) {
  if (!str) return '';
  return String(str)
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .toUpperCase().trim();
}

function getTurkeyGreenMed(str) {
  if (!str) return null;
  const raw = String(str).toUpperCase().trim();
  const norm = normalizeMedText(str);

  for (const m of turkeyGreenMeds) {
    const mName = m.name.toUpperCase();
    const mNorm = normalizeMedText(m.name);
    if (raw.includes(mName) || mName.includes(raw) || norm.includes(mNorm) || mNorm.includes(norm)) {
      return m;
    }
    // Check Turkish alias
    for (const [trKey, enKey] of Object.entries(greenAliases)) {
      if (enKey === mName && (norm.includes(trKey) || trKey.includes(norm))) {
        return m;
      }
    }
    // Check brand parts
    const brandParts = m.brand.toUpperCase().split(/[\s/()+,]+/);
    for (const part of brandParts) {
      if (part.length >= 4 && (raw.includes(part) || norm.includes(normalizeMedText(part)))) {
        return m;
      }
    }
  }
  return null;
}

let currentGreenFilter = 'all';

function casesPage() {
  const guide = guideBanner(
    "Türkiye'nin resmi yeşil reçete ve kontrole tabi psikotrop ilaçlarının SGK Ek-4/A, TİTCK ve FDA verileriyle birleştirilmiş ulusal analiz merkezidir.",
    "İlaçların yerli formülasyon mu (İMAL) yoksa %100 ithal mi (İTHAL) olduğunu, SGK Eşdeğer Gruplarını, yerli muadil sayılarını ve yapılandırılabilir tedarik risk skorunu gösterir.",
    "Filtre butonlarıyla yerli/ithal durumunu süzün; 'Risk Puanı Modeli' sekmesinden ağırlıkları değiştirdiğinizde bu sayfadaki skorlar anında güncellenir."
  );

  const enriched = turkeyGreenMeds.map(m => ({
    ...m,
    calculatedRisk: calculateDrugScore(m, state.riskWeights)
  }));

  const filtered = enriched.filter(m => {
    if (currentGreenFilter === 'imported') return m.origin.includes('İTHAL');
    if (currentGreenFilter === 'local') return m.origin.includes('İMAL');
    if (currentGreenFilter === 'highRisk') return m.calculatedRisk >= 75;
    return true;
  });

  const getRiskPill = (score) => {
    if (score >= 75) return `<span class="risk-pill high">YÜKSEK (${score})</span>`;
    if (score >= 50) return `<span class="risk-pill med">ORTA (${score})</span>`;
    return `<span class="risk-pill low">DÜŞÜK (${score})</span>`;
  };

  page.innerHTML = header('Yeşil Reçete & Türkiye Tedarik Riski', 'SGK Ek-4/A geri ödeme listesi, TİTCK ruhsatları ve FDA tedarik krizleriyle çapraz eşleştirilmiş yeşil reçete ilaçları.') + guide + `
    <section class="glass panel">
      <div class="controls" style="margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div class="tabs" style="margin-bottom:0">
          <button class="tab ${currentGreenFilter === 'all' ? 'active' : ''}" onclick="setGreenFilter('all')">Tüm Yeşil Reçete İlaçları (${turkeyGreenMeds.length})</button>
          <button class="tab ${currentGreenFilter === 'imported' ? 'active' : ''}" onclick="setGreenFilter('imported')">Yalnızca İthal İlaçlar</button>
          <button class="tab ${currentGreenFilter === 'local' ? 'active' : ''}" onclick="setGreenFilter('local')">Yerli İmalat Olanlar</button>
          <button class="tab ${currentGreenFilter === 'highRisk' ? 'active' : ''}" onclick="setGreenFilter('highRisk')">Kritik Riskli Olanlar (Risk ≥ 75)</button>
        </div>
        <button class="button secondary" onclick="location.hash='#riskmodel'" style="font-size:11px;">⚙ Risk Ağırlıklarını Düzenle →</button>
      </div>
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th>Etkin Madde (INN)</th>
              <th>Türkiye Müstahzar Adı</th>
              <th>SGK Barkod (GTIN)</th>
              <th>WHO ATC</th>
              <th>Menşe Statüsü</th>
              <th>SGK Eşdeğer Grubu</th>
              <th>Yerli Muadil</th>
              <th>FDA Sıkıntı Eşleşmesi</th>
              <th>Dinamik Risk Skoru</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(item => `
              <tr class="selectable" onclick="goToDrug('${item.name}')" style="cursor:pointer">
                <td><b>${esc(item.name)} <span class="green-rx-symbol" style="font-size:9.5px; padding:1px 6px;" title="TİTCK / SUT Kalkanı Resmi Yeşil Reçeteli İlaç">🟢 YEŞİL REÇETE</span></b></td>
                <td><b>${esc(item.brand)}</b><br><small style="color:var(--muted)">${esc(item.manufacturer)}</small></td>
                <td><code>${esc(item.barcode)}</code></td>
                <td><span class="source-tag">${esc(item.atc)}</span></td>
                <td><span class="badge ${item.origin === 'İMAL' ? 'resolved' : 'current'}">${esc(item.origin)}</span></td>
                <td><small>${esc(item.equivGroup)}</small></td>
                <td>${item.localEquivCount > 0 ? `<b style="color:var(--green)">${item.localEquivCount} Muadil</b>` : `<b style="color:var(--red)">Muadil Yok (0)</b>`}</td>
                <td><small>${esc(item.fdaShortage)}</small><br><span class="reason-badge">${esc(item.fdaReason)}</span></td>
                <td>${getRiskPill(item.calculatedRisk)}</td>
                <td><button class="button" style="padding:4px 12px; font-size:11px;" onclick="event.stopPropagation(); goToDrug('${item.name}')">İncele →</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="notice" style="margin-top:16px;">
        💡 <b>Mühendislik Notu:</b> Yukarıdaki risk skorları <b>Risk Puanı Modeli</b> sekmesinde tanımladığınız ağırlıklarla canlı olarak hesaplanmaktadır.
      </div>
    </section>
  `;
}

function setGreenFilter(f) {
  currentGreenFilter = f;
  casesPage();
}

// ==========================================================================
// 2.B. RİSK PUANI MODELİ & AĞIRLIK KONFİGÜRASYONU (RISK MODEL TAB)
// ==========================================================================
function riskModelPage() {
  const guide = guideBanner(
    "Endüstri Mühendisliği Çok Kriterli Karar Verme (MCDM) tabanlı Bileşik Tedarik Kırılganlık Riski (TKR) formülünü ve katsayı ağırlıklarını düzenleme merkezidir.",
    "İthalat bağımlılığı (w1), muadil eksikliği (w2), küresel FDA sıkıntısı (w3), lojistik boğaz gecikmesi (w4) ve monopol riskinin (w5) toplam skora katkısını modeller.",
    "Kaydırıcıları hareket ettirerek katsayıları değiştirin; toplam ağırlığın %100 dengesini izleyin. 'Tüm Sistemde Uygula' butonuna basarak Yeşil Reçete ve Simülasyon sekmelerine aktarın."
  );

  const w = state.riskWeights;
  const totalW = w.w_import + w.w_generic + w.w_fda + w.w_logistics + w.w_concentration;
  const isBalanced = totalW === 100;

  const previewList = turkeyGreenMeds.map(m => ({
    ...m,
    liveScore: calculateDrugScore(m, w)
  })).sort((a, b) => b.liveScore - a.liveScore);

  const getRiskPill = (score) => {
    if (score >= 75) return `<span class="risk-pill high">YÜKSEK (${score})</span>`;
    if (score >= 50) return `<span class="risk-pill med">ORTA (${score})</span>`;
    return `<span class="risk-pill low">DÜŞÜK (${score})</span>`;
  };

  page.innerHTML = header('Risk Puanı Modeli & Ağırlık Konfigüratörü', 'Tedarik Kırılganlık Riski (TKR) matematiksel modelini ve parametre katsayılarını yönetin.') + guide + `
    <section class="glass panel formula-box">
      <h2>Matematiksel Model: Bileşik Tedarik Kırılganlık Riski (TKR)</h2>
      <div class="math-display">
        TKR<sub>i</sub> = [ w<sub>ithal</sub>·C<sub>i,ithal</sub> + w<sub>muadil</sub>·C<sub>i,muadil</sub> + w<sub>fda</sub>·C<sub>i,fda</sub> + w<sub>lojistik</sub>·C<sub>i,lojistik</sub> + w<sub>monopol</sub>·C<sub>i,monopol</sub> ] / ∑ w<sub>k</sub>
      </div>
      <div style="font-size:12px; color:#475569; line-height:1.6;">
        <b>Kriter Puanlama Skalası (0-100):</b>
        <span class="source-tag">C1 (İthalat)</span> İthal: 100, İmal/İthal: 60, Yerli: 20 ·
        <span class="source-tag">C2 (Muadil)</span> 0 Muadil: 100, 1 Muadil: 75, 2: 50, ≥5: 10 ·
        <span class="source-tag">C3 (FDA/Küresel)</span> Aktif Kriz: 100, Yurt Dışı İlaç: 70, Normal: 15 ·
        <span class="source-tag">C4 (Lojistik Boğaz)</span> İthal Rota: 85, Asya API Hammadde: 65 ·
        <span class="source-tag">C5 (Monopol/Tek Üretici)</span> Tek Firma: 90, 2-3 Firma: 50, Rekabetçi: 20
      </div>
    </section>

    <section class="glass panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <h2>Ağırlık Katsayılarını Düzenle (∑ = %100)</h2>
        <div class="tabs" style="margin-bottom:0">
          <button class="tab" onclick="applyPresetWeights('balanced')">Dengeli Model (Varsayılan)</button>
          <button class="tab" onclick="applyPresetWeights('logistics')">Lojistik & Boğaz Odaklı</button>
          <button class="tab" onclick="applyPresetWeights('generic')">Yerli Üretim & Muadil Odaklı</button>
          <button class="tab" onclick="applyPresetWeights('global')">Küresel Kriz (FDA) Odaklı</button>
        </div>
      </div>

      <div class="slider-container">
        <div class="slider-card">
          <div class="slider-card-head">
            <b>w₁: İthalat Bağımlılığı</b>
            <span class="slider-val-badge" id="val_w_import">%${w.w_import}</span>
          </div>
          <input type="range" id="slider_w_import" min="0" max="60" step="5" value="${w.w_import}" oninput="updateLiveWeight('w_import', this.value)">
          <small style="color:var(--muted); font-size:11px;">SGK Ek-4/A menşe statüsü (İthal vs Yerli İmalat)</small>
        </div>

        <div class="slider-card">
          <div class="slider-card-head">
            <b>w₂: Yerli Muadil Eksikliği</b>
            <span class="slider-val-badge" id="val_w_generic">%${w.w_generic}</span>
          </div>
          <input type="range" id="slider_w_generic" min="0" max="60" step="5" value="${w.w_generic}" oninput="updateLiveWeight('w_generic', this.value)">
          <small style="color:var(--muted); font-size:11px;">SGK Eşdeğer Grubu'ndaki alternatif jenerik sayısı</small>
        </div>

        <div class="slider-card">
          <div class="slider-card-head">
            <b>w₃: Küresel Kriz (FDA/EMA)</b>
            <span class="slider-val-badge" id="val_w_fda">%${w.w_fda}</span>
          </div>
          <input type="range" id="slider_w_fda" min="0" max="60" step="5" value="${w.w_fda}" oninput="updateLiveWeight('w_fda', this.value)">
          <small style="color:var(--muted); font-size:11px;">FDA Shortages ve TİTCK Yurt Dışı İlaç Listesi</small>
        </div>

        <div class="slider-card">
          <div class="slider-card-head">
            <b>w₄: Lojistik Darboğazı</b>
            <span class="slider-val-badge" id="val_w_logistics">%${w.w_logistics}</span>
          </div>
          <input type="range" id="slider_w_logistics" min="0" max="60" step="5" value="${w.w_logistics}" oninput="updateLiveWeight('w_logistics', this.value)">
          <small style="color:var(--muted); font-size:11px;">IMF PortWatch Süveyş/Kızıldeniz deniz gecikmesi (+16 gün)</small>
        </div>

        <div class="slider-card">
          <div class="slider-card-head">
            <b>w₅: Pazar/Tedarikçi Yoğunlaşması</b>
            <span class="slider-val-badge" id="val_w_concentration">%${w.w_concentration}</span>
          </div>
          <input type="range" id="slider_w_concentration" min="0" max="60" step="5" value="${w.w_concentration}" oninput="updateLiveWeight('w_concentration', this.value)">
          <small style="color:var(--muted); font-size:11px;">Tek tedarikçi veya lisans sahibi tekeli (Monopol)</small>
        </div>
      </div>

      <div class="weight-summary-bar">
        <div>
          <b>Toplam Ağırlık:</b> 
          <span style="font-size:16px; font-weight:700; color:${isBalanced ? '#15803d' : '#b45309'}; margin-left:6px;">%${totalW}</span>
          <span style="font-size:11px; margin-left:8px; color:var(--muted);">${isBalanced ? '✓ Ağırlıklar tam ve dengeli.' : '⚠ Ağırlıklar toplamı %100 değilse otomatik normalize edilir.'}</span>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="button secondary" onclick="applyPresetWeights('balanced')">Varsayılana Sıfırla</button>
          <button class="button" onclick="saveAndApplyWeights()">✓ Kaydet & Tüm Sistemde Uygula</button>
        </div>
      </div>
    </section>

    <section class="glass panel" style="margin-top:20px;">
      <h2>Anlık Risk Puanı ve Sıralama Önizlemesi (Canlı Hesaplama)</h2>
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th>Sıra</th>
              <th>İlaç (INN / Ticari Adı)</th>
              <th>Menşe Statüsü</th>
              <th>Yerli Muadil</th>
              <th>FDA Durumu</th>
              <th>C1 (İthalat)</th>
              <th>C2 (Muadil)</th>
              <th>C3 (Kriz)</th>
              <th>C4 (Lojistik)</th>
              <th>C5 (Monopol)</th>
              <th>Hesaplanan Risk</th>
              <th>Risk Durumu</th>
            </tr>
          </thead>
          <tbody>
            ${previewList.map((m, idx) => `
              <tr class="selectable" onclick="goToDrug('${m.name}')" style="cursor:pointer">
                <td><b>#${idx + 1}</b></td>
                <td><b>${esc(m.name)}</b><br><small style="color:var(--muted)">${esc(m.brand)}</small></td>
                <td><span class="badge ${m.origin === 'İMAL' ? 'resolved' : 'current'}">${esc(m.origin)}</span></td>
                <td>${m.localEquivCount > 0 ? `${m.localEquivCount} Muadil` : `<span style="color:var(--red); font-weight:700;">Yok (0)</span>`}</td>
                <td><small>${esc(m.fdaShortage)}</small></td>
                <td>${m.origin === 'İTHAL' ? 100 : (m.origin.includes('İTHAL') ? 60 : 20)}</td>
                <td>${m.localEquivCount === 0 ? 100 : (m.localEquivCount === 1 ? 75 : (m.localEquivCount === 2 ? 50 : 30))}</td>
                <td>${m.fdaShortage.includes('Active') ? 100 : (m.yurtDisiList.includes('Evet') ? 70 : 15)}</td>
                <td>${m.origin.includes('İTHAL') ? 85 : 65}</td>
                <td>${m.localEquivCount <= 1 ? 90 : (m.localEquivCount <= 3 ? 50 : 20)}</td>
                <td><b style="font-size:14px; color:${m.liveScore >= 75 ? 'var(--red)' : (m.liveScore >= 50 ? '#b45309' : 'var(--green)')}">${m.liveScore} / 100</b></td>
                <td>${getRiskPill(m.liveScore)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function updateLiveWeight(key, val) {
  state.riskWeights[key] = Number(val);
  const badge = document.querySelector(`#val_${key}`);
  if (badge) badge.textContent = `%${val}`;
  riskModelPage();
}

function applyPresetWeights(preset) {
  if (preset === 'balanced') {
    state.riskWeights = { w_import: 30, w_generic: 25, w_fda: 20, w_logistics: 15, w_concentration: 10 };
  } else if (preset === 'logistics') {
    state.riskWeights = { w_import: 20, w_generic: 15, w_fda: 15, w_logistics: 40, w_concentration: 10 };
  } else if (preset === 'generic') {
    state.riskWeights = { w_import: 20, w_generic: 40, w_fda: 15, w_logistics: 10, w_concentration: 15 };
  } else if (preset === 'global') {
    state.riskWeights = { w_import: 15, w_generic: 15, w_fda: 45, w_logistics: 15, w_concentration: 10 };
  }
  riskModelPage();
}

function saveAndApplyWeights() {
  alert('Ağırlık katsayıları kaydedildi ve Yeşil Reçete Analizi ile Kriz Simülasyonu sekmelerine başarıyla uygulandı!');
  riskModelPage();
}

// ==========================================================================
// 3. KÜRESEL LOJİSTİK & BOĞAZLAR (LOGISTICS TAB)
// ==========================================================================
const tuikTradeData = [
  { country: 'Almanya', share: 22.4, val: '1.054 Milyar $', role: 'Bitmiş İlaç & Orijinal Formülasyon' },
  { country: 'İsviçre', share: 14.1, val: '663 Milyon $', role: 'Biyoteknolojik & Psikotrop Orijinal' },
  { country: 'İtalya', share: 9.8, val: '461 Milyon $', role: 'Bitmiş İlaç & Enjeksiyonluk Flakon' },
  { country: 'ABD', share: 8.6, val: '405 Milyon $', role: 'Özel Yetim İlaçlar & Orijinal Moleküller' },
  { country: 'Fransa', share: 6.9, val: '325 Milyon $', role: 'Sedatif & Nörolojik Müstahzarlar' },
  { country: 'Hindistan', share: 4.8, val: '225 Milyon $', role: 'Aktif Hammadde (API) & Jenerik Bulk' },
  { country: 'Çin', share: 4.2, val: '197 Milyon $', role: 'Temel Kimyasallar & Ham API Bileşenleri' },
  { country: 'Diğer Ülkeler', share: 29.2, val: '1.370 Milyar $', role: 'İrlanda, Belçika, İspanya, Avusturya vb.' }
];

const portwatchData = [
  { name: 'Süveyş Kanalı & Babülmendep (Kızıldeniz)', status: 'KRİTİK DARBOĞAZ', drop: '-%64.2 Geçiş Düşüşü', delay: '+16 Gün Ek Rota (Ümit Burnu)', freight: '+%180 Konteyner Navlun Artışı', severity: 'high', impact: 'Hindistan ve Çin’den Türkiye’ye (Mersin, Ambarlı limanları) gelen aktif farmasötik hammadde (API) sevkiyatları 2-3 hafta gecikmektedir.' },
  { name: 'Hürmüz Boğazı (Basra Körfezi)', status: 'YÜKSEK GERİLİM', drop: '-%8.5 Geçiş Sapması', delay: '+3 Gün Gümrük Beklemesi', freight: '+%35 Sigorta Primi', severity: 'med', impact: 'Bölgesel petrokimya ve farmasötik ambalaj (blister folyosu, tıbbi polimer) sevkiyat koridoru risk altındadır.' },
  { name: 'İstanbul & Çanakkale Boğazları', status: 'NORMAL AKIŞ', drop: '-%2.1 Normal Dalgalanma', delay: '0 Gün (Standart Kılavuzluk)', freight: 'Standart', severity: 'low', impact: 'Karadeniz havzası ve iç dağıtım hatları olağan seyrindedir.' },
  { name: 'Cebelitarık Boğazı (Atlantik Girişi)', status: 'NORMAL AKIŞ', drop: '-%1.4 Normal Dalgalanma', delay: '0 Gün', freight: 'Standart', severity: 'low', impact: 'Batı Avrupa ve ABD transatlantik orijinal ilaç kargo akışı aktiftir.' }
];

function logisticsPage() {
  const guide = guideBanner(
    "TÜİK Dış Ticaret İstatistikleri (Fasıl 30 / HS 3004) ile IMF PortWatch deniz boğazları kriz takip sistemini entegre eden küresel lojistik izleme merkezidir.",
    "Türkiye'nin ilaç ithalatında hangi ülkelere bağımlı olduğunu ve Kızıldeniz/Süveyş gibi kritik boğazlardaki aksamaların Türkiye'ye hammadde akışını nasıl geciktirdiğini sunar.",
    "Ülke bazlı pazar paylarını inceleyin; deniz boğazı göstergeleri üzerinden Asya'dan gelen konteyner gecikme sürelerini (+gün) takip edin."
  );

  page.innerHTML = header('Küresel Lojistik & Ticaret Bağımlılığı', 'TÜİK GTİP 3004 ilaç ithalat menşeileri ve IMF PortWatch canlı deniz boğazı darboğaz verileri.') + guide + `
    <section class="grid stats">
      <article class="glass stat"><span class="stat-label">Yıllık Bitmiş İlaç İthalatı</span><strong>4.7 Milyar $</strong><small>TÜİK Fasıl 30 Verisi</small><span class="trend red">↗</span></article>
      <article class="glass stat"><span class="stat-label">Süveyş / Kızıldeniz Düşüşü</span><strong>-%64.2</strong><small>IMF PortWatch AIS Takibi</small><span class="trend red">↘</span></article>
      <article class="glass stat"><span class="stat-label">Asya API Rota Gecikmesi</span><strong>+16 Gün</strong><small>Ümit Burnu Bypass Rotası</small><span class="trend red">↗</span></article>
      <article class="glass stat"><span class="stat-label">Yerli İlaçta Hammadde İthalatı</span><strong>~%80+</strong><small>Çin & Hindistan Bağımlılığı</small><span class="trend">↗</span></article>
    </section>

    <section class="grid main-grid">
      <article class="glass panel">
        <h2>TÜİK: Türkiye İlaç İthalatının Menşe Ülke Dağılımı (Fasıl 30 / HS 3004)</h2>
        <div class="data-table">
          <table>
            <thead><tr><th>Ülke</th><th>Pay (%)</th><th>Yıllık Hacim</th><th>Tedarik Zincirindeki Rolü</th></tr></thead>
            <tbody>
              ${tuikTradeData.map(t => `
                <tr>
                  <td><b>${t.country}</b></td>
                  <td><div style="display:flex;align-items:center;gap:8px;"><b>%${t.share}</b><div style="width:60px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="width:${t.share * 3.5}px;height:100%;background:#0284c7"></div></div></div></td>
                  <td>${t.val}</td>
                  <td><small>${t.role}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </article>

      <article class="glass panel">
        <h2>Endüstri Mühendisliği Görüsü</h2>
        <div class="notice">
          <b>İkili Bağımlılık Paradoksu:</b> Türkiye, kutu bazında tüketilen ilaçların yaklaşık %48'ini yerli tesislerde üretmesine rağmen, bu üretimin gerektirdiği <b>aktif kimyasal hammaddelerin (API) %80'inden fazlasını</b> Çin ve Hindistan'dan ithal etmektedir. Dolayısıyla deniz boğazlarındaki lojistik tıkanıklık doğrudan yerli fabrikaları durdurma potansiyeline sahiptir.
        </div>
      </article>
    </section>

    <section class="glass panel" style="margin-top:20px;">
      <h2>IMF PortWatch: Küresel Deniz Boğazları & Lojistik Darboğaz Analizi</h2>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:14px;">
        ${portwatchData.map(p => `
          <div class="scenario-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <b style="font-size:13px; color:#0f172a;">${p.name}</b>
              <span class="risk-pill ${p.severity}">${p.status}</span>
            </div>
            <div style="font-size:12px; margin-bottom:6px;"><b>Gemi Trafik Sapması:</b> <span style="color:${p.severity === 'high' ? 'var(--red)' : 'var(--ink)'}">${p.drop}</span></div>
            <div style="font-size:12px; margin-bottom:6px;"><b>Ortalama Ek Gecikme:</b> <b>${p.delay}</b></div>
            <div style="font-size:12px; margin-bottom:8px;"><b>Navlun Etkisi:</b> ${p.freight}</div>
            <p style="font-size:11px; color:var(--muted); line-height:1.5; margin:0; border-top:1px dashed #cbd5e1; padding-top:8px;">${p.impact}</p>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

// ==========================================================================
// 4. KRİZ SİMÜLASYONU & KARAR DESTEK SİSTEMİ (SIMULATOR TAB)
// ==========================================================================
function simulatorPage() {
  const guide = guideBanner(
    "Endüstri Mühendisliği karar modelleriyle geliştirilmiş; jeopolitik kriz ve rota tıkanmalarının Türkiye ilaç arzına etkisini test eden dinamik 'What-If' simülatörüdür.",
    "Belirli bir kriz senaryosu tetiklendiğinde hangi yeşil reçeteli ilaçların ilk önce tükeneceğini (runout time) ve hangi ilacın yerine hangi muadilin önerildiğini modeller.",
    "Senaryo kartlarından birini seçin (ör. Süveyş Kanalı Kapanması); anlık hesaplanan yeni risk skorlarını ve karar destek aksiyonlarını inceleyin."
  );

  const scenarioMeta = {
    scenario1: {
      title: 'Senaryo 1: Kızıldeniz & Süveyş Boğazı Kapanması',
      subtitle: 'IMF PortWatch verisi temelli: Hindistan & Çin hammadde gemileri Ümit Burnu rotasına sapar; teslimat süresi +16 gün uzar.',
      shockDesc: 'Yerli formülasyon yapan Türk fabrikalarının API hammadde stokları 20 gün içinde tükenme eşiğine gelir.'
    },
    scenario2: {
      title: 'Senaryo 2: Batı Avrupa İhraç Kısıtı & Kur Şoku',
      subtitle: 'TÜİK Fasıl 30 verisi temelli: Almanya, İsviçre ve İtalya menşeli %100 ithal orijinal ilaçlarda %70 arz kesintisi.',
      shockDesc: 'Türkiye’de yerli muadili olmayan ithal yeşil reçeteli ilaçlar (Xanax, Concerta, Ativan) piyasada bulunamaz hale gelir.'
    },
    scenario3: {
      title: 'Senaryo 3: Küresel Etkin Madde & GMP Kriz Şoku',
      subtitle: 'FDA Drug Shortages temelli: Dünya genelinde ortak hammadde üreticilerinde GMP uyumsuzluğu veya üretim durdurma.',
      shockDesc: 'Hem ithal hem yerli piyasada ortak molekül (Metilfenidat, Klonazepam, Fentanil) krizi başlar.'
    }
  };

  const simResults = turkeyGreenMeds.map(m => {
    let shock = 0;
    let daysLeft = 60;
    let action = '';

    if (state.activeScenario === 'scenario1') {
      if (m.origin.includes('İMAL')) {
        shock = 35; // Yerli ama hammadde Asya'dan geliyor
        daysLeft = 24;
        action = `Yerli üretici ${m.manufacturer} ile acil güvenlik stoğu devreye sokulmalı; alternatif Asya hava kargo koridoru açılmalı.`;
      } else {
        shock = 10;
        daysLeft = 45;
        action = `Avrupa menşeli stoklar olağan seyrinde takip edilmeli.`;
      }
    } else if (state.activeScenario === 'scenario2') {
      if (m.origin.includes('İTHAL')) {
        shock = 45;
        daysLeft = 12;
        if (m.localEquivCount > 0) {
          action = `SGK Eşdeğer Grubu [${m.equivGroup}] üzerinden yerli muadillere reçete geçişi zorunlu kılınmalı.`;
        } else {
          action = `ACİL ALARM: Yerli muadili yok! TİTCK Yurt Dışı İlaç Listesi (Ek-1) kapsamında TEB aracılığıyla acil ithalat kotası tahsis edilmeli.`;
        }
      } else {
        shock = 5;
        daysLeft = 55;
        action = `Yerli üretim talebi karşılamak için vardiya artırmalıdır.`;
      }
    } else { // scenario3
      if (m.fdaShortage.includes('Active')) {
        shock = 40;
        daysLeft = 15;
        action = `Küresel FDA/EMA krizi Türkiye'ye sıçradı. İlacın klinik kullanımında ikinci basamak terapötik alternatif moleküllere geçilmeli.`;
      } else {
        shock = 15;
        daysLeft = 40;
        action = `Genel güvenlik stoğu %25 artırılmalı.`;
      }
    }

    const base = calculateDrugScore(m, state.riskWeights);
    const simRisk = Math.min(100, base + shock);
    return { ...m, baseRisk: base, simRisk, daysLeft, action };
  }).sort((a, b) => b.simRisk - a.simRisk);

  page.innerHTML = header('Kriz Simülasyonu & Karar Destek Masası', 'Gerçek lojistik ve ticaret verilerine dayalı "What-If" kesinti senaryoları simülatörü.') + guide + `
    <section class="glass panel">
      <h2>1. Kriz Senaryosu Seçimi</h2>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px; margin-top:12px;">
        <div class="scenario-card ${state.activeScenario === 'scenario1' ? 'active' : ''}" onclick="setScenario('scenario1')">
          <div style="font-size:11px; font-weight:700; color:#0284c7; margin-bottom:4px;">LOJİSTİK DARBOĞAZI</div>
          <b style="font-size:13px; display:block; margin-bottom:6px;">Kızıldeniz & Süveyş Boğazı Tıkanması</b>
          <p style="font-size:11px; color:var(--muted); margin:0;">Hindistan/Çin hammadde sevkiyatı +16 gün gecikir. Yerli fabrikalarda API kıtlığı başlar.</p>
        </div>
        <div class="scenario-card ${state.activeScenario === 'scenario2' ? 'active' : ''}" onclick="setScenario('scenario2')">
          <div style="font-size:11px; font-weight:700; color:#b45309; margin-bottom:4px;">DIŞ TİCARET & İTHALAT ŞOKU</div>
          <b style="font-size:13px; display:block; margin-bottom:6px;">Batı Avrupa İhraç Kısıtı & Kur Şoku</b>
          <p style="font-size:11px; color:var(--muted); margin:0;">Almanya, İsviçre ve İtalya'dan gelen %100 bitmiş ithal ilaç akışı %70 daralır.</p>
        </div>
        <div class="scenario-card ${state.activeScenario === 'scenario3' ? 'active' : ''}" onclick="setScenario('scenario3')">
          <div style="font-size:11px; font-weight:700; color:#b91c1c; margin-bottom:4px;">KÜRESEL KALİTE & GMP ŞOKU</div>
          <b style="font-size:13px; display:block; margin-bottom:6px;">FDA/EMA Ortak Hammadde Krizi</b>
          <p style="font-size:11px; color:var(--muted); margin:0;">FDA listesindeki etkin maddelerin küresel üretimi durur; tedarik zinciri felç olur.</p>
        </div>
      </div>
    </section>

    <section class="glass panel" style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <h2 style="margin:0">${scenarioMeta[state.activeScenario].title}</h2>
          <p style="font-size:12px; color:var(--muted); margin:4px 0 0;">${scenarioMeta[state.activeScenario].subtitle}</p>
        </div>
        <span class="badge current">Aktif Simülasyon</span>
      </div>

      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th>İlaç (INN / Marka)</th>
              <th>Menşe Statüsü</th>
              <th>Önceki Risk</th>
              <th>Simüle Edilmiş Risk</th>
              <th>Tahmini Stok Tükenme</th>
              <th>Endüstri Mühendisi Karar Destek Önerisi</th>
            </tr>
          </thead>
          <tbody>
            ${simResults.map(r => `
              <tr class="selectable" onclick="goToDrug('${r.name}')" style="cursor:pointer">
                <td><b>${esc(r.name)}</b><br><small style="color:var(--muted)">${esc(r.brand)}</small></td>
                <td><span class="badge ${r.origin === 'İMAL' ? 'resolved' : 'current'}">${esc(r.origin)}</span></td>
                <td><b>${r.baseRisk} / 100</b></td>
                <td><b style="color:${r.simRisk >= 85 ? 'var(--red)' : r.simRisk >= 65 ? '#b45309' : 'var(--green)'}; font-size:14px;">${r.simRisk} / 100</b></td>
                <td><b style="color:${r.daysLeft <= 15 ? 'var(--red)' : '#1e293b'}">${r.daysLeft} Gün</b></td>
                <td style="max-width:320px; font-size:11px; line-height:1.4;"><span style="color:#0369a1; font-weight:600;">⚡ Aksiyon:</span> ${esc(r.action)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function setScenario(sc) {
  state.activeScenario = sc;
  simulatorPage();
}

// ==========================================================================
// 5. İLAÇ İNCELEYİCİ & VERİ KÜMESİ (EXPLORER & DATASETS)
// ==========================================================================
async function explorer() {
  state.page = 1;
  await recordsPage('explorer');
}

async function recordsPage(mode = 'datasets') {
  const isExplorer = mode === 'explorer';
  const source = isExplorer ? '' : `&source=${encodeURIComponent(state.dataset)}`;
  const query = state.query ? `&q=${encodeURIComponent(state.query)}` : '';
  const gSearch = document.querySelector('#globalSearch');
  if (gSearch && gSearch.value !== state.query) gSearch.value = state.query;

  const guide = isExplorer
    ? guideBanner(
        "Sistemdeki tüm ilaç kayıtlarını tek tek arayıp derinlemesine profillerini inceleyebileceğiniz Birleşik İlaç Tarayıcısıdır.",
        "Seçilen ilacın FDA ruhsatını, NDC ambalaj kodlarını, geçmiş tedarik krizlerini, CMS Medicare harcama trendini ve VA sözleşme fiyatlarını tek ekranda bağlar.",
        "Arama kutusuna ilaç adı veya NDC yazın; sonuç listesinden ilacı seçerek 6 veri kaynağının çapraz eşleştiği birleşik profili görüntüleyin."
      )
    : guideBanner(
        "Sistemde kullanılan 6 ham veri kümesini (FDA, NDC, CMS, VA) kaynak bazında ayrı ayrı filtreleyip ham kayıtları inceleme alanıdır.",
        "Ham veritabanı bütünlüğünü, veri alanlarını (raw JSON) ve kaynak bazlı kayıt sayısını şeffaf biçimde sunar.",
        "Veri Kaynağı açılır kutusundan istediğiniz veri tabanını seçin; sayfalama butonlarıyla kayıtları tarayın."
      );

  page.innerHTML = header(isExplorer ? 'İlaç İnceleyici' : 'Veri Kümesi İnceleyici', isExplorer ? 'Bir ilacı seçin; FDA, NDC, tedarik sıkıntısı, CMS ve VA kayıtlarındaki ilişkileri görün.' : 'Kaynak dosyalarını açmadan kayıtları süzün ve ayrıntılarını inceleyin.') + guide + '<div class="empty glass">Kayıtlar yükleniyor…</div>';
  try {
    const data = await api(`/api/records?page=${state.page}&limit=25${source}${query}`);
    page.innerHTML = header(isExplorer ? 'İlaç İnceleyici' : 'Veri Kümesi İnceleyici', isExplorer ? 'Bir ilacı seçin; kaynaklardaki bütün ilişkili bilgileri aynı yerde görün.' : 'Kaynak dosyalarını açmadan kayıtları süzün ve ayrıntılarını inceleyin.') + guide + `
      <section class="glass panel">
        ${!isExplorer ? `<div class="controls" style="margin-bottom:14px"><label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--muted)">Veri Kaynağı: <select id="sourceSelect">${Object.entries(sourceNames).map(([k, v]) => `<option value="${k}" ${k === state.dataset ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>` : ''}
        <div class="data-table">
          <table>
            <thead>
              <tr>
                ${isExplorer ? `<th>İlaç / Ürün</th><th>Üretici / Tedarikçi</th><th>NDC</th><th>Sıkıntı Nedeni</th>` : `<th>İlaç / Ürün</th><th>Üretici / Tedarikçi</th><th>NDC</th><th>Yıl</th><th>Durum</th><th>Sıkıntı Nedeni</th><th>Kaynak</th>`}
              </tr>
            </thead>
            <tbody>${recordRows(data.rows, true, isExplorer)}</tbody>
          </table>
        </div>
        <div class="pagination">
          <span>${data.total.toLocaleString('tr-TR')} kayıttan ${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)}</span>
          <div>
            <button class="button secondary" id="prev" ${data.page === 1 ? 'disabled' : ''}>← Önceki</button>
            <button class="button secondary" id="next" ${data.page * data.limit >= data.total ? 'disabled' : ''}>Sonraki →</button>
          </div>
        </div>
      </section>`;
    document.querySelector('#sourceSelect')?.addEventListener('change', e => { state.dataset = e.target.value; state.page = 1; recordsPage(mode); });
    document.querySelector('#prev').onclick = () => { state.page--; recordsPage(mode); };
    document.querySelector('#next').onclick = () => { state.page++; recordsPage(mode); };
    document.querySelectorAll('tr.selectable').forEach(row => row.onclick = () => detail(row.dataset.id));
  } catch (error) { page.innerHTML = header(isExplorer ? 'İlaç İnceleyici' : 'Veri Kümesi İnceleyici', '') + guide + dbMessage(error); }
}

function renderGreenDetail(m) {
  const isZeroEquiv = m.localEquivCount === 0;
  const isImported = m.origin.includes('İTHAL');
  const liveScore = calculateDrugScore(m, state.riskWeights);
  const riskClass = liveScore >= 75 ? 'high' : (liveScore >= 50 ? 'med' : 'low');
  const riskLabel = liveScore >= 75 ? 'KRİTİK' : (liveScore >= 50 ? 'ORTA' : 'DÜŞÜK');

  page.innerHTML = header(
    `${m.name} (${m.brand})`,
    'T.C. Sağlık Bakanlığı TİTCK Yeşil Reçete & SGK Ek-4/A Ulusal Tedarik Kriz Profili'
  ) + `
    <div style="margin-bottom:16px;">
      <button class="button secondary" onclick="shortagePageV2()" style="font-size:12px;">← Tedarik Sıkıntısı V2'ye Dön</button>
      <button class="button" onclick="goToDrug('${m.name}')" style="font-size:12px; margin-left:8px;">🌐 Birleşik İlaç Profilinde Ara →</button>
    </div>

    <section class="glass panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; border-bottom:1px solid rgba(0,0,0,0.06); padding-bottom:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:24px;">🟢</span>
          <div>
            <h2 style="margin:0; font-size:18px; font-family:Outfit;">${esc(m.brand)} <span style="font-size:13px; color:var(--muted); font-weight:normal;">(${esc(m.name)})</span></h2>
            <div style="font-size:12px; color:#475569; margin-top:2px;">
              SGK Barkod: <code>${esc(m.barcode)}</code> · WHO ATC: <span class="source-tag">${esc(m.atc)}</span> · Üretici: <b>${esc(m.manufacturer)}</b>
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge ${isImported ? 'current' : 'resolved'}" style="font-size:12px; padding:6px 12px;">
            ${esc(m.origin)}
          </span>
          <span class="risk-pill ${riskClass}" style="font-size:12px; padding:6px 12px;">
            ${riskLabel} (${liveScore})
          </span>
        </div>
      </div>

      <div class="detail-grid">
        ${field('Etkin Madde (INN)', m.name, 'TİTCK Yeşil Reçete')}
        ${field('Müstahzar Adı', m.brand, 'SGK Ek-4/A')}
        ${field('Menşe Statüsü', m.origin, 'Ruhsat')}
        ${field('Ruhsat Sahibi / Üretici', m.manufacturer, 'TİTCK')}
        ${field('SGK Barkod (GTIN)', m.barcode, 'SGK')}
        ${field('SGK Eşdeğer Grubu', m.equivGroup, 'SGK Geri Ödeme')}
        ${field('Yerli Muadil Sayısı', isZeroEquiv ? '0 Yerli Muadil (Kritik Monopol)' : `${m.localEquivCount} Yerli Muadil`, isZeroEquiv ? 'Kritik Risk' : 'Mevcut')}
        ${field('SGK Ek-1 Yurt Dışı İlaç', m.yurtDisiList, 'SGK Kriz Protokolü')}
        ${field('FDA Kriz Eşleşmesi', m.fdaShortage, 'openFDA')}
        ${field('FDA Kriz / Kök Neden', m.fdaReason, 'openFDA')}
      </div>
    </section>

    <section class="grid main-grid" style="margin-top:18px;">
      <article class="glass panel">
        <h2>🇹🇷 Türkiye Ulusal Tedarik Kriz Değerlendirmesi</h2>
        <div style="padding:14px; border-radius:10px; background:${isZeroEquiv ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${isZeroEquiv ? '#fecaca' : '#bbf7d0'}; margin-top:12px;">
          <b style="color:${isZeroEquiv ? '#991b1b' : '#166534'}; font-size:13px;">
            ${isZeroEquiv ? '🚨 Kritik İthalat Bağımlılığı & Monopol Riski:' : '🟢 Güvenceli Ulusal İmalat / Muadil Kapasitesi:'}
          </b>
          <p style="font-size:12px; color:#1e293b; margin:6px 0 0 0; line-height:1.5;">
            ${isZeroEquiv 
              ? `Bu molekül Türkiye'de <b>0 yerli muadile</b> sahiptir ve tamamen <b>${esc(m.manufacturer)}</b> tarafından yurt dışından ithal edilmektedir. Tedarik zincirindeki herhangi bir aksamada serbest eczanelerde ve kliniklerde anında yokluğa düşmekte, hastalar SGK Ek-1 yurt dışı ilaç listesi ve TEB acil ithalat protokolüne mecbur kalmaktadır.` 
              : `Bu molekülün Türkiye pazarında <b>${m.localEquivCount} adet yerli üretilmiş muadili</b> bulunmaktadır. İthalat kesintilerinde yerli imalatçılar devreye sokularak kriz hızla absorbe edilebilir.`}
          </p>
        </div>

        <div style="margin-top:14px;">
          <h3 style="font-size:13px; font-family:Outfit; margin-bottom:6px;">Önerilen Endüstri Mühendisliği Aksiyon Planı</h3>
          <div style="font-size:12px; line-height:1.5; color:#334155;">
            ${isZeroEquiv ? `
              <b>1. SGK Ek-1 & TEB Acil İthalat:</b> Tedarik kesintisi halinde TEB üzerinden acil kota temini.<br>
              <b>2. Alternatif Fason / Yerli Lisanslama:</b> TİTCK tarafından yerli üreticilere eşdeğer ruhsatlandırma teşviki sağlanması.<br>
              <b>3. Emniyet Stoğu Güvencesi:</b> Depocularda en az 90 günlük tampon stok bulundurulması.
            ` : `
              <b>1. Yerli Üretici Kota Tahsisi:</b> İthal ürün aksadığında yerli üreticilere üretim kotası aktarımı.<br>
              <b>2. İTS Stok İzleme:</b> İl bazlı stok dengesizliklerinin önlenmesi.<br>
              <b>3. Dinamik Sipariş Noktası (ROP):</b> Düzenli talep projeksiyonlarıyla stok optimizasyonu.
            `}
          </div>
        </div>
      </article>

      <article class="glass panel">
        <h2>📊 Çok Kriterli Karar Verme (MCDM) Risk Puanı Analizi</h2>
        <div style="font-size:12.5px; color:#475569; margin-top:8px;">
          Canlı Hesaplanan Kırılganlık Skoru: <span class="risk-pill ${riskClass}" style="font-size:13px; padding:4px 10px;">${riskLabel} (${liveScore}/100)</span>
        </div>
        <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; font-size:12px;">
            <span>İthalat Bağımlılığı Kriteri (w₁=%${state.riskWeights.w_import}):</span>
            <b>${isImported ? '100 / 100' : '20 / 100'}</b>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px;">
            <span>Yerli Muadil Yokluğu Kriteri (w₂=%${state.riskWeights.w_generic}):</span>
            <b>${isZeroEquiv ? '100 / 100 (0 Muadil)' : `${Math.max(10, 100 - m.localEquivCount * 25)} / 100`}</b>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px;">
            <span>FDA Küresel Kriz Kriteri (w₃=%${state.riskWeights.w_fda}):</span>
            <b>${m.fdaShortage.includes('Active') ? '100 / 100' : (m.yurtDisiList.includes('Evet') ? '70 / 100' : '15 / 100')}</b>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px;">
            <span>Lojistik Boğaz Riski (w₄=%${state.riskWeights.w_logistics}):</span>
            <b>${isImported ? '85 / 100' : '40 / 100'}</b>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12px;">
            <span>Pazar Konsantrasyonu / Monopol (w₅=%${state.riskWeights.w_concentration}):</span>
            <b>${isZeroEquiv ? '90 / 100' : '30 / 100'}</b>
          </div>
        </div>
        <button class="button secondary" onclick="location.hash='#riskmodel'" style="margin-top:16px; font-size:11px; width:100%;">
          ⚙ Risk Ağırlıklarını Risk Modeli Sekmesinde Düzenle →
        </button>
      </article>
    </section>
  `;
}

async function detail(id) {
  if (typeof id === 'string' && id.startsWith('green-')) {
    const medKey = id.replace('green-', '').toUpperCase();
    const m = turkeyGreenMeds.find(x => x.name.toUpperCase() === medKey) || getTurkeyGreenMed(medKey);
    if (m) {
      renderGreenDetail(m);
      return;
    }
  }

  page.innerHTML = header('Birleşik İlaç Profili', 'Seçili kayıt ve kaynaklar arası ilişkiler yükleniyor…') + '<div class="empty glass">Yükleniyor…</div>';
  try {
    const data = await api(`/api/records/${id}`);
    const r = data.record;
    const greenMatch = getTurkeyGreenMed(r.generic_name || '') || getTurkeyGreenMed(r.brand_name || '');
    const groups = Object.groupBy(data.related, x => x.source);
    page.innerHTML = header(label(r), 'FDA, NDC, tedarik sıkıntısı, CMS ve VA kaynaklarındaki mevcut kayıtlar.') + `
      ${greenMatch ? `
        <div class="glass panel" style="margin-bottom:18px; padding:14px 20px; border-left:4px solid #10b981; background:linear-gradient(135deg, rgba(236, 253, 245, 0.9), rgba(240, 249, 255, 0.8));">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:18px;">🟢</span>
                <b style="font-size:13px; color:#065f46; font-family:Outfit;">T.C. Sağlık Bakanlığı TİTCK Yeşil Reçete & SGK Eşleşmesi</b>
                <span class="badge ${greenMatch.origin.includes('İTHAL') ? 'current' : 'resolved'}" style="font-size:10px;">${esc(greenMatch.origin)}</span>
              </div>
              <div style="font-size:11.5px; color:#334155; margin-top:4px;">
                TR Müstahzar: <b>${esc(greenMatch.brand)}</b> (${esc(greenMatch.manufacturer)}) · Barkod: <code>${esc(greenMatch.barcode)}</code> · 
                ${greenMatch.localEquivCount === 0 ? '<b style="color:#b91c1c;">0 Yerli Muadil (Kritik İthal Bağımlısı)</b>' : `<b style="color:#047857;">${greenMatch.localEquivCount} Yerli Muadil</b>`} · 
                SGK: ${esc(greenMatch.equivGroup)} ${greenMatch.yurtDisiList !== 'Hayır' ? `· SGK Ek-1: <b>${esc(greenMatch.yurtDisiList)}</b>` : ''}
              </div>
            </div>
            <button class="button" style="padding:4px 12px; font-size:11px;" onclick="detail('green-${greenMatch.name.toLowerCase()}')">Ulusal Kriz Raporunu Aç →</button>
          </div>
        </div>
      ` : ''}
      <section class="glass panel">
        <div class="detail-grid">
          ${field('Jenerik Ad', r.generic_name, r.source)}
          ${field('Marka Adı', r.brand_name, r.source)}
          ${field('Üretici', r.manufacturer, r.source)}
          ${field('Tedarikçi', r.vendor, r.source)}
          ${field('NDC', r.ndc || r.product_ndc || r.package_ndc, r.source)}
          ${field('Başvuru Numarası', r.application_no, r.source)}
          ${field('Tedarik Sıkıntısı Durumu', r.shortage_status || (greenMatch ? (greenMatch.localEquivCount === 0 ? 'İthal Bağımlısı (0 Muadil)' : 'Kontrole Tabi') : ''), r.source)}
          ${field('Rapor Yılı', r.report_year, r.source)}
          ${field('Tedarik Sıkıntısı Nedeni', r.shortage_reason || (greenMatch && greenMatch.localEquivCount === 0 ? 'Tek İthal Tedarikçi Bağımlılığı & Yerli Muadil Yokluğu (SGK Ek-1)' : ''), r.source)}
        </div>
      </section>
      <section class="grid main-grid">
        <article class="glass panel">
          <h2>Kaynaklar Arası Eşleşme Durumu</h2>
          ${Object.entries(sourceNames).map(([key, value]) => `
            <div class="source-item">
              <span class="source-icon">${groups[key]?.length ? '✓' : '—'}</span>
              <b>${value}</b>
              <small>${groups[key]?.length ? `${groups[key].length} eşleşen kayıt` : 'Eşleşen kayıt yok'}</small>
            </div>
          `).join('')}
        </article>
        <article class="glass panel">
          <h2>İlişkili Tedarik Sıkıntısı Geçmişi</h2>
          ${groups['Drug Shortages']?.length ? `<table><thead><tr><th>İlaç</th><th>Durum</th><th>Sıkıntı Nedeni</th></tr></thead><tbody>${groups['Drug Shortages'].map(x => `<tr><td>${esc(label(x))}</td><td>${badge(x.shortage_status)}</td><td>${x.shortage_reason ? `<span class="reason-badge">${esc(x.shortage_reason)}</span>` : '<span style="color:var(--muted)">—</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Eşleşen tedarik sıkıntısı kaydı yok.</p>'}
        </article>
      </section>`;
  } catch (error) { page.innerHTML = header('Birleşik İlaç Profili', '') + dbMessage(error); }
}

// ==========================================================================
// 6. TEDARİK SIKINTISI, TALEP, TEDARİKÇİ, KARŞILAŞTIRMA & EDA
// ==========================================================================
function shortageTable(rows) {
  if (!rows.length) return '<p class="empty notice">Eşleşen tedarik sıkıntısı kaydı bulunamadı.</p>';
  return `<div class="data-table"><table><thead><tr><th>İlaç / Ürün</th><th>Üretici</th><th>NDC</th><th>Durum</th><th>Sıkıntı Nedeni</th><th>Yıl</th></tr></thead><tbody>${rows.map(r => `<tr data-id="${r.id}" class="selectable"><td class="drug-cell"><b>${esc(label(r))}</b><small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small></td><td>${esc(r.manufacturer || r.vendor || '—')}</td><td>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</td><td>${badge(r.shortage_status)}</td><td><span class="reason-badge">${esc(r.shortage_reason || 'Belirtilmemiş')}</span></td><td>${esc(r.report_year || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function scopedTable(rows, emptyText) {
  if (!rows.length) return `<p class="empty notice">${emptyText}</p>`;
  return `<div class="data-table"><table><thead><tr><th>İlaç / Ürün</th><th>Üretici / Tedarikçi</th><th>NDC</th><th>Yıl</th></tr></thead><tbody>${rows.map(r => `<tr data-id="${r.id}" class="selectable"><td class="drug-cell"><b>${esc(label(r))}</b><small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small></td><td>${esc(r.manufacturer || r.vendor || '—')}</td><td>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</td><td>${esc(r.report_year || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

let currentShortageQuery = '', currentShortageStatus = '';
let currentSupplierQuery = '';
let currentDemandQuery = '';

async function shortagePage(query = '', status = '') {
  currentShortageQuery = query; currentShortageStatus = status;
  const guide = guideBanner(
    "ABD FDA Drug Shortages veri tabanındaki güncel ve çözülmüş tüm ilaç tedarik krizlerini kök nedenleriyle analiz eden sekmedir.",
    "İlaçların neden tükendiğini (etkin madde eksikliği, talep artışı, lojistik gecikme, GMP fabrika uyumsuzluğu) ve krizin süresini gösterir.",
    "Durum filtresinden 'Güncel' veya 'Çözüldü' seçin; arama kutusuyla ilgilendiğiniz ilacın dünyadaki tedarik kriz geçmişini denetleyin."
  );

  page.innerHTML = header('Tedarik Sıkıntısı Analizi', 'FDA Drug Shortages kayıtlarını durum, neden, ilaç, NDC ve şirket bilgileriyle inceleyin.') + guide + '<div class="empty glass">Kayıtlar yükleniyor…</div>';
  try {
    const [summary, data] = await Promise.all([api('/api/analytics/shortages'), api(`/api/records?source=Drug%20Shortages&limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}${status ? `&status=${encodeURIComponent(status)}` : ''}`)]);
    page.innerHTML = header('Tedarik Sıkıntısı Analizi', 'FDA Drug Shortages kayıtlarını durum, neden, ilaç, NDC ve şirket bilgileriyle inceleyin.') + guide + `
      <section class="glass panel">
        <div class="controls" style="margin-bottom:14px"><label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--muted)">Durum Süzgeci: <select id="shortageStatus"><option value="">Tüm durumlar</option><option value="Current" ${status === 'Current' ? 'selected' : ''}>Güncel (Devam Eden)</option><option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>Çözüldü</option></select></label></div>
        <div class="grid main-grid"><article><h2>Durum Özeti</h2>${chart(summary.status)}</article><article><h2>Öne Çıkan Kök Nedenler</h2>${chart(summary.reasons)}</article></div>
        <h2 style="margin-top:22px">Eşleşen FDA Tedarik Sıkıntısı Kayıtları · ${data.total.toLocaleString('tr-TR')}</h2>
        ${shortageTable(data.rows)}
      </section>`;
    document.querySelector('#shortageStatus')?.addEventListener('change', e => shortagePage(document.querySelector('#globalSearch')?.value.trim() || '', e.target.value));
    bindDetails();
  } catch (error) { page.innerHTML = header('Tedarik Sıkıntısı Analizi', '') + guide + dbMessage(error); }
}

let currentShortageV2Query = '';
let currentShortageV2Source = 'Drug Shortages'; // Varsayılan: FDA Resmi Kriz Veri Tabanı
let currentShortageV2Status = '';
let currentShortageV2Reason = '';
let currentShortageV2Category = '';
let currentShortageV2Availability = '';
let currentShortageV2Risk = '';
let currentShortageV2Limit = 25;
let currentShortageV2Page = 1;

const fdaTherapeuticCategories = [
  'Analgesia/Addiction',
  'Anesthesia',
  'Anti-Infective',
  'Antiviral',
  'Cardiovascular',
  'Dermatology',
  'Endocrinology/Metabolism',
  'Gastroenterology',
  'Hematology',
  'Medical Imaging',
  'Neurology',
  'Oncology',
  'Ophthalmology',
  'Other',
  'Pediatric',
  'Psychiatry',
  'Pulmonary/Allergy',
  'Renal',
  'Rheumatology',
  'Transplant'
];

const fdaReasonDescriptions = {
  'Demand increase for the drug': 'İlaç Talep Artışı / Kapasite Yetersizliği',
  'Shortage of an active ingredient': 'Aktif Etken Madde (API) Tedarik Darboğazı',
  'Discontinuation of the manufacture of the drug': 'Üretimin Durdurulması / Piyasadan Çekilme',
  'Delay in shipping of the drug': 'Sevkiyat ve Lojistik Gecikmesi',
  'Requirements related to complying with good manufacturing practices': 'GMP ve Fabrika Kalite Standartları Uyumsuzluğu',
  'Shortage of an inactive ingredient component': 'Yardımcı Madde / Flakon Eksikliği',
  'Regulatory delay': 'Mevzuat ve Ruhsatlandırma Gecikmesi',
  'Other': 'Diğer Operasyonel Nedenler',
  'Belirtilmemiş': 'Belirtilmemiş (Veri Bekleniyor)',
  'Not available': 'Kayıtlarda Belirtilmemiş'
};

window.setShortageV2Source = function(src) {
  currentShortageV2Source = src;
  currentShortageV2Page = 1;
  shortagePageV2();
};

window.setShortageV2Reason = function(reason) {
  if (currentShortageV2Reason === reason) {
    currentShortageV2Reason = '';
  } else {
    currentShortageV2Reason = reason;
  }
  currentShortageV2Page = 1;
  shortagePageV2();
};

window.setShortageV2Category = function(cat) {
  currentShortageV2Category = (currentShortageV2Category === cat) ? '' : cat;
  currentShortageV2Page = 1;
  shortagePageV2();
};

window.setShortageV2Availability = function(av) {
  currentShortageV2Availability = (currentShortageV2Availability === av) ? '' : av;
  currentShortageV2Page = 1;
  shortagePageV2();
};

function classifyShortageReason(reasonStr) {
  const r = (reasonStr || '').toLowerCase();
  if (r.includes('tek ithal') || r.includes('ithal bağımlı') || r.includes('0 muadil') || r.includes('ek-1')) {
    return {
      key: 'import_zero',
      label: 'İthal Bağımlılığı (0 Yerli Muadil)',
      action: 'SGK Ek-1 Yurt Dışı İlaç Protokolü & TEB Acil Temin',
      actionDetail: '0 yerli muadilli %100 ithal ilacı; TEB acil ithalat protokolü ve yerli fason üretim lisanslama teşviki.',
      weight: 35
    };
  }
  if (r.includes('active ingredient') || r.includes('ingredient')) {
    return {
      key: 'api',
      label: 'Hammadde / API Sıkıntısı',
      action: 'Dual-Sourcing: İkincil API Üreticisi & Emniyet Stoğu Katsayısı (Z=2.33) Artırımı',
      actionDetail: 'İkincil API tedarikçisi sertifikasyonu hızlandırılmalı; emniyet stoğu %99 servis düzeyine çıkarılmalı.',
      weight: 30
    };
  }
  if (r.includes('shipping') || r.includes('delay') || r.includes('transit')) {
    return {
      key: 'logistics',
      label: 'Lojistik & Boğaz Gecikmesi',
      action: 'Lead Time Tamponu (+21 Gün) & Sipariş Noktası (ROP) Güncellemesi',
      actionDetail: 'Süveyş/Ümit Burnu sapması kaynaklı gecikme için ROP = d·L + SS formülünde teslim süresi 21 gün öne çekilmeli.',
      weight: 22
    };
  }
  if (r.includes('good manufacturing') || r.includes('gmp') || r.includes('complying') || r.includes('practices')) {
    return {
      key: 'gmp',
      label: 'GMP & Kalite Uyumsuzluğu',
      action: 'Eşdeğer Fason Tesis İkamesi & Hızlı Validasyon',
      actionDetail: 'TİTCK / FDA onaylı alternatif fason üretim tesisine lisans transferi ve parti serbest bırakma önceliği.',
      weight: 26
    };
  }
  if (r.includes('demand')) {
    return {
      key: 'demand',
      label: 'Talep Sıçraması & Kapasite',
      action: 'Dinamik Tayınlama (Rationing) & Kota Tahsisi',
      actionDetail: 'Hastane ve serbest eczanelere geçmiş tüketim katsayılı kota tahsisi yapılarak spekülatif stoklama engellenmeli.',
      weight: 18
    };
  }
  if (r.includes('discontinu')) {
    return {
      key: 'discontinued',
      label: 'Piyasadan Çekilme / Ruhsat',
      action: 'Ek-1 Yurt Dışı İlaç & SGK Muadil Geçişi',
      actionDetail: 'SGK eşdeğer grubundaki yerli alternatiflere reçete yönlendirmesi; muadil yoksa TEB acil ithalat protokolü.',
      weight: 28
    };
  }
  return {
    key: 'other',
    label: 'Diğer / Operasyonel Neden',
    action: 'Tedarikçi İstihbaratı & Yakın İzleme',
    actionDetail: 'Pazar yoğunlaşması ve tedarikçi stok hareketleri düzenli SCOR metrikleriyle takip edilmeli.',
    weight: 12
  };
}

function enrichShortageRecord(r) {
  let reasonText = getShortageReason(r) || r.shortage_reason || '';
  const greenMatch = getTurkeyGreenMed(r.generic_name || '') || getTurkeyGreenMed(r.brand_name || '') || getTurkeyGreenMed(r.search_text || '');
  const isGreen = Boolean(greenMatch) || greenMeds.test(r.generic_name || '') || greenMeds.test(r.brand_name || '');
  const isDirectShortage = r.source === 'Drug Shortages';
  const isCurrent = String(r.shortage_status || '').toLowerCase() === 'current';
  const isResolved = String(r.shortage_status || '').toLowerCase() === 'resolved';

  let displayStatus = 'Rutin Tedarik';
  let statusBadgeHtml = '';
  let score = 20;
  let tier = 'low';
  let tierLabel = 'DÜŞÜK';
  let finalAction = '';
  let finalActionDetail = '';
  let categoryKey = 'normal';
  let categoryLabel = 'Rutin Tedarik';

  // 1. Check if matching Turkey Green Prescription drug
  if (greenMatch) {
    if (greenMatch.origin.includes('İTHAL') && greenMatch.localEquivCount === 0) {
      displayStatus = 'İthal Bağımlısı (0 Muadil)';
      statusBadgeHtml = '<span class="badge current" style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-weight:700;">İthal Bağımlısı (0 Muadil)</span>';
      reasonText = (reasonText && reasonText !== 'Belirtilmemiş' && !reasonText.includes('Stabil'))
        ? `${reasonText} & Tek İthal Bağımlılığı (0 Muadil - SGK Ek-1)`
        : 'Tek İthal Tedarikçi Bağımlılığı & Yerli Muadil Yokluğu (SGK Ek-1 Dönemsel İthalat)';
      score = 82;
      tier = 'high';
      tierLabel = 'KRİTİK';
      categoryKey = 'import_zero';
      categoryLabel = 'İthal Bağımlılığı (0 Muadil)';
      finalAction = 'SGK Ek-1 Yurt Dışı İlaç Protokolü & TEB Acil Temin / Alternatif Üretici Lisanslaması';
      finalActionDetail = `Türkiye'de 0 yerli muadili olan %100 ithal yeşil reçete ilacı (${greenMatch.brand}). İthalat aksamasında TEB Ek-1 acil temini devreye alınmalı ve yerli eşdeğer üretimi teşvik edilmelidir.`;
    } else if (greenMatch.fdaShortage.includes('Active') || isCurrent) {
      displayStatus = 'Aktif Kriz (Yeşil Reçete)';
      statusBadgeHtml = '<span class="badge current" style="background:#fff1f2;color:#be123c;border:1px solid #fda4af;font-weight:700;">Aktif Kriz (Yeşil Reçete)</span>';
      reasonText = (greenMatch.fdaReason && !greenMatch.fdaReason.includes('Stabil')) ? greenMatch.fdaReason : (reasonText || 'Küresel FDA Kriz Eşleşmesi');
      score = 90;
      tier = 'high';
      tierLabel = 'KRİTİK';
      categoryKey = 'green_active';
      categoryLabel = 'Aktif Kriz (Yeşil Reçete)';
      finalAction = 'Dual-Sourcing & TİTCK Acil Kota Tahsisi';
      finalActionDetail = `${greenMatch.fdaReason || 'Küresel FDA kriz kaydı'} nedeniyle tedarik darboğazında; ulusal kotalar ve emniyet stokları azami seviyeye çıkarılmalıdır.`;
    } else if (greenMatch.origin.includes('İMAL')) {
      displayStatus = `Yerli İmalat (${greenMatch.localEquivCount} Muadil)`;
      statusBadgeHtml = `<span class="badge resolved" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-weight:600;">Yerli İmalat (${greenMatch.localEquivCount} Muadil)</span>`;
      reasonText = greenMatch.fdaReason || reasonText || 'Yerli İmalat Kapasitesi (Ulusal Kota Takibi)';
      score = 42;
      tier = 'med';
      tierLabel = 'ORTA';
      categoryKey = 'local_prod';
      categoryLabel = 'Yerli İmalat (Güvenceli)';
      finalAction = 'Yerli Üretim Kota Takibi & TİTCK Dağıtım Denetimi';
      finalActionDetail = `Ulusal imalat mevcuttur (${greenMatch.localEquivCount} yerli muadil); serbest eczane ve hastane stokları TİTCK İTS üzerinden düzenli izlenmelidir.`;
    } else {
      displayStatus = `İthal (${greenMatch.localEquivCount} Muadil)`;
      statusBadgeHtml = `<span class="badge" style="background:#fefce8;color:#a16207;border:1px solid #fef08a;font-weight:600;">İthal (${greenMatch.localEquivCount} Muadil)</span>`;
      reasonText = greenMatch.fdaReason || reasonText || 'İthal Tedarik & Kısıtlı Muadil Riski';
      score = 65;
      tier = 'med';
      tierLabel = 'ORTA';
      categoryKey = 'import_limited';
      categoryLabel = 'İthal Tedarik (Muadilli)';
      finalAction = 'Yerli Muadil Kotası & Eşdeğer Geçiş Protokolü';
      finalActionDetail = `İthal tedarik aksamalarına karşı yerli muadillere (${greenMatch.localEquivCount} muadil) reçete yönlendirmesi ve güvenlik stoğu artırımı sağlanmalıdır.`;
    }
  } else {
    // Standard FDA or catalog item
    const classification = classifyShortageReason(reasonText);
    const hasShortageReason = Boolean(reasonText && reasonText.trim() && reasonText !== 'Belirtilmemiş');

    if (isCurrent) {
      displayStatus = 'Güncel Kriz';
      statusBadgeHtml = '<span class="badge current">Güncel Kriz</span>';
    } else if (isResolved) {
      displayStatus = 'Çözüldü';
      statusBadgeHtml = '<span class="badge resolved">Çözüldü</span>';
    } else if (hasShortageReason) {
      displayStatus = 'Kriz Riski / Eşleşti';
      statusBadgeHtml = '<span class="badge current" style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;">Kriz Eşleşmesi</span>';
    } else if (isGreen) {
      displayStatus = 'Kontrole Tabi';
      statusBadgeHtml = '<span class="badge" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;">Kontrole Tabi</span>';
    } else {
      displayStatus = 'Rutin Tedarik';
      statusBadgeHtml = '<span class="badge neutral" style="background:#f0f9ff;color:#0284c7;border:1px solid #bae6fd;">Rutin Tedarik</span>';
    }

    if (isCurrent) score += 40;
    else if (hasShortageReason) score += 28;
    else if (isResolved) score += 10;

    if (hasShortageReason) score += classification.weight;
    if (isGreen) score += 22;

    score = Math.min(100, Math.max(12, score));

    if (score >= 75) {
      tier = 'high';
      tierLabel = 'KRİTİK';
    } else if (score >= 50) {
      tier = 'med';
      tierLabel = 'YÜKSEK';
    } else if (score >= 30) {
      tier = 'med';
      tierLabel = 'ORTA';
    }

    finalAction = classification.action;
    finalActionDetail = classification.actionDetail;
    if (!hasShortageReason && !isCurrent && !isResolved) {
      if (isGreen) {
        finalAction = 'Kontrole Tabi Takip: Yıllık TİTCK kota ve tüketim projeksiyonu';
        finalActionDetail = 'Yeşil reçeteli kısıtlı molekül; reçetesiz ve izinsiz temin edilemez, stok güvenliği kritik seviyede tutulmalı.';
      } else {
        finalAction = 'Rutin Tedarik İzleme: Standart Sipariş Verme Noktası (ROP)';
        finalActionDetail = 'Tedarik zincirinde aktif kesinti veya bildirilmiş küresel kriz kaydı bulunmuyor.';
      }
    }

    categoryKey = hasShortageReason ? classification.key : (isGreen ? 'green_rx' : 'normal');
    categoryLabel = hasShortageReason ? classification.label : (isGreen ? 'Kontrole Tabi Molekül' : 'Rutin Tedarik');
  }

  const rj = r.raw_json || {};
  let therapeuticCategory = rj.therapeutic_category || rj['Therapeutic category'] || (greenMatch ? 'Psikotrop & Narkotik (Yeşil Reçete)' : null);
  if (Array.isArray(therapeuticCategory)) {
    therapeuticCategory = therapeuticCategory.join(', ');
  }
  const presentation = rj.presentation || rj['Presentation'] || rj.dosage_form || rj['Dosage form'] || (greenMatch ? `${greenMatch.brand} (${greenMatch.origin}) - SGK: ${greenMatch.equivGroup}` : '—');
  const availability = rj.availability || rj['Availability'] || (greenMatch ? (greenMatch.localEquivCount === 0 && greenMatch.origin.includes('İTHAL') ? 'Unavailable / Limited' : (greenMatch.fdaShortage.includes('Active') ? 'Limited Availability' : 'Available')) : null);
  const updateDate = rj.update_date || rj['Updated'] || (r.report_year ? String(r.report_year) : (greenMatch ? '2026 (TİTCK / SGK)' : '—'));
  const initialDate = rj.initial_posting_date || rj['Initial posting date'] || null;
  const contactInfo = rj.contact_info || (greenMatch ? greenMatch.manufacturer : null);

  let availBadgeHtml = '<span style="color:var(--muted); font-size:11px;">—</span>';
  if (availability) {
    const avLow = availability.toLowerCase();
    if (avLow.includes('available') && !avLow.includes('un') && !avLow.includes('limit')) {
      availBadgeHtml = `<span class="avail-badge avail-green" title="Stok Mevcut">● ${esc(availability)}</span>`;
    } else if (avLow.includes('limit') || avLow.includes('allocat')) {
      availBadgeHtml = `<span class="avail-badge avail-amber" title="Kısıtlı Bulunabilirlik">▲ ${esc(availability)}</span>`;
    } else {
      availBadgeHtml = `<span class="avail-badge avail-red" title="Temin Edilemiyor / Kriz">✕ ${esc(availability)}</span>`;
    }
  }

  return {
    ...r,
    greenData: greenMatch,
    therapeuticCategory,
    presentation,
    availability,
    availBadgeHtml,
    updateDate,
    initialDate,
    contactInfo,
    reasonText: reasonText || (isGreen ? 'Kontrole tabi yeşil reçeteli molekül' : null),
    shortageReasonDisplay: reasonText || (isGreen ? 'Kontrole Tabi Molekül' : null),
    categoryKey,
    categoryLabel,
    action: finalAction,
    actionDetail: finalActionDetail,
    displayStatus,
    statusBadgeHtml,
    isDirectShortage,
    isCurrent,
    isResolved,
    hasShortageReason: Boolean(reasonText && reasonText.trim() && reasonText !== 'Belirtilmemiş'),
    isGreen,
    riskScore: score,
    riskTier: tier,
    riskTierLabel: tierLabel
  };
}

function shortageTableV2(rows, isFdaSource = true) {
  if (!rows.length) return '<p class="empty notice">Filtrelere veya arama kriterine uygun ilaç kaydı bulunamadı.</p>';
  if (isFdaSource) {
    return `
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th style="min-width:180px;">İlaç / Etkin Madde & Marka</th>
              <th>FDA Kriz Durumu</th>
              <th>Terapötik Kategori</th>
              <th style="min-width:160px;">Sıkıntı Nedeni</th>
              <th>Bulunabilirlik (Stok)</th>
              <th style="min-width:200px;">Sunum & Dozaj Formu</th>
              <th>Üretici Firma & İletişim</th>
              <th>Tarih</th>
              <th>Kırılganlık / EM Aksiyonu</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr data-id="${r.id}" class="selectable" style="cursor:pointer">
                <td class="drug-cell">
                  <b>${esc(label(r))}${r.isGreen ? ' <span class="green-rx-symbol" title="TİTCK / SUT Kalkanı Resmi Yeşil Reçeteli İlaç (Kontrole Tabi)">🟢 YEŞİL REÇETE</span>' : ''}</b>
                  <small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small>
                  ${r.greenData ? `
                    <div class="green-rx-meta">
                      <span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #10b981; font-size:10px; width:fit-content; font-weight:700;">
                        🟢 SUT Kalkanı Yeşil Reçete (${esc(r.greenData.origin)})
                      </span>
                      <div style="font-size:10.5px; color:#334155; margin-top:1px;">
                        ${r.greenData.localEquivCount > 0 
                          ? `<span style="color:#047857; font-weight:600;">● ${r.greenData.localEquivCount} Yerli Muadil</span>` 
                          : `<span style="color:#b91c1c; font-weight:700;">⚠ 0 Yerli Muadil (Kritik Monopol)</span>`}
                        <span style="color:var(--muted);">· SGK: ${esc(r.greenData.equivGroup)}</span>
                      </div>
                      ${r.greenData.yurtDisiList && r.greenData.yurtDisiList !== 'Hayır' ? `
                        <span class="badge" style="background:#fffbeb; color:#92400e; border:1px solid #fde68a; font-size:9.5px; width:fit-content;">
                          🏛️ SGK Yurt Dışı İlaç: ${esc(r.greenData.yurtDisiList)}
                        </span>
                      ` : ''}
                    </div>
                  ` : ''}
                </td>
                <td>${r.statusBadgeHtml}</td>
                <td>
                  ${r.therapeuticCategory ? `
                    <span class="category-pill">${esc(r.therapeuticCategory)}</span>
                  ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
                </td>
                <td>
                  ${r.shortageReasonDisplay ? `
                    <span class="reason-badge" style="font-weight:600; font-size:11px; white-space:normal; display:inline-block; max-width:230px; ${r.greenData && r.greenData.localEquivCount === 0 ? 'background:#fef2f2; color:#991b1b; border:1px solid #fecaca;' : ''}">
                      ${esc(r.shortageReasonDisplay)}
                    </span>
                  ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
                </td>
                <td>${r.availBadgeHtml}</td>
                <td>
                  <div style="font-size:11.5px; color:#1e293b; max-width:230px; line-height:1.35;">
                    ${esc(r.presentation)}
                  </div>
                  ${r.ndc ? `<code style="font-size:10px; color:var(--muted); display:inline-block; margin-top:2px;">NDC: ${esc(r.ndc)}</code>` : ''}
                </td>
                <td>
                  <div style="font-weight:600; font-size:11.5px; color:#0f172a;">${esc(r.manufacturer || r.vendor || '—')}</div>
                  ${r.contactInfo ? `<small style="font-size:10.5px; color:#0284c7; display:block; margin-top:2px;">📞 ${esc(r.contactInfo)}</small>` : ''}
                </td>
                <td>
                  <div style="font-size:11.5px; font-weight:600; color:#334155;">${esc(r.updateDate)}</div>
                  ${r.initialDate ? `<small style="font-size:10px; color:var(--muted); display:block;">İlan: ${esc(r.initialDate)}</small>` : ''}
                </td>
                <td>
                  <span class="risk-pill ${r.riskTier}">${r.riskTierLabel} (${r.riskScore})</span>
                  <div style="font-size:10.5px; font-weight:600; color:#0369a1; margin-top:3px; line-height:1.2;">
                    ⚡ ${esc(r.action)}
                  </div>
                </td>
                <td><button class="button" style="padding:4px 10px; font-size:11px;" onclick="event.stopPropagation(); detail('${r.id}')">İncele →</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  return `
    <div class="data-table">
      <table>
        <thead>
          <tr>
            <th>İlaç / Etkin Madde & Marka</th>
            <th>Kaynak</th>
            <th>Üretici / Tedarikçi</th>
            <th>NDC / Kod</th>
            <th>Tedarik Durumu</th>
            <th>Sıkıntı Nedeni</th>
            <th>Kırılganlık Riski</th>
            <th>Önerilen Mühendislik Aksiyonu</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${r.id}" class="selectable" style="cursor:pointer">
              <td class="drug-cell">
                <b>${esc(label(r))}${r.isGreen ? ' <span class="green-rx-symbol" title="TİTCK / SUT Kalkanı Resmi Yeşil Reçeteli İlaç (Kontrole Tabi)">🟢 YEŞİL REÇETE</span>' : ''}</b>
                <small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small>
                ${r.greenData ? `
                  <div class="green-rx-meta">
                    <span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #10b981; font-size:10px; width:fit-content; font-weight:700;">
                      🟢 SUT Kalkanı Yeşil Reçete (${esc(r.greenData.origin)})
                    </span>
                    <div style="font-size:10.5px; color:#334155; margin-top:1px;">
                      ${r.greenData.localEquivCount > 0 
                        ? `<span style="color:#047857; font-weight:600;">● ${r.greenData.localEquivCount} Yerli Muadil</span>` 
                        : `<span style="color:#b91c1c; font-weight:700;">⚠ 0 Yerli Muadil (Kritik Monopol)</span>`}
                      <span style="color:var(--muted);">· SGK: ${esc(r.greenData.equivGroup)}</span>
                    </div>
                    ${r.greenData.yurtDisiList && r.greenData.yurtDisiList !== 'Hayır' ? `
                      <span class="badge" style="background:#fffbeb; color:#92400e; border:1px solid #fde68a; font-size:9.5px; width:fit-content;">
                        🏛️ SGK Yurt Dışı İlaç: ${esc(r.greenData.yurtDisiList)}
                      </span>
                    ` : ''}
                  </div>
                ` : ''}
              </td>
              <td><span class="source-tag">${esc(sourceLabel(r.source))}</span></td>
              <td>${esc(r.manufacturer || r.vendor || '—')}</td>
              <td><code>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</code></td>
              <td>${r.statusBadgeHtml}</td>
              <td>
                ${r.shortageReasonDisplay ? `
                  <span class="reason-badge" style="font-weight:600; font-size:11px; white-space:normal; display:inline-block; max-width:240px; ${r.greenData && r.greenData.localEquivCount === 0 ? 'background:#fef2f2; color:#991b1b; border:1px solid #fecaca;' : ''}">
                    ${esc(r.shortageReasonDisplay)}
                  </span>
                  ${r.categoryLabel && r.categoryKey !== 'normal' ? `
                    <small style="color:#0284c7; font-weight:600; font-size:10px; display:block; margin-top:3px;">
                      🏷 ${esc(r.categoryLabel)}
                    </small>
                  ` : ''}
                ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
              </td>
              <td><span class="risk-pill ${r.riskTier}">${r.riskTierLabel} (${r.riskScore})</span></td>
              <td>
                <div style="font-size:11.5px; font-weight:600; color:#0369a1; line-height:1.3;">
                  ⚡ ${esc(r.action)}
                </div>
                <small style="color:var(--muted); font-size:10px; display:block; margin-top:2px;">${esc(r.actionDetail)}</small>
              </td>
              <td><button class="button" style="padding:4px 10px; font-size:11px;" onclick="event.stopPropagation(); detail('${r.id}')">İncele →</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function shortagePageV2(
  query = currentShortageV2Query,
  source = currentShortageV2Source,
  status = currentShortageV2Status,
  reasonFilter = currentShortageV2Reason,
  riskFilter = currentShortageV2Risk,
  pageNo = currentShortageV2Page
) {
  currentShortageV2Query = query;
  currentShortageV2Source = source;
  currentShortageV2Status = status;
  currentShortageV2Reason = reasonFilter;
  currentShortageV2Risk = riskFilter;
  currentShortageV2Page = pageNo;

  const gSearch = document.querySelector('#globalSearch');
  if (gSearch && gSearch.value !== query) gSearch.value = query;

  const guide = guideBanner(
    "ABD FDA Drug Shortages veri tabanındaki 1.587 kriz kaydının tamamını resmi FDA sitesiyle birebir senkronize şekilde sunan karar destek merkezidir.",
    "FDA resmi portalındaki tüm güncel ve çözülen ilaç krizlerini, terapötik sınıflarını (Onkoloji, Anestezi, Nöroloji), sunum ve dozaj formlarını, bulunabilirlik durumlarını ve kök nedenlerini tek ekranda inceler.",
    "Dilediğiniz ilacı veya NDC kodunu arayın; terapötik kategori ve stok durumu süzgeçleriyle filtreleyin veya tüm FDA kriz kayıtlarını tek ekranda listeleyin."
  );

  page.innerHTML = header('Tedarik Sıkıntısı Analizi V2', 'FDA Drug Shortages kriz kayıtlarının tamamı, terapötik sınıflamalar ve Endüstri Mühendisliği karar destek motoru.') + guide + '<div class="empty glass">FDA resmi kriz kayıtları yükleniyor…</div>';

  try {
    let overview;
    let summary;
    let data;

    if (source === 'green_cases') {
      const [ov, sm] = await Promise.all([
        api('/api/overview'),
        api('/api/analytics/shortages')
      ]);
      overview = ov;
      summary = sm;

      const greenRows = turkeyGreenMeds.map(m => ({
        id: `green-${m.name.toLowerCase()}`,
        source: 'Yeşil Reçete (TR)',
        generic_name: m.name,
        brand_name: m.brand,
        manufacturer: m.manufacturer,
        vendor: m.manufacturer,
        ndc: m.barcode,
        product_ndc: m.barcode,
        package_ndc: m.barcode,
        application_no: m.atc,
        shortage_status: m.fdaShortage.includes('Active') ? 'Current' : (m.origin.includes('İTHAL') && m.localEquivCount === 0 ? 'İthal Bağımlısı' : 'Yerli İmalat'),
        shortage_reason: m.origin.includes('İTHAL') && m.localEquivCount === 0 
          ? 'Tek İthal Tedarikçi Bağımlılığı & Yerli Muadil Yokluğu (SGK Ek-1 Dönemsel İthalat)' 
          : (m.fdaShortage.includes('Active') ? m.fdaReason : (m.fdaReason || 'Kontrole Tabi / Ulusal Kota Takibi')),
        report_year: 2026,
        raw_json: {
          therapeutic_category: 'Psikotrop & Narkotik (Yeşil Reçete)',
          presentation: `${m.brand} (${m.origin}) - SGK: ${m.equivGroup}`,
          availability: m.origin.includes('İTHAL') && m.localEquivCount === 0 ? 'Unavailable / Limited' : (m.fdaShortage.includes('Active') ? 'Limited Availability' : 'Available'),
          update_date: '2026 (TİTCK / SGK Ek-4/A)',
          contact_info: m.manufacturer,
          atc: m.atc,
          barcode: m.barcode,
          localEquivCount: m.localEquivCount,
          origin: m.origin,
          yurtDisiList: m.yurtDisiList
        }
      }));

      let filteredGreen = greenRows;
      if (query) {
        const qLow = query.toLowerCase();
        filteredGreen = greenRows.filter(r => 
          r.generic_name.toLowerCase().includes(qLow) ||
          r.brand_name.toLowerCase().includes(qLow) ||
          r.manufacturer.toLowerCase().includes(qLow) ||
          r.ndc.toLowerCase().includes(qLow)
        );
      }
      data = {
        rows: filteredGreen,
        total: filteredGreen.length,
        page: 1,
        limit: 25
      };
    } else {
      const queryParam = query ? `&q=${encodeURIComponent(query)}` : '';
      const sourceParam = source ? `&source=${encodeURIComponent(source)}` : '';
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : '';
      const reasonParam = reasonFilter ? `&reason=${encodeURIComponent(reasonFilter)}` : '';
      const categoryParam = currentShortageV2Category ? `&category=${encodeURIComponent(currentShortageV2Category)}` : '';
      const availParam = currentShortageV2Availability ? `&availability=${encodeURIComponent(currentShortageV2Availability)}` : '';
      const limitNum = currentShortageV2Limit === 'all' ? 2000 : Number(currentShortageV2Limit) || 25;

      const [ov, sm, dt] = await Promise.all([
        api('/api/overview'),
        api('/api/analytics/shortages'),
        api(`/api/records?page=${pageNo}&limit=${limitNum}${sourceParam}${queryParam}${statusParam}${reasonParam}${categoryParam}${availParam}`)
      ]);
      overview = ov;
      summary = sm;
      data = dt;

      // Smart green fallback: if user searched alprazolam, xanax, concerta etc. and 0 rows found in source
      if (query && data.rows.length === 0) {
        const matchedGreen = turkeyGreenMeds.filter(m => {
          const qLow = query.toLowerCase();
          return m.name.toLowerCase().includes(qLow) || m.brand.toLowerCase().includes(qLow);
        });
        if (matchedGreen.length > 0) {
          const syntheticRows = matchedGreen.map(m => ({
            id: `green-${m.name.toLowerCase()}`,
            source: 'Yeşil Reçete (TR)',
            generic_name: m.name,
            brand_name: m.brand,
            manufacturer: m.manufacturer,
            vendor: m.manufacturer,
            ndc: m.barcode,
            product_ndc: m.barcode,
            package_ndc: m.barcode,
            application_no: m.atc,
            shortage_status: m.fdaShortage.includes('Active') ? 'Current' : (m.origin.includes('İTHAL') && m.localEquivCount === 0 ? 'İthal Bağımlısı' : 'Yerli İmalat'),
            shortage_reason: m.origin.includes('İTHAL') && m.localEquivCount === 0 
              ? 'Tek İthal Tedarikçi Bağımlılığı & Yerli Muadil Yokluğu (SGK Ek-1 Dönemsel İthalat)' 
              : (m.fdaShortage.includes('Active') ? m.fdaReason : (m.fdaReason || 'Kontrole Tabi / Ulusal Kota Takibi')),
            report_year: 2026,
            raw_json: {
              therapeutic_category: 'Psikotrop & Narkotik (Yeşil Reçete)',
              presentation: `${m.brand} (${m.origin}) - SGK: ${m.equivGroup}`,
              availability: m.origin.includes('İTHAL') && m.localEquivCount === 0 ? 'Unavailable / Limited' : (m.fdaShortage.includes('Active') ? 'Limited Availability' : 'Available'),
              update_date: '2026 (TİTCK / SGK Ek-4/A)',
              contact_info: m.manufacturer
            }
          }));
          data.rows = syntheticRows;
          data.total = syntheticRows.length;
        }
      }
    }

    const count = Object.fromEntries(overview.counts.map(x => [x.source, x.count]));
    const totalAllDrugs = Object.values(count).reduce((a, b) => a + Number(b), 0);
    const enriched = data.rows.map(enrichShortageRecord);

    let filtered = enriched;
    if (reasonFilter) {
      if (reasonFilter === 'green_cases' || reasonFilter === 'green_rx') {
        filtered = filtered.filter(r => r.isGreen);
      } else {
        filtered = filtered.filter(r => {
          if (r.categoryKey === reasonFilter) return true;
          const normFilter = reasonFilter.toLowerCase();
          const normDisplay = (r.shortageReasonDisplay || '').toLowerCase();
          const normReason = (r.shortage_reason || '').toLowerCase();
          const normText = (r.reasonText || '').toLowerCase();
          return normDisplay.includes(normFilter) || normReason.includes(normFilter) || normText.includes(normFilter);
        });
      }
    }
    if (currentShortageV2Category) {
      filtered = filtered.filter(r => (r.therapeuticCategory || '').toLowerCase().includes(currentShortageV2Category.toLowerCase()));
    }
    if (currentShortageV2Availability) {
      filtered = filtered.filter(r => (r.availability || '').toLowerCase().includes(currentShortageV2Availability.toLowerCase()));
    }
    if (riskFilter) {
      if (riskFilter === 'high') filtered = filtered.filter(r => r.riskScore >= 75);
      else if (riskFilter === 'med') filtered = filtered.filter(r => r.riskScore >= 30 && r.riskScore < 75);
      else if (riskFilter === 'low') filtered = filtered.filter(r => r.riskScore < 30);
    }

    // Prioritization: SUT Kalkanı Yeşil Reçete active ingredients prioritized at the top, sorted by risk score
    filtered.sort((a, b) => {
      if (source === 'green_cases') {
        return (b.riskScore || 0) - (a.riskScore || 0);
      }
      if (query || reasonFilter === 'green_cases' || reasonFilter === 'green_rx') {
        if (a.isGreen !== b.isGreen) return a.isGreen ? -1 : 1;
      }
      return (b.riskScore || 0) - (a.riskScore || 0);
    });

    const greenImportZeroCount = turkeyGreenMeds.filter(m => m.origin.includes('İTHAL') && m.localEquivCount === 0).length;
    const greenActiveCount = turkeyGreenMeds.filter(m => m.fdaShortage.includes('Active')).length;
    const greenLocalCount = turkeyGreenMeds.filter(m => m.origin.includes('İMAL')).length;

    const currentCount = Number(overview.currentShortages || 0);
    const totalShortages = Number(count['Drug Shortages'] || 0);
    const isFdaSource = source === 'Drug Shortages';

    page.innerHTML = header('Tedarik Sıkıntısı Analizi V2', 'FDA Drug Shortages kriz kayıtlarının tamamı, terapötik sınıflamalar ve Endüstri Mühendisliği karar destek motoru.') + guide + `
      <!-- FDA Resmi Veri Portalı Senkronizasyon Kartı -->
      <div class="glass panel fda-sync-banner" style="margin-bottom:18px; padding:14px 20px; border-left:4px solid #0284c7; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">🏛️</span>
            <h2 style="margin:0; font-size:14px; font-family:Outfit; color:#0f172a;">ABD FDA Resmi Drug Shortages Portalı Veri Tabanı</h2>
            <span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-size:10.5px;">✓ Tüm 1.587 Kriz Kaydı Entegre</span>
          </div>
          <div style="font-size:11.5px; color:#475569; margin-top:3px;">
            FDA'nın resmi sitesindeki (${totalShortages.toLocaleString('tr-TR')} kriz kaydı) tüm Terapötik Kategoriler, Dozaj/Sunum Formları, Stok Durumu ve İletişim verileriyle bu ekrana tam entegre olarak listelenmektedir.
          </div>
        </div>
        <a href="https://www.accessdata.fda.gov/scripts/drugshortages/" target="_blank" rel="noopener noreferrer" class="button" style="padding:6px 14px; font-size:11px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
          FDA Resmi Sitesi ↗
        </a>
      </div>

      <section class="grid stats">
        <article class="glass stat">
          <span class="stat-label">FDA Kriz Veri Tabanı</span>
          <strong>${totalShortages.toLocaleString('tr-TR')}</strong>
          <small>FDA Drug Shortages (Tüm Kayıtlar)</small>
          <span class="trend red">⚡</span>
        </article>
        <article class="glass stat">
          <span class="stat-label">Aktif FDA Tedarik Krizi</span>
          <strong>${currentCount.toLocaleString('tr-TR')}</strong>
          <small>Devam eden küresel krizler</small>
          <span class="trend red">⚠</span>
        </article>
        <article class="glass stat">
          <span class="stat-label">Katalogdaki Tüm İlaçlar</span>
          <strong>${totalAllDrugs.toLocaleString('tr-TR')}</strong>
          <small>6 Veri Kaynağı (Birleşik Katalog)</small>
          <span class="trend">↗</span>
        </article>
        <article class="glass stat">
          <span class="stat-label">VA Tedarikçi Firmaları</span>
          <strong>${Number(overview.vendors || 0).toLocaleString('tr-TR')}</strong>
          <small>Pazar konsantrasyonu</small>
          <span class="trend">⌘</span>
        </article>
      </section>

      <section class="grid main-grid">
        <article class="glass panel">
          <div class="panel-head">
            <h2>Öne Çıkan Sıkıntı Nedenleri & FDA Sonuçları</h2>
            <span class="source-tag">FDA Kriz Kayıtları (${summary.reasons.length} Kök Neden)</span>
          </div>
          ${chart(summary.reasons)}

          <div style="margin-top:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:12px; font-weight:700; color:var(--ink); font-family:Outfit;">
                📋 FDA Veri Tabanı Kriz Nedenleri Sonuç Dağılımı (Filtrelemek İçin Tıklayın)
              </span>
              ${reasonFilter ? `
                <button class="button secondary" onclick="setShortageV2Reason('')" style="padding:2px 8px; font-size:11px; color:#e11d48; border-color:#fecdd3;">
                  ✕ Filtreyi Temizle
                </button>
              ` : ''}
            </div>

            <div class="reason-results-list">
              ${summary.reasons.map(r => {
                const isSelected = reasonFilter === r.label;
                const desc = fdaReasonDescriptions[r.label] || 'FDA Kriz Bildirimi';
                return `
                  <div class="reason-result-item ${isSelected ? 'active' : ''}" onclick="setShortageV2Reason('${esc(r.label)}')" title="Tıkla: Bu nedene ait ilaçları listele">
                    <div class="reason-result-info">
                      <div class="reason-result-title">
                        <b>${esc(r.label)}</b>
                        <span class="reason-tr">${esc(desc)}</span>
                      </div>
                    </div>
                    <div class="reason-result-stats">
                      <span class="reason-count">${Number(r.value).toLocaleString('tr-TR')} kayıt</span>
                      <span class="reason-badge-btn">${isSelected ? '✓ Seçili' : 'Filtrele →'}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 🇹🇷 Türkiye Yeşil Reçete & SUT Kalkanı Ulusal Tedarik Kriz Dağılımı Paneli -->
          <div style="margin-top:16px; padding:14px; border-radius:12px; background:linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(2, 132, 199, 0.08)); border:1px solid rgba(16, 185, 129, 0.25);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:16px;">🇹🇷</span>
                <b style="font-size:13px; color:#065f46; font-family:Outfit;">Türkiye Yeşil Reçete & SUT Kalkanı Tedarik Kriz Dağılımı (${turkeyGreenMeds.length} Ulusal Molekül)</b>
              </div>
              <button class="button" style="padding:4px 12px; font-size:11px;" onclick="setShortageV2Source('green_cases')">
                🟢 ${turkeyGreenMeds.length} SUT Kalkanı Yeşil Reçete İlacını Listele →
              </button>
            </div>
            <div style="font-size:11.5px; color:#475569; margin-bottom:10px;">
              T.C. Sağlık Bakanlığı TİTCK ve SUT Kalkanı resmi yeşil reçete listesiyle: Türkiye'de yerli alternatifi olmayan (%100 ithal) yeşil reçete ilaçları, FDA krizinde olmasalar dahi ulusal seviyede <b>kritik tedarik kırılganlığına (0 Muadil)</b> sahiptir.
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
              <div class="green-stat-card" style="border-left:3px solid #e11d48;" onclick="setShortageV2Source('green_cases')">
                <div style="font-size:11px; font-weight:700; color:#991b1b;">🔴 İthal Bağımlısı (0 Muadil)</div>
                <div style="font-size:18px; font-weight:800; color:#0f172a; margin-top:2px;">${greenImportZeroCount} İlaç</div>
                <div style="font-size:10.5px; color:#64748b; margin-top:2px;">Alprazolam (Xanax), Klonazepam, Tianeptin, vb.</div>
              </div>
              <div class="green-stat-card" style="border-left:3px solid #f59e0b;" onclick="setShortageV2Source('green_cases')">
                <div style="font-size:11px; font-weight:700; color:#b45309;">⚡ Aktif Küresel Kriz (FDA)</div>
                <div style="font-size:18px; font-weight:800; color:#0f172a; margin-top:2px;">${greenActiveCount} İlaç</div>
                <div style="font-size:10.5px; color:#64748b; margin-top:2px;">Metilfenidat (Concerta), Lorazepam, Midazolam, vb.</div>
              </div>
              <div class="green-stat-card" style="border-left:3px solid #10b981;" onclick="setShortageV2Source('green_cases')">
                <div style="font-size:11px; font-weight:700; color:#047857;">🟢 Yerli İmalat Güvencesi</div>
                <div style="font-size:18px; font-weight:800; color:#0f172a; margin-top:2px;">${greenLocalCount} İlaç</div>
                <div style="font-size:10.5px; color:#64748b; margin-top:2px;">Diazepam, Tramadol, Pregabalin, Biperiden vb.</div>
              </div>
            </div>
          </div>

          <div class="notice" style="margin-top:12px;">
            💡 <b>Sıkıntı Nedeni Analizi:</b> Yukarıdaki neden sonuçlarından herhangi birine tıklayarak tablodaki ilaçları doğrudan o kök nedene göre filtreleyebilir; ilgili mühendislik aksiyonunu (ikincil API, ROP tamponu, tayınlama) denetleyebilirsiniz.
          </div>
        </article>

        <article class="glass panel">
          <div class="panel-head">
            <h2>Endüstri Mühendisliği Müdahale Matrisi</h2>
            <span class="source-tag">Karar Destek Çerçevesi</span>
          </div>
          <div class="ie-matrix-grid">
            <div class="ie-matrix-card">
              <b>🚨 Hammadde / API Krizi</b>
              <small>Dual-Sourcing & Güvenlik Stoğu Artırımı (SS = Z · σ_L · D)</small>
            </div>
            <div class="ie-matrix-card">
              <b>🚢 Lojistik & Boğaz Gecikmesi</b>
              <small>Lead Time Tamponu (+21 Gün) & Sipariş Noktası (ROP) Revizyonu</small>
            </div>
            <div class="ie-matrix-card">
              <b>⚙ GMP & Kalite Kesintisi</b>
              <small>Eşdeğer Fason Tesis Lisans Transferi & Validasyon Hızlandırma</small>
            </div>
            <div class="ie-matrix-card">
              <b>📈 Talep Sıçraması</b>
              <small>Dinamik Tayınlama (Rationing) & Spekülatif Stok Blokajı</small>
            </div>
            <div class="ie-matrix-card">
              <b>🛑 Piyasadan Çekilme</b>
              <small>SGK Eşdeğer Grubu Muadil Yönlendirmesi & TEB Ek-1 İthalat</small>
            </div>
          </div>
        </article>
      </section>

      <section class="glass panel" style="margin-top:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
          <h2 style="margin:0; font-size:15px; font-family:Outfit;">⚡ FDA Kriz Veri Kapsamı & Gelişmiş Süzgeçler</h2>
          <button class="button secondary" id="resetShortageV2Filters" style="padding:6px 14px; font-size:11px;">Filtreleri Sıfırla</button>
        </div>

        <!-- Hızlı Veri Kaynağı Kapsam Sekmeleri -->
        <div class="tabs" style="margin-bottom:14px;">
          <button class="tab ${source === 'Drug Shortages' ? 'active' : ''}" onclick="setShortageV2Source('Drug Shortages')">⚡ FDA Resmi Kriz Veri Tabanı (Tüm FDA Sitesi · ${totalShortages.toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'green_cases' ? 'active' : ''}" onclick="setShortageV2Source('green_cases')">🟢 SUT Kalkanı Yeşil Reçeteli İlaçlar (${turkeyGreenMeds.length} Ulusal Molekül)</button>
          <button class="tab ${source === '' ? 'active' : ''}" onclick="setShortageV2Source('')">🌐 Birleşik İlaç Kataloğu (${totalAllDrugs.toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'FDA Drugs' ? 'active' : ''}" onclick="setShortageV2Source('FDA Drugs')">FDA Ruhsatlı İlaçlar (${Number(count['FDA Drugs'] || 0).toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'NDC Products' ? 'active' : ''}" onclick="setShortageV2Source('NDC Products')">NDC Ürün Kataloğu (${Number(count['NDC Products'] || 0).toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'VA Contracts' ? 'active' : ''}" onclick="setShortageV2Source('VA Contracts')">VA Tedarik Sözleşmeleri (${Number(count['VA Contracts'] || 0).toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'CMS Medicare Part D' ? 'active' : ''}" onclick="setShortageV2Source('CMS Medicare Part D')">CMS Talep Verileri (${Number(count['CMS Medicare Part D'] || 0).toLocaleString('tr-TR')})</button>
        </div>

        <div class="controls" style="margin-bottom:0; display:grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap:12px;">
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Veri Kapsamı / Kaynak:
            <select id="shortageV2SourceSelect">
              <option value="Drug Shortages" ${source === 'Drug Shortages' ? 'selected' : ''}>⚡ FDA Kriz Veri Tabanı (Tüm FDA Sitesi · ${totalShortages.toLocaleString('tr-TR')})</option>
              <option value="green_cases" ${source === 'green_cases' ? 'selected' : ''}>🟢 SUT Kalkanı Yeşil Reçeteli İlaçlar (${turkeyGreenMeds.length} Ulusal Molekül)</option>
              <option value="" ${source === '' ? 'selected' : ''}>🌐 Birleşik İlaç Kataloğu (${totalAllDrugs.toLocaleString('tr-TR')})</option>
              ${Object.entries(sourceNames).filter(([k]) => k !== 'Drug Shortages').map(([k, v]) => `<option value="${k}" ${k === source ? 'selected' : ''}>${v} (${Number(count[k] || 0).toLocaleString('tr-TR')})</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            FDA Kriz Durumu:
            <select id="shortageV2Status">
              <option value="">Tüm Durumlar</option>
              <option value="Current" ${status === 'Current' ? 'selected' : ''}>Güncel (Devam Eden - 1.141)</option>
              <option value="To Be Discontinued" ${status === 'To Be Discontinued' ? 'selected' : ''}>Üretim Sonlandırılıyor (427)</option>
              <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>Çözüldü (19)</option>
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Terapötik Kategori (FDA):
            <select id="shortageV2Category">
              <option value="">Tüm Terapötik Sınıflar (${fdaTherapeuticCategories.length})</option>
              ${fdaTherapeuticCategories.map(cat => `<option value="${cat}" ${currentShortageV2Category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Bulunabilirlik (Stok):
            <select id="shortageV2Availability">
              <option value="">Tüm Stok Durumları</option>
              <option value="Available" ${currentShortageV2Availability === 'Available' ? 'selected' : ''}>Available (Stok Mevcut)</option>
              <option value="Limited Availability" ${currentShortageV2Availability === 'Limited Availability' ? 'selected' : ''}>Limited Availability (Kısıtlı)</option>
              <option value="Unavailable" ${currentShortageV2Availability === 'Unavailable' ? 'selected' : ''}>Unavailable (Temin Edilemiyor)</option>
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Sıkıntı Nedeni / Sınıfı:
            <select id="shortageV2Reason">
              <option value="">Tüm Sıkıntı Nedenleri (Tümü)</option>
              <optgroup label="📋 FDA Veri Tabanı Kriz Nedenleri (Sonuçlar)">
                ${summary.reasons.map(r => `
                  <option value="${esc(r.label)}" ${reasonFilter === r.label ? 'selected' : ''}>
                    ${esc(r.label)} (${Number(r.value).toLocaleString('tr-TR')} kayıt)
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="⚙️ Endüstri Mühendisliği Kök Neden Sınıfları">
                <option value="green_cases" ${reasonFilter === 'green_cases' ? 'selected' : ''}>🟢 SUT Kalkanı Yeşil Reçeteli İlaçlar (${turkeyGreenMeds.length} Molekül)</option>
                <option value="import_zero" ${reasonFilter === 'import_zero' ? 'selected' : ''}>İthal Bağımlılığı (0 Muadil - SGK Ek-1)</option>
                <option value="green_active" ${reasonFilter === 'green_active' ? 'selected' : ''}>Aktif Kriz (Yeşil Reçete)</option>
                <option value="local_prod" ${reasonFilter === 'local_prod' ? 'selected' : ''}>Yerli İmalat (Güvenceli)</option>
                <option value="api" ${reasonFilter === 'api' ? 'selected' : ''}>Hammadde / API Sıkıntısı</option>
                <option value="logistics" ${reasonFilter === 'logistics' ? 'selected' : ''}>Lojistik & Boğaz Gecikmesi</option>
                <option value="gmp" ${reasonFilter === 'gmp' ? 'selected' : ''}>GMP & Kalite Uyumsuzluğu</option>
                <option value="demand" ${reasonFilter === 'demand' ? 'selected' : ''}>Talep Sıçraması & Kapasite</option>
                <option value="discontinued" ${reasonFilter === 'discontinued' ? 'selected' : ''}>Piyasadan Çekilme / Ruhsat</option>
                <option value="green_rx" ${reasonFilter === 'green_rx' ? 'selected' : ''}>Kontrole Tabi (Yeşil Reçete)</option>
                <option value="normal" ${reasonFilter === 'normal' ? 'selected' : ''}>Rutin Tedarik (Normal)</option>
              </optgroup>
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Kritiklik Seviyesi:
            <select id="shortageV2Risk">
              <option value="">Tüm Risk Seviyeleri</option>
              <option value="high" ${riskFilter === 'high' ? 'selected' : ''}>Kritik (Risk ≥ 75)</option>
              <option value="med" ${riskFilter === 'med' ? 'selected' : ''}>Yüksek / Orta (Risk 30-74)</option>
              <option value="low" ${riskFilter === 'low' ? 'selected' : ''}>Düşük (Risk &lt; 30)</option>
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Sayfa Başına Kayıt:
            <select id="shortageV2Limit">
              <option value="25" ${currentShortageV2Limit === 25 ? 'selected' : ''}>25 Kayıt</option>
              <option value="50" ${currentShortageV2Limit === 50 ? 'selected' : ''}>50 Kayıt</option>
              <option value="100" ${currentShortageV2Limit === 100 ? 'selected' : ''}>100 Kayıt</option>
              <option value="250" ${currentShortageV2Limit === 250 ? 'selected' : ''}>250 Kayıt</option>
              <option value="all" ${currentShortageV2Limit === 'all' ? 'selected' : ''}>Tümü (${isFdaSource ? totalShortages.toLocaleString('tr-TR') : '2.000'} Kayıt)</option>
            </select>
          </label>
        </div>

        ${(reasonFilter || currentShortageV2Category || currentShortageV2Availability || status) ? `
          <div style="margin-top:14px; margin-bottom:14px; padding:10px 14px; border-radius:12px; background:rgba(2, 132, 199, 0.08); border:1px solid rgba(2, 132, 199, 0.25); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; color:#0369a1;">
              <b>🔍 Aktif Süzgeçler:</b>
              ${status ? `<span class="badge current" style="font-size:10.5px;">Durum: ${esc(status)}</span>` : ''}
              ${currentShortageV2Category ? `<span class="category-pill">Kategori: ${esc(currentShortageV2Category)}</span>` : ''}
              ${currentShortageV2Availability ? `<span class="avail-badge avail-green">Stok: ${esc(currentShortageV2Availability)}</span>` : ''}
              ${reasonFilter ? `<span class="reason-badge">Neden: ${esc(reasonFilter)}</span>` : ''}
            </div>
            <button class="button secondary" id="clearActiveShortageV2Filters" style="padding:4px 10px; font-size:11px;">Filtreleri Temizle ✕</button>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:22px; flex-wrap:wrap; gap:10px;">
          <h2 style="margin:0;">
            ${source === 'green_cases' ? `🟢 SUT Kalkanı Yeşil Reçete & Ulusal Tedarik Kriz Portföyü (${turkeyGreenMeds.length} Molekül)` : (isFdaSource ? 'FDA Resmi Kriz Veri Tabanı' : (source ? esc(sourceNames[source] || source) : 'Birleşik İlaç Kataloğu'))} Kayıtları · ${data.total.toLocaleString('tr-TR')}
            ${query ? `<small style="font-size:12px; color:var(--muted); font-weight:normal;">("${esc(query)}" için filtrelendi)</small>` : ''}
          </h2>
          <span style="font-size:11px; color:var(--muted);">${source === 'green_cases' ? `T.C. Sağlık Bakanlığı TİTCK ve SUT Kalkanı kapsamındaki ${turkeyGreenMeds.length} ulusal psikotrop ilaç ve kriz durumları listelenmektedir` : (isFdaSource ? 'FDA resmi sitesindeki tüm alanlar listelenmektedir · Satıra tıklayarak çapraz profili açabilirsiniz' : 'Satıra tıklayarak 6 kaynaklı çapraz ilaç profilini açabilirsiniz')}</span>
        </div>

        ${shortageTableV2(filtered, isFdaSource)}

        <!-- Sayfalama (Pagination) -->
        <div class="pagination" style="margin-top:16px;">
          <span>${data.total.toLocaleString('tr-TR')} kayıttan ${data.total === 0 ? 0 : (data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} gösteriliyor (Sayfa ${data.page})</span>
          <div>
            <button class="button secondary" id="shortageV2Prev" ${data.page === 1 ? 'disabled' : ''}>← Önceki</button>
            <button class="button secondary" id="shortageV2Next" ${data.page * data.limit >= data.total ? 'disabled' : ''}>Sonraki →</button>
          </div>
        </div>
      </section>
    `;

    document.querySelector('#shortageV2SourceSelect')?.addEventListener('change', e => {
      currentShortageV2Source = e.target.value;
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Status')?.addEventListener('change', e => {
      currentShortageV2Status = e.target.value;
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Category')?.addEventListener('change', e => {
      currentShortageV2Category = e.target.value;
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Availability')?.addEventListener('change', e => {
      currentShortageV2Availability = e.target.value;
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Reason')?.addEventListener('change', e => {
      currentShortageV2Reason = e.target.value;
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Risk')?.addEventListener('change', e => {
      currentShortageV2Risk = e.target.value;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Limit')?.addEventListener('change', e => {
      currentShortageV2Limit = e.target.value === 'all' ? 'all' : Number(e.target.value);
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#clearActiveShortageV2Filters')?.addEventListener('click', () => {
      currentShortageV2Status = '';
      currentShortageV2Category = '';
      currentShortageV2Availability = '';
      currentShortageV2Reason = '';
      currentShortageV2Page = 1;
      shortagePageV2();
    });
    document.querySelector('#shortageV2Prev')?.addEventListener('click', () => {
      if (currentShortageV2Page > 1) {
        currentShortageV2Page--;
        shortagePageV2();
      }
    });
    document.querySelector('#shortageV2Next')?.addEventListener('click', () => {
      currentShortageV2Page++;
      shortagePageV2();
    });
    document.querySelector('#resetShortageV2Filters')?.addEventListener('click', () => {
      currentShortageV2Query = '';
      currentShortageV2Source = 'Drug Shortages';
      currentShortageV2Status = '';
      currentShortageV2Reason = '';
      currentShortageV2Category = '';
      currentShortageV2Availability = '';
      currentShortageV2Risk = '';
      currentShortageV2Limit = 25;
      currentShortageV2Page = 1;
      const globalInput = document.querySelector('#globalSearch');
      if (globalInput) globalInput.value = '';
      shortagePageV2();
    });

    bindDetails();
  } catch (error) {
    page.innerHTML = header('Tedarik Sıkıntısı Analizi V2', '') + guide + dbMessage(error);
  }
}

async function supplierPage(query = '') {
  currentSupplierQuery = query;
  const guide = guideBanner(
    "İlaç tedarik zincirindeki üretici, dağıtıcı ve yetkili tedarikçilerin pazar yoğunlaşmasını analiz eden tedarikçi istihbarat ekranıdır.",
    "Pazarda tek tedarikçiye bağımlılık (monopoly risk) olup olmadığını ve en büyük tedarikçi firmaların sözleşme hacimlerini gösterir.",
    "Tedarikçi bazlı sözleşme sayılarını inceleyin; tek kaynaktan temin edilen riskli ilaçları tespit etmek için firma adına göre filtreleme yapın."
  );

  page.innerHTML = header('Tedarikçi Analizi', 'Yalnızca VA sözleşme kaynaklarında tedarikçi veya ilaç adına göre arama yapın.') + guide + '<div class="empty glass">Kayıtlar yükleniyor…</div>';
  try {
    const [summary, data] = await Promise.all([api('/api/analytics/suppliers'), api(`/api/records?source=VA%20Contracts&limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}`)]);
    page.innerHTML = header('Tedarikçi Analizi', 'Yalnızca VA sözleşme kaynaklarında tedarikçi veya ilaç adına göre arama yapın.') + guide + `
      <section class="glass panel">
        <section class="grid main-grid"><article><h2>En Yoğun Tedarikçiler</h2>${chart(summary.vendors)}</article><article><h2>Arama Kapsamı</h2><div class="notice">FSS, National Contract ve Big 4 değerleri VA tedarik/sözleşme fiyatlarıdır; genel piyasa fiyatı değildir.</div></article></section>
        <h2 style="margin-top:22px">Eşleşen Tedarikçi Sözleşmeleri · ${data.total.toLocaleString('tr-TR')}</h2>
        ${scopedTable(data.rows, 'Bu tedarikçi veya ilaç için sözleşme kaydı bulunamadı.')}
      </section>`;
    bindDetails();
  } catch (error) { page.innerHTML = header('Tedarikçi Analizi', '') + guide + dbMessage(error); }
}

async function demandPage(query = '') {
  currentDemandQuery = query;
  const guide = guideBanner(
    "CMS Medicare Part D reçete talep verileri ile VA kamu satın alma sözleşme fiyatlarını birleştiren maliyet ve hacim analiz modülüdür.",
    "Bir ilacın piyasadaki talep hacmini (reçete sayısı) ve kamu sözleşmelerindeki birim maliyetlerini (FSS ve Big 4 fiyatları) gösterir.",
    "Yıllara göre talep eğilimini izleyin; ilgilendiğiniz ilacı aratarak kamu maliyetini ve bütçe büyüklüğünü değerlendirin."
  );

  page.innerHTML = header('Talep & Maliyet Analizi', 'CMS Medicare Part D kullanımı bir talep göstergesidir; VA değerleri sözleşme fiyatlarıdır.') + guide + '<div class="empty glass">Kayıtlar yükleniyor…</div>';
  try {
    const [trend, cms, va] = await Promise.all([api('/api/analytics/demand'), api(`/api/records?source=CMS%20Medicare%20Part%20D&limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}`), api(`/api/records?source=VA%20Contracts&limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}`)]);
    page.innerHTML = header('Talep & Maliyet Analizi', 'CMS Medicare Part D kullanımı bir talep göstergesidir; VA değerleri sözleşme fiyatlarıdır.') + guide + `
      <section class="glass panel">
        <h2>CMS Medicare Part D · Yıllara Göre Talep Yoğunluğu</h2>${chart(trend.years)}
        <section style="display:flex; flex-direction:column; gap:20px; margin-top:20px">
          <article><h2>CMS Reçete Talebi Eşleşmeleri · ${cms.total.toLocaleString('tr-TR')}</h2>${scopedTable(cms.rows, 'Bu aramayla CMS Medicare Part D kaydı bulunamadı.')}</article>
          <article><h2>Kamu Sözleşme Fiyatı Eşleşmeleri · ${va.total.toLocaleString('tr-TR')}</h2>${scopedTable(va.rows, 'Bu aramayla sözleşme kaydı bulunamadı.')}</article>
        </section>
      </section>`;
    bindDetails();
  } catch (error) { page.innerHTML = header('Talep & Maliyet Analizi', '') + guide + dbMessage(error); }
}

async function comparison() {
  state.query = '';
  const guide = guideBanner(
    "İki ilacı 10 farklı mühendislik ve tedarik kriteri üzerinden yan yana kıyaslayan karar destek modülüdür.",
    "İki ilacın üreticilerini, tedarik sıkıntısı geçmişlerini, fiyatlarını ve alternatif bulunabilirliklerini doğrudan karşılaştırır.",
    "Sol ve sağ kutulardan birer ilaç aratıp seçin; 'Seçilenleri Karşılaştır' butonuna basarak çok kriterli karşılaştırma matrisini inceleyin."
  );

  page.innerHTML = header('İlaç Karşılaştırma', 'İki ilacı kaynaklar arası ölçülerle yan yana karşılaştırın.') + guide + `
    <section class="glass panel">
      <div class="comparison-grid">
        <article>
          <h2>1. İlaç Seçimi</h2>
          <div class="controls" style="margin-bottom:15px"><input id="comp1Query" placeholder="İlaç adı, marka veya NDC ara"><button id="comp1Search" class="button">Ara</button></div>
          <div id="comp1Results" class="data-table" style="max-height: 300px; overflow: auto;"><p class="empty notice">Arama yapın, ardından listeden ilacı seçin.</p></div>
        </article>
        <article>
          <h2>2. İlaç Seçimi</h2>
          <div class="controls" style="margin-bottom:15px"><input id="comp2Query" placeholder="İlaç adı, marka veya NDC ara"><button id="comp2Search" class="button">Ara</button></div>
          <div id="comp2Results" class="data-table" style="max-height: 300px; overflow: auto;"><p class="empty notice">Arama yapın, ardından listeden ilacı seçin.</p></div>
        </article>
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button id="compareGo" class="button" style="padding: 12px 30px; font-size: 14px;">Seçilenleri Karşılaştır</button>
      </div>
    </section>`;

  const doSearch = async (num) => {
    const q = document.querySelector(`#comp${num}Query`).value.trim();
    if (!q) return;
    const d = await api(`/api/records?q=${encodeURIComponent(q)}&limit=15`);
    document.querySelector(`#comp${num}Results`).innerHTML = d.rows.length ? `<table><thead><tr><th></th><th>İlaç</th></tr></thead><tbody>${d.rows.map(r => `<tr><td><input type="radio" name="comp${num}Radio" value="${r.id}"></td><td>${esc(label(r))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty notice">Kayıt bulunamadı.</p>';
  };

  document.querySelector('#comp1Search').onclick = () => doSearch(1);
  document.querySelector('#comp2Search').onclick = () => doSearch(2);
  document.querySelector('#comp1Query').onkeydown = e => { if (e.key === 'Enter') doSearch(1); };
  document.querySelector('#comp2Query').onkeydown = e => { if (e.key === 'Enter') doSearch(2); };

  document.querySelector('#compareGo').onclick = () => {
    const id1 = document.querySelector('input[name="comp1Radio"]:checked')?.value;
    const id2 = document.querySelector('input[name="comp2Radio"]:checked')?.value;
    if (!id1 || !id2) return alert('Lütfen her iki taraftan da birer ilaç seçin.');
    compareSelected([id1, id2]);
  };
}

async function compareSelected(ids) {
  if (ids.length < 2 || ids.length > 5) return alert('2 ile 5 kayıt seçin.');
  const records = await Promise.all(ids.map(id => api(`/api/records/${id}`)));
  const criteria = [['Kaynak', 'source'], ['Jenerik ad', 'generic_name'], ['Marka adı', 'brand_name'], ['Üretici', 'manufacturer'], ['Tedarikçi', 'vendor'], ['NDC', 'ndc'], ['Başvuru numarası', 'application_no'], ['Tedarik sıkıntısı', 'shortage_status'], ['Neden', 'shortage_reason'], ['Eşleşen kaynak kaydı', 'related']];
  const desktopHtml = `<table class="desktop-compare-table"><thead><tr><th>Ölçüt</th>${records.map(x => `<th>${esc(label(x.record))}</th>`).join('')}</tr></thead><tbody>${criteria.map(([n, key]) => `<tr><td><b>${n}</b></td>${records.map(x => `<td>${key === 'related' ? x.related.length : esc(x.record[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  page.innerHTML = header('İlaç Karşılaştırma', 'Seçili ilaç kayıtlarının kaynak bazlı karşılaştırması.') + `<section class="data-table panel glass">${desktopHtml}</section>`;
}

function eda() {
  const guide = guideBanner(
    "Sistemin dayandığı endüstri mühendisliği terminolojisini, veri kataloglarını ve kaynakların birbirine nasıl bağlandığını açıklayan bilgi merkezidir.",
    "NDC kod yapısını, ATC taksonomisini, CMS metriklerini ve çapraz tablo ilişkilerinin kurallarını şematize eder.",
    "Terim kartlarını inceleyin; DrugFlow veri modelinin mantıksal mimarisini öğrenmek için referans olarak kullanın."
  );

  page.innerHTML = header('Keşifsel Veri Analizi & Terminoloji', 'Sistemi kullanmadan önce temel terminolojiyi ve kaynakların kapsadığı alanları inceleyin.') + guide + `
    <section class="grid main-grid">
      <article class="glass panel">
        <h2>Temel Tanımlar & Tanımlayıcılar</h2>
        <div class="detail-grid">
          ${field('WHO ATC Kodu', 'Dünya Sağlık Örgütü anatomik kimyasal kodu; küresel ilaç eşleştirmenin altın standardıdır.', 'WHO')}
          ${field('Barkod / GTIN', 'Türkiye SGK Ek-4/A kutu takip kodu; 869/868 ile başlar.', 'SGK / GS1')}
          ${field('İmal / İthal', 'SGK Ek-4/A yerli üretim ve yabancı ithalat sınıflandırması.', 'SGK')}
          ${field('Eşdeğer Grubu Kodu', 'SGK tarafından birbiri yerine verilebilecek biyoeşdeğer ilaç havuzudur.', 'SGK')}
          ${field('GTİP / HS 3004', 'Dış ticarette perakende ilaç ürün grubu gümrük kodu.', 'TÜİK / BM')}
          ${field('IMF PortWatch', 'Deniz boğazlarındaki gemi trafiğini ve rota tıkanmalarını izleyen sistem.', 'IMF')}
        </div>
      </article>
      <article class="glass panel">
        <h2>Veri Kaynakları Nasıl Birbirine Bağlanır?</h2>
        <div class="notice">
          <b>Entegrasyon Kuralı:</b> Türkiye ilaçları (SGK Ek-4/A) uluslararası kriz veritabanlarına (FDA / EMA) <b>WHO ATC Kodu</b> ve <b>Etkin Madde (INN)</b> üzerinden bağlanır. Ülke bazlı bağımlılıklar ise <b>TÜİK GTİP 3004</b> ve <b>IMF PortWatch Boğaz İndeksleri</b> üzerinden ağırlıklandırılır.
        </div>
      </article>
    </section>
  `;
}

function sources() { eda(); }

function goToDrug(name) {
  state.query = name;
  state.page = 1;
  location.hash = '#explorer';
}

function bindDetails() {
  document.querySelectorAll('tr.selectable').forEach(row => {
    row.onclick = () => detail(row.dataset.id);
  });
}

// ==========================================================================
// 7. YÖNLENDİRİCİ (ROUTER) & ETKİLEŞİMLER
// ==========================================================================
const routes = {
  dashboard,
  explorer,
  shortages: shortagePage,
  shortagesv2: shortagePageV2,
  demand: demandPage,
  suppliers: supplierPage,
  comparison,
  datasets: () => recordsPage('datasets'),
  eda,
  sources,
  cases: casesPage,
  riskmodel: riskModelPage,
  logistics: logisticsPage,
  simulator: simulatorPage
};

function router() {
  const name = location.hash.slice(1) || 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === name));
  (routes[name] || dashboard)();
  window.scrollTo(0, 0);
  syncSearchPlaceholder();
  setSidebarOpen(false);
}

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) location.hash = go.dataset.go;
});
window.addEventListener('hashchange', router);

// Mobil menü kontrolü
const sidebarEl = document.querySelector('.sidebar');
const overlayEl = document.querySelector('#sidebarOverlay');
const mobileBtnEl = document.querySelector('.mobile-menu');
const closeBtnEl = document.querySelector('#sidebarClose');

const setSidebarOpen = (open) => {
  if (!sidebarEl) return;
  sidebarEl.classList.toggle('open', open);
  if (overlayEl) overlayEl.classList.toggle('active', open);
  document.body.style.overflow = (open && window.innerWidth <= 900) ? 'hidden' : '';
};

mobileBtnEl?.addEventListener('click', (e) => {
  e.stopPropagation();
  setSidebarOpen(!sidebarEl?.classList.contains('open'));
});

closeBtnEl?.addEventListener('click', () => setSidebarOpen(false));
overlayEl?.addEventListener('click', () => setSidebarOpen(false));
document.querySelectorAll('.sidebar a').forEach(link => link.addEventListener('click', () => setSidebarOpen(false)));

// Chatbot desteği
const chat = document.querySelector('#chat');
const toggleChat = () => chat.classList.toggle('hidden');
document.querySelector('#chatFloat').onclick = toggleChat;
document.querySelector('#chatClose').onclick = () => chat.classList.add('hidden');
const chatHistory = [];
document.querySelector('#chatForm').onsubmit = async e => {
  e.preventDefault();
  const input = document.querySelector('#chatInput');
  const content = input.value.trim();
  if (!content) return;
  const messages = document.querySelector('#chatMessages');
  messages.insertAdjacentHTML('beforeend', `<p class="user-message">${esc(content)}</p>`);
  chatHistory.push({ role: 'user', content });
  input.value = '';
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });
    const d = await r.json();
    const answer = d.answer || d.message;
    messages.insertAdjacentHTML('beforeend', `<p class="assistant-message">${esc(answer)}</p>`);
    chatHistory.push({ role: 'assistant', content: answer });
  } catch {
    messages.insertAdjacentHTML('beforeend', '<p class="assistant-message">Şu anda yanıt alınamadı.</p>');
  }
  messages.scrollTop = messages.scrollHeight;
};

// Üst arama çubuğu kontrolü
function setupGlobalSearch() {
  const input = document.querySelector('#globalSearch');
  const btn = document.querySelector('#globalSearchBtn');
  if (!input || !btn) return;

  const triggerSearch = () => {
    const q = input.value.trim();
    const hash = (location.hash.slice(1) || 'dashboard');
    if (hash === 'explorer') {
      state.query = q; state.page = 1; recordsPage('explorer');
    } else if (hash === 'datasets') {
      state.query = q; state.page = 1; recordsPage('datasets');
    } else if (hash === 'shortages') {
      shortagePage(q, document.querySelector('#shortageStatus')?.value || '');
    } else if (hash === 'shortagesv2') {
      currentShortageV2Query = q;
      currentShortageV2Page = 1;
      shortagePageV2();
    } else if (hash === 'suppliers') {
      supplierPage(q);
    } else if (hash === 'demand') {
      demandPage(q);
    } else {
      state.query = q; state.page = 1; location.hash = '#explorer';
    }
  };

  btn.onclick = triggerSearch;
  input.onkeydown = e => { if (e.key === 'Enter') triggerSearch(); };
}

function syncSearchPlaceholder() {
  const input = document.querySelector('#globalSearch');
  if (!input) return;
  const hash = (location.hash.slice(1) || 'dashboard');
  if (hash === 'shortagesv2') input.placeholder = 'Tüm ilaçlarda ara (İlaç, etken madde, marka, NDC…)';
  else if (hash === 'shortages') input.placeholder = 'FDA Tedarik Sıkıntılarında ara (İlaç, marka, NDC…)';
  else if (hash === 'suppliers') input.placeholder = 'Sözleşmelerde tedarikçi veya ilaç ara…';
  else if (hash === 'demand') input.placeholder = 'Talep ve fiyat verilerinde ara…';
  else if (hash === 'cases') input.placeholder = 'Yeşil reçeteli ilaç veya etken madde ara…';
  else input.placeholder = 'İlaç, jenerik ad, marka veya NDC ara…';
}

// Tablo sıralama desteği
document.addEventListener('click', e => {
  const th = e.target.closest('th');
  if (!th) return;
  const table = th.closest('table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const ths = Array.from(th.parentNode.children);
  const colIndex = ths.indexOf(th);
  const isAsc = th.classList.contains('sort-asc');

  ths.forEach(h => {
    h.classList.remove('sort-asc', 'sort-desc');
    const icon = h.querySelector('.sort-icon');
    if (icon) icon.remove();
  });

  const dir = isAsc ? -1 : 1;
  th.classList.add(isAsc ? 'sort-desc' : 'sort-asc');
  th.insertAdjacentHTML('beforeend', `<span class="sort-icon">${isAsc ? '▾' : '▴'}</span>`);

  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    let aText = (a.children[colIndex]?.textContent || '').trim();
    let bText = (b.children[colIndex]?.textContent || '').trim();
    let aClean = aText.replace(/[\$₺€,%]/g, '');
    let bClean = bText.replace(/[\$₺€,%]/g, '');
    let aNum = parseFloat(aClean);
    let bNum = parseFloat(bClean);
    if (!isNaN(aNum) && isFinite(aClean) && !isNaN(bNum) && isFinite(bClean)) {
      return (aNum - bNum) * dir;
    }
    return aText.localeCompare(bText, 'tr', { numeric: true, sensitivity: 'base' }) * dir;
  });
  rows.forEach(r => tbody.appendChild(r));
});

setupGlobalSearch();
router();
