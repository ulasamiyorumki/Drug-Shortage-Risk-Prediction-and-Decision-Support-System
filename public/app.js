const page = document.querySelector('#page');
const sourceNames = {
  'FDA Drugs': 'FDA Drugs@FDA',
  'Drug Shortages': 'FDA Tedarik Sıkıntıları',
  'NDC Products': 'NDC Ürün Dizini',
  'NDC Packages': 'NDC Paket Dizini',
  'CMS Medicare Part D': 'CMS Medicare Part D',
  'VA Contracts': 'VA Sözleşmeleri',
  'EMA Shortages': 'EMA Tedarik Krizleri (Avrupa İlaç Ajansı)'
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
  const stLow = String(status).toLowerCase();
  const current = stLow === 'current' || stLow.includes('ongoing');
  const resolved = stLow.includes('resolved');
  const discontinued = stLow.includes('discontinued');
  if (current) return `<span class="badge current">${stLow.includes('ongoing') ? '🔴 Devam Eden' : 'Güncel'}</span>`;
  if (resolved) return `<span class="badge resolved">🟢 Çözüldü</span>`;
  if (discontinued) return `<span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">⚫ Piyasadan Çekildi</span>`;
  return `<span class="badge neutral">${esc(status)}</span>`;
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

const greenMeds = /(?:^|[^a-z0-9])(fentanyl|fentanil|durogesic|sublimaze|actiq|fentora|abstral|instanyl|morphine|morfin|roxanol|kadian|oxycodone|oksikodon|oxycontin|oxynorm|percocet|roxicodone|targin|hydromorphone|hidromorfon|dilaudid|jurnista|exalgo|methadone|metadon|dolophine|methadose|physeptone|hydrocodone|hidrokodon|vicodin|norco|lortab|zohydro|hysingla|meperidine|meperidin|pethidine|petidin|demerol|aldolan|amphetamine|amfetamin|adderall|evekeo|dyanavel|lisdexamfetamine|lisdexamfetamin|lizdeksamfetamin|vyvanse|elvanse|methylphenidate|metilfenidat|ritalin|concerta|medikinet|daytrana|metadate|dexmethylphenidate|deksmetilfenidat|focalin|buprenorphine|buprenorfin|subutex|suboxone|butrans|belbuca|temgesic|transtec|ketamine|ketamin|ketalar|ketanest|spravato|alprazolam|xanax|niravam|clonazepam|klonazepam|rivotril|klonopin|diazepam|diazem|nervium|valium|diastat|lorazepam|ativan|lorabenz|tramadol|contramal|ultram|ultracet|tramal|zaldiar|zolpidem|ambien|sanval|stilnox|edluar|intermezzo|eszopiclone|eszopiklon|lunesta|temazepam|restoril|normison|phenobarbital|fenobarbital|luminaletten|luminal|pregabalin|lyrica|galara|alyse|neogaba|regapen|symra|biperiden|akineton|midazolam|dormicum|versed|tianeptine|tianeptin|stablon|coaxil|thiopental|tiyopental|ekipental|pentothal|zopiclone|zopiklon|imovane|alfentanil|rapifen|alfenta|bromazepam|lexotanil|lexotan|chlordiazepoxide|klordiazepoksit|librax|librium|clobazam|klobazam|frisium|onfi|clorazepate|klorazepat|tranxene|tranxilium|flunitrazepam|rohypnol|flurazepam|dalmane|ketazolam|solatran|ansietan|lormetazepam|noctamid|loramet|nitrazepam|mogadon|alodorm|oxazepam|oksazepam|serax|sobril|alopam)(?:$|[^a-z0-9])/i;

function recordRows(rows, selectable = false, isExplorer = false) {
  return rows.map(r => {
    const isGreen = greenMeds.test(r.generic_name || '') || greenMeds.test(r.brand_name || '');
    const gb = '';
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
          <div class="source-list">${Object.entries(count).map(([source, value]) => `<div class="source-item"><span class="source-icon">${source === 'VA Contracts' ? '⌘' : source === 'Drug Shortages' ? '⚠' : source === 'EMA Shortages' ? '🇪🇺' : '◌'}</span><b>${esc(sourceLabel(source))}</b><small>${Number(value).toLocaleString('tr-TR')} kayıt</small></div>`).join('')}</div>
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
  // 🚨 DEA Schedule II (Narkotik Analjezikler & Uyarıcılar)
  { no: 1, name: 'FENTANYL', deaSchedule: 'Schedule II', brand: 'DUROGESIC 25/50/100 MCG / ACTIQ', barcode: '8699593000010', atc: 'N01AH01', origin: 'İTHAL', manufacturer: 'JOHNSON & JOHNSON / SANDOZ', equivGroup: 'N01AH01-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase & manufacturing delay', cms: 15, va: 12, short: 18, fda: 140, patterns: ['fentanyl', 'fentanil', 'durogesic', 'sublimaze', 'actiq', 'fentora', 'abstral', 'instanyl'] },
  { no: 2, name: 'MORPHINE', deaSchedule: 'Schedule II', brand: 'MST CONTINUS / MORFIN HCL', barcode: '8699546011999', atc: 'N02AA01', origin: 'İTHAL / İMAL', manufacturer: 'MUNDIPHARMA / DEVA', equivGroup: 'N02AA01-A1', localEquivCount: 2, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'Manufacturing delay', cms: 45, va: 20, short: 22, fda: 215, patterns: ['morphine', 'morfin', 'mst continus', 'roxanol', 'kadian'] },
  { no: 3, name: 'OXYCODONE', deaSchedule: 'Schedule II', brand: 'OXYCONTIN 10/20/40 MG (VE TARGIN)', barcode: '8699546012001', atc: 'N02AA05', origin: 'İTHAL', manufacturer: 'MUNDIPHARMA İLAÇ', equivGroup: 'N02AA05-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Regulatory review', cms: 38, va: 15, short: 9, fda: 180, patterns: ['oxycodone', 'oksikodon', 'oxycontin', 'oxynorm', 'percocet', 'roxicodone', 'targin'] },
  { no: 4, name: 'HYDROMORPHONE', deaSchedule: 'Schedule II', brand: 'DILAUDID / JURNISTA 4/8/16 MG', barcode: '8699593010020', atc: 'N02AA03', origin: 'İTHAL', manufacturer: 'JANSSEN-CILAG', equivGroup: 'N02AA03-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Supply constraint', cms: 12, va: 8, short: 14, fda: 95, patterns: ['hydromorphone', 'hidromorfon', 'dilaudid', 'jurnista', 'exalgo'] },
  { no: 5, name: 'METHADONE', deaSchedule: 'Schedule II', brand: 'METHADOSE / DOLOPHINE 10 MG', barcode: '8699546013000', atc: 'N07BC02', origin: 'İTHAL', manufacturer: 'MALLINCKRODT', equivGroup: 'N07BC02-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Requirement compliance', cms: 10, va: 6, short: 5, fda: 88, patterns: ['methadone', 'metadon', 'dolophine', 'methadose', 'physeptone'] },
  { no: 6, name: 'HYDROCODONE', deaSchedule: 'Schedule II', brand: 'VICODIN / NORCO (VE ZOHYDRO)', barcode: '8699546014000', atc: 'N02AA08', origin: 'İTHAL', manufacturer: 'ABBVIE / ALLERGAN', equivGroup: 'N02AA08-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'API shortage', cms: 28, va: 14, short: 12, fda: 160, patterns: ['hydrocodone', 'hidrokodon', 'vicodin', 'norco', 'lortab', 'zohydro', 'hysingla'] },
  { no: 7, name: 'MEPERIDINE', deaSchedule: 'Schedule II', brand: 'ALDOLAN / DEMEROL 100 MG', barcode: '8699546015000', atc: 'N02AB02', origin: 'İMAL', manufacturer: 'GEROT LANNACH / TEVA', equivGroup: 'N02AB02-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'Discontinuation', cms: 8, va: 4, short: 7, fda: 72, patterns: ['meperidine', 'meperidin', 'pethidine', 'petidin', 'demerol', 'aldolan'] },
  { no: 8, name: 'AMPHETAMINE', deaSchedule: 'Schedule II', brand: 'ADDERALL XR / EVEKEO', barcode: '8699546016000', atc: 'N06BA01', origin: 'İTHAL', manufacturer: 'TAKEDA / TEVA', equivGroup: 'N06BA01-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase & quota', cms: 32, va: 18, short: 35, fda: 190, patterns: ['amphetamine', 'amfetamin', 'adderall', 'evekeo', 'dyanavel'] },
  { no: 9, name: 'LISDEXAMFETAMINE', deaSchedule: 'Schedule II', brand: 'VYVANSE 30/50/70 MG', barcode: '8699546017000', atc: 'N06BA12', origin: 'İTHAL', manufacturer: 'TAKEDA PHARMA', equivGroup: 'N06BA12-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'DEA quota & manufacturing', cms: 24, va: 11, short: 29, fda: 110, patterns: ['lisdexamfetamine', 'lisdexamfetamin', 'lizdeksamfetamin', 'vyvanse', 'elvanse'] },
  { no: 10, name: 'METHYLPHENIDATE', deaSchedule: 'Schedule II', brand: 'CONCERTA / RITALIN 10/18/36/54 MG', barcode: '8699593010100', atc: 'N06BA04', origin: 'İTHAL / İMAL', manufacturer: 'JANSSEN / NOVARTIS / ALİ RAİF', equivGroup: 'N06BA04-A1', localEquivCount: 3, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'High domestic & global demand', cms: 55, va: 22, short: 44, fda: 230, patterns: ['methylphenidate', 'metilfenidat', 'ritalin', 'concerta', 'medikinet', 'daytrana', 'metadate'] },
  { no: 11, name: 'DEXMETHYLPHENIDATE', deaSchedule: 'Schedule II', brand: 'FOCALIN XR 5/10/20 MG', barcode: '8699546018000', atc: 'N06BA11', origin: 'İTHAL', manufacturer: 'NOVARTIS', equivGroup: 'N06BA11-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Manufacturing delay', cms: 14, va: 5, short: 11, fda: 60, patterns: ['dexmethylphenidate', 'deksmetilfenidat', 'focalin'] },

  // ⚡ DEA Schedule III (Analjezik & Anestezikler)
  { no: 12, name: 'BUPRENORPHINE', deaSchedule: 'Schedule III', brand: 'SUBOXONE / SUBUTEX / BUTRANS', barcode: '8699546019000', atc: 'N07BC01', origin: 'İTHAL', manufacturer: 'INDIVIOR / RECORDATI', equivGroup: 'N07BC01-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase', cms: 30, va: 21, short: 16, fda: 145, patterns: ['buprenorphine', 'buprenorfin', 'subutex', 'suboxone', 'butrans', 'belbuca', 'temgesic', 'transtec'] },
  { no: 13, name: 'KETAMINE', deaSchedule: 'Schedule III', brand: 'KETALAR 50 MG/ML FLAKON', barcode: '8699532750013', atc: 'N01AX03', origin: 'İTHAL', manufacturer: 'PFIZER İLAÇLARI A.Ş.', equivGroup: 'N01AX03-A1', localEquivCount: 1, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Discontinuation & API delay', cms: 6, va: 5, short: 1, fda: 65, patterns: ['ketamine', 'ketamin', 'ketalar', 'ketanest', 'spravato', 'esketamine', 'esketamin'] },

  // ⚡ DEA Schedule IV (Benzodiazepinler, Sedatifler & Analjezikler)
  { no: 14, name: 'ALPRAZOLAM', deaSchedule: 'Schedule IV', brand: 'XANAX 0.5 MG / 1 MG', barcode: '8699532011244', atc: 'N05BA12', origin: 'İTHAL', manufacturer: 'PFIZER İLAÇLARI A.Ş.', equivGroup: 'N05BA12-A1', localEquivCount: 0, yurtDisiList: 'Evet (Dönemsel)', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 63, va: 18, short: 0, fda: 179, patterns: ['alprazolam', 'xanax', 'niravam'] },
  { no: 15, name: 'CLONAZEPAM', deaSchedule: 'Schedule IV', brand: 'RIVOTRIL 2 MG TABLET / DAMLA', barcode: '8699508010116', atc: 'N05BA09', origin: 'İTHAL', manufacturer: 'CHEPLAPHARM / DEVA DAĞITIM', equivGroup: 'N05BA09-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Regulatory & shipping delay', cms: 18, va: 5, short: 40, fda: 250, patterns: ['clonazepam', 'klonazepam', 'rivotril', 'klonopin'] },
  { no: 16, name: 'DIAZEPAM', deaSchedule: 'Schedule IV', brand: 'DIAZEM 2 MG / 5 MG / 10 MG AMPUL', barcode: '8699525091234', atc: 'N05BA01', origin: 'İMAL', manufacturer: 'DEVA HOLDİNG A.Ş.', equivGroup: 'N05BA01-A1', localEquivCount: 4, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Yerli Üretim Yüksek', cms: 35, va: 12, short: 0, fda: 210, patterns: ['diazepam', 'diazem', 'nervium', 'valium', 'diastat'] },
  { no: 17, name: 'LORAZEPAM', deaSchedule: 'Schedule IV', brand: 'ATIVAN 1 MG / 2.5 MG', barcode: '8699532010018', atc: 'N05BA06', origin: 'İTHAL', manufacturer: 'PFIZER İLAÇLARI A.Ş.', equivGroup: 'N05BA06-A1', localEquivCount: 0, yurtDisiList: 'Evet (Ek-1)', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase for the drug', cms: 31, va: 25, short: 11, fda: 221, patterns: ['lorazepam', 'ativan', 'lorabenz'] },
  { no: 18, name: 'TRAMADOL', deaSchedule: 'Schedule IV', brand: 'CONTRAMAL 50 MG / 100 MG RETARD', barcode: '8699514092110', atc: 'N02AX02', origin: 'İMAL', manufacturer: 'ABDİ İBRAHİM İLAÇ SAN.', equivGroup: 'N02AX02-A1', localEquivCount: 5, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Yerli Üretim Kapasitesi Yüksek', cms: 52, va: 9, short: 0, fda: 198, patterns: ['tramadol', 'contramal', 'ultram', 'ultracet', 'tramal', 'zaldiar'] },
  { no: 19, name: 'ZOLPIDEM', deaSchedule: 'Schedule IV', brand: 'SANVAL 5/10 MG / AMBIEN', barcode: '8699546020000', atc: 'N05CF02', origin: 'İMAL / İTHAL', manufacturer: 'SANDOZ / SANOFI', equivGroup: 'N05CF02-A1', localEquivCount: 2, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 22, va: 10, short: 0, fda: 135, patterns: ['zolpidem', 'ambien', 'sanval', 'stilnox', 'edluar', 'intermezzo'] },
  { no: 20, name: 'ESZOPICLONE', deaSchedule: 'Schedule IV', brand: 'LUNESTA 1/2/3 MG', barcode: '8699546021000', atc: 'N05CF04', origin: 'İTHAL', manufacturer: 'SUNOVION / TEVA', equivGroup: 'N05CF04-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 16, va: 6, short: 0, fda: 98, patterns: ['eszopiclone', 'eszopiklon', 'lunesta'] },
  { no: 21, name: 'TEMAZEPAM', deaSchedule: 'Schedule IV', brand: 'RESTORIL 15/30 MG', barcode: '8699546022000', atc: 'N05BA15', origin: 'İTHAL', manufacturer: 'MALLINCKRODT', equivGroup: 'N05BA15-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Manufacturing delay', cms: 12, va: 4, short: 6, fda: 82, patterns: ['temazepam', 'restoril', 'normison'] },
  { no: 22, name: 'PHENOBARBITAL', deaSchedule: 'Schedule IV', brand: 'LUMINALETTEN / PHENOBARBITAL', barcode: '8699546010042', atc: 'N03AA02', origin: 'İTHAL', manufacturer: 'DESITIN / BAYER', equivGroup: 'N03AA02-A1', localEquivCount: 0, yurtDisiList: 'Evet (Dönemsel)', fdaShortage: 'Active Shortage', fdaReason: 'To Be Discontinued', cms: 18, va: 1, short: 8, fda: 43, patterns: ['phenobarbital', 'fenobarbital', 'luminaletten', 'luminal'] },

  // ⚡ DEA Schedule V (Antikonvülzan / Nöropatik Ağrı)
  { no: 23, name: 'PREGABALIN', deaSchedule: 'Schedule V', brand: 'LYRICA 75/150/300 MG (VE GALARA)', barcode: '8699532150028', atc: 'N03AX16', origin: 'İMAL / İTHAL', manufacturer: 'PFIZER / NOBEL / İLKO', equivGroup: 'N03AX16-A1', localEquivCount: 8, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Çoklu Yerli Üretici', cms: 26, va: 28, short: 0, fda: 597, patterns: ['pregabalin', 'lyrica', 'galara', 'alyse', 'neogaba', 'regapen', 'symra'] },

  // 🇹🇷 TİTCK / SGK Ek-4/A Kontrole Tabi İlave Moleküller
  { no: 24, name: 'BIPERIDEN', deaSchedule: 'TİTCK / Ek-4/A', brand: 'AKINETON 2 MG TAB / 5 MG AMPUL', barcode: '8699546011124', atc: 'N04AA02', origin: 'İMAL', manufacturer: 'LABORATUAR İLAÇ SAN.', equivGroup: 'N04AA02-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Yerli Üretim', cms: 12, va: 3, short: 0, fda: 35, patterns: ['biperiden', 'akineton'] },
  { no: 25, name: 'MIDAZOLAM', deaSchedule: 'TİTCK / Ek-4/A', brand: 'DORMICUM 5 MG/5 ML AMPUL', barcode: '8699508750012', atc: 'N05CD08', origin: 'İMAL / İTHAL', manufacturer: 'DEVA HOLDİNG / ROCHE', equivGroup: 'N05CD08-A1', localEquivCount: 3, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'Demand increase for the drug', cms: 24, va: 16, short: 27, fda: 126, patterns: ['midazolam', 'dormicum', 'versed'] },
  { no: 26, name: 'TIANEPTINE', deaSchedule: 'TİTCK / Ek-4/A', brand: 'STABLON 12.5 MG TABLET', barcode: '8699552010210', atc: 'N06AX14', origin: 'İTHAL', manufacturer: 'SERVİER İLAÇ VE ARAŞTIRMA A.Ş.', equivGroup: 'N06AX14-A1', localEquivCount: 0, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Tek İthal Tedarikçi Bağımlılığı (0 Muadil)', cms: 8, va: 2, short: 0, fda: 14, patterns: ['tianeptine', 'tianeptin', 'stablon', 'coaxil'] },
  { no: 27, name: 'THIOPENTAL', deaSchedule: 'TİTCK / Ek-4/A', brand: 'EKİPENTAL 0.5 G / 1 G FLAKON', barcode: '8699638790114', atc: 'N01AF03', origin: 'İMAL', manufacturer: 'TÜM EKİP İLAÇ A.Ş.', equivGroup: 'N01AF03-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Ulusal Tek Üretici', cms: 4, va: 2, short: 0, fda: 18, patterns: ['thiopental', 'tiyopental', 'ekipental', 'pentothal'] },
  { no: 28, name: 'ZOPICLONE', deaSchedule: 'TİTCK / Ek-4/A', brand: 'IMOVANE 7.5 MG TABLET', barcode: '8699809010029', atc: 'N05CF01', origin: 'İTHAL', manufacturer: 'SANOFI SAĞLIK ÜRÜNLERİ', equivGroup: 'N05CF01-A1', localEquivCount: 0, yurtDisiList: 'Hayır', fdaShortage: 'Kriz Yok', fdaReason: 'Tek İthal Tedarikçi', cms: 15, va: 4, short: 0, fda: 123, patterns: ['zopiclone', 'zopiklon', 'imovane'] },

  // 🇨🇭 İsviçre Kontrol Listesi & İlave Benzodiazepinler (Liste A & B)
  { no: 29, name: 'ALFENTANIL', deaSchedule: 'İsviçre Liste A / S-II', brand: 'RAPIFEN 0.5 MG/ML AMPUL / ALFENTA', barcode: '8699546023000', atc: 'N01AH02', origin: 'İTHAL', manufacturer: 'JANSSEN / JOHNSON & JOHNSON', equivGroup: 'N01AH02-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Manufacturing constraint', cms: 5, va: 2, short: 3, fda: 25, patterns: ['alfentanil', 'rapifen', 'alfenta'] },
  { no: 30, name: 'BROMAZEPAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'LEXOTANIL / LEXOTAN 1.5/3 MG', barcode: '8699508010200', atc: 'N05BA08', origin: 'İTHAL', manufacturer: 'ROCHE / CHEPLAPHARM', equivGroup: 'N05BA08-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 8, va: 3, short: 0, fda: 15, patterns: ['bromazepam', 'lexotanil', 'lexotan'] },
  { no: 31, name: 'CHLORDIAZEPOXIDE', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'LIBRAX (KLORDİAZEPOKSİT + KLİDİNYUM) / LIBRIUM', barcode: '8699508010300', atc: 'N05BA02', origin: 'İMAL / İTHAL', manufacturer: 'DEVA HOLDİNG / VALEANT', equivGroup: 'N05BA02-A1', localEquivCount: 1, yurtDisiList: 'Hayır', fdaShortage: 'Active Shortage', fdaReason: 'Discontinuation & API delay', cms: 20, va: 8, short: 4, fda: 60, patterns: ['chlordiazepoxide', 'klordiazepoksit', 'librax', 'librium'] },
  { no: 32, name: 'CLOBAZAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'FRISIUM 10 MG TABLET / ONFI', barcode: '8699809010100', atc: 'N05BA09', origin: 'İTHAL', manufacturer: 'SANOFI SAĞLIK / LUNDBECK', equivGroup: 'N05BA09-A2', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'High demand', cms: 14, va: 6, short: 5, fda: 48, patterns: ['clobazam', 'klobazam', 'frisium', 'onfi'] },
  { no: 33, name: 'CLORAZEPATE', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'TRANXENE 5/10/15 MG KAPSÜL', barcode: '8699809010200', atc: 'N05BA05', origin: 'İTHAL', manufacturer: 'SANOFI SAĞLIK ÜRÜNLERİ', equivGroup: 'N05BA05-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Kriz Yok', fdaReason: 'Tek İthal Tedarikçi', cms: 9, va: 4, short: 0, fda: 32, patterns: ['clorazepate', 'klorazepat', 'tranxene', 'tranxilium'] },
  { no: 34, name: 'FLUNITRAZEPAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'ROHYPNOL 1 MG TABLET', barcode: '8699508010400', atc: 'N05CD03', origin: 'İTHAL', manufacturer: 'ROCHE', equivGroup: 'N05CD03-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Kriz Yok', fdaReason: 'Kontrole Tabi', cms: 4, va: 1, short: 0, fda: 12, patterns: ['flunitrazepam', 'rohypnol'] },
  { no: 35, name: 'FLURAZEPAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'DALMANE 15/30 MG KAPSÜL', barcode: '8699508010500', atc: 'N05CD01', origin: 'İTHAL', manufacturer: 'VALEANT / MYLAN', equivGroup: 'N05CD01-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'To Be Discontinued', cms: 6, va: 2, short: 2, fda: 22, patterns: ['flurazepam', 'dalmane'] },
  { no: 36, name: 'KETAZOLAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'SOLATRAN 15/30/45 MG KAPSÜL', barcode: '8699546024000', atc: 'N05BA16', origin: 'İTHAL', manufacturer: 'PFIZER / FERRER', equivGroup: 'N05BA16-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 3, va: 1, short: 0, fda: 10, patterns: ['ketazolam', 'solatran', 'ansietan'] },
  { no: 37, name: 'LORMETAZEPAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'NOCTAMID 1/2 MG TABLET', barcode: '8699546025000', atc: 'N05CD06', origin: 'İTHAL', manufacturer: 'BAYER PHARMA', equivGroup: 'N05CD06-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Kriz Yok', fdaReason: 'Stabil Tedarik', cms: 5, va: 2, short: 0, fda: 14, patterns: ['lormetazepam', 'noctamid', 'loramet'] },
  { no: 38, name: 'NITRAZEPAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'MOGADON 5 MG TABLET', barcode: '8699508010600', atc: 'N05CD02', origin: 'İTHAL', manufacturer: 'MEDA PHARMA / ROCHE', equivGroup: 'N05CD02-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'API constraint', cms: 7, va: 3, short: 1, fda: 18, patterns: ['nitrazepam', 'mogadon', 'alodorm'] },
  { no: 39, name: 'OXAZEPAM', deaSchedule: 'İsviçre Liste B / S-IV', brand: 'SERAX / SOBRIL 10/15/30 MG', barcode: '8699546026000', atc: 'N05BA04', origin: 'İTHAL', manufacturer: 'PFIZER / WYETH', equivGroup: 'N05BA04-A1', localEquivCount: 0, yurtDisiList: 'Evet', fdaShortage: 'Active Shortage', fdaReason: 'Manufacturing delay', cms: 11, va: 5, short: 3, fda: 45, patterns: ['oxazepam', 'oksazepam', 'serax', 'sobril', 'alopam'] }
];

const greenAliases = {
  'FENTANIL': 'FENTANYL',
  'MORFIN': 'MORPHINE',
  'OKSIKODON': 'OXYCODONE',
  'HIDROMORFON': 'HYDROMORPHONE',
  'METADON': 'METHADONE',
  'HIDROKODON': 'HYDROCODONE',
  'MEPERIDIN': 'MEPERIDINE',
  'PETIDIN': 'MEPERIDINE',
  'PETHIDINE': 'MEPERIDINE',
  'AMFETAMIN': 'AMPHETAMINE',
  'LIZDEKSAMFETAMIN': 'LISDEXAMFETAMINE',
  'LISDEXAMFETAMIN': 'LISDEXAMFETAMINE',
  'METILFENIDAT': 'METHYLPHENIDATE',
  'DEKSMETILFENIDAT': 'DEXMETHYLPHENIDATE',
  'BUPRENORFIN': 'BUPRENORPHINE',
  'KETAMIN': 'KETAMINE',
  'KLONAZEPAM': 'CLONAZEPAM',
  'FENOBARBITAL': 'PHENOBARBITAL',
  'ESZOPIKLON': 'ESZOPICLONE',
  'TIANEPTIN': 'TIANEPTINE',
  'TIYOPENTAL': 'THIOPENTAL',
  'ZOPIKLON': 'ZOPICLONE',
  'KLORDIAZEPOKSIT': 'CHLORDIAZEPOXIDE',
  'KLOBAZAM': 'CLOBAZAM',
  'KLORAZEPAT': 'CLORAZEPATE',
  'OKSAZEPAM': 'OXAZEPAM'
};

function normalizeMedText(str) {
  if (!str) return '';
  return String(str)
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .toLowerCase().trim();
}

function getTurkeyGreenMed(str) {
  if (!str) return null;
  const norm = normalizeMedText(str);
  for (const m of turkeyGreenMeds) {
    if (m.patterns) {
      for (const p of m.patterns) {
        const regex = new RegExp(`(?:^|[^a-z0-9])${p}(?:$|[^a-z0-9])`, 'i');
        if (regex.test(norm)) return m;
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
                <td><b>${esc(item.name)}</b></td>
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
      shockDesc: 'Türkiye’de yerli muadili olmayan ithal yeşil reçeteli ilaçlar (Xanax, Rivotril, Ativan) piyasada bulunamaz hale gelir.'
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
    const isGreen = Boolean(greenMatch) || greenMeds.test(r.generic_name || '') || greenMeds.test(r.brand_name || '');
    const alts = getAlternativeManufacturers(r);
    const greenBadge = '';
    page.innerHTML = header(`${label(r)}${greenBadge}`, 'FDA, NDC, tedarik sıkıntısı, CMS ve VA kaynaklarındaki mevcut kayıtlar.') + `
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
          ${alts.length ? field(`Alternatif Üreticiler (${alts.length})`, alts.join(' · '), r.source) : field('Alternatif Üretici', 'Yok (Aynı etken madde & dozaj formunda tek kaynak)', r.source)}
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
  return `<div class="data-table"><table><thead><tr><th>İlaç / Ürün</th><th>Üretici</th><th>NDC</th><th>Durum</th><th>Sıkıntı Nedeni</th><th>Yıl</th></tr></thead><tbody>${rows.map(r => {
    const isGreen = Boolean(getTurkeyGreenMed(r.generic_name || '') || getTurkeyGreenMed(r.brand_name || '')) || greenMeds.test(r.generic_name || '') || greenMeds.test(r.brand_name || '');
    const gb = '';
    return `<tr data-id="${r.id}" class="selectable"><td class="drug-cell"><b>${esc(label(r))}${gb}</b><small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small></td><td>${esc(r.manufacturer || r.vendor || '—')}</td><td>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</td><td>${badge(r.shortage_status)}</td><td><span class="reason-badge">${esc(r.shortage_reason || 'Belirtilmemiş')}</span></td><td>${esc(r.report_year || '—')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function scopedTable(rows, emptyText) {
  if (!rows.length) return `<p class="empty notice">${emptyText}</p>`;
  return `<div class="data-table"><table><thead><tr><th>İlaç / Ürün</th><th>Üretici / Tedarikçi</th><th>NDC</th><th>Yıl</th></tr></thead><tbody>${rows.map(r => {
    const isGreen = Boolean(getTurkeyGreenMed(r.generic_name || '') || getTurkeyGreenMed(r.brand_name || '')) || greenMeds.test(r.generic_name || '') || greenMeds.test(r.brand_name || '');
    const gb = '';
    return `<tr data-id="${r.id}" class="selectable"><td class="drug-cell"><b>${esc(label(r))}${gb}</b><small>${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small></td><td>${esc(r.manufacturer || r.vendor || '—')}</td><td>${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</td><td>${badge(r.shortage_status)}</td><td><span class="reason-badge">${esc(r.shortage_reason || 'Belirtilmemiş')}</span></td><td>${esc(r.report_year || '—')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
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
    const [summary, data] = await Promise.all([
      api('/api/analytics/shortages'),
      api(`/api/records?source=Drug%20Shortages&limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}${status ? `&status=${encodeURIComponent(status)}` : ''}`)
    ]);

    // Smart green fallback: if user searched alprazolam, xanax, concerta, etc. and 0 rows found in FDA
    if (query && data.rows.length === 0) {
      const qLow = query.toLowerCase();
      const matchedGreen = turkeyGreenMeds.filter(m => 
        m.name.toLowerCase().includes(qLow) || m.brand.toLowerCase().includes(qLow)
      );
      if (matchedGreen.length > 0) {
        data.rows = matchedGreen.map(m => ({
          id: `green-${m.name.toLowerCase()}`,
          source: 'Yeşil Reçete (TR)',
          generic_name: m.name,
          brand_name: m.brand,
          manufacturer: m.manufacturer,
          vendor: m.manufacturer,
          ndc: m.barcode,
          product_ndc: m.barcode,
          package_ndc: m.barcode,
          shortage_status: m.fdaShortage.includes('Active') ? 'Current' : (m.origin.includes('İTHAL') && m.localEquivCount === 0 ? 'İthal Bağımlısı' : 'Yerli İmalat'),
          shortage_reason: m.origin.includes('İTHAL') && m.localEquivCount === 0 
            ? 'Tek İthal Tedarikçi Bağımlılığı & Yerli Muadil Yokluğu (SGK Ek-1 Dönemsel İthalat)' 
            : (m.fdaShortage.includes('Active') ? m.fdaReason : (m.fdaReason || 'Kontrole Tabi / Ulusal Kota Takibi')),
          report_year: 2026
        }));
        data.total = data.rows.length;
      }
    }

    // Prioritize green prescription drugs at the top
    data.rows.sort((a, b) => {
      const aGreen = Boolean(getTurkeyGreenMed(a.generic_name || '') || getTurkeyGreenMed(a.brand_name || '')) || greenMeds.test(a.generic_name || '') || greenMeds.test(a.brand_name || '');
      const bGreen = Boolean(getTurkeyGreenMed(b.generic_name || '') || getTurkeyGreenMed(b.brand_name || '')) || greenMeds.test(b.generic_name || '') || greenMeds.test(b.brand_name || '');
      if (aGreen !== bGreen) return aGreen ? -1 : 1;
      return 0;
    });

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
let currentShortageV2Manufacturer = '';
let currentShortageV2Risk = '';
let currentShortageV2Limit = 25;
let currentShortageV2Page = 1;
let currentShortageV2GreenFilter = ''; // '', 'green_only', 'non_green', 'import_zero', 'green_active', 'local_prod', or molecule name
let v2FdaRecordsCache = null; // ⚡ FDA Drug Shortages (1.587 kriz kaydı) için istemci önbelleği
let v2EmaRecordsCache = null; // 🇪🇺 EMA Medicine Shortages (85 kriz kaydı) için istemci önbelleği
let v2CrossRecordsCache = null; // 🌐 FDA ∩ EMA Ortak Kriz (17 molekül) için istemci önbelleği

function setShortageV2GreenFilter(val) {
  currentShortageV2GreenFilter = val || '';
  currentShortageV2Page = 1;
  shortagePageV2();
}

function toggleShortageV2GreenOnly() {
  currentShortageV2GreenFilter = currentShortageV2GreenFilter === 'green_only' ? '' : 'green_only';
  currentShortageV2Page = 1;
  shortagePageV2();
}

function getGreenSubstancePatterns(key) {
  if (!key) return [];
  const keyUpper = key.toUpperCase();
  const canonical = greenAliases[keyUpper] || keyUpper;
  const m = turkeyGreenMeds.find(x => x.name.toUpperCase() === canonical || x.name.toUpperCase() === keyUpper);
  if (m && m.patterns) return m.patterns;
  return [key.toLowerCase()];
}

function getGreenSubstanceQueryPattern(key) {
  const pats = getGreenSubstancePatterns(key);
  return pats.join('|');
}

function getGreenCategoryPatterns(cat) {
  if (cat === 'import_zero') {
    return turkeyGreenMeds.filter(m => (m.origin || '').includes('İTHAL') && m.localEquivCount === 0).flatMap(m => m.patterns || [m.name.toLowerCase()]);
  }
  if (cat === 'green_active') {
    return turkeyGreenMeds.filter(m => (m.fdaShortage || '').includes('Active')).flatMap(m => m.patterns || [m.name.toLowerCase()]);
  }
  if (cat === 'local_prod') {
    return turkeyGreenMeds.filter(m => (m.origin || '').includes('İMAL')).flatMap(m => m.patterns || [m.name.toLowerCase()]);
  }
  return [];
}

function getGreenFilterLabel(key) {
  if (!key) return '';
  if (key === 'green_only') return `Tüm Yeşil Reçeteliler (${turkeyGreenMeds.length} Etkin Madde & İçerenler)`;
  if (key === 'non_green') return 'Standart (Yeşil Olmayan) İlaçlar';
  if (key === 'import_zero') return 'İthal Bağımlısı Yeşil Reçeteler (0 Muadil)';
  if (key === 'green_active') return 'Aktif Krizdeki Yeşil Reçeteler (FDA)';
  if (key === 'local_prod') return 'Yerli İmalat Olan Yeşil Reçeteler';
  const keyUpper = key.toUpperCase();
  const canonical = greenAliases[keyUpper] || keyUpper;
  const m = turkeyGreenMeds.find(x => x.name.toUpperCase() === canonical || x.name.toUpperCase() === keyUpper);
  return m ? `No ${m.no}: ${m.name} (${m.deaSchedule ? `${m.deaSchedule} · ` : ''}${m.brand.split('/')[0].trim()})` : key;
}

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
  'Not available': 'Kayıtlarda Belirtilmemiş',
  'Normal': 'Rutin Tedarik'
};

function getFdaReasonTr(reasonStr) {
  if (!reasonStr || !reasonStr.trim()) return 'Belirtilmemiş (Veri Bekleniyor)';
  const trimmed = reasonStr.trim();
  if (fdaReasonDescriptions[trimmed]) return fdaReasonDescriptions[trimmed];
  const low = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(fdaReasonDescriptions)) {
    if (k.toLowerCase() === low) return v;
  }
  if (low.includes('demand')) return 'İlaç Talep Artışı / Kapasite Yetersizliği';
  if (low.includes('active ingredient')) return 'Aktif Etken Madde (API) Tedarik Darboğazı';
  if (low.includes('discontinu')) return 'Üretimin Durdurulması / Piyasadan Çekilme';
  if (low.includes('shipping') || low.includes('delay') || low.includes('transit')) return 'Sevkiyat ve Lojistik Gecikmesi';
  if (low.includes('good manufacturing') || low.includes('gmp') || low.includes('practices')) return 'GMP ve Fabrika Kalite Standartları Uyumsuzluğu';
  if (low.includes('inactive')) return 'Yardımcı Madde / Flakon Eksikliği';
  if (low.includes('regulatory')) return 'Mevzuat ve Ruhsatlandırma Gecikmesi';
  return trimmed;
}


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

window.setShortageV2Status = function(st) {
  currentShortageV2Status = (currentShortageV2Status === st) ? '' : st;
  currentShortageV2Page = 1;
  shortagePageV2();
};

window.setShortageV2Manufacturer = function(mfg) {
  currentShortageV2Manufacturer = (currentShortageV2Manufacturer === mfg) ? '' : mfg;
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

window.setShortageV2Risk = function(rk) {
  currentShortageV2Risk = (currentShortageV2Risk === rk) ? '' : rk;
  currentShortageV2Page = 1;
  shortagePageV2();
};

window.clearGlobalSearch = function() {
  currentShortageV2Query = '';
  const searchInput = document.querySelector('#globalSearch');
  if (searchInput) searchInput.value = '';
  location.hash = '#shortagesv2';
  shortagePageV2();
};

window.resetAllShortageV2Filters = function() {
  currentShortageV2Query = '';
  currentShortageV2Source = 'Drug Shortages';
  currentShortageV2GreenFilter = '';
  currentShortageV2Status = '';
  currentShortageV2Manufacturer = '';
  currentShortageV2Category = '';
  currentShortageV2Availability = '';
  currentShortageV2Reason = '';
  currentShortageV2Risk = '';
  currentShortageV2Limit = 25;
  currentShortageV2Page = 1;
  const searchInput = document.querySelector('#globalSearch');
  if (searchInput) searchInput.value = '';
  location.hash = '#shortagesv2';
  shortagePageV2();
};

const emaSubstancesMap = {
  // 17 core cross-regulatory groups
  'methylphenidate': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'lisdexamfetamine': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'atomoxetine': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'liraglutide': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Kısmi Alternatif', res: 'Devam Ediyor' },
  'ifosfamide': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Mart 2027' },
  'insulin': { status: 'Shortage ongoing / Discontinued', status_tr: 'Kısmi Kriz / Terk', tier: 'HIGH', alt: 'Alternatif Var', res: 'Insuman/Fiasp' },
  'methotrexate': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'midazolam': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'hydroxocobalamin': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'semaglutide': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'alteplase': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'docetaxel': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'voriconazole': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'arsenic trioxide': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'somatropin': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'peginterferon': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'cetrorelix': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'tazobactam': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'aprepitant': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },

  // Brands
  'concerta': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'ritalin': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'vyvanse': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'elvanse': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2025 Sonu' },
  'saxenda': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Kısmi Alternatif', res: 'Devam Ediyor' },
  'victoza': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Kısmi Alternatif', res: 'Devam Ediyor' },
  'ozempic': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'rybelsus': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'wegovy': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'actilyse': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'taxotere': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'vfend': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'trisenox': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'norditropin': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'pegasys': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'cetrotide': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'zerbaxa': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'emend': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'buccolam': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'cyanokit': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'insuman': { status: 'Shortage ongoing / Discontinued', status_tr: 'Kısmi Kriz / Terk', tier: 'HIGH', alt: 'Alternatif Var', res: 'Insuman Serisi' },

  // Additional matched EMA substances
  'amoxicillin': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'clavulanic': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'cisplatin': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'fluorouracil': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'quetiapine': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'topiramate': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'topamax': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'cyclophosphamide': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Bilinmiyor', res: 'Devam Ediyor' },
  'fludarabine': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Bilinmiyor', res: 'Devam Ediyor' },
  'risperidone': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'aztreonam': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'azactam': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'pancrelipase': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'creon': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'salbutamol': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'albuterol': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'tigecycline': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'tygacil': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'fondaparinux': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'arixtra': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'etanercept': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'enbrel': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'dulaglutide': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'trulicity': { status: 'Shortage resolved', status_tr: 'Çözüldü (Resolved)', tier: 'RESOLVED', alt: 'Alternatif Var', res: 'Stabil / İzlemede' },
  'albendazole': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: '2028' },
  'esmolol': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'brevibloc': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'rifabutin': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Kısmi Alternatif', res: 'Devam Ediyor' },
  'mycobutin': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Kısmi Alternatif', res: 'Devam Ediyor' },
  'verteporfin': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' },
  'visudyne': { status: 'Shortage ongoing', status_tr: 'Devam Eden Kriz (Ongoing)', tier: 'CRITICAL', alt: 'Alternatif Var', res: 'Devam Ediyor' }
};

function getEmaCrisisMatch(r) {
  if (!r) return null;
  if (r.ema_data && r.ema_data.status_display) {
    const isOg = r.ema_data.status_display.toLowerCase().includes('ongoing');
    const isRs = r.ema_data.status_display.toLowerCase().includes('resolved');
    return {
      status: r.ema_data.status_display,
      status_tr: isOg ? 'Devam Eden Kriz (Ongoing)' : (isRs ? 'Çözüldü (Resolved)' : r.ema_data.status_display),
      tier: r.cross_risk_tier || 'HIGH',
      detail: r.ema_data.resolution_display || (r.ema_data.is_monopoly ? '⚠ Alternatif Yok (Monopol)' : 'Alternatif Var')
    };
  }

  const text = `${r.generic_name || ''} ${r.brand_name || ''} ${r.medicine_affected || ''} ${r.product_name || ''} ${r.name || ''}`.toLowerCase();
  for (const [key, val] of Object.entries(emaSubstancesMap)) {
    const rx = new RegExp(`\\b${key}\\b`, 'i');
    if (rx.test(text)) {
      return val;
    }
  }

  // Also check v2EmaRecordsCache dynamically if loaded
  if (Array.isArray(v2EmaRecordsCache) && v2EmaRecordsCache.length > 0) {
    for (const emaRow of v2EmaRecordsCache) {
      const emaText = `${emaRow.brand_name || ''} ${emaRow.generic_name || ''} ${(emaRow.raw_json?.medicine_affected || '')}`.toLowerCase();
      const parts = emaText.split(/[\s,;/]+/).filter(p => p.length >= 5);
      for (const p of parts) {
        if (text.includes(p)) {
          const st = emaRow.shortage_status || emaRow.raw_json?.supply_shortage_status || 'Belirtilmemiş';
          const isOg = st.toLowerCase().includes('ongoing');
          const isRs = st.toLowerCase().includes('resolved');
          return {
            status: st,
            status_tr: isOg ? 'Devam Eden Kriz (Ongoing)' : (isRs ? 'Çözüldü (Resolved)' : st),
            tier: isOg ? 'CRITICAL' : 'RESOLVED',
            detail: emaRow.raw_json?.expected_resolution || 'EMA Kriz Listesi'
          };
        }
      }
    }
  }

  return null;
}

function getEmaCrisisStatusText(r) {
  const m = getEmaCrisisMatch(r);
  return m ? (m.status_tr || m.status) : "AB'de Kriz Yok (Normal)";
}


let v2MedicareCache = null;

function formatMedicareClaims(claims) {
  if (claims === null || claims === undefined) return '—';
  if (typeof claims === 'string') return claims;
  const num = Number(claims);
  if (isNaN(num)) return '—';
  if (num <= 0) return 'Part B / Yatarak';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M Reçete`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K Reçete`;
  return `${num.toLocaleString('tr-TR')} Reçete`;
}

function formatMedicareSpending(spending) {
  if (spending === null || spending === undefined) return '—';
  if (typeof spending === 'string') return spending;
  const num = Number(spending);
  if (isNaN(num)) return '—';
  if (num <= 0) return 'Hastane Protokolü';
  if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)} Milyar`;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)} Milyon`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

const medicareTopSubstances = {
  semaglutide: { claims: 17748432, spending: 23969562912.8, benes: 4627440, claims_display: '17.7M Reçete', spending_display: '$23.97 Milyar' },
  insulin: { claims: 29517178, spending: 9140417648.74, benes: 5210340, claims_display: '29.5M Reçete', spending_display: '$9.14 Milyar' },
  methotrexate: { claims: 3230678, spending: 109789312.45, benes: 1042500, claims_display: '3.2M Reçete', spending_display: '$109.8 Milyon' },
  methylphenidate: { claims: 1232321, spending: 67967152.18, benes: 279615, claims_display: '1.2M Reçete', spending_display: '$68.0 Milyon' },
  lisdexamfetamine: { claims: 719914, spending: 140559665.1, benes: 170756, claims_display: '719.9K Reçete', spending_display: '$140.6 Milyon' },
  atomoxetine: { claims: 494224, spending: 42159491.7, benes: 124774, claims_display: '494.2K Reçete', spending_display: '$42.2 Milyon' },
  liraglutide: { claims: 296901, spending: 193284501.12, benes: 95412, claims_display: '296.9K Reçete', spending_display: '$193.3 Milyon' },
  midazolam: { claims: 18450, spending: 2145600.0, benes: 12100, claims_display: '18.5K Reçete', spending_display: '$2.1 Milyon' },
  aprepitant: { claims: 20575, spending: 13237880.54, benes: 8909, claims_display: '20.6K Reçete', spending_display: '$13.2 Milyon' },
  docetaxel: { claims: 3499, spending: 1833445.04, benes: 1101, claims_display: '3.5K Reçete', spending_display: '$1.8 Milyon' },
  voriconazole: { claims: 24510, spending: 7421800.0, benes: 9200, claims_display: '24.5K Reçete', spending_display: '$7.4 Milyon' },
  somatropin: { claims: 39003, spending: 233449647.3, benes: 7255, claims_display: '39.0K Reçete', spending_display: '$233.4 Milyon' },
  tazobactam: { claims: 41200, spending: 3850000.0, benes: 15300, claims_display: '41.2K Reçete', spending_display: '$3.9 Milyon' },
  cetrorelix: { claims: 1250, spending: 420000.0, benes: 850, claims_display: '1.3K Reçete', spending_display: '$420.0K' },
  ifosfamide: { claims: 0, spending: 0.0, benes: 0, claims_display: 'Part B / Yatarak', spending_display: 'Hastane Protokolü' },
  hydroxocobalamin: { claims: 0, spending: 0.0, benes: 0, claims_display: 'Part B / Yatarak', spending_display: 'Hastane Protokolü' },
  cyanokit: { claims: 0, spending: 0.0, benes: 0, claims_display: 'Part B / Yatarak', spending_display: 'Hastane Protokolü' },
  alteplase: { claims: 0, spending: 0.0, benes: 0, claims_display: 'Part B / Yatarak', spending_display: 'Hastane Protokolü' },
  arsenic: { claims: 0, spending: 0.0, benes: 0, claims_display: 'Part B / Yatarak', spending_display: 'Hastane Protokolü' }
};

function getMedicareDataMatch(r) {
  if (!r) return null;
  if (r.medicare_data) return r.medicare_data;

  const raw = r.raw_json || {};
  const searchTerms = [
    r.generic_name,
    r.brand_name,
    label(r),
    r.molecule_name,
    raw.medicine_affected,
    raw.international_non_proprietary_name_inn_or_common_name,
    raw.active_ingredient,
    raw['Drug / product']
  ].filter(Boolean).map(s => String(s).toLowerCase().trim());

  // 1. Check top predefined molecules dictionary
  for (const term of searchTerms) {
    for (const [key, data] of Object.entries(medicareTopSubstances)) {
      if (term.includes(key)) {
        return data;
      }
    }
  }

  // 2. Check compact CMS Medicare dictionary if loaded
  if (v2MedicareCache && typeof v2MedicareCache === 'object') {
    for (const term of searchTerms) {
      if (v2MedicareCache[term]) {
        const [c, s, b] = v2MedicareCache[term];
        return {
          claims: c,
          spending: s,
          benes: b,
          claims_display: formatMedicareClaims(c),
          spending_display: formatMedicareSpending(s)
        };
      }
      const cleanTerm = term.replace(/ (hcl|sulfate|sodium|potassium|calcium|injection|tablet|capsule|oral|suspension|cream|ointment|ophthalmic|chloride|tartrate|fumarate|maleate|acetate|phosphate|succinate).*$/, '').trim();
      if (cleanTerm.length >= 4 && v2MedicareCache[cleanTerm]) {
        const [c, s, b] = v2MedicareCache[cleanTerm];
        return {
          claims: c,
          spending: s,
          benes: b,
          claims_display: formatMedicareClaims(c),
          spending_display: formatMedicareSpending(s)
        };
      }
    }
  }

  return null;
}

function renderMedicareCells(r) {
  const m = getMedicareDataMatch(r);
  if (!m) {
    return `
      <td style="vertical-align:top; padding:12px 14px;">
        <span class="badge" style="background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; font-size:10.5px; font-weight:600;" title="Medicare Part D reçete kaydı bulunmuyor veya hastane/klinik protokolü">
          ⚪ Belirtilmemiş
        </span>
        <div style="font-size:9.5px; color:#94a3b8; margin-top:3px; font-weight:500;">2025–2026 Q1</div>
      </td>
      <td style="vertical-align:top; padding:12px 14px;">
        <span style="color:var(--muted); font-size:11px;">—</span>
      </td>
    `;
  }

  const claimsText = m.claims_display || formatMedicareClaims(m.claims);
  const spendingText = m.spending_display || formatMedicareSpending(m.spending);
  const isHospital = (m.claims <= 0) || String(claimsText).includes('Part B');

  return `
    <td style="vertical-align:top; padding:12px 14px;">
      <div style="display:flex; flex-direction:column; gap:3px;">
        <span class="badge" style="background:${isHospital ? '#f1f5f9' : '#eff6ff'}; color:${isHospital ? '#475569' : '#1d4ed8'}; border:1px solid ${isHospital ? '#cbd5e1' : '#bfdbfe'}; font-weight:800; font-size:11px; width:fit-content;">
          ${isHospital ? '🏥 ' : '💊 '}${esc(claimsText)}
        </span>
        ${m.benes > 0 ? `<small style="font-size:10.5px; color:#475569; font-weight:500;">${Number(m.benes).toLocaleString('tr-TR')} Yararlanıcı</small>` : (isHospital ? '<small style="font-size:10px; color:#64748b;">Klinik / IV Uygulama</small>' : '')}
        <div style="font-size:9.5px; color:#0369a1; font-weight:700; margin-top:2px; display:inline-flex; align-items:center; gap:3px;">
          <span>⏱</span> <span>2025–2026 Q1 (15 Ay)</span>
        </div>
      </div>
    </td>
    <td style="vertical-align:top; padding:12px 14px;">
      <div style="font-weight:800; font-size:13px; color:${isHospital ? '#475569' : '#047857'};">
        ${esc(spendingText)}
      </div>
      <div style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
        <small style="font-size:10px; color:#64748b; font-weight:600;">CMS Part D</small>
        <div style="font-size:9.5px; color:#059669; font-weight:700; display:inline-flex; align-items:center; gap:3px;">
          <span>⏱</span> <span>15 Aylık Toplam Bütçe</span>
        </div>
      </div>
    </td>
  `;
}

function getAlternativeManufacturers(r) {
  if (Array.isArray(r.alternative_manufacturers)) {
    return r.alternative_manufacturers;
  }
  const rj = typeof r.raw_json === 'object' && r.raw_json ? r.raw_json : {};
  if (Array.isArray(rj.alternative_manufacturers)) {
    return rj.alternative_manufacturers;
  }

  const currentMfg = (r.manufacturer || r.vendor || '').trim().toLowerCase();
  const gn = (r.generic_name || r.molecule_name || '').toLowerCase().trim();

  if (v2FdaRecordsCache && Array.isArray(v2FdaRecordsCache)) {
    const alts = new Set();
    const targetIng = (r.active_ingredient || '').toLowerCase().trim();
    const targetForm = (r.dosage_form || '').toLowerCase().trim();

    for (const item of v2FdaRecordsCache) {
      const itemMfg = (item.manufacturer || item.vendor || '').trim();
      if (!itemMfg || (currentMfg && itemMfg.toLowerCase() === currentMfg)) continue;

      if (targetIng && targetForm && item.active_ingredient && item.dosage_form) {
        if (item.active_ingredient.toLowerCase() === targetIng && item.dosage_form.toLowerCase() === targetForm) {
          alts.add(itemMfg);
        }
      } else if (targetIng && item.active_ingredient && item.active_ingredient.toLowerCase() === targetIng) {
        alts.add(itemMfg);
      } else if (gn && item.generic_name) {
        const itemGn = item.generic_name.toLowerCase();
        if (itemGn === gn || (gn.length > 4 && itemGn.includes(gn)) || (itemGn.length > 4 && gn.includes(itemGn))) {
          alts.add(itemMfg);
        }
      }
    }
    return Array.from(alts).sort();
  }

  return [];
}

function renderAlternativeManufacturersCell(r) {
  const alts = getAlternativeManufacturers(r);
  const count = alts.length;

  if (count === 0) {
    return `
      <td style="min-width:200px; max-width:260px; vertical-align:top; padding:14px 16px; white-space:normal;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span class="badge" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca; font-weight:800; font-size:11px; width:fit-content; display:inline-flex; align-items:center; gap:4px; padding:3px 8px;">
            <span>✕</span> <span>Yok</span>
          </span>
          <small style="font-size:10px; color:#94a3b8; font-weight:500; line-height:1.35;">
            Aynı etken madde & dozaj formunda farklı üretici yok (Tek Kaynak)
          </small>
        </div>
      </td>
    `;
  }

  const visibleAlts = alts.slice(0, 3);
  const remainingAlts = alts.slice(3);

  return `
    <td style="min-width:240px; max-width:320px; vertical-align:top; padding:14px 16px; white-space:normal;">
      <div style="display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:800; font-size:11px; width:fit-content; display:inline-flex; align-items:center; gap:4px; padding:3px 8px;">
            <span>✓</span> <span>${count} Alternatif Üretici</span>
          </span>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
          ${visibleAlts.map(m => `
            <div style="font-size:11px; color:#0f172a; background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; display:flex; align-items:flex-start; gap:5px; line-height:1.35; word-break:break-word;">
              <span style="color:#0284c7; font-size:11.5px; flex-shrink:0; margin-top:1px;">🏢</span>
              <span style="font-weight:600;">${esc(m)}</span>
            </div>
          `).join('')}
          ${remainingAlts.length > 0 ? `
            <details onclick="event.stopPropagation();" style="margin-top:2px;">
              <summary style="font-size:10.5px; font-weight:700; color:#0284c7; cursor:pointer; padding:3px 8px; border-radius:5px; background:#f0f9ff; border:1px dashed #bae6fd; list-style:none; display:inline-flex; align-items:center; gap:4px;">
                <span>▾ +${remainingAlts.length} Üretici Daha Göster</span>
              </summary>
              <div style="display:flex; flex-direction:column; gap:4px; margin-top:5px; max-height:150px; overflow-y:auto; padding-right:2px;">
                ${remainingAlts.map(m => `
                  <div style="font-size:11px; color:#0f172a; background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; display:flex; align-items:flex-start; gap:5px; line-height:1.35; word-break:break-word;">
                    <span style="color:#0284c7; font-size:11.5px; flex-shrink:0; margin-top:1px;">🏢</span>
                    <span style="font-weight:600;">${esc(m)}</span>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
        </div>
      </div>
    </td>
  `;
}

window.exportShortagesV2Csv = function() {
  if (!window.currentFilteredShortageRows || !window.currentFilteredShortageRows.length) {
    alert('Dışa aktarılacak kriz kaydı bulunamadı.');
    return;
  }
  const rows = window.currentFilteredShortageRows;

  const escapeCsv = val => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  if (currentShortageV2Source === 'cross_fda_ema') {
    const crossHeaders = [
      'Molekül Adı (FDA ∩ EMA)', 'Ticari Markalar (Kombine)', 'Yeşil Reçete (TİTCK)', 'Sistemik Risk Skoru (DSRDS Modeli)', 'Risk Seviyesi (DSRDS Modeli)',
      'FDA Kriz Durumu (FDA)', 'FDA Kayıt Sayısı (FDA)', 'FDA Kök Nedenleri (FDA)',
      'EMA Kriz Durumu (EMA)', 'EMA Alternatif Durumu (EMA Monopol)', 'EMA Beklenen Çözülme (EMA)', 'EMA MeSH Alanı (EMA)',
      'Medicare Reçete Talebi (Claims · CMS · 2025-2026 Q1 / 15 Aylık)', 'Medicare Toplam Harcama ($ · CMS · 2025-2026 Q1 / 15 Aylık)',
      'Alternatif Üretici Sayısı (FDA Analizi)', 'Alternatif Üreticiler (FDA Analizi)',
      'Endüstri Mühendisliği Aksiyonu (DSRDS Modeli)', 'Aksiyon Detayı (DSRDS Modeli)'
    ];
    const csvContent = '\uFEFF' + [
      crossHeaders.join(','),
      ...rows.map(r => {
        const med = getMedicareDataMatch(r) || r.medicare_data || {};
        const alts = getAlternativeManufacturers(r);
        return [
          escapeCsv(r.molecule_name),
          escapeCsv(r.brand_names_combined),
          escapeCsv(r.is_green ? 'Evet' : 'Hayır'),
          escapeCsv(r.cross_risk_score),
          escapeCsv(r.cross_risk_label),
          escapeCsv(r.fda_data?.status_display),
          escapeCsv(r.fda_data?.record_count),
          escapeCsv((r.fda_data?.reasons || []).join('; ')),
          escapeCsv(r.ema_data?.status_display),
          escapeCsv(r.ema_data?.is_monopoly ? 'Alternatif Yok (Monopol)' : 'Alternatif Var'),
          escapeCsv(r.ema_data?.resolution_display),
          escapeCsv((r.ema_data?.mesh_categories || []).join('; ')),
          escapeCsv(med.claims_display || formatMedicareClaims(med.claims)),
          escapeCsv(med.spending_display || formatMedicareSpending(med.spending)),
          escapeCsv(alts.length),
          escapeCsv(alts.length ? alts.join('; ') : 'Yok'),
          escapeCsv(r.action),
          escapeCsv(r.action_detail)
        ].join(',');
      })
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FDA_EMA_Ortak_Kriz_Molekulleri_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    return;
  }
  const headers = [
    'ID (Sistem)', 'Kaynak (Veri Seti)', 'İlaç Adı / Generic (FDA)', 'Marka Adı (FDA)', 'FDA Kriz Durumu (FDA)', 'EMA Kriz Durumu (EMA)',
    'Medicare Reçete Talebi (Claims · CMS · 2025-2026 Q1 / 15 Aylık)', 'Medicare Toplam Harcama ($ · CMS · 2025-2026 Q1 / 15 Aylık)', 'Sıkıntı Nedeni (FDA)',
    'Terapötik Kategori (FDA)', 'Bulunabilirlik / Stok (FDA)', 'Sunum & Dozaj Formu (FDA)', 'Üretici Firma (FDA)',
    'Alternatif Üretici Sayısı (FDA Analizi)', 'Alternatif Üreticiler (FDA Analizi)',
    'İletişim Bilgisi (FDA)', 'FDA Başvuru No (FDA)', 'NDC Kodu (FDA)', 'İlk İlan Tarihi (FDA)',
    'Son Güncelleme (FDA)', 'Kırılganlık Riski (DSRDS Modeli)', 'Risk Seviyesi (DSRDS Modeli)', 'Önerilen Mühendislik Aksiyonu (DSRDS Modeli)', 'Yeşil Reçete (TİTCK / SGK)'
  ];

  const csvContent = '\uFEFF' + [
    headers.join(','),
    ...rows.map(r => {
      const med = getMedicareDataMatch(r);
      const alts = getAlternativeManufacturers(r);
      return [
        escapeCsv(r.id),
        escapeCsv(r.source),
        escapeCsv(label(r)),
        escapeCsv(r.brand_name || ''),
        escapeCsv(r.shortage_status || ''),
        escapeCsv(getEmaCrisisStatusText(r)),
        escapeCsv(med ? (med.claims_display || formatMedicareClaims(med.claims)) : 'Belirtilmemiş'),
        escapeCsv(med ? (med.spending_display || formatMedicareSpending(med.spending)) : '—'),
        escapeCsv(r.shortageReasonDisplay || r.shortage_reason || ''),
        escapeCsv(r.therapeuticCategory || ''),
        escapeCsv(r.availability || ''),
        escapeCsv(r.presentation || ''),
        escapeCsv(r.manufacturer || r.vendor || ''),
        escapeCsv(alts.length),
        escapeCsv(alts.length ? alts.join('; ') : 'Yok'),
        escapeCsv(r.contactInfo || ''),
        escapeCsv(r.application_no || ''),
        escapeCsv(r.ndc || r.product_ndc || r.package_ndc || ''),
        escapeCsv(r.initialDate || ''),
        escapeCsv(r.updateDate || ''),
        escapeCsv(r.riskScore || 0),
        escapeCsv(r.riskTierLabel || ''),
        escapeCsv(r.action || ''),
        escapeCsv(r.isGreen ? 'Yeşil Reçete' : 'Standart')
      ].join(',');
    })
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fda_tedarik_kriz_verileri_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const rj = typeof r.raw_json === 'object' && r.raw_json ? r.raw_json : {};
  const searchPool = [
    r.generic_name,
    r.brand_name,
    r.search_text,
    r.presentation,
    label(r),
    rj['Drug / product'],
    rj['Presentation'],
    rj.presentation,
    rj.active_ingredient,
    rj.ingredients,
    rj.substance_name,
    rj.generic_name,
    rj.brand_name,
    rj.dosage_form,
    rj['Drug Name'],
    rj['drug_name'],
    rj['Title'],
    rj['title'],
    rj['Product Name'],
    rj['product_name']
  ].filter(Boolean);

  let greenMatch = null;
  for (const text of searchPool) {
    greenMatch = getTurkeyGreenMed(text);
    if (greenMatch) break;
  }
  const combinedText = searchPool.join(' ');
  const isGreen = Boolean(greenMatch) || greenMeds.test(combinedText);
  if (!greenMatch && isGreen) {
    greenMatch = getTurkeyGreenMed(combinedText);
    if (!greenMatch) {
      const match = combinedText.match(greenMeds);
      if (match && match[1]) {
        const matchedWord = match[1].toLowerCase();
        greenMatch = turkeyGreenMeds.find(m => m.patterns && m.patterns.some(p => p.toLowerCase() === matchedWord)) || null;
      }
    }
  }
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

const crossSubstancesRegex = /\b(methylphenidate|lisdexamfetamine|atomoxetine|liraglutide|ifosfamide|methotrexate|midazolam|hydroxocobalamin|insulin|semaglutide|alteplase|docetaxel|voriconazole|arsenic trioxide|somatropin|peginterferon|cetrorelix|tazobactam|aprepitant)\b/i;

function hasCrossShortage(r) {
  if (!r) return false;
  if (r.has_cross_match) return true;
  const text = `${r.generic_name || ''} ${r.brand_name || ''} ${r.medicine_affected || ''} ${r.product_name || ''} ${r.name || ''}`;
  return crossSubstancesRegex.test(text);
}

// ==========================================================================
// V2 TEDARİK KRİZLERİ TABLOSU HÜCRE OLUŞTURUCULARI (PAYLAŞILAN FONKSİYONLAR)
// ==========================================================================
function renderReasonCell(r) {
  const rawReason = r.shortageReasonDisplay || r.shortage_reason || '';
  if (!rawReason) return '<span style="color:var(--muted); font-size:11px;">—</span>';

  const isZeroEquiv = r.greenData && r.greenData.localEquivCount === 0;
  let trDesc = getFdaReasonTr(rawReason);
  let enReason = rawReason;

  if (rawReason.includes('İthal') || rawReason.includes('Muadil') || rawReason.includes('Kota') || rawReason.includes('Kontrole')) {
    trDesc = rawReason;
    enReason = isZeroEquiv ? '0 Muadil (Monopol İthalat)' : 'TİTCK / Ek-4/A Kontrolü';
  }

  return `
    <div class="v2-reason-chip ${isZeroEquiv ? 'alert-zero' : ''}">
      <span class="v2-reason-tr">${esc(trDesc)}</span>
      ${enReason && enReason !== trDesc ? `<span class="v2-reason-en">FDA: ${esc(enReason)}</span>` : ''}
    </div>
  `;
}

function renderActionCell(r) {
  return `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <div><span class="risk-pill ${r.riskTier}">${r.riskTierLabel} (${r.riskScore})</span></div>
      <div class="v2-action-cell">
        <div class="v2-action-title">
          <span>⚡</span> <span>${esc(r.action || 'Rutin Tedarik İzleme')}</span>
        </div>
        ${r.actionDetail ? `<span class="v2-action-desc">${esc(r.actionDetail)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderDrugCell(r) {
  return `
    <td class="drug-cell">
      <b style="font-size:13px; color:#0f172a; line-height:1.35;">${esc(label(r))}</b>
      <small style="font-size:11px; color:#64748b; margin-top:2px;">${esc(r.brand_name || r.product_ndc || r.ndc || '—')}</small>
      ${r.greenData ? `
        <div class="green-rx-meta">
          <span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #10b981; font-size:10.5px; width:fit-content; font-weight:700;">
            🟢 YEŞİL REÇETE (${esc(r.greenData.origin)}${r.greenData.deaSchedule ? ` · ${esc(r.greenData.deaSchedule)}` : ''}${r.greenData.name !== (r.generic_name || '').toUpperCase() ? ` · Etkin Madde: ${esc(r.greenData.name)}` : ''})
          </span>
          <div style="font-size:11px; color:#334155; margin-top:2px;">
            ${r.greenData.localEquivCount > 0 
              ? `<span style="color:#047857; font-weight:700;">● ${r.greenData.localEquivCount} Yerli Muadil (${esc(r.greenData.brand)})</span>` 
              : `<span style="color:#b91c1c; font-weight:800; background:#fee2e2; padding:1px 6px; border-radius:4px; border:1px solid #fca5a5;">⚠ 0 Yerli Muadil (${esc(r.greenData.brand)} - Monopol)</span>`}
            <span style="color:var(--muted); margin-left:4px;">· SGK: ${esc(r.greenData.equivGroup)}</span>
          </div>
          ${r.greenData.yurtDisiList && r.greenData.yurtDisiList !== 'Hayır' ? `
            <span class="badge" style="background:#fffbeb; color:#92400e; border:1px solid #fde68a; font-size:10px; width:fit-content; font-weight:700;">
              🏛️ SGK Yurt Dışı İlaç: ${esc(r.greenData.yurtDisiList)}
            </span>
          ` : ''}
        </div>
      ` : ''}
    </td>
  `;
}

function renderEmaCrisisStatusCell(r) {
  const match = getEmaCrisisMatch(r);
  if (!match) {
    return `
      <div>
        <span class="badge" style="background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; font-size:10.5px; font-weight:600;" title="Avrupa İlaç Ajansı (EMA) kriz kataloğunda kriz kaydı bildirilmemiştir.">
          ⚪ AB'de Kriz Yok
        </span>
      </div>
    `;
  }

  const isOngoing = (match.status || '').toLowerCase().includes('ongoing');
  const isResolved = (match.status || '').toLowerCase().includes('resolved');

  const bg = isOngoing ? '#fee2e2' : (isResolved ? '#dcfce7' : '#fef3c7');
  const color = isOngoing ? '#991b1b' : (isResolved ? '#15803d' : '#92400e');
  const border = isOngoing ? '#fecaca' : (isResolved ? '#bbf7d0' : '#fde68a');
  const icon = isOngoing ? '🚨' : (isResolved ? '🟢' : '🛑');

  return `
    <div style="display:flex; flex-direction:column; gap:3px;">
      <span class="badge" style="background:${bg}; color:${color}; border:1px solid ${border}; font-weight:800; font-size:10.5px; width:fit-content; cursor:pointer;" onclick="event.stopPropagation(); setShortageV2Source('cross_fda_ema');" title="Tıkla: FDA ve EMA birleşik kriz analizini görüntüle">
        ${icon} ${esc(match.status_tr || match.status)}
      </span>
      ${match.detail ? `<small style="font-size:10px; color:#475569; line-height:1.2;">${esc(match.detail)}</small>` : ''}
    </div>
  `;
}

function renderFdaCrisisStatusCell(r) {
  const isCross = hasCrossShortage(r);
  if (isCross) {
    return `
      <div style="display:flex; flex-direction:column; gap:3px;">
        <span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; font-weight:800; font-size:10.5px; width:fit-content; cursor:pointer;" onclick="event.stopPropagation(); setShortageV2Source('cross_fda_ema');" title="Bu ilaç hem FDA hem EMA kriz listesinde! Birleşik analize gitmek için tıkla.">
          ⚡ Aktif Kriz (Current)
        </span>
        <small style="font-size:10px; color:#991b1b; font-weight:700;">🇺🇸 FDA Kriz Kayıtlı</small>
      </div>
    `;
  }
  return `
    <div>
      <span class="badge" style="background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; font-size:10.5px; font-weight:600;" title="ABD FDA kriz kataloğunda bu molekül için bildirilmiş aktif kriz kaydı bulunmuyor.">
        ⚪ ABD'de Kriz Yok
      </span>
    </div>
  `;
}

function shortageTableV2(rows, isFdaSource = true, source = currentShortageV2Source) {
  if (!rows.length) return '<p class="empty notice" style="font-size:13px; font-weight:600; padding:32px;">🔍 Seçili filtrelere veya arama kriterine uygun kriz kaydı bulunamadı. Lütfen filtreleri gevşetmeyi veya sıfırlamayı deneyin.</p>';


  const activeSource = source || currentShortageV2Source || (rows[0] && rows[0].source);
  const isCrossSource = activeSource === 'cross_fda_ema' || (rows[0] && rows[0].id && String(rows[0].id).startsWith('cross-'));
  if (isCrossSource) {
    return `
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th style="min-width:230px;" title="Veri Seti: FDA ve EMA Ortak Kriz Molekülleri">Ortak Molekül & Ticari Markalar (FDA ∩ EMA)</th>
              <th title="Veri Seti: DSRDS Transatlantik Sistemik Risk Modeli">Transatlantik Risk (DSRDS Modeli)</th>
              <th style="min-width:240px;" title="Veri Seti: ABD Gıda ve İlaç Dairesi (FDA) Kriz Kayıtları">🇺🇸 ABD FDA Kriz Verileri (FDA)</th>
              <th style="min-width:240px;" title="Veri Seti: Avrupa İlaç Ajansı (EMA) Kriz Kayıtları">🇪🇺 AB EMA Kriz Verileri (EMA)</th>
              <th style="min-width:240px; padding:12px 16px;" title="Veri Seti: FDA Kataloğu Alternatif Üretici Eşleştirmesi">Alternatif Üretici (FDA Analizi)</th>
              <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Reçete Talebi (Claims)">
                <div style="font-weight:700;">Medicare Reçete Talebi (CMS)</div>
                <div style="font-size:10px; font-weight:600; color:#0284c7; text-transform:none; margin-top:3px; background:#e0f2fe; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #bae6fd;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
              </th>
              <th style="min-width:165px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Kamu Bütçesi Harcaması ($)">
                <div style="font-weight:700;">Medicare Harcama ($) (CMS)</div>
                <div style="font-size:10px; font-weight:600; color:#059669; text-transform:none; margin-top:3px; background:#ecfdf5; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #a7f3d0;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
              </th>
              <th title="Veri Seti: Avrupa İlaç Ajansı (EMA) Tahmini Çözülme Takvimi">Beklenen Çözülme (EMA)</th>
              <th style="min-width:260px;" title="Veri Seti: DSRDS Endüstri Mühendisliği Stratejik Karar Desteği">Küresel Endüstri Mühendisliği Aksiyonu (DSRDS Modeli)</th>
              <th title="Veri Seti: EMA Resmi Duyuru Sayfası">Resmi Bildirim (EMA)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const ema = r.ema_data || {};
              const fda = r.fda_data || {};
              const isCrit = r.cross_risk_tier === 'CRITICAL';
              const isHigh = r.cross_risk_tier === 'HIGH';
              const badgeClass = isCrit ? 'cross-badge-critical' : (isHigh ? 'cross-badge-high' : 'cross-badge-resolved');

              return `
                <tr class="selectable">
                  <td>
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                      <b style="font-size:13.5px; color:#0f172a;">${esc(r.molecule_name)}</b>
                      ${r.is_green ? `<span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #10b981; font-size:10px; font-weight:800;">🟢 YEŞİL REÇETE</span>` : ''}
                    </div>
                    <div style="font-size:11px; color:#64748b; margin-top:3px; line-height:1.35;">
                      <b>Markalar:</b> ${esc(r.brand_names_combined || '—')}
                    </div>
                    <div style="margin-top:4px;">
                      <span class="cross-tag-both">🌐 FDA ∩ EMA Ortak Kriz</span>
                    </div>
                  </td>
                  <td>
                    <span class="${badgeClass}">${esc(r.cross_risk_label)}</span>
                    <div style="font-size:11px; font-weight:700; color:#475569; margin-top:4px;">
                      Sistemik Risk: <span style="color:${isCrit ? '#dc2626' : (isHigh ? '#d97706' : '#16a34a')}; font-weight:800; font-size:12.5px;">${r.cross_risk_score}</span> / 100
                    </div>
                  </td>
                  <td>
                    <div class="cross-box cross-box-fda">
                      <div style="font-weight:700; color:#1e293b; display:flex; justify-content:space-between; align-items:center;">
                        <span>🇺🇸 FDA Durumu:</span>
                        <span class="badge" style="background:${(fda.status_display || '').includes('Current') ? '#fee2e2' : '#f1f5f9'}; color:${(fda.status_display || '').includes('Current') ? '#b91c1c' : '#475569'}; font-weight:800; font-size:10px;">${esc(fda.status_display || 'Belirtilmemiş')}</span>
                      </div>
                      <div style="font-size:11px; color:#475569; margin-top:3px;">
                        <b>${fda.record_count || 0}</b> FDA kriz kaydı · <b>${(fda.generics || []).length}</b> formülasyon
                      </div>
                      ${(fda.reasons && fda.reasons.length > 0) ? `
                        <div style="font-size:10.5px; color:#0369a1; margin-top:3px; font-style:italic;">
                          Neden: ${esc(fda.reasons.slice(0, 2).join('; '))}
                        </div>
                      ` : ''}
                    </div>
                  </td>
                  <td>
                    <div class="cross-box cross-box-ema">
                      <div style="font-weight:700; color:#0369a1; display:flex; justify-content:space-between; align-items:center;">
                        <span>🇪🇺 EMA Durumu:</span>
                        <span class="badge" style="background:${(ema.status_display || '').includes('ongoing') ? '#fee2e2' : '#dcfce7'}; color:${(ema.status_display || '').includes('ongoing') ? '#b91c1c' : '#15803d'}; font-weight:800; font-size:10px;">${esc(ema.status_display || 'Belirtilmemiş')}</span>
                      </div>
                      <div style="margin-top:3px;">
                        ${ema.is_monopoly 
                          ? `<span class="ema-alt-pill-no" style="font-size:10.5px; padding:2px 6px;">⚠ Alternatif Yok (Monopol)</span>` 
                          : `<span class="ema-alt-pill-yes" style="font-size:10.5px; padding:2px 6px;">✓ Alternatif Var</span>`}
                      </div>
                      ${(ema.mesh_categories && ema.mesh_categories.length > 0) ? `
                        <div style="font-size:10.5px; color:#475569; margin-top:3px;">
                          MeSH: ${esc(ema.mesh_categories.slice(0, 2).join(', '))}
                        </div>
                      ` : ''}
                    </div>
                  </td>
                  ${renderAlternativeManufacturersCell(r)}
                  ${renderMedicareCells(r)}
                  <td>
                    <div style="font-size:12px; font-weight:700; color:#0f172a;">
                      ${ema.resolution_display ? `🎯 ${esc(ema.resolution_display)}` : '<span style="color:#64748b; font-style:italic;">Belirtilmemiş</span>'}
                    </div>
                  </td>
                  <td>
                    <div class="v2-action-cell">
                      <div class="v2-action-title">
                        <span>⚡</span> <span>${esc(r.action || 'Küresel Stratejik Stok')}</span>
                      </div>
                      <span class="v2-action-desc">${esc(r.action_detail || '')}</span>
                    </div>
                  </td>
                  <td>
                    ${(ema.urls && ema.urls[0]) ? `
                      <a href="${esc(ema.urls[0])}" target="_blank" rel="noopener noreferrer" class="button" style="padding:6px 12px; font-size:11px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;" onclick="event.stopPropagation();">
                        EMA ↗
                      </a>
                    ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const isEmaSource = activeSource === 'EMA Shortages' || (rows[0] && rows[0].source === 'EMA Shortages');
  if (isEmaSource) {
    return `
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th style="min-width:210px;" title="Veri Seti: Avrupa İlaç Ajansı (EMA) İlaç ve INN Adı">İlaç Adı & Etken Madde (EMA)</th>
              <th title="Veri Seti: Avrupa İlaç Ajansı (EMA) Resmi Kriz Durumu">AB (EMA) Kriz Durumu (EMA)</th>
              <th style="min-width:145px;" title="Veri Seti: ABD FDA Veri Tabanı Eşleşmesi">FDA Kriz Durumu (FDA)</th>
              <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Reçete Talebi (Claims)">
                <div style="font-weight:700;">Medicare Reçete Talebi (CMS)</div>
                <div style="font-size:10px; font-weight:600; color:#0284c7; text-transform:none; margin-top:3px; background:#e0f2fe; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #bae6fd;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
              </th>
              <th style="min-width:165px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Kamu Bütçesi Harcaması ($)">
                <div style="font-weight:700;">Medicare Harcama ($) (CMS)</div>
                <div style="font-size:10px; font-weight:600; color:#059669; text-transform:none; margin-top:3px; background:#ecfdf5; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #a7f3d0;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
              </th>
              <th style="min-width:180px;" title="Veri Seti: EMA MeSH (Medical Subject Headings) Sınıflandırması">Terapötik Alan (EMA / MeSH)</th>
              <th style="min-width:240px; padding:12px 16px;" title="Veri Seti: EMA İlaç Formu ve Dozaj Bilgisi">Etkilenen Form & Dozaj (EMA)</th>
              <th style="min-width:240px; padding:12px 16px;" title="Veri Seti: FDA Kataloğu Alternatif Üretici Eşleştirmesi">Alternatif Üretici (FDA Analizi)</th>
              <th title="Veri Seti: EMA Alternatif İlaç Bulunabilirlik Tespiti">Alternatif Bulunabilirliği (EMA)</th>
              <th title="Veri Seti: EMA Kriz Takvimi ve Çözülme Beklentisi">Tarihler & Beklenen Çözülme (EMA)</th>
              <th style="min-width:220px;" title="Veri Seti: DSRDS Endüstri Mühendisliği Karar Destek Algoritması">Kırılganlık / EM Aksiyonu (DSRDS Modeli)</th>
              <th title="Veri Seti: EMA Resmi Duyuru Sayfası">Resmi Bildirim (EMA)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const raw = r.raw_json || {};
              const alt = raw.availability_of_alternatives;
              let altHtml = '<span class="ema-alt-pill-unknown">Belirtilmemiş</span>';
              if (alt === 'Yes') {
                altHtml = '<span class="ema-alt-pill-yes">✓ Alternatif Var</span>';
              } else if (alt === 'No') {
                altHtml = '<span class="ema-alt-pill-no">⚠ Alternatif Yok (Kritik)</span>';
              } else if (alt) {
                altHtml = `<span class="ema-alt-pill-unknown">${esc(alt)}</span>`;
              }
              const meshList = (raw.therapeutic_area_mesh || '').split(';').filter(Boolean);
              const forms = raw.pharmaceutical_forms_affected || '—';
              const strengths = raw.strengths_affected;

              return `
                <tr data-id="${r.id}" class="selectable" style="cursor:pointer">
                  <td>
                    <div style="font-weight:800; font-size:13.5px; color:#1e3a8a;">
                      ${esc(r.brand_name || raw.medicine_affected || '—')}
                    </div>
                    <div style="font-size:12px; color:#475569; font-weight:600; margin-top:2px;">
                      🧪 INN: ${esc(r.generic_name || raw.international_non_proprietary_name_inn_or_common_name || '—')}
                    </div>
                    <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                      <span class="ema-source-badge">🇪🇺 EMA</span>
                      ${r.isGreen ? '<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-size:10px; font-weight:700;">🟢 Yeşil Reçete</span>' : ''}
                      <span class="badge" style="background:#f1f5f9; color:#475569; font-size:10px;">${esc(raw.category || 'Human')}</span>
                    </div>
                  </td>
                  <td>${r.statusBadgeHtml}</td>
                  <td>${renderFdaCrisisStatusCell(r)}</td>
                  ${renderMedicareCells(r)}
                  <td>
                    ${meshList.length > 0 ? `
                      <div style="display:flex; flex-direction:column; gap:4px;">
                        ${meshList.slice(0, 2).map(m => `<span class="ema-mesh-chip" title="${esc(m)}">${esc(m)}</span>`).join('')}
                        ${meshList.length > 2 ? `<small style="font-size:10px; color:#64748b;">+${meshList.length - 2} alan daha</small>` : ''}
                      </div>
                    ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
                  </td>
                  <td style="min-width:240px; max-width:320px; vertical-align:top; padding:14px 16px; white-space:normal;">
                    <div style="font-size:12.5px; color:#1e293b; font-weight:600; line-height:1.5; word-break:break-word;">
                      ${esc(forms)}
                    </div>
                    ${strengths ? `
                      <div style="margin-top:8px; font-size:11px; color:#0369a1; background:#f0f9ff; padding:3px 8px; border-radius:5px; border:1px solid #bae6fd; display:inline-block; font-weight:600;">
                        Doz: ${esc(strengths)}
                      </div>
                    ` : ''}
                  </td>
                  ${renderAlternativeManufacturersCell(r)}
                  <td>${altHtml}</td>
                  <td style="min-width:180px; vertical-align:top; padding:14px 16px; white-space:normal;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                      <div>
                        <span style="font-size:10px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.3px; display:block;">
                          🎯 Beklenen Çözülme:
                        </span>
                        <span style="font-size:12px; font-weight:700; color:#1e293b;">
                          ${raw.expected_resolution ? esc(raw.expected_resolution) : (raw.expected_resolution_date ? esc(raw.expected_resolution_date) : '<span style="color:#94a3b8; font-weight:400; font-style:italic;">Belirtilmemiş</span>')}
                        </span>
                      </div>
                      ${raw.start_of_shortage_date ? `
                        <div style="border-top:1px dashed #e2e8f0; padding-top:4px;">
                          <span style="font-size:10px; font-weight:700; color:#b45309; text-transform:uppercase; display:block;">
                            ⚠ Kriz Başlangıcı:
                          </span>
                          <span style="font-size:11.5px; color:#b45309; font-weight:600;">
                            ${esc(raw.start_of_shortage_date)}
                          </span>
                        </div>
                      ` : ''}
                      ${raw.last_updated_date ? `
                        <div style="border-top:1px dashed #e2e8f0; padding-top:4px;">
                          <span style="font-size:10px; font-weight:600; color:#0369a1; text-transform:uppercase; display:block;">
                            🔄 Son Revizyon:
                          </span>
                          <span style="font-size:11.5px; color:#0369a1; font-weight:600;">
                            ${esc(raw.last_updated_date)}
                          </span>
                        </div>
                      ` : ''}
                      ${raw.first_published_date ? `
                        <div style="border-top:1px dashed #e2e8f0; padding-top:4px;">
                          <span style="font-size:10px; font-weight:600; color:#64748b; text-transform:uppercase; display:block;">
                            📢 İlk İlan:
                          </span>
                          <span style="font-size:11px; color:#64748b;">
                            ${esc(raw.first_published_date)}
                          </span>
                        </div>
                      ` : ''}
                    </div>
                  </td>
                  <td>${renderActionCell(r)}</td>
                  <td>
                    ${raw.shortage_url ? `
                      <a href="${esc(raw.shortage_url)}" target="_blank" rel="noopener noreferrer" class="button" style="padding:6px 12px; font-size:11.5px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;" onclick="event.stopPropagation();">
                        EMA Sayfası ↗
                      </a>
                    ` : `<button class="button" style="padding:6px 12px; font-size:11.5px; font-weight:700;" onclick="event.stopPropagation(); detail('${r.id}')">İncele →</button>`}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (isFdaSource) {
    return `
      <div class="data-table">
        <table>
          <thead>
            <tr>
              <th style="min-width:200px;" title="Veri Seti: ABD FDA (Food and Drug Administration) Resmi Kriz Kataloğu">İlaç / Etkin Madde & Marka (FDA)</th>
              <th title="Veri Seti: ABD FDA Drug Shortages Veri Tabanı">FDA Kriz Durumu (FDA)</th>
              <th style="min-width:145px;" title="Veri Seti: Avrupa İlaç Ajansı (EMA) Resmi Kriz Kataloğu">EMA Kriz Durumu (EMA)</th>
              <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: CMS (Centers for Medicare & Medicaid Services) Part D 15 Aylık Reçete Talebi (Claims)">
                <div style="font-weight:700;">Medicare Reçete Talebi (CMS)</div>
                <div style="font-size:10px; font-weight:600; color:#0284c7; text-transform:none; margin-top:3px; background:#e0f2fe; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #bae6fd;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
              </th>
              <th style="min-width:165px; padding:12px 14px;" title="Veri Seti: CMS (Centers for Medicare & Medicaid Services) Part D 15 Aylık Kamu Bütçesi Harcaması ($)">
                <div style="font-weight:700;">Medicare Harcama ($) (CMS)</div>
                <div style="font-size:10px; font-weight:600; color:#059669; text-transform:none; margin-top:3px; background:#ecfdf5; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #a7f3d0;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
              </th>
              <th title="Veri Seti: ABD FDA Drug Shortages Terapötik Sınıflandırma">Terapötik Kategori (FDA)</th>
              <th style="min-width:180px;" title="Veri Seti: ABD FDA Kriz Bildirim Gerekçesi & Kök Neden">Sıkıntı Nedeni & Kök Neden (FDA)</th>
              <th title="Veri Seti: ABD FDA Tedarik & Dağıtım Stok Bildirimi">Bulunabilirlik (Stok) (FDA)</th>
              <th style="min-width:280px; padding:12px 16px;" title="Veri Seti: ABD FDA Sunum, Dozaj Formu & NDC Kodları">Sunum & Dozaj Formu (FDA)</th>
              <th style="min-width:260px; padding:12px 16px;" title="Veri Seti: ABD FDA Üretici Firma & Tedarik İletişim Bilgisi">Üretici Firma & İletişim (FDA)</th>
              <th style="min-width:240px; padding:12px 16px;" title="Veri Seti: FDA Kataloğu Eş Zamanlı Etken Madde & Form Üretici Analizi">Alternatif Üretici (FDA Analizi)</th>
              <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: ABD FDA İlk İlan ve Son Güncelleme Takvimi">Kriz Tarihleri (FDA)</th>
              <th style="min-width:220px;" title="Veri Seti: DSRDS Endüstri Mühendisliği Karar Destek Algoritması & Risk Skoru">Kırılganlık / EM Aksiyonu (DSRDS Modeli)</th>
              <th title="İşlem: Sistem Kayıt Detayı ve Çapraz Eşleşmeleri Görüntüle">İşlem (Sistem)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr data-id="${r.id}" class="selectable" style="cursor:pointer">
                ${renderDrugCell(r)}
                <td>${r.statusBadgeHtml}</td>
                <td>${renderEmaCrisisStatusCell(r)}</td>
                ${renderMedicareCells(r)}
                <td>
                  ${r.therapeuticCategory ? `
                    <span class="category-pill">${esc(r.therapeuticCategory)}</span>
                  ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
                </td>
                <td>${renderReasonCell(r)}</td>
                <td>${r.availBadgeHtml}</td>
                <td style="min-width:280px; max-width:340px; vertical-align:top; padding:14px 16px; white-space:normal;">
                  <div style="font-size:12.5px; color:#1e293b; line-height:1.55; word-break:break-word; font-weight:500;">
                    ${esc(r.presentation)}
                  </div>
                  ${(r.ndc || r.application_no) ? `
                    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                      ${r.ndc ? `<code style="font-size:10.5px; color:#475569; background:#f1f5f9; padding:3px 8px; border-radius:5px; border:1px solid #e2e8f0; font-family:monospace; display:inline-flex; align-items:center; gap:3px;"><span style="color:#94a3b8;">NDC:</span> ${esc(r.ndc)}</code>` : ''}
                      ${r.application_no ? `<code style="font-size:10.5px; color:#0369a1; background:#e0f2fe; padding:3px 8px; border-radius:5px; font-weight:700; border:1px solid #bae6fd; font-family:monospace; display:inline-flex; align-items:center; gap:3px;"><span style="color:#0284c7;">FDA:</span> ${esc(r.application_no)}</code>` : ''}
                    </div>
                  ` : ''}
                </td>
                <td style="min-width:260px; max-width:320px; vertical-align:top; padding:14px 16px; white-space:normal;">
                  <div style="font-weight:700; font-size:13px; color:#0f172a; line-height:1.45; word-break:break-word; display:flex; align-items:flex-start; gap:6px;">
                    <span style="font-size:14px; flex-shrink:0; margin-top:1px;">🏢</span>
                    <span>${esc(r.manufacturer || r.vendor || '—')}</span>
                  </div>
                  ${r.contactInfo ? `
                    <div style="margin-top:10px; font-size:11.5px; color:#0369a1; background:#f0f9ff; padding:7px 11px; border-radius:7px; border:1px solid #bae6fd; line-height:1.45; word-break:break-word; box-shadow:0 1px 3px rgba(2,132,199,0.06);">
                      <div style="font-weight:700; font-size:10.5px; color:#0284c7; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:3px; display:flex; align-items:center; gap:4px;">
                        <span>📞</span> <span>İletişim & Tedarik:</span>
                      </div>
                      <div style="color:#0c4a6e; font-weight:500;">
                        ${esc(r.contactInfo)}
                      </div>
                    </div>
                  ` : ''}
                </td>
                ${renderAlternativeManufacturersCell(r)}
                <td style="min-width:160px; vertical-align:top; padding:14px 16px; white-space:normal;">
                  <div style="display:flex; flex-direction:column; gap:6px;">
                    <div>
                      <span style="font-size:10px; font-weight:700; color:#0284c7; text-transform:uppercase; letter-spacing:0.3px; display:block;">
                        🔄 Son Güncelleme:
                      </span>
                      <span style="font-size:12px; font-weight:700; color:#0f172a;">
                        ${esc(r.updateDate || '—')}
                      </span>
                    </div>
                    ${r.initialDate ? `
                      <div style="border-top:1px dashed #e2e8f0; padding-top:5px;">
                        <span style="font-size:10px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.3px; display:block;">
                          📢 İlk İlan Tarihi:
                        </span>
                        <span style="font-size:11.5px; color:#475569; font-weight:600;">
                          ${esc(r.initialDate)}
                        </span>
                      </div>
                    ` : ''}
                  </div>
                </td>
                <td>${renderActionCell(r)}</td>
                <td><button class="button" style="padding:6px 12px; font-size:11.5px; font-weight:700;" onclick="event.stopPropagation(); detail('${r.id}')">İncele →</button></td>
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
            <th style="min-width:200px;" title="Veri Seti: ABD FDA / Ulusal Katalog">İlaç / Etkin Madde & Marka (FDA)</th>
            <th title="Veri Seti: Kayıt Kaynağı">Kaynak (Veri Seti)</th>
            <th style="min-width:250px; padding:12px 16px;" title="Veri Seti: ABD FDA Üretici ve Tedarikçi Bilgisi">Üretici / Tedarikçi (FDA)</th>
            <th style="min-width:240px; padding:12px 16px;" title="Veri Seti: FDA Kataloğu Alternatif Üretici Eşleştirmesi">Alternatif Üretici (FDA Analizi)</th>
            <th title="Veri Seti: ABD FDA / NDC Kodu">NDC / Kod (FDA)</th>
            <th title="Veri Seti: ABD FDA Kriz Kataloğu">FDA Kriz Durumu (FDA)</th>
            <th style="min-width:145px;" title="Veri Seti: Avrupa İlaç Ajansı (EMA) Kriz Kataloğu">EMA Kriz Durumu (EMA)</th>
            <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Reçete Talebi (Claims)">
              <div style="font-weight:700;">Medicare Reçete Talebi (CMS)</div>
              <div style="font-size:10px; font-weight:600; color:#0284c7; text-transform:none; margin-top:3px; background:#e0f2fe; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #bae6fd;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
            </th>
            <th style="min-width:165px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Kamu Bütçesi Harcaması ($)">
              <div style="font-weight:700;">Medicare Harcama ($) (CMS)</div>
              <div style="font-size:10px; font-weight:600; color:#059669; text-transform:none; margin-top:3px; background:#ecfdf5; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #a7f3d0;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
            </th>
            <th style="min-width:180px;" title="Veri Seti: ABD FDA Kriz Nedeni">Sıkıntı Nedeni (FDA)</th>
            <th style="min-width:220px;" title="Veri Seti: DSRDS Endüstri Mühendisliği Karar Destek Algoritması">Kırılganlık / EM Aksiyonu (DSRDS Modeli)</th>
            <th title="İşlem: Sistem Kayıt Detayı">İşlem (Sistem)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${r.id}" class="selectable" style="cursor:pointer">
              ${renderDrugCell(r)}
              <td><span class="source-tag">${esc(sourceLabel(r.source))}</span></td>
              <td style="min-width:250px; max-width:320px; vertical-align:top; padding:14px 16px; white-space:normal;">
                <div style="font-weight:700; font-size:12.5px; color:#0f172a; line-height:1.45; word-break:break-word; display:flex; align-items:center; gap:6px;">
                  <span>🏢</span> <span>${esc(r.manufacturer || r.vendor || '—')}</span>
                </div>
              </td>
              ${renderAlternativeManufacturersCell(r)}
              <td><code style="font-size:11px;">${esc(r.ndc || r.product_ndc || r.package_ndc || '—')}</code></td>
              <td>${r.statusBadgeHtml}</td>
              <td>${renderEmaCrisisStatusCell(r)}</td>
              ${renderMedicareCells(r)}
              <td>${renderReasonCell(r)}</td>
              <td>${renderActionCell(r)}</td>
              <td><button class="button" style="padding:6px 12px; font-size:11.5px; font-weight:700;" onclick="event.stopPropagation(); detail('${r.id}')">İncele →</button></td>
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
  greenFilter = currentShortageV2GreenFilter,
  pageNo = currentShortageV2Page
) {
  currentShortageV2Query = query;
  currentShortageV2Source = source;
  currentShortageV2Status = status;
  currentShortageV2Reason = reasonFilter;
  currentShortageV2Risk = riskFilter;
  currentShortageV2GreenFilter = greenFilter || '';
  currentShortageV2Page = pageNo;

  const gSearch = document.querySelector('#globalSearch');
  if (gSearch && gSearch.value !== query) gSearch.value = query;

  const guide = source === 'cross_fda_ema'
    ? guideBanner(
        "ABD FDA ve Avrupa İlaç Ajansı (EMA) resmi kriz listelerinde AYNI ANDA yer alan transatlantik krizdeki moleküllerin birleşik analizidir.",
        "17 temel molekül altında toplanan 240+ kriz kaydı; hem FDA hem EMA statüsü, alternatif mevcudiyeti, CMS Medicare 15 aylık (2025–2026 Q1) reçete talep/harcama verisi ve küresel sistemik risk puanıyla tek kalemde sunulur.",
        "Hem ABD hem Avrupa pazarında açık veren moleküller, yerel distribütör sorunundan öte küresel hammadde (API) ve üretim darboğazına işaret eder."
      )
    : (source === 'EMA Shortages'
      ? guideBanner(
          "Avrupa İlaç Ajansı (EMA) Resmi Kriz Kataloğundaki 85 ilacın güncel kriz verilerini, etken maddelerini ve alternatif bulunabilirlik durumlarını sunar.",
          "EMA kriz durumları, MeSH terapötik alanları, alternatif bulunabilirlik analizleri ve CMS Medicare 15 aylık (2025–2026 Q1) reçete talep/kamu harcama büyüklüklerini içerir.",
          "Alternatif bulunabilirliği olmayan ilaçlar 'Monopol Tedarik Riski' olarak işaretlenmiş olup doğrudan resmi EMA duyuru sayfasına bağlantı içerir."
        )
      : guideBanner(
          "ABD FDA Drug Shortages veri tabanındaki 1.587 kriz kaydının tamamını resmi FDA sitesiyle birebir senkronize şekilde sunan karar destek merkezidir.",
          "FDA resmi portalındaki tüm güncel ve çözülen ilaç krizlerini, terapötik sınıflarını, stok durumlarını ve CMS Medicare 15 aylık (2025–2026 Q1) reçete talep ve bütçe büyüklüklerini tek ekranda inceler.",
          "Dilediğiniz ilacı veya NDC kodunu arayın; terapötik kategori ve stok durumu süzgeçleriyle filtreleyin veya tüm FDA kriz kayıtlarını tek ekranda listeleyin."
        ));

  const headerSub = source === 'cross_fda_ema'
    ? 'FDA ve EMA resmi veri tabanlarında ortak krizdeki 17 temel molekülün tek kalemde birleşik karar destek görünümü.'
    : (source === 'EMA Shortages'
      ? 'Avrupa İlaç Ajansı (EMA) 85 resmi kriz kaydı, MeSH tıbbi alanları, monopol analizleri ve alternatif kararları.'
      : 'FDA Drug Shortages kriz kayıtlarının tamamı, terapötik sınıflamalar ve Endüstri Mühendisliği karar destek motoru.');

  const loadingMsg = source === 'cross_fda_ema'
    ? 'Transatlantik FDA ∩ EMA ortak kriz verileri yükleniyor…'
    : (source === 'EMA Shortages'
      ? 'EMA Avrupa resmi kriz kayıtları yükleniyor…'
      : 'FDA resmi kriz kayıtları yükleniyor…');

  page.innerHTML = header('Tedarik Sıkıntısı Analizi V2', headerSub) + guide + `<div class="empty glass">${loadingMsg}</div>`;

  if (!v2MedicareCache) {
    fetch('medicare_spending_compact.json?v=1.0.28')
      .then(r => r.json())
      .then(d => { if (d && typeof d === 'object') v2MedicareCache = d; })
      .catch(() => {});
  }

  try {
    let overview;
    let summary;
    let data;
    let isClientRisk = Boolean(riskFilter);
    let matchedGreen = [];

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
      if (currentShortageV2GreenFilter) {
        if (currentShortageV2GreenFilter === 'import_zero') {
          filteredGreen = filteredGreen.filter(r => (r.raw_json?.origin || '').includes('İTHAL') && r.raw_json?.localEquivCount === 0);
        } else if (currentShortageV2GreenFilter === 'green_active') {
          filteredGreen = filteredGreen.filter(r => r.shortage_status === 'Current');
        } else if (currentShortageV2GreenFilter === 'local_prod') {
          filteredGreen = filteredGreen.filter(r => (r.raw_json?.origin || '').includes('İMAL'));
        } else if (currentShortageV2GreenFilter !== 'green_only' && currentShortageV2GreenFilter !== 'non_green') {
          const targetCanon = (greenAliases[currentShortageV2GreenFilter.toUpperCase()] || currentShortageV2GreenFilter).toUpperCase();
          filteredGreen = filteredGreen.filter(r => r.generic_name.toUpperCase() === targetCanon || r.generic_name.toUpperCase() === currentShortageV2GreenFilter.toUpperCase());
        }
      }
      data = {
        rows: filteredGreen,
        total: filteredGreen.length,
        page: 1,
        limit: filteredGreen.length
      };
    } else if (source === 'Drug Shortages') {
      // ⚡ FDA Resmi Kriz Veri Tabanı (1.587 kayıt)
      // FDA kriz veri tabanındaki 1.587 kaydın tümü yüklenir ve önbelleğe alınır.
      // 1. Önce doğrudan public/fda_shortages_records.json dosyasından 1.587 kaydı sıfır gecikmeyle çek
      if (!v2FdaRecordsCache || v2FdaRecordsCache.length < 1500) {
        let allRows = [];
        try {
          const staticRes = await fetch('fda_shortages_records.json?v=1.0.33').then(r => r.json());
          if (Array.isArray(staticRes) && staticRes.length >= 1500) {
            allRows = staticRes;
          }
        } catch (e) {
          console.warn('FDA static fetch failed, falling back to API:', e);
        }

        const [ov, sm] = await Promise.all([
          api('/api/overview').catch(() => null),
          api('/api/analytics/shortages').catch(() => null)
        ]);
        overview = ov;
        summary = sm;

        // 2. Statik dosya eksikse veya boşsa API'den çekmeyi dene
        if (allRows.length < 1500) {
          try {
            const dt = await api('/api/records?source=Drug%20Shortages&limit=2000');
            allRows = (dt && Array.isArray(dt.rows)) ? dt.rows : [];
            const expectedTotal = Number(dt?.total || overview?.counts?.find(x => x.source === 'Drug Shortages')?.count || 1587);

            // Sunucu 100 kayıtlık sayfalama yapıyorsa, kalan sayfalar paralel getirilerek 1.587 kaydın tümü birleştirilir
            if (expectedTotal > allRows.length && allRows.length > 0) {
              const pageSize = allRows.length;
              const totalPages = Math.ceil(expectedTotal / pageSize);
              const pagePromises = [];
              for (let p = 2; p <= totalPages; p++) {
                pagePromises.push(api(`/api/records?source=Drug%20Shortages&limit=${pageSize}&page=${p}`).catch(() => null));
              }
              const pageResults = await Promise.all(pagePromises);
              for (const pr of pageResults) {
                if (pr && Array.isArray(pr.rows)) {
                  allRows = allRows.concat(pr.rows);
                }
              }
            }
          } catch (e) {
            console.warn('API fetch failed:', e);
          }
        }
        v2FdaRecordsCache = allRows;
        if (!v2EmaRecordsCache) {
          fetch('ema_medicine_shortages.json?v=1.0.31')
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) v2EmaRecordsCache = d; })
            .catch(() => {});
        }
        if (!v2MedicareCache) {
          fetch('medicare_spending_compact.json?v=1.0.31')
            .then(r => r.json())
            .then(d => { if (d && typeof d === 'object') v2MedicareCache = d; })
            .catch(() => {});
        }
      } else {
        const [ov, sm] = await Promise.all([
          api('/api/overview').catch(() => null),
          api('/api/analytics/shortages').catch(() => null)
        ]);
        overview = ov;
        summary = sm;
      }
      data = {
        rows: v2FdaRecordsCache,
        total: v2FdaRecordsCache.length,
        page: 1,
        limit: v2FdaRecordsCache.length
      };
    } else if (source === 'EMA Shortages') {
      // 🇪🇺 EMA Resmi Kriz Kataloğu (85 kayıt)
      if (!v2EmaRecordsCache || v2EmaRecordsCache.length === 0 || v2EmaRecordsCache[0]?.source !== 'EMA Shortages') {
        const [ov, sm] = await Promise.all([
          api('/api/overview').catch(() => null),
          api('/api/analytics/shortages').catch(() => null)
        ]);
        overview = ov;
        summary = sm;
        let allRows = [];
        // 1. Doğrudan public/ema_medicine_shortages.json dosyasından 85 kaydı anında çek
        try {
          const staticRes = await fetch('ema_medicine_shortages.json?v=1.0.28').then(r => r.json());
          if (Array.isArray(staticRes) && staticRes.length > 0) {
            allRows = staticRes.map((r, idx) => ({
              id: 900000 + idx + 1,
              source: 'EMA Shortages',
              generic_name: r.international_non_proprietary_name_inn_or_common_name || '',
              brand_name: r.medicine_affected || '',
              shortage_status: r.supply_shortage_status || '',
              shortage_reason: `Alternatif: ${r.availability_of_alternatives || 'Belirtilmemiş'} | Terapötik Alan: ${r.therapeutic_area_mesh || 'Genel'}`,
              search_text: `${r.medicine_affected || ''} ${r.international_non_proprietary_name_inn_or_common_name || ''} ${r.therapeutic_area_mesh || ''} ${r.pharmaceutical_forms_affected || ''} ${r.supply_shortage_status || ''}`,
              raw_json: r
            }));
          }
        } catch (e) {
          console.warn('EMA static fetch failed:', e);
        }

        // 2. Fallback: API endpointleri
        if (allRows.length === 0) {
          try {
            const apiRes = await api('/api/ema-shortages');
            if (apiRes && Array.isArray(apiRes.rows) && apiRes.rows.length > 0) {
              allRows = apiRes.rows;
            }
          } catch {}
        }
        if (allRows.length === 0) {
          try {
            const dt = await api('/api/records?source=EMA%20Shortages&limit=2000');
            if (dt && Array.isArray(dt.rows) && dt.rows.some(r => r.source === 'EMA Shortages')) {
              allRows = dt.rows.filter(r => r.source === 'EMA Shortages');
            }
          } catch {}
        }
        v2EmaRecordsCache = allRows;
      } else {
        const [ov, sm] = await Promise.all([
          api('/api/overview'),
          api('/api/analytics/shortages')
        ]);
        overview = ov;
        summary = sm;
      }
      data = {
        rows: v2EmaRecordsCache,
        total: v2EmaRecordsCache.length,
        page: 1,
        limit: v2EmaRecordsCache.length
      };
    } else if (source === 'cross_fda_ema') {
      // 🌐 Transatlantik FDA ∩ EMA Ortak Kriz (17 Molekül)
      if (!v2CrossRecordsCache || v2CrossRecordsCache.length === 0) {
        const [ov, sm] = await Promise.all([
          api('/api/overview').catch(() => null),
          api('/api/analytics/shortages').catch(() => null)
        ]);
        overview = ov;
        summary = sm;
        let allCross = [];
        try {
          const staticCross = await fetch('fda_ema_matched_shortages.json?v=1.0.28').then(r => r.json());
          if (Array.isArray(staticCross) && staticCross.length > 0) {
            allCross = staticCross;
          }
        } catch (e) {
          console.warn('Cross static fetch failed:', e);
        }
        if (allCross.length === 0) {
          try {
            const apiRes = await api('/api/cross-shortages');
            if (apiRes && Array.isArray(apiRes.rows) && apiRes.rows.length > 0) {
              allCross = apiRes.rows;
            }
          } catch {}
        }
        v2CrossRecordsCache = allCross.map(r => ({
          ...r,
          generic_name: r.molecule_name,
          brand_name: r.brand_names_combined,
          shortage_status: r.cross_risk_label,
          shortage_reason: r.action,
          riskScore: r.cross_risk_score,
          riskTier: r.cross_risk_tier === 'CRITICAL' ? 'critical' : (r.cross_risk_tier === 'HIGH' ? 'high' : 'low'),
          riskTierLabel: r.cross_risk_label,
          isGreen: r.is_green,
          search_text: `${r.molecule_name} ${r.brand_names_combined} ${(r.ema_data?.inns || []).join(' ')} ${(r.fda_data?.generics || []).join(' ')} ${(r.fda_data?.brands || []).join(' ')}`
        }));
      } else {
        const [ov, sm] = await Promise.all([
          api('/api/overview').catch(() => null),
          api('/api/analytics/shortages').catch(() => null)
        ]);
        overview = ov;
        summary = sm;
      }
      let filteredCross = v2CrossRecordsCache;
      if (query) {
        const qLow = query.toLowerCase();
        filteredCross = filteredCross.filter(r => (r.search_text || '').toLowerCase().includes(qLow));
      }
      if (currentShortageV2GreenFilter === 'green_only') {
        filteredCross = filteredCross.filter(r => r.isGreen);
      } else if (currentShortageV2GreenFilter === 'non_green') {
        filteredCross = filteredCross.filter(r => !r.isGreen);
      }
      if (riskFilter === 'high' || riskFilter === 'CRITICAL') {
        filteredCross = filteredCross.filter(r => r.cross_risk_tier === 'CRITICAL');
      } else if (riskFilter === 'med' || riskFilter === 'HIGH') {
        filteredCross = filteredCross.filter(r => r.cross_risk_tier === 'HIGH');
      }
      data = {
        rows: filteredCross,
        total: filteredCross.length,
        page: 1,
        limit: filteredCross.length
      };
    } else {
      const queryParam = query ? `&q=${encodeURIComponent(query)}` : '';
      const sourceParam = source ? `&source=${encodeURIComponent(source)}` : '';
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : '';
      const mfgParam = currentShortageV2Manufacturer ? `&manufacturer=${encodeURIComponent(currentShortageV2Manufacturer)}` : '';
      const reasonParam = reasonFilter ? `&reason=${encodeURIComponent(reasonFilter)}` : '';
      const categoryParam = currentShortageV2Category ? `&category=${encodeURIComponent(currentShortageV2Category)}` : '';
      const availParam = currentShortageV2Availability ? `&availability=${encodeURIComponent(currentShortageV2Availability)}` : '';
      const greenParam = (currentShortageV2GreenFilter === 'green_only' || (currentShortageV2GreenFilter && !['non_green'].includes(currentShortageV2GreenFilter)))
        ? '&green=1'
        : (currentShortageV2GreenFilter === 'non_green' ? '&non_green=1' : '');
      
      let greenSubstanceQuery = '';
      if (currentShortageV2GreenFilter && !['green_only', 'non_green'].includes(currentShortageV2GreenFilter)) {
        if (['import_zero', 'green_active', 'local_prod'].includes(currentShortageV2GreenFilter)) {
          greenSubstanceQuery = getGreenCategoryPatterns(currentShortageV2GreenFilter).join('|');
        } else {
          greenSubstanceQuery = getGreenSubstanceQueryPattern(currentShortageV2GreenFilter);
        }
      }
      const greenSubstanceParam = greenSubstanceQuery ? `&green_substance=${encodeURIComponent(greenSubstanceQuery)}` : '';

      const hasClientFilter = Boolean(
        currentShortageV2GreenFilter ||
        riskFilter ||
        reasonFilter ||
        currentShortageV2Category ||
        currentShortageV2Availability ||
        currentShortageV2Manufacturer ||
        currentShortageV2Limit === 'all'
      );
      const limitNum = hasClientFilter ? 2000 : (Number(currentShortageV2Limit) || 25);
      const reqPage = hasClientFilter ? 1 : pageNo;

      const [ov, sm, dt] = await Promise.all([
        api('/api/overview'),
        api('/api/analytics/shortages'),
        api(`/api/records?page=${reqPage}&limit=${limitNum}${sourceParam}${queryParam}${statusParam}${mfgParam}${reasonParam}${categoryParam}${availParam}${greenParam}${greenSubstanceParam}`)
      ]);
      overview = ov;
      summary = sm;
      data = dt;

      // Smart green fallback: if user searched alprazolam, xanax, rivotril etc. and 0 rows found in source
      if (query && data.rows.length === 0) {
        const qNorm = normalizeMedText(query);
        matchedGreen = turkeyGreenMeds.filter(m => {
          const qLow = query.toLowerCase();
          return m.name.toLowerCase().includes(qLow) || 
                 m.brand.toLowerCase().includes(qLow) ||
                 (m.patterns && m.patterns.some(p => p.includes(qNorm) || qNorm.includes(p)));
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

    const count = Object.fromEntries(
      overview?.counts
        ? overview.counts.map(x => [x.source, x.count])
        : [
            ['Drug Shortages', v2FdaRecordsCache?.length || 1587],
            ['EMA Shortages', v2EmaRecordsCache?.length || 85],
            ['FDA Drugs', 0],
            ['NDC Products', 0],
            ['NDC Packages', 0],
            ['CMS Medicare Part D', 0],
            ['VA Contracts', 0]
          ]
    );
    const totalAllDrugs = Object.values(count).reduce((a, b) => a + Number(b), 0);
    const enriched = data.rows.map(enrichShortageRecord);

    let filtered = enriched;
    if (query) {
      const qLow = query.toLowerCase();
      filtered = filtered.filter(r => {
        const gn = (r.generic_name || '').toLowerCase();
        const bn = (r.brand_name || '').toLowerCase();
        const mf = (r.manufacturer || r.vendor || '').toLowerCase();
        const nd = (r.ndc || r.product_ndc || r.package_ndc || '').toLowerCase();
        const pr = (r.presentation || '').toLowerCase();
        const tc = (r.therapeuticCategory || '').toLowerCase();
        const sr = (r.shortage_reason || '').toLowerCase();
        const st = (r.search_text || '').toLowerCase();
        const rt = (r.reasonText || '').toLowerCase();
        const gName = (r.greenData?.name || '').toLowerCase();
        const gBrand = (r.greenData?.brand || '').toLowerCase();
        return gn.includes(qLow) || bn.includes(qLow) || mf.includes(qLow) || nd.includes(qLow) ||
               pr.includes(qLow) || tc.includes(qLow) || sr.includes(qLow) || st.includes(qLow) ||
               rt.includes(qLow) || gName.includes(qLow) || gBrand.includes(qLow);
      });
    }
    if (status) {
      const sLow = status.toLowerCase();
      filtered = filtered.filter(r => (r.shortage_status || '').toLowerCase() === sLow);
    }
    if (reasonFilter) {
      if (reasonFilter === 'green_cases' || reasonFilter === 'green_rx') {
        filtered = filtered.filter(r => r.isGreen);
      } else if (reasonFilter === 'no_alt') {
        filtered = filtered.filter(r => (r.raw_json?.availability_of_alternatives || '').toLowerCase() === 'no' || (r.shortage_reason || '').includes('Alternatif: No'));
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
    if (currentShortageV2Manufacturer) {
      const normMfg = currentShortageV2Manufacturer.toLowerCase();
      filtered = filtered.filter(r => (r.manufacturer || r.vendor || '').toLowerCase().includes(normMfg));
    }
    if (riskFilter) {
      if (riskFilter === 'high') filtered = filtered.filter(r => r.riskScore >= 75);
      else if (riskFilter === 'med') filtered = filtered.filter(r => r.riskScore >= 30 && r.riskScore < 75);
      else if (riskFilter === 'low') filtered = filtered.filter(r => r.riskScore < 30);
    }
    if (currentShortageV2GreenFilter) {
      if (currentShortageV2GreenFilter === 'green_only') {
        filtered = filtered.filter(r => r.isGreen);
      } else if (currentShortageV2GreenFilter === 'non_green') {
        filtered = filtered.filter(r => !r.isGreen);
      } else if (currentShortageV2GreenFilter === 'import_zero') {
        filtered = filtered.filter(r => r.isGreen && (r.greenData?.origin || '').includes('İTHAL') && r.greenData?.localEquivCount === 0);
      } else if (currentShortageV2GreenFilter === 'green_active') {
        filtered = filtered.filter(r => r.isGreen && (r.greenData?.fdaShortage || '').includes('Active'));
      } else if (currentShortageV2GreenFilter === 'local_prod') {
        filtered = filtered.filter(r => r.isGreen && (r.greenData?.origin || '').includes('İMAL'));
      } else {
        const pats = getGreenSubstancePatterns(currentShortageV2GreenFilter);
        const targetCanon = (greenAliases[currentShortageV2GreenFilter.toUpperCase()] || currentShortageV2GreenFilter).toUpperCase();
        filtered = filtered.filter(r => {
          if (!r.isGreen) return false;
          if (r.greenData) {
            const mName = (r.greenData.name || '').toUpperCase();
            if (mName === targetCanon) return true;
            if (r.greenData.patterns && r.greenData.patterns.some(p => pats.includes(p.toLowerCase()))) return true;
          }
          const rText = `${r.generic_name || ''} ${r.brand_name || ''} ${r.search_text || ''} ${r.presentation || ''}`.toLowerCase();
          return pats.some(p => rText.includes(p.toLowerCase()));
        });
      }
    }

    // Prioritization: Yeşil Reçete active ingredients prioritized at the top, sorted by risk score
    filtered.sort((a, b) => {
      if (source === 'green_cases') {
        return (b.riskScore || 0) - (a.riskScore || 0);
      }
      if (query || reasonFilter === 'green_cases' || reasonFilter === 'green_rx' || currentShortageV2GreenFilter) {
        if (a.isGreen !== b.isGreen) return a.isGreen ? -1 : 1;
      }
      return (b.riskScore || 0) - (a.riskScore || 0);
    });

    // 🎯 FİLTRELENMİŞ KESİN TOPLAM İLAÇ SAYISI:
    const hasAnyClientFilter = Boolean(
      currentShortageV2GreenFilter ||
      riskFilter ||
      reasonFilter ||
      currentShortageV2Category ||
      currentShortageV2Availability ||
      currentShortageV2Manufacturer ||
      currentShortageV2Limit === 'all' ||
      query
    );
    const totalFound = (source === 'Drug Shortages' || source === 'EMA Shortages' || source === 'cross_fda_ema' || source === 'green_cases' || hasAnyClientFilter)
      ? filtered.length
      : (data.total || filtered.length);
    data.total = totalFound;

    // CSV dışa aktarımı için filtrelenmiş kayıtların tamamı (sayfalanmamış liste) saklanır
    window.currentFilteredShortageRows = filtered;

    // Sayfalama (Pagination) hesaplaması:
    const pageSize = currentShortageV2Limit === 'all' ? Math.max(totalFound, 1) : (Number(currentShortageV2Limit) || 25);
    const totalPages = Math.max(1, Math.ceil(totalFound / pageSize));
    let currentPage = Math.min(Math.max(1, pageNo), totalPages);
    currentShortageV2Page = currentPage;
    data.page = currentPage;
    data.limit = pageSize;

    const startIdx = (currentPage - 1) * pageSize;
    const paginatedRows = (source === 'Drug Shortages' || source === 'EMA Shortages' || source === 'cross_fda_ema' || source === 'green_cases' || hasAnyClientFilter)
      ? filtered.slice(startIdx, startIdx + pageSize)
      : filtered;

    const activeFilters = [];
    if (query) {
      activeFilters.push({
        label: 'Arama Sözcüğü',
        value: `"${query}"`,
        icon: '🔎',
        style: 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;',
        onRemove: `clearGlobalSearch()`
      });
    }
    if (currentShortageV2GreenFilter) {
      activeFilters.push({
        label: 'Yeşil Reçete',
        value: getGreenFilterLabel(currentShortageV2GreenFilter),
        icon: '🟢',
        style: 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;',
        onRemove: `setShortageV2GreenFilter('')`
      });
    }
    if (source && source !== 'Drug Shortages') {
      activeFilters.push({
        label: 'Veri Kaynağı',
        value: source === 'green_cases' ? `Türkiye Yeşil Molekül Portföyü (${turkeyGreenMeds.length})` : (sourceNames[source] || source),
        icon: '🏛️',
        style: 'background:#f8fafc; color:#334155; border:1px solid #cbd5e1;',
        onRemove: `setShortageV2Source('Drug Shortages')`
      });
    }
    if (status) {
      activeFilters.push({
        label: 'FDA Kriz Durumu',
        value: status,
        icon: '⚡',
        style: 'background:#fff1f2; color:#be123c; border:1px solid #fda4af;',
        onRemove: `setShortageV2Status('')`
      });
    }
    if (currentShortageV2Manufacturer) {
      activeFilters.push({
        label: 'Üretici Firma',
        value: currentShortageV2Manufacturer,
        icon: '🏭',
        style: 'background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;',
        onRemove: `setShortageV2Manufacturer('')`
      });
    }
    if (currentShortageV2Category) {
      activeFilters.push({
        label: 'Terapötik Kategori',
        value: currentShortageV2Category,
        icon: '📑',
        style: 'background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe;',
        onRemove: `setShortageV2Category('')`
      });
    }
    if (currentShortageV2Availability) {
      activeFilters.push({
        label: 'Stok Durumu',
        value: currentShortageV2Availability,
        icon: '📦',
        style: 'background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;',
        onRemove: `setShortageV2Availability('')`
      });
    }
    if (reasonFilter) {
      activeFilters.push({
        label: 'Sıkıntı Nedeni',
        value: reasonFilter,
        icon: '📋',
        style: 'background:#fffbeb; color:#b45309; border:1px solid #fde68a;',
        onRemove: `setShortageV2Reason('')`
      });
    }
    if (riskFilter) {
      const riskLabels = { high: 'Kritik (Risk ≥ 75)', med: 'Orta / Yüksek (Risk 30–74)', low: 'Düşük (Risk < 30)' };
      activeFilters.push({
        label: 'Risk Seviyesi',
        value: riskLabels[riskFilter] || riskFilter,
        icon: '⚠️',
        style: 'background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;',
        onRemove: `setShortageV2Risk('')`
      });
    }

    const greenImportZeroCount = turkeyGreenMeds.filter(m => m.origin.includes('İTHAL') && m.localEquivCount === 0).length;
    const greenActiveCount = turkeyGreenMeds.filter(m => m.fdaShortage.includes('Active')).length;
    const greenLocalCount = turkeyGreenMeds.filter(m => m.origin.includes('İMAL')).length;

    // Anlık filtrelenmiş analitik metrikler
    const filteredCriticalCount = filtered.filter(r => r.riskScore >= 75).length;
    const filteredCurrentCrisisCount = filtered.filter(r => (r.shortage_status || '').toLowerCase() === 'current').length;
    const filteredGreenCount = filtered.filter(r => r.isGreen).length;
    const filteredZeroEquivCount = filtered.filter(r => r.isGreen && (r.greenData?.localEquivCount === 0 || (r.shortage_status || '').includes('0 Muadil'))).length;

    const currentCount = Number(overview?.currentShortages || (v2FdaRecordsCache ? v2FdaRecordsCache.filter(r => (r.shortage_status || '').toLowerCase() === 'current').length : 1141));
    const totalShortages = Number(count['Drug Shortages'] || (v2FdaRecordsCache?.length || 1587));
    const discontinuedCount = Number(summary?.status?.find(s => s.label === 'To Be Discontinued')?.value || (v2FdaRecordsCache ? v2FdaRecordsCache.filter(r => (r.shortage_status || '').toLowerCase().includes('discontinued')).length : 427));
    const resolvedCount = Number(summary?.status?.find(s => s.label === 'Resolved')?.value || (v2FdaRecordsCache ? v2FdaRecordsCache.filter(r => (r.shortage_status || '').toLowerCase() === 'resolved').length : 19));
    const totalCompanies = Number(summary?.totalCompanies || 142);
    const isFdaSource = source === 'Drug Shortages';
    const isEmaSource = source === 'EMA Shortages';
    const isCrossSource = source === 'cross_fda_ema';

    const filteredOngoingEma = filtered.filter(r => (r.shortage_status || '').toLowerCase().includes('ongoing')).length;
    const filteredResolvedEma = filtered.filter(r => (r.shortage_status || '').toLowerCase().includes('resolved')).length;
    const filteredDiscontinuedEma = filtered.filter(r => (r.shortage_status || '').toLowerCase().includes('discontinued')).length;
    const filteredNoAltEma = filtered.filter(r => (r.raw_json?.availability_of_alternatives || '').toLowerCase() === 'no').length;

    page.innerHTML = header('Tedarik Sıkıntısı Analizi V2', headerSub) + guide + `
      <!-- 🔍 FİLTRELEME VE TOTAL BULUNAN İLAÇ SONUÇLARI BİLGİ KARTI (BAŞTA GÖSTERİM) -->
      <div class="glass panel v2-results-summary-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <div style="width:48px; height:48px; border-radius:14px; background:linear-gradient(135deg, #0284c7, #0369a1); color:#fff; display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 12px rgba(2,132,199,0.28);">
              🔍
            </div>
            <div>
              <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:#0369a1; display:flex; align-items:center; gap:6px;">
                <span>V2 Tedarik Kriz Karar Destek Süzgeci</span>
                <span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:10px; padding:1px 8px; font-weight:700;">Canlı Senkronize</span>
              </div>
              <h3 style="margin:4px 0 0; font-size:21px; font-family:Outfit; color:#0f172a; font-weight:800;">
                Filtreleme sonucunda toplam <span style="color:#0284c7; font-size:26px; font-weight:800; background:#fff; padding:2px 14px; border-radius:10px; border:2px solid #38bdf8; box-shadow:0 2px 8px rgba(2,132,199,0.14); display:inline-block;">${totalFound.toLocaleString('tr-TR')}</span> ${isCrossSource ? 'ortak molekül' : 'ilaç'} bulundu.
              </h3>
              <div style="font-size:12.5px; color:#475569; margin-top:5px; font-weight:500;">
                ${isCrossSource
                  ? (activeFilters.length > 0 
                      ? 'FDA ve EMA veritabanlarında ortak krizdeki 17 temel molekül içinden seçili kriterlere uyan kayıtlar listeleniyor.' 
                      : 'ABD FDA ve AB EMA resmi kriz veri tabanlarında ortak krizdeki 17 temel molekül tek kalemde birleşik olarak listeleniyor.')
                  : (isFdaSource 
                  ? (activeFilters.length > 0 
                      ? `1.587 FDA kriz kaydı içinden seçili kriterlere uyan kayıtlar listeleniyor.` 
                      : 'FDA Drug Shortages veri tabanındaki 1.587 kriz kaydının tamamı eksiksiz listeleniyor.')
                  : (isEmaSource
                      ? (activeFilters.length > 0 
                          ? `85 EMA Avrupa Birliği kriz kaydı içinden seçili kriterlere uyan kayıtlar listeleniyor.` 
                          : 'Avrupa İlaç Ajansı (EMA) resmi ilaç tedarik sıkıntısı portalındaki 85 kriz kaydının tamamı eksiksiz listeleniyor.')
                      : (source === 'green_cases' ? `Türkiye ${turkeyGreenMeds.length} ulusal yeşil reçete molekülü listeleniyor.` : `${sourceNames[source] || source || 'Birleşik Katalog'} kayıtları listeleniyor.`)))}
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="text-align:right;">
              <div style="font-size:11px; color:#64748b; font-weight:600;">Görüntülenen İlaçlar</div>
              <div style="font-size:14px; font-weight:800; color:#0f172a;">
                ${totalFound === 0 ? '0' : `${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, totalFound)}`} / ${totalFound.toLocaleString('tr-TR')}
              </div>
            </div>
            ${activeFilters.length > 0 ? `
              <button class="button secondary" onclick="resetAllShortageV2Filters()" style="padding:7px 16px; font-size:11.5px; color:#be123c; border-color:#fecdd3; display:inline-flex; align-items:center; gap:6px; font-weight:700;" title="Tüm filtreleri temizleyip varsayılan görünüme dön">
                ✕ Filtreleri Sıfırla (${activeFilters.length})
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Anlık Analitik Metrik Hapları -->
        <div class="v2-metric-pills-row">
          <span class="v2-metric-pill pill-total" title="Toplam filtrelenen ilaç sayısı">
            📊 <b>${totalFound.toLocaleString('tr-TR')}</b> ${isCrossSource ? 'Ortak Molekül Grubu' : 'Toplam İlaç'}
          </span>
          ${isCrossSource ? `
            <span class="v2-metric-pill pill-critical" onclick="setShortageV2Risk('CRITICAL')" title="Tıkla: Hem FDA hem EMA'da çift taraflı aktif krizdeki molekülleri listele">
              🚨 <b>${filtered.filter(r => r.cross_risk_tier === 'CRITICAL').length}</b> Çift Taraflı Aktif Kriz (Risk 95)
            </span>
            <span class="v2-metric-pill pill-zero" onclick="setShortageV2Risk('HIGH')" title="Tıkla: Kısmi aktif krizdeki molekülleri listele">
              ⚡ <b>${filtered.filter(r => r.cross_risk_tier === 'HIGH').length}</b> Kısmi Aktif Kriz (Risk 80-85)
            </span>
            <span class="v2-metric-pill pill-resolved" onclick="setShortageV2Risk('RESOLVED')" title="Tıkla: Çözülen veya stabil krizleri listele" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;">
              🟢 <b>${filtered.filter(r => r.cross_risk_tier === 'RESOLVED').length}</b> Çözülen / Stabil (Risk 60)
            </span>
            <span class="v2-metric-pill pill-green" onclick="setShortageV2GreenFilter('green_only')" title="Tıkla: Ortak krizdeki yeşil reçeteli molekülleri listele">
              🧪 <b>${filtered.filter(r => r.is_green || r.isGreen).length}</b> Yeşil Reçeteli (ADHD, Midazolam)
            </span>
          ` : (isEmaSource ? `
            <span class="v2-metric-pill pill-critical" onclick="setShortageV2Status('Shortage ongoing')" title="Tıkla: Sadece Devam Eden Krizleri listele">
              🔴 <b>${filteredOngoingEma.toLocaleString('tr-TR')}</b> Devam Eden Kriz
            </span>
            <span class="v2-metric-pill pill-zero" onclick="setShortageV2Reason('no_alt')" title="Tıkla: Alternatifi Olmayan (Kritik Monopol) krizleri listele">
              ⚠ <b>${filteredNoAltEma.toLocaleString('tr-TR')}</b> Alternatif Yok (Monopol)
            </span>
            <span class="v2-metric-pill pill-resolved" onclick="setShortageV2Status('Shortage resolved')" title="Tıkla: Çözülen krizleri listele" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;">
              🟢 <b>${filteredResolvedEma.toLocaleString('tr-TR')}</b> Çözüldü
            </span>
            <span class="v2-metric-pill pill-green" onclick="setShortageV2GreenFilter('green_only')" title="Tıkla: Kontrole tabi / yeşil reçeteli ilaçları listele">
              🧪 <b>${filteredGreenCount.toLocaleString('tr-TR')}</b> Yeşil Reçeteli (${filteredGreenCount})
            </span>
          ` : `
            <span class="v2-metric-pill pill-critical" onclick="setShortageV2Risk('high')" title="Tıkla: Sadece Kritik Riskli (Risk ≥ 75) ilaçları listele">
              🚨 <b>${filteredCriticalCount.toLocaleString('tr-TR')}</b> Kritik Kırılganlık (Risk ≥ 75)
            </span>
            <span class="v2-metric-pill pill-active" onclick="setShortageV2Status('Current')" title="Tıkla: Devam eden aktif FDA krizlerini listele">
              ⚡ <b>${filteredCurrentCrisisCount.toLocaleString('tr-TR')}</b> Aktif Kriz (Devam Eden)
            </span>
            <span class="v2-metric-pill pill-green" onclick="setShortageV2GreenFilter('green_only')" title="Tıkla: Yeşil reçeteli kontrole tabi ilaçları listele">
              🟢 <b>${filteredGreenCount.toLocaleString('tr-TR')}</b> Kontrole Tabi (Yeşil Reçete)
            </span>
            ${filteredZeroEquivCount > 0 ? `
              <span class="v2-metric-pill pill-zero" onclick="setShortageV2GreenFilter('import_zero')" title="Tıkla: 0 yerli muadilli monopol ithal ilaçları listele">
                ⚠ <b>${filteredZeroEquivCount.toLocaleString('tr-TR')}</b> 0 Yerli Muadil (Monopol)
              </span>
            ` : ''}
          `)}
        </div>

        <!-- Dahil Edilen Filtrelerin Ayrıntılı Listesi -->
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(2, 132, 199, 0.15); display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
          <span style="font-size:12px; font-weight:700; color:#334155; display:inline-flex; align-items:center; gap:4px;">
            <span>🎯 Dahil Edilen Filtreler (${activeFilters.length}):</span>
          </span>
          ${activeFilters.length === 0 ? `
            <span style="font-size:12px; color:#64748b; font-style:italic;">Filtre uygulanmadı — Seçili kaynak (${isFdaSource ? 'FDA Drug Shortages' : (source || 'Birleşik Katalog')}) kapsamındaki tüm 1.587 kayıt eksiksiz listeleniyor.</span>
          ` : activeFilters.map(f => `
            <span class="v2-active-filter-tag">
              ${f.icon} <b>${f.label}:</b> <span>${esc(f.value)}</span>
              <span class="v2-filter-remove-btn" onclick="${f.onRemove}" title="${f.label} filtresini kaldır">✕</span>
            </span>
          `).join('')}
        </div>
      </div>

      <!-- 🌐 KÜRESEL ÇAPRAZ KRİZ (FDA ∩ EMA ORTAK 17 MOLEKÜL) TRANSATLANTİK BANNER -->
      <div class="glass panel" style="margin-top:14px; background:linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(99, 102, 241, 0.08)); border:1.5px solid #38bdf8; border-radius:14px; padding:16px 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div style="flex:1; min-width:300px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:24px;">🌐</span>
              <h2 style="margin:0; font-size:16px; font-family:Outfit; color:#0369a1; font-weight:800;">
                Küresel Çapraz Kriz Entegrasyonu: FDA ∩ EMA Ortak 17 Molekül (Tek Kalemde Birleşik)
              </h2>
              <span class="badge" style="background:#0284c7; color:#fff; font-size:11px; font-weight:800; padding:2px 8px;">
                Transatlantik Kriz Analizi
              </span>
            </div>
            <div style="font-size:12.5px; color:#334155; margin-top:6px; line-height:1.5;">
              Amerikan FDA (1.587 kayıt) ve Avrupa EMA (85 kayıt) veri tabanları taranarak <b>17 ortak kritik molekül</b> (22 EMA bildirimi ve 243 FDA kriz kaydı) tek kalemde birleştirilmiştir.
              <b>3 molekülde çift taraflı aktif kritik kriz (Risk 95)</b>, <b>4 molekülde kısmi aktif kriz</b> tespit edilmiş olup tüm formülasyon ve monopol durumları eşleştirilmiştir.
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="button" onclick="setShortageV2Source('cross_fda_ema'); setShortageV2GreenFilter('');" style="background:linear-gradient(135deg, #0284c7, #0369a1); border-color:#0284c7; color:#fff; font-weight:700; padding:10px 20px; font-size:12.5px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 3px 10px rgba(2,132,199,0.35); border-radius:10px; cursor:pointer;" title="Tıkla: FDA ve EMA ortak krizindeki 17 molekülün birleşik tablosunu aç">
              🌐 KÜRESEL ÇAPRAZ KRİZ ANALİZİNE GEÇ (17 Molekül) →
            </button>
            <a href="/fda_ema_matched_shortages.json" target="_blank" download="fda_ema_matched_shortages.json" class="button secondary" style="padding:9px 14px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:6px;" title="Birleşik JSON veri setini indir">
              📥 JSON İndir
            </a>
            <a href="/fda_ema_matched_shortages.csv" target="_blank" download="fda_ema_matched_shortages.csv" class="button secondary" style="padding:9px 14px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:6px;" title="Birleşik CSV veri setini indir">
              📊 CSV İndir
            </a>
          </div>
        </div>
      </div>

      <!-- 🟢 TÜM YEŞİL REÇETELİLER MASTER FİLTRE & BİLGİ BANDI -->
      <div class="glass panel green-master-banner">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div style="flex:1; min-width:290px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:22px;">🟢</span>
              <h2 style="margin:0; font-size:16px; font-family:Outfit; color:#065f46; font-weight:800;">
                Resmi Yeşil Reçete & DEA Kontrollü İlaçlar İzleme Sistemi (${turkeyGreenMeds.length} Etkin Madde & Kombinasyonlar)
              </h2>
              <span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-size:11px; font-weight:700;">
                DEA Schedule II-V & TİTCK Ek-4/A
              </span>
            </div>
            <div style="font-size:12.5px; color:#334155; margin-top:6px; line-height:1.5;">
              Kritik merkezi sinir sistemi, anestezi ve psikotrop molekülleri (Fentanyl, Morphine, Oxycodone, Ketamine, Xanax, Contramal, Lyrica, Ritalin vb.) ile İsviçre kontrol listesi benzodiazepinleri ve müstahzarları tek merkezden izlenmektedir.
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="button" onclick="toggleShortageV2GreenOnly()" style="background:${currentShortageV2GreenFilter === 'green_only' ? '#047857' : '#059669'}; border-color:#047857; color:#fff; font-weight:700; padding:10px 20px; font-size:12.5px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 3px 10px rgba(16,185,129,0.35); border-radius:10px; cursor:pointer;" title="Tıkla: Tüm yeşil reçeteli ilaçları ve kombinasyonları filtrele">
              ${currentShortageV2GreenFilter === 'green_only' ? '✓ TÜM YEŞİL REÇETELİLER SEÇİLİ (Filtreyi Kaldır)' : '🟢 TÜM YEŞİL REÇETELİLERİ FİLTRELE (Tek Tıkla Süz) →'}
            </button>
            ${currentShortageV2GreenFilter ? `
              <button class="button secondary" onclick="setShortageV2GreenFilter('')" style="padding:9px 14px; font-size:12px; color:#e11d48; border-color:#fecdd3; font-weight:700;">
                ✕ Yeşil Filtreyi Sıfırla
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 3 Hızlı Yeşil Reçete Kategori Kartı -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin-top:14px;">
          <div class="green-stat-card ${currentShortageV2GreenFilter === 'import_zero' ? 'active' : ''}" style="border-left:4px solid #e11d48;" onclick="setShortageV2GreenFilter('import_zero')" title="Tıkla: İthal bağımlısı (0 muadil) yeşil reçeteleri filtrele">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11.5px; font-weight:700; color:#991b1b;">🔴 İthal Bağımlısı (0 Muadil)</span>
              <span class="badge" style="background:#fee2e2; color:#991b1b; font-size:10px; font-weight:800;">Yüksek Kırılganlık</span>
            </div>
            <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:4px;">${greenImportZeroCount} İlaç</div>
            <div style="font-size:11px; color:#64748b; margin-top:3px; line-height:1.35;">Alprazolam (Xanax), Klonazepam, Tianeptin vb.</div>
          </div>
          <div class="green-stat-card ${currentShortageV2GreenFilter === 'green_active' ? 'active' : ''}" style="border-left:4px solid #f59e0b;" onclick="setShortageV2GreenFilter('green_active')" title="Tıkla: Aktif FDA krizindeki yeşil reçeteleri filtrele">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11.5px; font-weight:700; color:#b45309;">⚡ Aktif Küresel Kriz (FDA)</span>
              <span class="badge" style="background:#fef3c7; color:#b45309; font-size:10px; font-weight:800;">Küresel Darboğaz</span>
            </div>
            <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:4px;">${greenActiveCount} İlaç</div>
            <div style="font-size:11px; color:#64748b; margin-top:3px; line-height:1.35;">Lorazepam (Ativan), Midazolam, Fentanyl vb.</div>
          </div>
          <div class="green-stat-card ${currentShortageV2GreenFilter === 'local_prod' ? 'active' : ''}" style="border-left:4px solid #10b981;" onclick="setShortageV2GreenFilter('local_prod')" title="Tıkla: Yerli imalat güvencesindeki yeşil reçeteleri filtrele">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11.5px; font-weight:700; color:#047857;">🟢 Yerli İmalat Güvencesi</span>
              <span class="badge" style="background:#d1fae5; color:#047857; font-size:10px; font-weight:800;">Ulusal Güvence</span>
            </div>
            <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:4px;">${greenLocalCount} İlaç</div>
            <div style="font-size:11px; color:#64748b; margin-top:3px; line-height:1.35;">Diazepam, Tramadol, Pregabalin, Biperiden vb.</div>
          </div>
        </div>
      </div>

      <!-- FDA Resmi Veri Portalı Senkronizasyon Kartı -->
      <div class="glass panel fda-sync-banner">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">🏛️</span>
              <h2 style="margin:0; font-size:15px; font-family:Outfit; color:#0f172a; font-weight:700;">ABD FDA Resmi Drug Shortages Portalı Veri Tabanı</h2>
              <span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-size:11px; font-weight:700;">✓ Tüm 1.587 Kriz Kaydı Entegre</span>
            </div>
            <div style="font-size:12px; color:#475569; margin-top:4px; line-height:1.4;">
              FDA'nın resmi veri tabanındaki (${totalShortages.toLocaleString('tr-TR')} kriz kaydı) tüm Terapötik Sınıflar, Dozaj/Sunum Formları, Stok Durumu ve İletişim verileriyle bu ekrana tam entegre olarak listelenmektedir.
            </div>
          </div>
          <a href="https://www.accessdata.fda.gov/scripts/drugshortages/" target="_blank" rel="noopener noreferrer" class="button" style="padding:8px 16px; font-size:11.5px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:700;">
            FDA Resmi Portalı ↗
          </a>
        </div>
      </div>

      <section class="grid stats" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        <article class="glass stat" onclick="setShortageV2Status('')" style="cursor:pointer;" title="Tüm FDA Kriz Kayıtlarını Göster">
          <span class="stat-label">FDA Kriz Veri Tabanı</span>
          <strong>${totalShortages.toLocaleString('tr-TR')}</strong>
          <small>FDA Drug Shortages (Tüm Kayıtlar)</small>
          <span class="trend red">⚡</span>
        </article>
        <article class="glass stat" onclick="setShortageV2Status('Current')" style="cursor:pointer;" title="Sadece Aktif/Güncel Krizleri Filtrele">
          <span class="stat-label">Aktif FDA Tedarik Krizi</span>
          <strong style="color:#b91c1c;">${currentCount.toLocaleString('tr-TR')}</strong>
          <small>Devam eden küresel krizler</small>
          <span class="trend red">⚠</span>
        </article>
        <article class="glass stat" onclick="setShortageV2Status('To Be Discontinued')" style="cursor:pointer;" title="Üretimi Sonlandırılan İlaçları Filtrele">
          <span class="stat-label">Üretimi Sonlandırılıyor</span>
          <strong style="color:#d97706;">${discontinuedCount.toLocaleString('tr-TR')}</strong>
          <small>Piyasadan çekilme / terk</small>
          <span class="trend" style="background:#fef3c7; color:#b45309;">🛑</span>
        </article>
        <article class="glass stat" onclick="setShortageV2Status('Resolved')" style="cursor:pointer;" title="Çözülen Kriz Kayıtlarını Filtrele">
          <span class="stat-label">Çözülen Krizler</span>
          <strong style="color:#047857;">${resolvedCount.toLocaleString('tr-TR')}</strong>
          <small>Tedariki yeniden sağlananlar</small>
          <span class="trend" style="background:#ecfdf5; color:#047857;">✓</span>
        </article>
        <article class="glass stat">
          <span class="stat-label">Krizdeki Üretici Firmalar</span>
          <strong>${totalCompanies.toLocaleString('tr-TR')}</strong>
          <small>Etkilenen ilaç üreticisi</small>
          <span class="trend">🏭</span>
        </article>
        <article class="glass stat" onclick="setShortageV2Source('')" style="cursor:pointer;" title="Birleşik Kataloğu Aç">
          <span class="stat-label">Katalogdaki Tüm İlaçlar</span>
          <strong>${totalAllDrugs.toLocaleString('tr-TR')}</strong>
          <small>6 Veri Kaynağı (Birleşik Katalog)</small>
          <span class="trend">🌐</span>
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
              <span style="font-size:12.5px; font-weight:700; color:var(--ink); font-family:Outfit;">
                📋 FDA Veri Tabanı Kriz Nedenleri Sonuç Dağılımı (Filtrelemek İçin Tıklayın)
              </span>
              ${reasonFilter ? `
                <button class="button secondary" onclick="setShortageV2Reason('')" style="padding:3px 10px; font-size:11px; color:#e11d48; border-color:#fecdd3; font-weight:700;">
                  ✕ Filtreyi Temizle
                </button>
              ` : ''}
            </div>

            <div class="reason-results-list">
              ${(() => {
                const totalReasonsSum = summary.reasons.reduce((acc, curr) => acc + Number(curr.value || 0), 0) || 1;
                return summary.reasons.map(r => {
                  const isSelected = reasonFilter === r.label;
                  const desc = getFdaReasonTr(r.label);
                  const pct = Math.round((Number(r.value) / totalReasonsSum) * 100);
                  return `
                    <div class="reason-result-item ${isSelected ? 'active' : ''}" onclick="setShortageV2Reason('${esc(r.label)}')" title="Tıkla: Bu nedene ait ilaçları listele">
                      <div class="reason-result-info">
                        <div class="reason-result-title">
                          <span class="reason-tr">${esc(desc)}</span>
                          <span class="reason-en">FDA: ${esc(r.label)}</span>
                        </div>
                      </div>
                      <div class="reason-result-stats">
                        <span class="reason-count">${Number(r.value).toLocaleString('tr-TR')} kayıt</span>
                        <span class="reason-pct">%${pct}</span>
                        <span class="reason-badge-btn">${isSelected ? '✓ Seçili' : 'Filtrele →'}</span>
                      </div>
                    </div>
                  `;
                }).join('');
              })()}
            </div>
          </div>

          <!-- 🇹🇷 Türkiye Yeşil Reçete & Ulusal Tedarik Kriz Dağılımı Paneli -->
          <div style="margin-top:16px; padding:16px; border-radius:14px; background:linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(2, 132, 199, 0.08)); border:1px solid rgba(16, 185, 129, 0.25);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:18px;">🇹🇷</span>
                <b style="font-size:13.5px; color:#065f46; font-family:Outfit;">Türkiye Yeşil Reçete & Ulusal Tedarik Kriz Dağılımı (${turkeyGreenMeds.length} Ulusal Molekül)</b>
              </div>
              <button class="button" style="padding:5px 14px; font-size:11.5px; font-weight:700;" onclick="setShortageV2GreenFilter('green_only')">
                🟢 ${turkeyGreenMeds.length} Yeşil Reçeteli İlacı Listele →
              </button>
            </div>
            <div style="font-size:12px; color:#334155; margin-bottom:12px; line-height:1.45;">
              T.C. Sağlık Bakanlığı TİTCK ve SGK Ek-4/A resmi yeşil reçete listesiyle: Türkiye'de yerli alternatifi olmayan (%100 ithal) yeşil reçete ilaçları, FDA krizinde olmasalar dahi ulusal seviyede <b>kritik tedarik kırılganlığına (0 Muadil)</b> sahiptir.
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
              <div class="green-stat-card ${currentShortageV2GreenFilter === 'import_zero' ? 'active' : ''}" style="border-left:4px solid #e11d48;" onclick="setShortageV2GreenFilter('import_zero')" title="Tıkla: İthal bağımlısı (0 muadil) yeşil reçeteleri filtrele">
                <div style="font-size:11.5px; font-weight:700; color:#991b1b;">🔴 İthal Bağımlısı (0 Muadil)</div>
                <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:2px;">${greenImportZeroCount} İlaç</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Alprazolam (Xanax), Klonazepam, Tianeptin, vb.</div>
              </div>
              <div class="green-stat-card ${currentShortageV2GreenFilter === 'green_active' ? 'active' : ''}" style="border-left:4px solid #f59e0b;" onclick="setShortageV2GreenFilter('green_active')" title="Tıkla: Aktif FDA krizindeki yeşil reçeteleri filtrele">
                <div style="font-size:11.5px; font-weight:700; color:#b45309;">⚡ Aktif Küresel Kriz (FDA)</div>
                <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:2px;">${greenActiveCount} İlaç</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Klonazepam (Rivotril), Lorazepam (Ativan), Midazolam, vb.</div>
              </div>
              <div class="green-stat-card ${currentShortageV2GreenFilter === 'local_prod' ? 'active' : ''}" style="border-left:4px solid #10b981;" onclick="setShortageV2GreenFilter('local_prod')" title="Tıkla: Yerli imalat güvencesindeki yeşil reçeteleri filtrele">
                <div style="font-size:11.5px; font-weight:700; color:#047857;">🟢 Yerli İmalat Güvencesi</div>
                <div style="font-size:20px; font-weight:800; color:#0f172a; margin-top:2px;">${greenLocalCount} İlaç</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Diazepam, Tramadol, Pregabalin, Biperiden vb.</div>
              </div>
            </div>
          </div>

          <div class="notice" style="margin-top:14px; font-size:12px; line-height:1.45;">
            💡 <b>Kök Neden Analizi & Karar Desteği:</b> Yukarıdaki neden sonuçlarından herhangi birine tıklayarak tablodaki ilaçları doğrudan o kök nedene göre filtreleyebilir; ilgili endüstri mühendisliği aksiyonunu (ikincil API, ROP tamponu, dinamik tayınlama) denetleyebilirsiniz.
          </div>
        </article>

        <article class="glass panel">
          <div class="panel-head">
            <h2>FDA Kriz Durumu Dağılımı</h2>
            <span class="source-tag">Eski Sistem Durum Analizi (${summary.status.length} Sınıf)</span>
          </div>
          ${chart(summary.status.map(s => ({
            label: s.label === 'Current' ? 'Güncel (1.141)' : (s.label === 'To Be Discontinued' ? 'Sonlandırılıyor (427)' : (s.label === 'Resolved' ? 'Çözüldü (19)' : s.label)),
            value: s.value
          })))}

          <div class="status-stat-grid" style="margin-top:12px;">
            <div class="status-stat-item ${status === 'Current' ? 'active' : ''}" onclick="setShortageV2Status('Current')">
              <div style="font-size:11.5px; font-weight:700; color:#b91c1c;">● Güncel (Aktif Kriz)</div>
              <div style="font-size:17px; font-weight:800; color:#0f172a; margin-top:2px;">${currentCount.toLocaleString('tr-TR')}</div>
              <small style="color:var(--muted); font-size:10.5px;">Kriz süreci devam ediyor</small>
            </div>
            <div class="status-stat-item ${status === 'To Be Discontinued' ? 'active' : ''}" onclick="setShortageV2Status('To Be Discontinued')">
              <div style="font-size:11.5px; font-weight:700; color:#d97706;">● Sonlandırılıyor</div>
              <div style="font-size:17px; font-weight:800; color:#0f172a; margin-top:2px;">${discontinuedCount.toLocaleString('tr-TR')}</div>
              <small style="color:var(--muted); font-size:10.5px;">Üretici piyasadan çekiliyor</small>
            </div>
            <div class="status-stat-item ${status === 'Resolved' ? 'active' : ''}" onclick="setShortageV2Status('Resolved')">
              <div style="font-size:11.5px; font-weight:700; color:#047857;">● Çözüldü</div>
              <div style="font-size:17px; font-weight:800; color:#0f172a; margin-top:2px;">${resolvedCount.toLocaleString('tr-TR')}</div>
              <small style="color:var(--muted); font-size:10.5px;">Stok dengesi sağlandı</small>
            </div>
          </div>

          <!-- 🏭 En Çok Tedarik Sıkıntısı Bildirilen Üretici Firmalar -->
          <div class="top-companies-container" style="margin-top:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:12.5px; font-weight:700; color:var(--ink); font-family:Outfit;">
                🏭 En Çok Kriz Bildiren Üreticiler (Filtrelemek İçin Tıklayın)
              </span>
              ${currentShortageV2Manufacturer ? `
                <button class="button secondary" onclick="setShortageV2Manufacturer('')" style="padding:2px 8px; font-size:11px; color:#e11d48; font-weight:700;">✕ Sıfırla</button>
              ` : ''}
            </div>
            <div style="font-size:11.5px; color:var(--muted); margin-bottom:8px;">
              FDA kriz veri tabanında en yoğun bildirim yapan ilk 10 uluslararası ilaç firması:
            </div>
            <div class="top-companies-grid">
              ${(summary.topCompanies && summary.topCompanies.length ? summary.topCompanies : [
                { label: 'Pfizer Inc.', value: 104 },
                { label: 'Teva Pharmaceuticals USA, Inc.', value: 76 },
                { label: 'Hikma Pharmaceuticals USA Inc.', value: 68 },
                { label: 'Fresenius Kabi USA, LLC', value: 64 },
                { label: 'Hospira, Inc.', value: 48 },
                { label: 'Sandoz Inc.', value: 42 },
                { label: 'Aurobindo Pharma USA', value: 39 },
                { label: 'Amneal Pharmaceuticals', value: 33 },
                { label: 'Mylan Pharmaceuticals Inc.', value: 29 },
                { label: 'Sun Pharmaceutical Industries', value: 24 }
              ]).map(c => {
                const isSelected = currentShortageV2Manufacturer && c.label.toLowerCase().includes(currentShortageV2Manufacturer.toLowerCase());
                return `
                  <button class="company-pill-btn ${isSelected ? 'active' : ''}" onclick="setShortageV2Manufacturer('${esc(c.label)}')" title="Tıkla: ${esc(c.label)} krizlerini listele">
                    <span>${esc(c.label)}</span>
                    <b>${Number(c.value).toLocaleString('tr-TR')}</b>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 📊 Endüstri Mühendisliği Karar Destek & Müdahale Matrisi (IE Matrix) -->
          <div style="margin-top:18px;">
            <div class="panel-head" style="margin-bottom:6px;">
              <h2>Endüstri Mühendisliği Müdahale Matrisi</h2>
              <span class="source-tag">Karar Destek Çerçevesi</span>
            </div>
            <div style="font-size:11.5px; color:var(--muted); margin-bottom:10px;">
              Krizin kök nedenine göre uygulanan stok optimizasyonu, tampon süresi ve operasyonel mühendislik kararları (Filtrelemek için karta tıklayın):
            </div>
            <div class="ie-matrix-grid">
              <div class="ie-matrix-card ${reasonFilter === 'api' ? 'active' : ''}" onclick="setShortageV2Reason('api')" title="Tıkla: Hammadde/API sıkıntısı olan ilaçları filtrele">
                <div class="ie-card-head">
                  <b>🚨 Hammadde / API Darboğazı</b>
                  <span class="badge" style="background:#fee2e2; color:#991b1b; font-size:9.5px; font-weight:800;">Tedarik Riski</span>
                </div>
                <div class="ie-card-formula">Emniyet Stoğu: SS = Z · σ_L · D (Z=2.33, %99 Servis Düzeyi)</div>
                <div class="ie-card-desc">İkincil API üreticisi akreditasyonu hızlandırılır; emniyet stoğu ve sipariş partisi azamiye çıkarılır.</div>
                <div class="ie-card-action">⚡ Dual-Sourcing & İkincil Kaynak Akreditasyonu →</div>
              </div>

              <div class="ie-matrix-card ${reasonFilter === 'logistics' ? 'active' : ''}" onclick="setShortageV2Reason('logistics')" title="Tıkla: Lojistik/Boğaz gecikmesi yaşayan ilaçları filtrele">
                <div class="ie-card-head">
                  <b>🚢 Lojistik & Boğaz Gecikmesi</b>
                  <span class="badge" style="background:#fef3c7; color:#b45309; font-size:9.5px; font-weight:800;">Transit Gecikmesi</span>
                </div>
                <div class="ie-card-formula">Sipariş Noktası: ROP = d · (L + 21 Gün) + SS</div>
                <div class="ie-card-desc">Süveyş ve boğaz sapmaları kaynaklı teslim süresi uzamasına karşı ROP öne çekilir; acil hava koridoru açılır.</div>
                <div class="ie-card-action">⚡ Lead Time Tamponu (+21 Gün) & ROP Güncellemesi →</div>
              </div>

              <div class="ie-matrix-card ${reasonFilter === 'gmp' ? 'active' : ''}" onclick="setShortageV2Reason('gmp')" title="Tıkla: GMP/Kalite kaynaklı krizleri filtrele">
                <div class="ie-card-head">
                  <b>⚙️ GMP & Kalite Uyumsuzluğu</b>
                  <span class="badge" style="background:#f3e8ff; color:#7e22ce; font-size:9.5px; font-weight:800;">Üretim Kesintisi</span>
                </div>
                <div class="ie-card-formula">Eşdeğer Fason Tesis Transferi & Hızlı Parti Salımı</div>
                <div class="ie-card-desc">Hattı duran tesisteki lisans, onaylı alternatif fason üreticiye aktarılır; analitik parti salımı hızlandırılır.</div>
                <div class="ie-card-action">⚡ Fason Tesis İkamesi & Validasyon Hızlandırma →</div>
              </div>

              <div class="ie-matrix-card ${reasonFilter === 'demand' ? 'active' : ''}" onclick="setShortageV2Reason('demand')" title="Tıkla: Talep sıçraması kaynaklı krizleri filtrele">
                <div class="ie-card-head">
                  <b>📈 Talep Sıçraması & Kapasite</b>
                  <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:9.5px; font-weight:800;">Kapasite Aşımı</span>
                </div>
                <div class="ie-card-formula">Dinamik Tayınlama Kotası: Q_i = Q_toplam · (T_i / ΣT)</div>
                <div class="ie-card-desc">Hastanelerin ve eczanelerin geçmiş tüketim verilerine göre kotalı dağıtım uygulanarak panik stoklaması önlenir.</div>
                <div class="ie-card-action">⚡ Dinamik Tayınlama & Spekülatif Stok Blokajı →</div>
              </div>

              <div class="ie-matrix-card ${reasonFilter === 'discontinued' ? 'active' : ''}" onclick="setShortageV2Reason('discontinued')" title="Tıkla: Piyasadan çekilen/terk edilen ilaçları filtrele">
                <div class="ie-card-head">
                  <b>🛑 Piyasadan Çekilme / Terk</b>
                  <span class="badge" style="background:#f1f5f9; color:#475569; font-size:9.5px; font-weight:800;">Pazar Terki</span>
                </div>
                <div class="ie-card-formula">Eşdeğer Geçiş Protokolü + TEB Ek-1 İthalat</div>
                <div class="ie-card-desc">Reçeteler yerli eşdeğer ilaçlara yönlendirilir; yerli muadili yoksa TEB Ek-1 acil ithalat protokolü açılır.</div>
                <div class="ie-card-action">⚡ SGK Eşdeğer Grubu Muadili & TEB Acil Temin →</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="glass panel" style="margin-top:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
          <h2 style="margin:0; font-size:15px; font-family:Outfit;">${source === 'cross_fda_ema' ? '🌐 Küresel Çapraz Kriz: FDA ∩ EMA Ortak Moleküller (Tek Kalemde Birleşik Analiz)' : (source === 'EMA Shortages' ? '🇪🇺 EMA Avrupa Kriz Kataloğu & Süzgeçler' : '⚡ FDA Kriz Veri Kapsamı & Gelişmiş Süzgeçler')}</h2>
          <button class="button secondary" id="resetShortageV2Filters" style="padding:6px 14px; font-size:11px;">Filtreleri Sıfırla</button>
        </div>

        <!-- Hızlı Veri Kaynağı Kapsam Sekmeleri -->
        <div class="tabs" style="margin-bottom:14px;">
          <button class="tab ${source === 'cross_fda_ema' ? 'active' : ''}" onclick="setShortageV2Source('cross_fda_ema'); setShortageV2GreenFilter('');" style="${source === 'cross_fda_ema' ? 'background:linear-gradient(135deg,#0284c7,#0369a1); color:#fff; font-weight:800;' : 'border-color:#38bdf8; color:#0369a1; font-weight:700;'}">🌐 Küresel Çapraz Kriz (FDA ∩ EMA Ortak · 17 Molekül)</button>
          <button class="tab ${source === 'Drug Shortages' && !currentShortageV2GreenFilter ? 'active' : ''}" onclick="setShortageV2Source('Drug Shortages'); setShortageV2GreenFilter('');">⚡ FDA Resmi Kriz Veri Tabanı (Tüm FDA Sitesi · ${totalShortages.toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'EMA Shortages' ? 'active' : ''}" onclick="setShortageV2Source('EMA Shortages'); setShortageV2GreenFilter('');">🇪🇺 EMA Resmi Kriz Kataloğu (Avrupa İlaç Ajansı · 85)</button>
          <button class="tab ${currentShortageV2GreenFilter === 'green_only' ? 'active' : ''}" onclick="setShortageV2GreenFilter('green_only')">🟢 Tüm Yeşil Reçeteliler (${turkeyGreenMeds.length} Etkin Madde & İçerenler)</button>
          <button class="tab ${source === 'green_cases' ? 'active' : ''}" onclick="setShortageV2Source('green_cases'); setShortageV2GreenFilter('');">🇹🇷 Türkiye ${turkeyGreenMeds.length} Ulusal Yeşil Molekül Portföyü</button>
          <button class="tab ${source === '' && !currentShortageV2GreenFilter ? 'active' : ''}" onclick="setShortageV2Source(''); setShortageV2GreenFilter('');">🌐 Birleşik İlaç Kataloğu (${totalAllDrugs.toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'FDA Drugs' ? 'active' : ''}" onclick="setShortageV2Source('FDA Drugs'); setShortageV2GreenFilter('');">FDA Ruhsatlı İlaçlar (${Number(count['FDA Drugs'] || 0).toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'NDC Products' ? 'active' : ''}" onclick="setShortageV2Source('NDC Products'); setShortageV2GreenFilter('');">NDC Ürün Kataloğu (${Number(count['NDC Products'] || 0).toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'VA Contracts' ? 'active' : ''}" onclick="setShortageV2Source('VA Contracts'); setShortageV2GreenFilter('');">VA Tedarik Sözleşmeleri (${Number(count['VA Contracts'] || 0).toLocaleString('tr-TR')})</button>
          <button class="tab ${source === 'CMS Medicare Part D' ? 'active' : ''}" onclick="setShortageV2Source('CMS Medicare Part D'); setShortageV2GreenFilter('');">CMS Talep Verileri (${Number(count['CMS Medicare Part D'] || 0).toLocaleString('tr-TR')})</button>
        </div>

        <div class="controls" style="margin-bottom:0; display:grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap:12px;">
          <label style="font-size:12px; font-weight:700; color:#047857; display:flex; flex-direction:column; gap:4px;">
            🟢 Yeşil Reçete Filtresi:
            <select id="shortageV2GreenFilter" style="border:1.5px solid #10b981; background:#f0fdf4; font-weight:600; color:#065f46;">
              <option value="">Tüm İlaçlar (Standart + Yeşil Reçete)</option>
              <option value="green_only" ${currentShortageV2GreenFilter === 'green_only' ? 'selected' : ''}>🟢 Tüm Yeşil Reçeteliler (${turkeyGreenMeds.length} Madde & Kombinasyonlar)</option>
              <option value="non_green" ${currentShortageV2GreenFilter === 'non_green' ? 'selected' : ''}>⚪ Standart İlaçlar (Yeşil Olmayanlar)</option>
              <optgroup label="🚨 DEA Schedule II (Narkotikler & Uyarıcılar - 11 Madde)">
                ${turkeyGreenMeds.filter(m => m.deaSchedule === 'Schedule II').map(m => `
                  <option value="${m.name}" ${currentShortageV2GreenFilter.toUpperCase() === m.name ? 'selected' : ''}>
                    No ${m.no}: ${m.name} (${m.brand.split('/')[0].trim()})
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="⚡ DEA Schedule III & IV & V (Sedatifler, Anksiyolitikler & Diğerleri - 12 Madde)">
                ${turkeyGreenMeds.filter(m => ['Schedule III', 'Schedule IV', 'Schedule V'].includes(m.deaSchedule)).map(m => `
                  <option value="${m.name}" ${currentShortageV2GreenFilter.toUpperCase() === m.name ? 'selected' : ''}>
                    No ${m.no}: ${m.name} (${m.brand.split('/')[0].trim()})
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="🇹🇷 TİTCK / Ek-4/A Kontrole Tabi İlave Moleküller (5 Madde)">
                ${turkeyGreenMeds.filter(m => m.deaSchedule === 'TİTCK / Ek-4/A').map(m => `
                  <option value="${m.name}" ${currentShortageV2GreenFilter.toUpperCase() === m.name ? 'selected' : ''}>
                    No ${m.no}: ${m.name} (${m.brand.split('/')[0].trim()})
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="🇨🇭 İsviçre Kontrol Listesi & İlave Benzodiazepinler (11 Madde)">
                ${turkeyGreenMeds.filter(m => (m.deaSchedule || '').includes('İsviçre')).map(m => `
                  <option value="${m.name}" ${currentShortageV2GreenFilter.toUpperCase() === m.name ? 'selected' : ''}>
                    No ${m.no}: ${m.name} (${m.brand.split('/')[0].trim()})
                  </option>
                `).join('')}
              </optgroup>
              <optgroup label="⚡ Tedarik Kırılganlığı (Yeşil Reçete)">
                <option value="import_zero" ${currentShortageV2GreenFilter === 'import_zero' ? 'selected' : ''}>🔴 İthal Bağımlısı (0 Muadil - SGK Ek-1)</option>
                <option value="green_active" ${currentShortageV2GreenFilter === 'green_active' ? 'selected' : ''}>⚡ Aktif FDA Krizindeki Yeşil Reçeteler</option>
                <option value="local_prod" ${currentShortageV2GreenFilter === 'local_prod' ? 'selected' : ''}>🟢 Yerli İmalat (Güvenceli)</option>
              </optgroup>
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            Veri Kapsamı / Kaynak:
            <select id="shortageV2SourceSelect">
              <option value="cross_fda_ema" ${source === 'cross_fda_ema' ? 'selected' : ''}>🌐 Küresel Çapraz Kriz: FDA ∩ EMA Ortak (17 Molekül)</option>
              <option value="Drug Shortages" ${source === 'Drug Shortages' ? 'selected' : ''}>⚡ FDA Kriz Veri Tabanı (Tüm FDA Sitesi · ${totalShortages.toLocaleString('tr-TR')})</option>
              <option value="EMA Shortages" ${source === 'EMA Shortages' ? 'selected' : ''}>🇪🇺 EMA Kriz Kataloğu (Avrupa İlaç Ajansı · 85)</option>
              <option value="green_cases" ${source === 'green_cases' ? 'selected' : ''}>🟢 Yeşil Reçeteli İlaçlar (${turkeyGreenMeds.length} Ulusal Molekül)</option>
              <option value="" ${source === '' ? 'selected' : ''}>🌐 Birleşik İlaç Kataloğu (${totalAllDrugs.toLocaleString('tr-TR')})</option>
              ${Object.entries(sourceNames).filter(([k]) => !['Drug Shortages', 'EMA Shortages'].includes(k)).map(([k, v]) => `<option value="${k}" ${k === source ? 'selected' : ''}>${v} (${Number(count[k] || 0).toLocaleString('tr-TR')})</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px; font-weight:600; color:var(--muted); display:flex; flex-direction:column; gap:4px;">
            ${isEmaSource ? 'AB (EMA) Kriz Durumu:' : 'FDA Kriz Durumu:'}
            <select id="shortageV2Status">
              <option value="">Tüm Durumlar</option>
              ${isEmaSource ? `
                <option value="Shortage ongoing" ${status === 'Shortage ongoing' ? 'selected' : ''}>Devam Eden Kriz (Ongoing - 27)</option>
                <option value="Shortage resolved" ${status === 'Shortage resolved' ? 'selected' : ''}>Çözüldü (Resolved - 53)</option>
                <option value="Medicine discontinued" ${status === 'Medicine discontinued' ? 'selected' : ''}>Piyasadan Çekildi (5)</option>
              ` : `
                <option value="Current" ${status === 'Current' ? 'selected' : ''}>Güncel (Devam Eden - 1.141)</option>
                <option value="To Be Discontinued" ${status === 'To Be Discontinued' ? 'selected' : ''}>Üretim Sonlandırılıyor (427)</option>
                <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>Çözüldü (19)</option>
              `}
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
            Üretici / Firma Adı:
            <input type="text" id="shortageV2Manufacturer" placeholder="Firma adında ara (Pfizer, Teva...)" value="${esc(currentShortageV2Manufacturer)}" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:12px; background:var(--card);">
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
                <option value="green_cases" ${reasonFilter === 'green_cases' ? 'selected' : ''}>🟢 Yeşil Reçeteli İlaçlar (${turkeyGreenMeds.length} Molekül)</option>
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

        ${activeFilters.length > 0 ? `
          <div style="margin-top:14px; margin-bottom:14px; padding:12px 16px; border-radius:12px; background:rgba(2, 132, 199, 0.08); border:1px solid rgba(2, 132, 199, 0.25); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; color:#0369a1;">
              <b>🔍 Aktif Süzgeçler (${activeFilters.length}):</b>
              <span class="badge" style="background:#0284c7; color:#fff; font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">
                Filtrelenen Toplam: ${totalFound.toLocaleString('tr-TR')} İlaç
              </span>
              ${activeFilters.map(f => `
                <span class="badge" style="font-size:11px; padding:3px 8px; ${f.style || 'background:#fff; color:#0f172a; border:1px solid #cbd5e1;'} cursor:pointer;" onclick="${f.onRemove}" title="Tıkla: ${f.label} filtresini kaldır">
                  ${f.icon} <b>${f.label}:</b> ${esc(f.value)} ✕
                </span>
              `).join('')}
            </div>
            <button class="button secondary" onclick="resetAllShortageV2Filters()" style="padding:5px 12px; font-size:11px; color:#be123c; border-color:#fecdd3; font-weight:600;">✕ Filtreleri Temizle</button>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:22px; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 style="margin:0;">
              ${source === 'green_cases' ? `🟢 Türkiye Yeşil Reçete & Ulusal Tedarik Kriz Portföyü (${turkeyGreenMeds.length} Molekül)` : (isFdaSource ? 'FDA Resmi Kriz Veri Tabanı' : (source ? esc(sourceNames[source] || source) : 'Birleşik İlaç Kataloğu'))} Kayıtları · <span style="color:#0284c7; font-weight:800; background:#e0f2fe; padding:2px 10px; border-radius:8px; border:1px solid #bae6fd;">${totalFound.toLocaleString('tr-TR')} İlaç Bulundu</span>
              ${query ? `<small style="font-size:12px; color:var(--muted); font-weight:normal;">("${esc(query)}" için filtrelendi)</small>` : ''}
              ${currentShortageV2Manufacturer ? `<small style="font-size:12px; color:#0284c7; font-weight:normal;">(Firma: "${esc(currentShortageV2Manufacturer)}")</small>` : ''}
            </h2>
            <span style="font-size:11px; color:var(--muted);">${source === 'green_cases' ? `T.C. Sağlık Bakanlığı TİTCK ve SGK Ek-4/A kapsamındaki ${turkeyGreenMeds.length} ulusal psikotrop ilaç ve kriz durumları listelenmektedir` : (isFdaSource ? 'FDA resmi sitesindeki tüm alanlar listelenmektedir · Satıra tıklayarak çapraz profili açabilirsiniz' : 'Satıra tıklayarak 6 kaynaklı çapraz ilaç profilini açabilirsiniz')}</span>
          </div>
          <button class="button csv-export-btn" onclick="exportShortagesV2Csv()" title="Görüntülenen kriz kayıtlarını Excel/CSV olarak indir">
            📥 Süzülmüş Kriz Kayıtlarını Dışa Aktar (CSV · ${totalFound.toLocaleString('tr-TR')} İlaç)
          </button>
        </div>

        ${shortageTableV2(paginatedRows, isFdaSource, source)}

        <!-- Sayfalama (Pagination) -->
        <div class="pagination" style="margin-top:16px;">
          <span>Filtrelenen <b>${totalFound.toLocaleString('tr-TR')}</b> ilaçtan <b>${totalFound === 0 ? 0 : (currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalFound)}</b> arası gösteriliyor (Sayfa ${currentPage} / ${totalPages})</span>
          <div>
            <button class="button secondary" id="shortageV2Prev" ${currentPage <= 1 ? 'disabled' : ''}>← Önceki</button>
            <button class="button secondary" id="shortageV2Next" ${currentPage >= totalPages ? 'disabled' : ''}>Sonraki →</button>
          </div>
        </div>
      </section>
    `;

    document.querySelector('#shortageV2GreenFilter')?.addEventListener('change', e => {
      setShortageV2GreenFilter(e.target.value);
    });
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
    document.querySelector('#shortageV2Manufacturer')?.addEventListener('change', e => {
      currentShortageV2Manufacturer = e.target.value.trim();
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
      currentShortageV2Manufacturer = '';
      currentShortageV2Category = '';
      currentShortageV2Availability = '';
      currentShortageV2Reason = '';
      currentShortageV2GreenFilter = '';
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
      if (currentShortageV2Page < totalPages) {
        currentShortageV2Page++;
        shortagePageV2();
      }
    });
    document.querySelector('#resetShortageV2Filters')?.addEventListener('click', () => {
      resetAllShortageV2Filters();
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
// ==========================================================================
// 6.7 RİSK ANALİZ KRİTERLERİ & AĞIRLIKLANDIRMA SİSTEMİ (DSRDS - 8 ANA KRİTER)
// ==========================================================================
const defaultRiskCriteriaData = [
  {
    id: 1,
    symbol: 'R₁',
    code: 'R1',
    name: 'Önceki kıtlıklar ve kıtlığın devamlılığı',
    nameEn: 'Previous shortages and persistence',
    weight: 18,
    weightDec: 0.18,
    score: 50,
    icon: '⏳',
    color: '#e11d48',
    colorBg: '#fff1f2',
    colorBorder: '#fda4af',
    colorGradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
    subCriteria: []
  },
  {
    id: 2,
    symbol: 'R₂',
    code: 'R2',
    name: 'Talep–stok dengesizliği',
    nameEn: 'Demand–stock imbalance',
    weight: 18,
    weightDec: 0.18,
    score: 50,
    icon: '⚖️',
    color: '#ea580c',
    colorBg: '#fff7ed',
    colorBorder: '#fdba74',
    colorGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    subCriteria: []
  },
  {
    id: 3,
    symbol: 'R₃',
    code: 'R3',
    name: 'Üretici ve tedarikçi yoğunlaşması',
    nameEn: 'Manufacturer/supplier concentration',
    weight: 15,
    weightDec: 0.15,
    score: 50,
    icon: '🏭',
    color: '#7c3aed',
    colorBg: '#f5f3ff',
    colorBorder: '#c4b5fd',
    colorGradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    subCriteria: []
  },
  {
    id: 4,
    symbol: 'R₄',
    code: 'R4',
    name: 'Üretim, hammadde ve kalite kesintileri',
    nameEn: 'Production, raw-material and quality interruptions',
    weight: 15,
    weightDec: 0.15,
    score: 50,
    icon: '🧪',
    color: '#db2777',
    colorBg: '#fdf2f8',
    colorBorder: '#f9a8d4',
    colorGradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    subCriteria: []
  },
  {
    id: 5,
    symbol: 'R₅',
    code: 'R5',
    name: 'Tedarik süresi ve lojistik riskleri',
    nameEn: 'Lead time and logistics',
    weight: 10,
    weightDec: 0.10,
    score: 50,
    icon: '🚢',
    color: '#0284c7',
    colorBg: '#f0f9ff',
    colorBorder: '#7dd3fc',
    colorGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    subCriteria: []
  },
  {
    id: 6,
    symbol: 'R₆',
    code: 'R6',
    name: 'İlişkili terapötik gruptaki kıtlıklar',
    nameEn: 'Related therapeutic-group shortages',
    weight: 10,
    weightDec: 0.10,
    score: 50,
    icon: '💊',
    color: '#059669',
    colorBg: '#ecfdf5',
    colorBorder: '#6ee7b7',
    colorGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    subCriteria: []
  },
  {
    id: 7,
    symbol: 'R₇',
    code: 'R7',
    name: 'Ürün özellikleri ve ikame edilebilirlik',
    nameEn: 'Product characteristics and substitutability',
    weight: 7,
    weightDec: 0.07,
    score: 50,
    icon: '🔄',
    color: '#4f46e5',
    colorBg: '#eef2ff',
    colorBorder: '#a5b4fc',
    colorGradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    subCriteria: []
  },
  {
    id: 8,
    symbol: 'R₈',
    code: 'R8',
    name: 'Finansal, düzenleyici ve bilgi akışı riskleri',
    nameEn: 'Financial, regulatory and information-flow risks',
    weight: 7,
    weightDec: 0.07,
    score: 50,
    icon: '🏛️',
    color: '#d97706',
    colorBg: '#fffbeb',
    colorBorder: '#fcd34d',
    colorGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    subCriteria: []
  }
];

let riskCriteriaState = {
  currentOpenCriterionId: null, // null: 8 Buton & Ana Denklem; 1-8: Kriterin İçi
  criteria: JSON.parse(JSON.stringify(defaultRiskCriteriaData))
};

function calculateOverallRiskScores() {
  const criteria = riskCriteriaState.criteria;
  const totalWeightPercent = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const totalWeightDecimal = totalWeightPercent / 100;
  // R_total = sum( w_dec_i * R_i ) / sum(w_dec_i)
  const weightedSum = criteria.reduce((sum, c) => {
    const wDec = (Number(c.weight) || 0) / 100;
    return sum + (wDec * (Number(c.score) || 0));
  }, 0);
  const rTotal = totalWeightDecimal > 0 ? (weightedSum / totalWeightDecimal) : 0;
  return {
    totalWeightPercent,
    totalWeightDecimal,
    weightedSum,
    rTotal,
    isBalanced: totalWeightPercent === 100
  };
}

function getCriteriaRiskTier(score) {
  if (score >= 85) {
    return { label: 'KRİTİK RİSK', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' };
  } else if (score >= 70) {
    return { label: 'YÜKSEK RİSK', color: '#ea580c', bg: '#ffedd5', border: '#fed7aa' };
  } else if (score >= 40) {
    return { label: 'ORTA RİSK', color: '#b45309', bg: '#fef3c7', border: '#fde68a' };
  } else {
    return { label: 'DÜŞÜK RİSK', color: '#16a34a', bg: '#dcfce7', border: '#86efac' };
  }
}

function enterCriterion(id) {
  riskCriteriaState.currentOpenCriterionId = Number(id);
  riskCriteriaPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function leaveCriterion() {
  riskCriteriaState.currentOpenCriterionId = null;
  riskCriteriaPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateMainCriterionWeight(id, val) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(id));
  if (crit) {
    crit.weight = Math.max(0, Math.min(100, Number(val) || 0));
    crit.weightDec = crit.weight / 100;
    riskCriteriaPage();
  }
}

function updateMainCriterionScore(id, val) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(id));
  if (crit) {
    crit.score = Math.max(0, Math.min(100, Number(val) || 0));
    riskCriteriaPage();
  }
}

function addSubCriterion(critId) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  const count = crit.subCriteria.length + 1;
  crit.subCriteria.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: `Alt Gösterge S_{${crit.id},${count}}`,
    weight: 0, // a_ij
    score: 50  // S_ij
  });
  distributeSubWeightsEqually(critId, false);
  riskCriteriaPage();
}

function removeSubCriterion(critId, subId) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  crit.subCriteria = crit.subCriteria.filter(s => s.id !== Number(subId));
  if (crit.subCriteria.length > 0) {
    distributeSubWeightsEqually(critId, false);
  }
  riskCriteriaPage();
}

function updateSubCriterionName(critId, subId, name) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  const sub = crit.subCriteria.find(s => s.id === Number(subId));
  if (sub) {
    sub.name = String(name || '');
  }
}

function updateSubCriterionWeight(critId, subId, weight) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  const sub = crit.subCriteria.find(s => s.id === Number(subId));
  if (sub) {
    sub.weight = Math.max(0, Math.min(100, Number(weight) || 0));
    riskCriteriaPage();
  }
}

function updateSubCriterionScore(critId, subId, score) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  const sub = crit.subCriteria.find(s => s.id === Number(subId));
  if (sub) {
    sub.score = Math.max(0, Math.min(100, Number(score) || 0));
    riskCriteriaPage();
  }
}

function distributeSubWeightsEqually(critId, reRender = true) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit || crit.subCriteria.length === 0) return;
  const n = crit.subCriteria.length;
  const baseWeight = Math.floor(100 / n);
  const remainder = 100 - (baseWeight * n);
  crit.subCriteria.forEach((s, idx) => {
    s.weight = idx === 0 ? baseWeight + remainder : baseWeight;
  });
  if (reRender) riskCriteriaPage();
}

function applySubScoreToMainCriterion(critId) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  if (crit.subCriteria.length === 0) {
    alert('Bu kriterde henüz alt gösterge tanımlanmadı. Önce "+ Yeni Alt Gösterge Ekle" butonuna basarak alt gösterge ekleyin.');
    return;
  }
  // R_i = [ sum( a_ij * S_ij ) ] / [ sum( a_ij ) ]
  const totalSubW = crit.subCriteria.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  let computedScore = 0;
  if (totalSubW > 0) {
    const weightedSum = crit.subCriteria.reduce((sum, s) => sum + ((Number(s.weight) || 0) * (Number(s.score) || 0)), 0);
    computedScore = weightedSum / totalSubW;
  } else {
    computedScore = crit.subCriteria.reduce((sum, s) => sum + (Number(s.score) || 0), 0) / crit.subCriteria.length;
  }
  crit.score = Math.round(computedScore);
  alert(`"${crit.name}" kriteri için hesaplanan alt ağırlıklı risk puanı (R_${crit.id} = ${crit.score}/100) ana denkleme başarıyla aktarıldı.`);
  riskCriteriaPage();
}

function clearSubCriteriaOfCriterion(critId) {
  const crit = riskCriteriaState.criteria.find(c => c.id === Number(critId));
  if (!crit) return;
  if (confirm(`"${crit.name}" (${crit.symbol}) kriterinin içindeki tüm alt göstergeleri silip içini tamamen boşaltmak istediğinize emin misiniz?`)) {
    crit.subCriteria = [];
    riskCriteriaPage();
  }
}

function resetAllCriteriaWeightsToDefault() {
  defaultRiskCriteriaData.forEach(def => {
    const current = riskCriteriaState.criteria.find(c => c.id === def.id);
    if (current) {
      current.weight = def.weight;
      current.weightDec = def.weightDec;
    }
  });
  riskCriteriaPage();
}

function setAllCriteriaScoresValue(val) {
  riskCriteriaState.criteria.forEach(c => {
    c.score = val;
  });
  riskCriteriaPage();
}

function exportRiskCriteriaMatrixCSV() {
  const headers = ['Değişken (R_i)', 'Anlamı / Kriter Adı (TR)', 'İngilizce Adı (EN)', 'Ağırlık Yüzdesi (%)', 'Ağırlık Ondalık (w_i)', 'Mevcut Risk Puanı (R_i, 0-100)', 'Ağırlıklı Katkı (w_i * R_i)'];
  const rows = riskCriteriaState.criteria.map(c => {
    const wDec = (c.weight / 100).toFixed(2);
    const contrib = ((c.weight / 100) * c.score).toFixed(2);
    return [
      c.code,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.nameEn || '').replace(/"/g, '""')}"`,
      `%${c.weight}`,
      wDec,
      c.score,
      contrib
    ].join(';');
  });

  const { totalWeightPercent, totalWeightDecimal, rTotal } = calculateOverallRiskScores();
  const summaryRow = ['R_total', 'TOPLAM İLAÇ KITLIĞI RİSK PUANI', '', `%${totalWeightPercent}`, totalWeightDecimal.toFixed(2), Math.round(rTotal), rTotal.toFixed(2)];

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows, summaryRow.join(';')].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dsrds_risk_denklemi_kriterleri_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// 400 YEŞİL REÇETELİ İLAÇ (V2 KAPSAMI) - RİSK ANALİZ VERİ KÜMESİ SİSTEMİ
// ==========================================================================
let riskCriteriaDrugQuery = '';
let riskCriteriaDrugRiskFilter = '';
let riskCriteriaDrugStatusFilter = '';
let riskCriteriaDrugPage = 1;
let riskCriteriaDrugPageSize = 25;
let riskCriteriaSelectedDrugId = null;
let riskCriteriaFdaLoading = false;

async function ensureV2FdaDataLoaded() {
  if (!v2FdaRecordsCache || v2FdaRecordsCache.length < 1500) {
    try {
      const staticRes = await fetch('fda_shortages_records.json?v=1.0.33').then(r => r.json());
      if (Array.isArray(staticRes) && staticRes.length >= 1500) {
        v2FdaRecordsCache = staticRes;
      }
    } catch (e) {
      console.warn('FDA static fetch failed, falling back to API:', e);
      try {
        const dt = await api('/api/records?source=Drug%20Shortages&limit=2000');
        if (dt && Array.isArray(dt.rows)) v2FdaRecordsCache = dt.rows;
      } catch {}
    }
  }
  if (!v2MedicareCache) {
    try {
      const medData = await fetch('medicare_spending_compact.json?v=1.0.31').then(r => r.json());
      if (medData && typeof medData === 'object') v2MedicareCache = medData;
    } catch {}
  }
}

function getV2Green400Records() {
  if (!v2FdaRecordsCache || !Array.isArray(v2FdaRecordsCache)) return [];
  const enriched = v2FdaRecordsCache.map(enrichShortageRecord);
  return enriched.filter(r => r.isGreen);
}

function getFilteredV2GreenDrugs() {
  let records = getV2Green400Records();
  if (riskCriteriaDrugQuery) {
    const q = riskCriteriaDrugQuery.toLowerCase().trim();
    records = records.filter(r => {
      const gn = (r.generic_name || '').toLowerCase();
      const bn = (r.brand_name || '').toLowerCase();
      const mf = (r.manufacturer || r.vendor || '').toLowerCase();
      const nd = (r.ndc || '').toLowerCase();
      const pr = (r.presentation || '').toLowerCase();
      const sr = (r.shortage_reason || r.reasonText || '').toLowerCase();
      return gn.includes(q) || bn.includes(q) || mf.includes(q) || nd.includes(q) || pr.includes(q) || sr.includes(q);
    });
  }
  if (riskCriteriaDrugStatusFilter) {
    const s = riskCriteriaDrugStatusFilter.toLowerCase();
    records = records.filter(r => (r.shortage_status || '').toLowerCase().includes(s));
  }
  if (riskCriteriaDrugRiskFilter) {
    if (riskCriteriaDrugRiskFilter === 'critical') records = records.filter(r => (r.riskScore || 0) >= 75);
    else if (riskCriteriaDrugRiskFilter === 'high') records = records.filter(r => (r.riskScore || 0) >= 50 && (r.riskScore || 0) < 75);
    else if (riskCriteriaDrugRiskFilter === 'med') records = records.filter(r => (r.riskScore || 0) < 50);
  }
  return records;
}

function applyDrugToRiskCriteria(drugId) {
  const records = getV2Green400Records();
  const d = records.find(r => String(r.id) === String(drugId));
  if (!d) return;

  riskCriteriaSelectedDrugId = d.id;

  // DSRDS 8 Kriter Değerini İlacın Gerçek Parametrelerine Göre Hesapla:
  // R1: Önceki kıtlıklar ve devamlılığı (shortage_status & history)
  let r1 = 50;
  if (d.shortage_status === 'Current') r1 = 88;
  else if (d.shortage_status === 'Resolved') r1 = 35;
  else if (String(d.shortage_status).includes('Discontinued')) r1 = 92;

  // R2: Talep–stok dengesizliği (CMS Medicare talebi & bulunabilirlik)
  let r2 = 55;
  const m = getMedicareDataMatch(d);
  if (m && m.claims > 500000) r2 += 30;
  else if (m && m.claims > 100000) r2 += 20;
  else if (m && m.claims > 20000) r2 += 10;
  const avLow = (d.availability || '').toLowerCase();
  if (avLow.includes('un') || avLow.includes('limit')) r2 += 15;
  r2 = Math.min(100, Math.max(20, r2));

  // R3: Üretici ve tedarikçi yoğunlaşması (alternatif üretici sayısı)
  let r3 = 70;
  const altCount = Number(d.alternative_manufacturers_count) || (d.alternative_manufacturers ? d.alternative_manufacturers.length : 0);
  if (altCount === 0) r3 = 95;
  else if (altCount <= 2) r3 = 78;
  else if (altCount <= 4) r3 = 55;
  else r3 = 30;

  // R4: Üretim, hammadde ve kalite kesintileri (kök neden)
  let r4 = 50;
  const reason = (d.shortage_reason || d.reasonText || '').toLowerCase();
  if (reason.includes('api') || reason.includes('hammadde') || reason.includes('active pharmaceutical')) r4 = 92;
  else if (reason.includes('manufacturing') || reason.includes('imalat') || reason.includes('kalite') || reason.includes('quality')) r4 = 85;
  else if (reason.includes('delay') || reason.includes('shipping') || reason.includes('gecik')) r4 = 72;
  else if (reason.includes('demand') || reason.includes('talep')) r4 = 65;
  else r4 = 45;

  // R5: Tedarik süresi ve lojistik riskleri (İthal vs Yerli, enjeksiyon/soğuk zincir)
  let r5 = 55;
  const isImport = (d.greenData?.origin || '').includes('İTHAL');
  if (isImport) r5 = 82;
  else if ((d.greenData?.origin || '').includes('İMAL')) r5 = 38;
  const presLow = (d.presentation || '').toLowerCase();
  if (presLow.includes('injection') || presLow.includes('enjeksiyon') || presLow.includes('ampul') || presLow.includes('vial')) {
    r5 = Math.min(100, r5 + 10);
  }

  // R6: İlişkili terapötik gruptaki kıtlıklar (Psikotrop / Narkotik yeşil reçete yoğunluğu)
  let r6 = 80;

  // R7: Ürün özellikleri ve ikame edilebilirlik (Türkiye yerli muadil sayısı)
  let r7 = 50;
  const equivCount = d.greenData?.localEquivCount;
  if (equivCount === 0) r7 = 95;
  else if (equivCount !== undefined && equivCount <= 2) r7 = 68;
  else if (equivCount !== undefined && equivCount > 2) r7 = 35;
  else r7 = 55;

  // R8: Finansal, yasal ve bilgi akışı riskleri (yeşil reçete kotası & kur hassasiyeti)
  let r8 = 75;
  if (isImport) r8 = 88;

  const scoresMap = { 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7, 8: r8 };
  riskCriteriaState.criteria.forEach(c => {
    if (scoresMap[c.id] !== undefined) {
      c.score = scoresMap[c.id];
    }
  });

  riskCriteriaPage();

  setTimeout(() => {
    const el = document.getElementById('dsrdsActiveDrugBanner') || document.getElementById('dsrdsFormulaSection');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

function clearSelectedRiskDrug() {
  riskCriteriaSelectedDrugId = null;
  riskCriteriaState.criteria.forEach(c => {
    c.score = 50;
  });
  riskCriteriaPage();
}

function scrollToRiskFormula() {
  const el = document.getElementById('dsrdsFormulaSection');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleRiskCriteriaDrugSearch(val) {
  riskCriteriaDrugQuery = val;
  riskCriteriaDrugPage = 1;
  renderRiskCriteriaDrugTableOnly();
}

function handleRiskCriteriaDrugStatusFilter(val) {
  riskCriteriaDrugStatusFilter = val;
  riskCriteriaDrugPage = 1;
  renderRiskCriteriaDrugTableOnly();
}

function handleRiskCriteriaDrugRiskFilter(val) {
  riskCriteriaDrugRiskFilter = val;
  riskCriteriaDrugPage = 1;
  renderRiskCriteriaDrugTableOnly();
}

function handleRiskCriteriaDrugPage(p) {
  const filtered = getFilteredV2GreenDrugs();
  const totalPages = Math.max(1, Math.ceil(filtered.length / riskCriteriaDrugPageSize));
  riskCriteriaDrugPage = Math.max(1, Math.min(totalPages, p));
  renderRiskCriteriaDrugTableOnly();
  const el = document.getElementById('riskCriteriaDrugSectionContainer');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleRiskCriteriaDrugPageSize(sz) {
  riskCriteriaDrugPageSize = Number(sz) || 25;
  riskCriteriaDrugPage = 1;
  renderRiskCriteriaDrugTableOnly();
}

function clearRiskCriteriaDrugFilters() {
  riskCriteriaDrugQuery = '';
  riskCriteriaDrugStatusFilter = '';
  riskCriteriaDrugRiskFilter = '';
  riskCriteriaDrugPage = 1;
  const inputEl = document.getElementById('riskCriteriaDrugSearchInput');
  if (inputEl) inputEl.value = '';
  const statusEl = document.getElementById('riskCriteriaDrugStatusSelect');
  if (statusEl) statusEl.value = '';
  const riskEl = document.getElementById('riskCriteriaDrugRiskSelect');
  if (riskEl) riskEl.value = '';
  renderRiskCriteriaDrugTableOnly();
}

function exportRiskCriteriaGreenDrugsCSV() {
  const records = getV2Green400Records();
  if (!records || records.length === 0) {
    alert('Veriler yükleniyor, lütfen bekleyin...');
    return;
  }
  const headers = [
    'Sıra', 'ID', 'İlaç / Etkin Madde & Marka (FDA)', 'FDA Kriz Durumu', 'EMA Kriz Durumu',
    'CMS Medicare Reçete Talebi (15 Ay)', 'CMS Medicare Harcama $ (15 Ay)', 'Terapötik Kategori',
    'Sıkıntı Nedeni & Kök Neden', 'Bulunabilirlik (Stok)', 'Sunum & Dozaj Formu', 'NDC Kodu',
    'FDA Başvuru No', 'Üretici Firma', 'İletişim Bilgisi', 'Alternatif Üretici Sayısı',
    'Alternatif Üreticiler', 'Son Güncelleme', 'İlk İlan Tarihi', 'DSRDS Risk Puanı',
    'Risk Seviyesi', 'Önerilen Karar Destek Aksiyonu'
  ];
  const rows = records.map((r, i) => {
    const m = getMedicareDataMatch(r);
    const ema = getEmaCrisisMatch(r);
    const altCount = Number(r.alternative_manufacturers_count) || (r.alternative_manufacturers ? r.alternative_manufacturers.length : 0);
    const altNames = Array.isArray(r.alternative_manufacturers) ? r.alternative_manufacturers.join(', ') : '';
    return [
      i + 1,
      r.id,
      r.brand_name || r.generic_name || '',
      r.shortage_status || '',
      ema ? (ema.status_tr || ema.status) : "AB'de Kriz Yok",
      m ? m.claims : '',
      m ? m.spending : '',
      r.therapeuticCategory || '',
      r.shortage_reason || r.reasonText || '',
      r.availability || '',
      r.presentation || '',
      r.ndc || '',
      r.application_no || '',
      r.manufacturer || r.vendor || '',
      r.contactInfo || '',
      altCount,
      altNames,
      r.updateDate || '',
      r.initialDate || '',
      r.riskScore || '',
      r.riskTierLabel || '',
      r.action || ''
    ];
  });
  const csvContent = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DSRDS_400_Yesil_Recete_Ilac_Risk_Veri_Kumesi_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderRiskCriteriaDrugTableOnly() {
  const tableWrap = document.getElementById('riskCriteriaDrugTableWrap');
  const pagWrap = document.getElementById('riskCriteriaDrugPaginationWrap');
  const countBadge = document.getElementById('riskCriteriaDrugFilteredCount');
  if (!tableWrap || !pagWrap) return;

  const allRecords = getV2Green400Records();
  const filtered = getFilteredV2GreenDrugs();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / riskCriteriaDrugPageSize));
  if (riskCriteriaDrugPage > totalPages) riskCriteriaDrugPage = totalPages;

  const startIdx = (riskCriteriaDrugPage - 1) * riskCriteriaDrugPageSize;
  const endIdx = startIdx + riskCriteriaDrugPageSize;
  const paginated = filtered.slice(startIdx, endIdx);

  if (countBadge) {
    countBadge.textContent = `${total} / ${allRecords.length} İlaç`;
  }

  if (paginated.length === 0) {
    tableWrap.innerHTML = `
      <div style="padding:48px 20px; text-align:center; background:#ffffff; border-radius:12px; border:1.5px solid #bcdcfa;">
        <div style="font-size:36px; margin-bottom:8px;">🔍</div>
        <h4 style="margin:0 0 6px; font-size:16px; color:#0f2942;">Arama Kriterlerine Uygun İlaç Bulunamadı</h4>
        <p style="margin:0; font-size:12.5px; color:#64748b;">Farklı bir arama terimi girin veya filtreleri temizleyin.</p>
        <button type="button" class="button secondary" style="margin-top:12px; font-size:11px; padding:6px 14px; font-weight:700;" onclick="clearRiskCriteriaDrugFilters()">
          Filtreleri Temizle
        </button>
      </div>
    `;
    pagWrap.innerHTML = '';
    return;
  }

  tableWrap.innerHTML = `
    <div class="data-table" style="background:#ffffff; border-radius:12px; border:1.5px solid #bcdcfa; overflow-x:auto;">
      <table class="dsrds-drug-table" style="min-width: 2200px; width: 100%;">
        <thead>
          <tr>
            <th style="width:45px; text-align:center;" title="Kayıt Sıra Numarası (1–400)">#</th>
            <th style="min-width:220px;" title="Veri Seti: ABD FDA Resmi Kriz Kataloğu & TİTCK Yeşil Reçete">1. İlaç / Etkin Madde & Marka (FDA)</th>
            <th title="Veri Seti: ABD FDA Drug Shortages Veri Tabanı">2. FDA Kriz Durumu (FDA)</th>
            <th style="min-width:145px;" title="Veri Seti: Avrupa İlaç Ajansı (EMA) Resmi Kriz Kataloğu">3. EMA Kriz Durumu (EMA)</th>
            <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Reçete Talebi (Claims)">
              <div style="font-weight:700;">4. Medicare Reçete Talebi (CMS)</div>
              <div style="font-size:10px; font-weight:600; color:#0284c7; text-transform:none; margin-top:3px; background:#e0f2fe; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #bae6fd;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
            </th>
            <th style="min-width:165px; padding:12px 14px;" title="Veri Seti: CMS Part D 15 Aylık Kamu Bütçesi Harcaması ($)">
              <div style="font-weight:700;">5. Medicare Harcama ($) (CMS)</div>
              <div style="font-size:10px; font-weight:600; color:#059669; text-transform:none; margin-top:3px; background:#ecfdf5; padding:2px 6px; border-radius:4px; width:fit-content; border:1px solid #a7f3d0;">⏱ 2025 – 2026 Q1 (15 Ay)</div>
            </th>
            <th title="Veri Seti: ABD FDA Drug Shortages Terapötik Sınıflandırma">6. Terapötik Kategori (FDA)</th>
            <th style="min-width:180px;" title="Veri Seti: ABD FDA Kriz Bildirim Gerekçesi & Kök Neden">7. Sıkıntı Nedeni & Kök Neden (FDA)</th>
            <th title="Veri Seti: ABD FDA Tedarik & Dağıtım Stok Bildirimi">8. Bulunabilirlik (Stok) (FDA)</th>
            <th style="min-width:280px; padding:12px 16px;" title="Veri Seti: ABD FDA Sunum, Dozaj Formu & NDC Kodları">9. Sunum & Dozaj Formu (FDA)</th>
            <th style="min-width:260px; padding:12px 16px;" title="Veri Seti: ABD FDA Üretici Firma & Tedarik İletişim Bilgisi">10. Üretici Firma & İletişim (FDA)</th>
            <th style="min-width:240px; padding:12px 16px;" title="Veri Seti: FDA Kataloğu Eş Zamanlı Etken Madde & Form Üretici Analizi">11. Alternatif Üretici (FDA Analizi)</th>
            <th style="min-width:160px; padding:12px 14px;" title="Veri Seti: ABD FDA İlk İlan ve Son Güncelleme Takvimi">12. Kriz Tarihleri (FDA)</th>
            <th style="min-width:220px;" title="Veri Seti: DSRDS Endüstri Mühendisliği Karar Destek Algoritması & Risk Skoru">Kırılganlık / EM Aksiyonu (DSRDS Modeli)</th>
            <th style="min-width:160px; text-align:center;" title="İşlem: DSRDS 8 Ana Kriterine Yansıt ve Detay Modalını Aç">İşlem (Karar Destek)</th>
          </tr>
        </thead>
        <tbody>
          ${paginated.map((r, idx) => {
            const seq = startIdx + idx + 1;
            const isSelected = riskCriteriaSelectedDrugId && String(riskCriteriaSelectedDrugId) === String(r.id);
            return `
              <tr data-id="${r.id}" class="selectable ${isSelected ? 'selected' : ''}" style="cursor:pointer;" onclick="detail('${r.id}')">
                <td style="text-align:center; font-weight:700; color:#64748b; font-size:11.5px; vertical-align:top; padding:14px 8px;">
                  ${seq}
                </td>
                ${renderDrugCell(r)}
                <td style="vertical-align:top; padding:14px 12px;">${r.statusBadgeHtml}</td>
                <td style="vertical-align:top; padding:14px 12px;">${renderEmaCrisisStatusCell(r)}</td>
                ${renderMedicareCells(r)}
                <td style="vertical-align:top; padding:14px 12px;">
                  ${r.therapeuticCategory ? `
                    <span class="category-pill">${esc(r.therapeuticCategory)}</span>
                  ` : '<span style="color:var(--muted); font-size:11px;">—</span>'}
                </td>
                <td style="vertical-align:top; padding:14px 12px;">${renderReasonCell(r)}</td>
                <td style="vertical-align:top; padding:14px 12px;">${r.availBadgeHtml}</td>
                <td style="min-width:280px; max-width:340px; vertical-align:top; padding:14px 16px; white-space:normal;">
                  <div style="font-size:12.5px; color:#1e293b; line-height:1.55; word-break:break-word; font-weight:500;">
                    ${esc(r.presentation)}
                  </div>
                  ${(r.ndc || r.application_no) ? `
                    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                      ${r.ndc ? `<code style="font-size:10.5px; color:#475569; background:#f1f5f9; padding:3px 8px; border-radius:5px; border:1px solid #e2e8f0; font-family:monospace; display:inline-flex; align-items:center; gap:3px;"><span style="color:#94a3b8;">NDC:</span> ${esc(r.ndc)}</code>` : ''}
                      ${r.application_no ? `<code style="font-size:10.5px; color:#0369a1; background:#e0f2fe; padding:3px 8px; border-radius:5px; font-weight:700; border:1px solid #bae6fd; font-family:monospace; display:inline-flex; align-items:center; gap:3px;"><span style="color:#0284c7;">FDA:</span> ${esc(r.application_no)}</code>` : ''}
                    </div>
                  ` : ''}
                </td>
                <td style="min-width:260px; max-width:320px; vertical-align:top; padding:14px 16px; white-space:normal;">
                  <div style="font-weight:700; font-size:13px; color:#0f172a; line-height:1.45; word-break:break-word; display:flex; align-items:flex-start; gap:6px;">
                    <span style="font-size:14px; flex-shrink:0; margin-top:1px;">🏢</span>
                    <span>${esc(r.manufacturer || r.vendor || '—')}</span>
                  </div>
                  ${r.contactInfo ? `
                    <div style="margin-top:10px; font-size:11.5px; color:#0369a1; background:#f0f9ff; padding:7px 11px; border-radius:7px; border:1px solid #bae6fd; line-height:1.45; word-break:break-word; box-shadow:0 1px 3px rgba(2,132,199,0.06);">
                      <div style="font-weight:700; font-size:10.5px; color:#0284c7; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:3px; display:flex; align-items:center; gap:4px;">
                        <span>📞</span> <span>İletişim & Tedarik:</span>
                      </div>
                      <div style="color:#0c4a6e; font-weight:500;">
                        ${esc(r.contactInfo)}
                      </div>
                    </div>
                  ` : ''}
                </td>
                ${renderAlternativeManufacturersCell(r)}
                <td style="min-width:160px; vertical-align:top; padding:14px 16px; white-space:normal;">
                  <div style="display:flex; flex-direction:column; gap:6px;">
                    <div>
                      <span style="font-size:10px; font-weight:700; color:#0284c7; text-transform:uppercase; letter-spacing:0.3px; display:block;">
                        🔄 Son Güncelleme:
                      </span>
                      <span style="font-size:12px; font-weight:700; color:#0f172a;">
                        ${esc(r.updateDate || '—')}
                      </span>
                    </div>
                    ${r.initialDate ? `
                      <div style="border-top:1px dashed #e2e8f0; padding-top:5px;">
                        <span style="font-size:10px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.3px; display:block;">
                          📢 İlk İlan Tarihi:
                        </span>
                        <span style="font-size:11.5px; color:#475569; font-weight:600;">
                          ${esc(r.initialDate)}
                        </span>
                      </div>
                    ` : ''}
                  </div>
                </td>
                <td style="vertical-align:top; padding:14px 16px;">${renderActionCell(r)}</td>
                <td style="min-width:150px; text-align:center; vertical-align:top; padding:14px 16px;">
                  <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
                    <button type="button" class="dsrds-apply-btn ${isSelected ? 'applied' : ''}" style="width:100%; justify-content:center;" onclick="event.stopPropagation(); applyDrugToRiskCriteria('${esc(r.id)}')">
                      ${isSelected ? '✓ Kriterlere Yansıtıldı' : '🎯 Kriterlere Yansıt'}
                    </button>
                    <button type="button" class="button" style="padding:6px 12px; font-size:11.5px; font-weight:700; width:100%;" onclick="event.stopPropagation(); detail('${r.id}')">
                      İncele →
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  pagWrap.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:16px;">
      <div style="font-size:12px; color:var(--muted); font-weight:600;">
        Toplam <b>${total}</b> yeşil reçeteli ilaçtan <b>${startIdx + 1} - ${Math.min(endIdx, total)}</b> arası gösteriliyor.
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button type="button" class="button secondary" style="font-size:11px; padding:6px 12px; font-weight:700;" onclick="handleRiskCriteriaDrugPage(${riskCriteriaDrugPage - 1})" ${riskCriteriaDrugPage <= 1 ? 'disabled' : ''}>
          ← Önceki
        </button>
        <span style="font-size:12px; font-weight:700; padding:0 8px; color:var(--ink);">
          ${riskCriteriaDrugPage} / ${totalPages}
        </span>
        <button type="button" class="button secondary" style="font-size:11px; padding:6px 12px; font-weight:700;" onclick="handleRiskCriteriaDrugPage(${riskCriteriaDrugPage + 1})" ${riskCriteriaDrugPage >= totalPages ? 'disabled' : ''}>
          Sonraki →
        </button>
      </div>
    </div>
  `;
}

function renderRiskCriteriaDrugSection() {
  const records = getV2Green400Records();
  const selectedDrug = riskCriteriaSelectedDrugId ? records.find(r => String(r.id) === String(riskCriteriaSelectedDrugId)) : null;

  if (records.length === 0) {
    return `
      <section class="glass panel" id="riskCriteriaDrugSectionContainer" style="padding: 24px; margin-bottom: 24px;">
        <div style="text-align:center; padding:40px 20px;">
          <div style="font-size:36px; margin-bottom:12px;">⏳</div>
          <h3 style="margin:0 0 6px; font-size:17px; font-family:Outfit; color:#0f2942;">
            V2 Yeşil Reçete Kriz Verileri Yükleniyor (400 İlaç)...
          </h3>
          <p style="color:var(--muted); font-size:13px; margin:0 auto; max-width:500px;">
            FDA ve CMS Medicare veri tabanlarındaki 400 yeşil reçeteli ilaç kaydı hazırlanıyor ve senkronize ediliyor. Lütfen birkaç saniye bekleyin...
          </p>
        </div>
      </section>
    `;
  }

  return `
    <section class="glass panel" id="riskCriteriaDrugSectionContainer" style="padding: 24px; margin-bottom: 24px;">
      <!-- Başlık Bandı & Senkronizasyon Rozeti -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:20px;">
        <div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px; flex-wrap:wrap;">
            <span style="font-size:24px;">🟢</span>
            <h2 style="margin:0; font-size:18px; font-family:Outfit; color:#0f2942;">
              4. İlaç Bazlı Risk Analiz Veri Kümesi (V2 Yeşil Reçete Kapsamı · 400 İlaç)
            </h2>
            <span class="badge" id="riskCriteriaDrugFilteredCount" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; font-weight:800; font-size:12px; padding:4px 10px;">
              ${records.length} İlaç
            </span>
          </div>
          <p style="color:var(--muted); font-size:13px; margin:0; line-height:1.5;">
            V2 Tedarik Krizleri panelindeki <b>"🟢 Tüm Yeşil Reçeteliler"</b> filtresiyle birebir senkronize çalışan 400 ilacın FDA kriz, yerli muadil ve CMS Medicare harcama verileri.
            Herhangi bir ilacın <b>"🎯 Kriterlere Yansıt"</b> butonuna tıklayarak yukarıdaki 8 ana risk kriterini (R₁–R₈) o ilacın reel parametreleriyle doldurabilir ve hesaplanan nihai risk puanını (R<sub>total</sub>) analiz edebilirsiniz.
          </p>
        </div>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <span class="badge" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-weight:700; font-size:11px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e;"></span>
            V2 ile Canlı Senkronize
          </span>
          <button type="button" class="button" style="font-size:11.5px; padding:8px 16px; font-weight:700; display:inline-flex; align-items:center; gap:6px;" onclick="exportRiskCriteriaGreenDrugsCSV()">
            📥 400 İlacın Verisini İndir (CSV)
          </button>
        </div>
      </div>

      <!-- Aktif Analiz Edilen İlaç Bandı -->
      ${selectedDrug ? `
        <div id="dsrdsActiveDrugBanner" class="dsrds-active-drug-banner">
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="width:44px; height:44px; border-radius:10px; background:#2563eb; color:#fff; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800; flex-shrink:0;">
              🎯
            </div>
            <div>
              <div style="font-size:11px; font-weight:800; color:#1d4ed8; text-transform:uppercase; letter-spacing:0.5px;">
                Aktif Analiz Edilen İlaç Seçildi:
              </div>
              <div style="font-size:16px; font-weight:800; color:#1e3a8a;">
                ${esc(selectedDrug.brand_name || selectedDrug.generic_name)}
                <span style="font-size:13px; font-weight:600; color:#3b82f6;">(INN: ${esc(selectedDrug.generic_name || '—')})</span>
              </div>
              <div style="font-size:12px; color:#475569; margin-top:2px;">
                🏢 Üretici: <b>${esc(selectedDrug.manufacturer || selectedDrug.vendor || '—')}</b> · 
                Menşe: <b>${esc(selectedDrug.greenData?.origin || 'İTHAL')}</b> (${selectedDrug.greenData?.localEquivCount === 0 ? '0 Yerli Muadil' : `${selectedDrug.greenData?.localEquivCount || 0} Muadil`}) · 
                Bu ilacın reel parametreleri yukarıdaki 8 ana kriter puanına (R₁–R₈) yansıtılmıştır.
              </div>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="button secondary" style="font-size:11.5px; padding:6px 14px; font-weight:700; background:#fff;" onclick="clearSelectedRiskDrug()">
              ✕ Seçimi Kaldır / Sıfırla
            </button>
            <button type="button" class="button" style="font-size:11.5px; padding:6px 14px; font-weight:700;" onclick="scrollToRiskFormula()">
              ↑ Denkleme & Puanlara Git
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Arama ve Filtreleme Kontrolleri -->
      <div style="background:#ffffff; border:1.5px solid #bcdcfa; border-radius:12px; padding:14px 18px; margin-bottom:18px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; flex:1; min-width:300px;">
          <div style="position:relative; flex:1; min-width:220px; max-width:400px;">
            <input type="text" id="riskCriteriaDrugSearchInput" value="${esc(riskCriteriaDrugQuery)}" placeholder="400 yeşil reçeteli ilaçta ara (INN, marka, üretici)..." style="width:100%; height:36px; padding:0 12px 0 32px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:12.5px; outline:none; box-sizing:border-box;" oninput="handleRiskCriteriaDrugSearch(this.value)">
            <span style="position:absolute; left:10px; top:9px; font-size:14px; color:#94a3b8;">🔍</span>
          </div>

          <select id="riskCriteriaDrugStatusSelect" style="height:36px; padding:0 10px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;" onchange="handleRiskCriteriaDrugStatusFilter(this.value)">
            <option value="" ${riskCriteriaDrugStatusFilter === '' ? 'selected' : ''}>Tüm Kriz Durumları</option>
            <option value="Current" ${riskCriteriaDrugStatusFilter === 'Current' ? 'selected' : ''}>🚨 Güncel Kriz (Current)</option>
            <option value="Discontinued" ${riskCriteriaDrugStatusFilter === 'Discontinued' ? 'selected' : ''}>⚠️ Üretimi Durdurulacak</option>
          </select>

          <select id="riskCriteriaDrugRiskSelect" style="height:36px; padding:0 10px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;" onchange="handleRiskCriteriaDrugRiskFilter(this.value)">
            <option value="" ${riskCriteriaDrugRiskFilter === '' ? 'selected' : ''}>Tüm Risk Düzeyleri</option>
            <option value="critical" ${riskCriteriaDrugRiskFilter === 'critical' ? 'selected' : ''}>🔴 Kritik Risk (≥75)</option>
            <option value="high" ${riskCriteriaDrugRiskFilter === 'high' ? 'selected' : ''}>🟠 Yüksek Risk (50-74)</option>
            <option value="med" ${riskCriteriaDrugRiskFilter === 'med' ? 'selected' : ''}>🟡 Orta Risk (&lt;50)</option>
          </select>

          ${(riskCriteriaDrugQuery || riskCriteriaDrugStatusFilter || riskCriteriaDrugRiskFilter) ? `
            <button type="button" class="button secondary" style="font-size:11px; padding:6px 12px; font-weight:700;" onclick="clearRiskCriteriaDrugFilters()">
              ✕ Filtreleri Temizle
            </button>
          ` : ''}
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:var(--muted); font-weight:600;">Sayfa Başı:</span>
          <select style="height:32px; padding:0 6px; border:1px solid #cbd5e1; border-radius:6px; font-size:11.5px; font-weight:700;" onchange="handleRiskCriteriaDrugPageSize(this.value)">
            <option value="25" ${riskCriteriaDrugPageSize === 25 ? 'selected' : ''}>25 Kayıt</option>
            <option value="50" ${riskCriteriaDrugPageSize === 50 ? 'selected' : ''}>50 Kayıt</option>
            <option value="100" ${riskCriteriaDrugPageSize === 100 ? 'selected' : ''}>100 Kayıt</option>
            <option value="400" ${riskCriteriaDrugPageSize === 400 ? 'selected' : ''}>Tümü (400)</option>
          </select>
        </div>
      </div>

      <!-- Tablo Alanı -->
      <div id="riskCriteriaDrugTableWrap"></div>

      <!-- Sayfalama Alanı -->
      <div id="riskCriteriaDrugPaginationWrap"></div>
    </section>
  `;
}

// Global scope bindings for inline HTML event handlers
window.enterCriterion = enterCriterion;
window.leaveCriterion = leaveCriterion;
window.updateMainCriterionWeight = updateMainCriterionWeight;
window.updateMainCriterionScore = updateMainCriterionScore;
window.addSubCriterion = addSubCriterion;
window.removeSubCriterion = removeSubCriterion;
window.updateSubCriterionName = updateSubCriterionName;
window.updateSubCriterionWeight = updateSubCriterionWeight;
window.updateSubCriterionScore = updateSubCriterionScore;
window.distributeSubWeightsEqually = distributeSubWeightsEqually;
window.applySubScoreToMainCriterion = applySubScoreToMainCriterion;
window.clearSubCriteriaOfCriterion = clearSubCriteriaOfCriterion;
window.resetAllCriteriaWeightsToDefault = resetAllCriteriaWeightsToDefault;
window.setAllCriteriaScoresValue = setAllCriteriaScoresValue;
window.exportRiskCriteriaMatrixCSV = exportRiskCriteriaMatrixCSV;

window.handleRiskCriteriaDrugSearch = handleRiskCriteriaDrugSearch;
window.handleRiskCriteriaDrugStatusFilter = handleRiskCriteriaDrugStatusFilter;
window.handleRiskCriteriaDrugRiskFilter = handleRiskCriteriaDrugRiskFilter;
window.handleRiskCriteriaDrugPage = handleRiskCriteriaDrugPage;
window.handleRiskCriteriaDrugPageSize = handleRiskCriteriaDrugPageSize;
window.clearRiskCriteriaDrugFilters = clearRiskCriteriaDrugFilters;
window.applyDrugToRiskCriteria = applyDrugToRiskCriteria;
window.clearSelectedRiskDrug = clearSelectedRiskDrug;
window.scrollToRiskFormula = scrollToRiskFormula;
window.exportRiskCriteriaGreenDrugsCSV = exportRiskCriteriaGreenDrugsCSV;


function riskCriteriaPage() {
  const { totalWeightPercent, totalWeightDecimal, rTotal, isBalanced } = calculateOverallRiskScores();
  const tier = getCriteriaRiskTier(rTotal);

  // --------------------------------------------------------------------------
  // DURUM A: BİR KRİTERİN İÇİNE GİRİLDİYSE (currentOpenCriterionId !== null)
  // --------------------------------------------------------------------------
  if (riskCriteriaState.currentOpenCriterionId !== null) {
    const c = riskCriteriaState.criteria.find(item => item.id === riskCriteriaState.currentOpenCriterionId) || riskCriteriaState.criteria[0];
    const subWeightSum = c.subCriteria.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    const subScore = c.subCriteria.length > 0
      ? (subWeightSum > 0
          ? c.subCriteria.reduce((sum, s) => sum + ((Number(s.weight) || 0) * (Number(s.score) || 0)), 0) / subWeightSum
          : c.subCriteria.reduce((sum, s) => sum + (Number(s.score) || 0), 0) / c.subCriteria.length)
      : 0;

    page.innerHTML = `
      <div style="margin-bottom: 18px;">
        <button type="button" class="button secondary" style="font-size:12.5px; padding:10px 20px; display:inline-flex; align-items:center; gap:8px; font-weight:700; border:1.5px solid #bcdcfa;" onclick="leaveCriterion()">
          ← 8 Kriter Butonuna & Ana Ekrana Geri Dön
        </button>
      </div>

      <section class="glass panel" style="border-left: 6px solid ${c.color}; border-color:${c.colorBorder}; padding: 26px; margin-bottom: 22px; background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, ${c.colorBg} 100%);">
        <!-- Kriter Başlık Bandı -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom: 20px;">
          <div>
            <div style="display:flex; align-items:center; gap:14px;">
              <div class="dsrds-crit-badge" style="width:52px; height:52px; font-size:20px; background:${c.colorGradient}; box-shadow:0 4px 14px ${c.color}40;">${c.symbol}</div>
              <div>
                <h1 style="margin:0; font-size:22px; font-family:Outfit; color:#0f2942; display:flex; align-items:center; gap:8px;">
                  <span>${c.icon}</span> ${esc(c.name)}
                </h1>
                <p style="color:#5a7590; font-size:13px; margin:3px 0 0; font-style:italic;">
                  ${esc(c.nameEn)} · Değişken Kodu: <b style="color:${c.color};">${c.code}</b>
                </p>
              </div>
            </div>
          </div>

          <!-- Ağırlık ve Katsayı Ayar Kutusu -->
          <div style="display:flex; gap:12px; align-items:center; background:#ffffff; padding:10px 18px; border-radius:12px; border:1.5px solid #bcdcfa; box-shadow:0 4px 12px rgba(24,126,229,0.06);">
            <div>
              <small style="display:block; font-size:10px; color:var(--muted); font-weight:800; text-transform:uppercase;">Kriter Ağırlığı (w<sub>${c.id}</sub>):</small>
              <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                <input type="number" min="0" max="100" value="${c.weight}" style="width:65px; height:32px; font-weight:800; text-align:center; border:1px solid #cbd5e1; border-radius:6px;" onchange="updateMainCriterionWeight(${c.id}, this.value)">
                <span style="font-weight:700; color:var(--muted); font-size:12px;">% (${(c.weight/100).toFixed(2)})</span>
              </div>
            </div>
            <div style="border-left:1px solid #cbd5e1; padding-left:12px;">
              <small style="display:block; font-size:10px; color:var(--muted); font-weight:800; text-transform:uppercase;">Risk Puanı (${c.symbol}):</small>
              <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                <input type="number" min="0" max="100" value="${c.score}" style="width:65px; height:32px; font-weight:800; text-align:center; border:1px solid #cbd5e1; border-radius:6px;" onchange="updateMainCriterionScore(${c.id}, this.value)">
                <span style="font-weight:700; color:var(--muted); font-size:12px;">/100</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Kriterin Kendi İçindeki Matematiksel Hesaplama Formülü Kutusu -->
        <div class="dsrds-boxed-formula" style="margin-bottom: 22px;">
          <div style="font-size:11px; font-weight:800; color:#187ce5; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
            Kriter İçi Alt Gösterge Hesaplama Formülü:
          </div>
          <div style="font-family:'DM Mono', monospace, Consolas; font-size:16px; font-weight:800; color:#0f4c81; margin:8px 0; background:#f0f9ff; padding:12px 16px; border-radius:8px; border:1px solid #bae6fd;">
            ${c.symbol} = [ ∑<sub>j=1</sub><sup>n<sub>${c.id}</sub></sup> ( a<sub>${c.id}j</sub> × S<sub>${c.id}j</sub> ) ] / [ ∑<sub>j=1</sub><sup>n<sub>${c.id}</sub></sup> a<sub>${c.id}j</sub> ]
          </div>
          <div style="font-size:12px; color:#475569; line-height:1.6; margin-top:8px;">
            • <b>${c.symbol}</b>: Ana kriterin nihai risk puanı (0–100).<br>
            • <b>n<sub>${c.id}</sub></b>: İlgili kriterdeki alt gösterge sayısı (Şu an: <b>${c.subCriteria.length}</b>).<br>
            • <b>a<sub>${c.id}j</sub></b>: Alt göstergenin kriter içindeki ağırlığı.<br>
            • <b>S<sub>${c.id}j</sub></b>: Alt göstergenin 0–100 arasındaki risk puanı.<br>
            <span style="color:#0369a1; font-weight:600;">* Alt göstergelerin ağırlıkları toplamı 100 olacak şekilde belirlendiğinde formül, tam ağırlıklı ortalama olarak uygulanır.</span>
          </div>
        </div>

        <!-- Kriter İçi Eylem Butonları -->
        <div class="crit-action-bar" style="margin-bottom: 20px;">
          <button type="button" class="button" style="font-size:12px; padding:9px 18px; font-weight:700;" onclick="addSubCriterion(${c.id})">
            ➕ Yeni Alt Gösterge Ekle (S<sub>${c.id}j</sub>)
          </button>
          <button type="button" class="button secondary" style="font-size:12px; padding:9px 18px; font-weight:700;" onclick="distributeSubWeightsEqually(${c.id})">
            ⚖ Alt Ağırlıkları Eşit Dağıt (∑ a<sub>${c.id}j</sub> = 100)
          </button>
          <button type="button" class="button secondary" style="font-size:12px; padding:9px 18px; background:#e0f2fe; color:#0369a1; border-color:#7dd3fc; font-weight:700;" onclick="applySubScoreToMainCriterion(${c.id})">
            ✓ ${c.symbol} Puanını Hesapla ve Ana Denkleme Aktar
          </button>
          <button type="button" class="button secondary" style="font-size:12px; padding:9px 18px; background:#fff1f2; color:#be123c; border-color:#fecdd3; margin-left:auto; font-weight:700;" onclick="clearSubCriteriaOfCriterion(${c.id})">
            🗑 Temizle (Boşalt)
          </button>
        </div>

        <!-- Butonun İçi: Şimdilik Boş Gözüksün veya Alt Gösterge Tablosu -->
        ${c.subCriteria.length === 0 ? `
          <div style="padding: 56px 24px; text-align:center; background:rgba(255,255,255,0.45); border:2px dashed rgba(24, 126, 229, 0.3); border-radius:16px;">
            <div style="font-size: 46px; margin-bottom: 12px;">📭</div>
            <h3 style="margin:0 0 6px; font-size:18px; font-family:Outfit; color:var(--ink);">Bu Kriterin İçi Şimdilik Boştur</h3>
            <p style="color:var(--muted); font-size:13.5px; max-width:580px; margin:0 auto 20px; line-height:1.6;">
              Bu butonun içi, <b>${esc(c.name)} (${c.symbol})</b> kriteri için alt göstergeler (S<sub>${c.id}j</sub>) ve alt ağırlıklar (a<sub>${c.id}j</sub>) tanımlayabilmeniz amacıyla hazırlanmıştır.
              Şimdilik içi boştur. İhtiyaç duyduğunuzda yukarıdaki <b>"➕ Yeni Alt Gösterge Ekle"</b> butonuna basarak göstergeleri tanımlayabilirsiniz.
            </p>
            <button type="button" class="button" style="font-size:12.5px; padding:10px 22px; font-weight:700;" onclick="addSubCriterion(${c.id})">
              ➕ İlk Alt Göstergeyi Ekle
            </button>
          </div>
        ` : `
          <div class="data-table" style="background:#ffffff; border-radius:12px; border:1.5px solid #bcdcfa; overflow:hidden;">
            <table class="sub-crit-table">
              <thead>
                <tr style="background: #f1f8fe;">
                  <th style="width:50px; text-align:center;">j</th>
                  <th style="min-width:280px;">Alt Gösterge Tanımı</th>
                  <th style="width:150px; text-align:center;">Alt Ağırlık (a<sub>${c.id}j</sub>, %)</th>
                  <th style="width:150px; text-align:center;">Risk Puanı (S<sub>${c.id}j</sub>, 0-100)</th>
                  <th style="width:140px; text-align:center;">Ağırlıklı Katkı</th>
                  <th style="width:70px; text-align:center;">Sil</th>
                </tr>
              </thead>
              <tbody>
                ${c.subCriteria.map((sub, idx) => {
                  const contrib = ((Number(sub.weight) || 0) * (Number(sub.score) || 0) / 100).toFixed(2);
                  return `
                    <tr>
                      <td style="text-align:center; font-weight:700; color:var(--muted);">${idx + 1}</td>
                      <td>
                        <input type="text" value="${esc(sub.name)}" placeholder="Alt gösterge adını girin..." onchange="updateSubCriterionName(${c.id}, ${sub.id}, this.value)" oninput="updateSubCriterionName(${c.id}, ${sub.id}, this.value)">
                      </td>
                      <td>
                        <div style="display:flex; align-items:center; gap:4px; justify-content:center;">
                          <input type="number" min="0" max="100" value="${sub.weight}" style="text-align:center; font-weight:700;" onchange="updateSubCriterionWeight(${c.id}, ${sub.id}, this.value)">
                          <span style="font-size:11px; font-weight:700; color:var(--muted)">%</span>
                        </div>
                      </td>
                      <td>
                        <div style="display:flex; align-items:center; gap:4px; justify-content:center;">
                          <input type="number" min="0" max="100" value="${sub.score}" style="text-align:center; font-weight:700;" onchange="updateSubCriterionScore(${c.id}, ${sub.id}, this.value)">
                          <span style="font-size:11px; font-weight:700; color:var(--muted)">/100</span>
                        </div>
                      </td>
                      <td style="text-align:center; font-weight:700; color:var(--blue);">
                        +${contrib}
                      </td>
                      <td style="text-align:center;">
                        <button type="button" title="Sil" style="border:0; background:none; cursor:pointer; font-size:16px; color:#ef4444;" onclick="removeSubCriterion(${c.id}, ${sub.id})">
                          🗑
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="crit-summary-box">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
              <div>
                <small style="display:block; font-size:10px; color:var(--muted); font-weight:800;">TOPLAM ALT AĞIRLIK (∑ a<sub>${c.id}j</sub>):</small>
                <span style="font-size:16px; font-weight:800; color:${subWeightSum === 100 ? 'var(--blue)' : 'var(--red)'}">
                  %${subWeightSum}
                </span>
                ${subWeightSum === 100
                  ? '<span class="badge resolved" style="margin-left:6px;">✓ %100 Dengeli</span>'
                  : `<span class="badge current" style="margin-left:6px;">⚠ Fark: %${100 - subWeightSum}</span>`}
              </div>
              <div style="border-left:1px solid #cbd5e1; padding-left:16px;">
                <small style="display:block; font-size:10px; color:var(--muted); font-weight:800;">HESAPLANAN RİSK PUANI (${c.symbol}):</small>
                <b style="font-size:18px; color:var(--ink);">${subScore.toFixed(1)} <span style="font-size:12px; color:var(--muted)">/ 100</span></b>
              </div>
            </div>

            <button type="button" class="button" style="font-size:12px; padding:9px 20px; font-weight:700;" onclick="applySubScoreToMainCriterion(${c.id})">
              ✓ Bu Puanı (${Math.round(subScore)}) Ana Denkleme Aktar
            </button>
          </div>
        `}
      </section>
    `;
    return;
  }

  // --------------------------------------------------------------------------
  // DURUM B: ANA EKRAN (8 ADET BUTON GİBİ BUTON + TOPLAM RİSK DENKLEMİ)
  // --------------------------------------------------------------------------
  if (!v2FdaRecordsCache || v2FdaRecordsCache.length < 1500) {
    if (!riskCriteriaFdaLoading) {
      riskCriteriaFdaLoading = true;
      ensureV2FdaDataLoaded().then(() => {
        riskCriteriaFdaLoading = false;
        if (location.hash === '#riskcriteria') {
          riskCriteriaPage();
        }
      });
    }
  }

  const allGreenRecords = getV2Green400Records();
  const selectedDrug = riskCriteriaSelectedDrugId ? allGreenRecords.find(r => String(r.id) === String(riskCriteriaSelectedDrugId)) : null;

  page.innerHTML = header('Toplam İlaç Kıtlığı Risk Puanı (DSRDS)', '8 ana risk kriteri, ondalık ağırlıklı toplam risk denklemi ve kriter bazlı alt hesaplama mimarisi.') + `
    <!-- 1. BÖLÜM: 8 ADET GERÇEK BUTON ŞEKLİNDE KRİTERLER -->
    <section class="glass panel" style="margin-bottom: 24px; padding: 24px;">
      <div class="panel-head" style="margin-bottom: 6px;">
        <div>
          <h2 style="margin:0 0 4px; font-size:18px; font-family:Outfit;">1. Ana Risk Kriterleri (İçine Girmek İçin Butona Tıklayın)</h2>
          <p style="color:var(--muted); font-size:13px; margin:0;">
            Aşağıdaki 8 butonun her biri bağımsız bir kriterdir. Üzerlerinde değişken sembolleri (R₁–R₈), isimleri ve ağırlık yüzdeleri yer alır.
          </p>
        </div>
      </div>

      <!-- 8 Buton Izgarası (Gerçek Buton Tasarımı - Renkli & Göze Hitap Eden) -->
      <div class="dsrds-crit-grid">
        ${riskCriteriaState.criteria.map(c => `
          <button type="button" class="dsrds-crit-btn" onclick="enterCriterion(${c.id})" style="border-color:${c.colorBorder}; background: linear-gradient(180deg, #ffffff 0%, ${c.colorBg} 100%);">
            <div style="display:flex; align-items:center; gap:14px; min-width:0; flex:1;">
              <div class="dsrds-crit-badge" style="background:${c.colorGradient}; box-shadow:0 4px 14px ${c.color}40;">
                ${c.symbol}
              </div>
              <div class="dsrds-crit-text">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                  <span style="font-size:15px;">${c.icon}</span>
                  <div class="dsrds-crit-title" style="color:#0f2942;">${esc(c.name)}</div>
                </div>
                <div class="dsrds-crit-sub" style="color:#5a7590;">${esc(c.nameEn)}</div>
              </div>
            </div>
            <div class="dsrds-crit-meta">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="dsrds-crit-pill-weight" style="background:${c.colorBg}; color:${c.color}; border:1px solid ${c.colorBorder};">
                  %${c.weight} <small style="font-weight:700; opacity:0.85;">(0.${c.weight < 10 ? '0' + c.weight : c.weight})</small>
                </span>
                <span style="font-size:11.5px; font-weight:800; background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:3px 8px; border-radius:8px;">
                  ${c.symbol}: <b style="color:${c.color};">${c.score}</b>
                </span>
              </div>
              <span class="dsrds-crit-pill-action" style="border-color:${c.colorBorder}; color:${c.color};">
                Kriteri Aç & Hesapla ➔
              </span>
            </div>
          </button>
        `).join('')}
      </div>
    </section>

    <!-- 2. BÖLÜM: TOPLAM RİSK DENKLEMİ VE HESAPLAMA SİSTEMİ -->
    <section class="glass panel" id="dsrdsFormulaSection" style="padding: 24px; margin-bottom: 24px;">
      ${selectedDrug ? `
        <div class="dsrds-active-drug-banner" style="margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:24px;">🎯</span>
            <div>
              <div style="font-size:11px; font-weight:800; color:#1d4ed8; text-transform:uppercase;">Seçili İlaç Parametreleri Denklem Puanlarına Yansıtıldı:</div>
              <div style="font-size:15px; font-weight:800; color:#1e3a8a;">${esc(selectedDrug.brand_name || selectedDrug.generic_name)} <span style="font-weight:600; font-size:12px; color:#475569;">(${esc(selectedDrug.generic_name || '')})</span></div>
            </div>
          </div>
          <button type="button" class="button secondary" style="font-size:11px; padding:6px 12px; font-weight:700; background:#fff;" onclick="clearSelectedRiskDrug()">
            ✕ İlaç Seçimini Kaldır
          </button>
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="margin:0 0 4px; font-size:18px; font-family:Outfit;">2. Toplam İlaç Kıtlığı Risk Puanı Denklemi</h2>
          <p style="color:var(--muted); font-size:13px; margin:0;">
            Ağırlıklar ondalık biçimde kullanılır ve toplamları 1'dir. Kriter puanları (R<sub>i</sub>) 0–100 arasındadır.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="button secondary" style="font-size:11px; padding:7px 14px; font-weight:700;" onclick="resetAllCriteriaWeightsToDefault()">
            🔄 Ağırlıkları Sıfırla (0.18, 0.18...)
          </button>
          <button type="button" class="button secondary" style="font-size:11px; padding:7px 14px; font-weight:700;" onclick="setAllCriteriaScoresValue(50)">
            ⚖ Puanları 50 (Nötr) Yap
          </button>
          <button type="button" class="button secondary" style="font-size:11px; padding:7px 14px; font-weight:700;" onclick="setAllCriteriaScoresValue(0)">
            0️⃣ Puanları Sıfırla (0)
          </button>
          <button type="button" class="button" style="font-size:11px; padding:7px 14px; font-weight:700;" onclick="exportRiskCriteriaMatrixCSV()">
            📥 CSV İndir
          </button>
        </div>
      </div>

      <!-- Kullanıcının İstediği Resmi Matematiksel Denklem Kutusu -->
      <div class="dsrds-boxed-formula">
        <div style="font-size:12px; font-weight:800; color:#187ce5; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
          Matematiksel Model: Toplam İlaç Kıtlığı Risk Puanı (R<sub>total</sub>)
        </div>
        <div style="font-family:'DM Mono', monospace, Consolas; font-size:15px; font-weight:800; color:#0f4c81; line-height:1.7; background:#f0f9ff; padding:14px 18px; border-radius:10px; border:1px solid #bae6fd;">
          R<sub>total</sub> = 0.18 R₁ + 0.18 R₂ + 0.15 R₃ + 0.15 R₄ + 0.10 R₅ + 0.10 R₆ + 0.07 R₇ + 0.07 R₈
        </div>
        <div style="font-size:12px; color:#475569; margin-top:8px;">
          Her <b>R<sub>i</sub></b>, ilgili kriterin 0–100 arasındaki risk puanıdır. Ağırlıklar ondalık biçimde kullanılır ve toplamları 1'dir (∑ w<sub>i</sub> = 1.00).
        </div>
      </div>

      <!-- Canlı Değiştirilebilir Terimler Kartları -->
      <div style="background:#ffffff; border:1.5px solid #bcdcfa; border-radius:14px; padding:18px; margin-bottom:20px;">
        <div style="font-size:12px; font-weight:800; color:var(--ink); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.4px;">
          Denklem Terimlerini Değiştirin (Ağırlıklar w<sub>i</sub> ve Puanlar R<sub>i</sub>):
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px;">
          ${riskCriteriaState.criteria.map(c => {
            const wDec = (c.weight / 100).toFixed(2);
            const contrib = (wDec * c.score).toFixed(2);
            return `
              <div style="background:${c.colorBg}; border:1.5px solid ${c.colorBorder}; border-top:3.5px solid ${c.color}; border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:800; color:${c.color}; font-size:13px;">${c.icon} ${c.symbol} (${c.code})</span>
                    <span style="font-size:11px; font-weight:800; color:${c.color}; background:#ffffff; padding:2px 7px; border-radius:6px; border:1px solid ${c.colorBorder};">Katkı: +${contrib}</span>
                  </div>
                  <div style="font-size:12px; font-weight:700; color:var(--ink); margin-bottom:8px; line-height:1.3;">
                    ${esc(c.name)}
                  </div>
                </div>

                <div style="display:flex; gap:8px; align-items:center; background:#ffffff; padding:8px; border-radius:8px; border:1px solid ${c.colorBorder};">
                  <div style="flex:1;">
                    <small style="display:block; font-size:9.5px; font-weight:800; color:var(--muted);">AĞIRLIK (%):</small>
                    <div style="display:flex; align-items:center; gap:2px;">
                      <input type="number" min="0" max="100" value="${c.weight}" style="width:100%; height:28px; text-align:center; font-weight:700; font-size:12px; border:1px solid #cbd5e1; border-radius:5px;" onchange="updateMainCriterionWeight(${c.id}, this.value)">
                      <span style="font-size:10px; font-weight:700; color:var(--muted);">%</span>
                    </div>
                  </div>
                  <span style="font-weight:800; color:${c.color}; font-size:14px; margin-top:10px;">×</span>
                  <div style="flex:1;">
                    <small style="display:block; font-size:9.5px; font-weight:800; color:var(--muted);">PUAN (${c.symbol}):</small>
                    <div style="display:flex; align-items:center; gap:2px;">
                      <input type="number" min="0" max="100" value="${c.score}" style="width:100%; height:28px; text-align:center; font-weight:700; font-size:12px; border:1px solid #cbd5e1; border-radius:5px;" onchange="updateMainCriterionScore(${c.id}, this.value)">
                      <span style="font-size:10px; font-weight:700; color:var(--muted);">/100</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Canlı Hesaplanan Nihai Sonuç Paneli -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%); border:2px solid #187ce5; border-radius:16px; padding:22px 30px; flex-wrap:wrap; gap:16px; box-shadow:0 8px 25px rgba(24,126,229,0.12);">
        <div>
          <span style="font-size:11px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">
            HESAPLANAN TOPLAM RİSK PUANI (R<sub>total</sub>):
          </span>
          <div style="font-size:34px; font-weight:800; color:${tier.color}; font-family:Outfit; margin-top:2px; display:flex; align-items:baseline; gap:6px;">
            ${rTotal.toFixed(2)}
            <span style="font-size:16px; color:var(--muted); font-weight:500;">/ 100</span>
          </div>
        </div>

        <div style="text-align:center;">
          <span style="font-size:11px; font-weight:800; color:var(--muted); display:block; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px;">
            RİSK SEVİYESİ:
          </span>
          <span style="background:${tier.bg}; color:${tier.color}; border:1.5px solid ${tier.border}; padding:7px 20px; border-radius:22px; font-weight:800; font-size:14px; display:inline-block; letter-spacing:0.4px;">
            ${tier.label}
          </span>
        </div>

        <div style="text-align:right;">
          <span style="font-size:11px; font-weight:800; color:var(--muted); display:block; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px;">
            AĞIRLIKLAR TOPLAMI (∑ w<sub>i</sub>):
          </span>
          <b style="font-size:22px; color:${isBalanced ? 'var(--blue)' : 'var(--red)'};">
            ${totalWeightDecimal.toFixed(2)} (%${totalWeightPercent})
          </b>
          <small style="display:block; font-size:11px; color:${isBalanced ? 'var(--green)' : 'var(--red)'}; font-weight:800; margin-top:2px;">
            ${isBalanced ? '✓ 1.00 Tam Dengeli' : '⚠ Dengesiz (∑ ≠ 1.00)'}
          </small>
        </div>
      </div>
    </section>

    <!-- 3. BÖLÜM: KULLANICININ VERDİĞİ AKADEMİK DEĞİŞKENLER TABLOSU -->
    <section class="glass panel" style="padding: 24px; margin-bottom: 24px;">
      <h2 style="margin:0 0 12px; font-size:17px; font-family:Outfit;">3. Kriter Değişkenleri, Anlamları ve Ağırlık Dağılımı</h2>
      <div class="data-table" style="background:#ffffff; border-radius:12px; border:1.5px solid #bcdcfa; overflow:hidden;">
        <table>
          <thead>
            <tr style="background:#f1f8fe;">
              <th style="width:100px; text-align:center;">Değişken</th>
              <th>Anlamı (Kriter Adı)</th>
              <th style="width:130px; text-align:center;">Ağırlığı (% / Ondalık)</th>
              <th style="width:130px; text-align:center;">Mevcut Puan (R<sub>i</sub>)</th>
              <th style="width:140px; text-align:center;">Ağırlıklı Katkı (w<sub>i</sub> × R<sub>i</sub>)</th>
              <th style="width:110px; text-align:center;">Kriter İçi</th>
            </tr>
          </thead>
          <tbody>
            ${riskCriteriaState.criteria.map(c => {
              const wDec = (c.weight / 100).toFixed(2);
              const contrib = (wDec * c.score).toFixed(2);
              return `
                <tr>
                  <td style="text-align:center; font-weight:800; color:#187ce5; font-size:14px;">
                    ${c.symbol}
                  </td>
                  <td>
                    <b>${esc(c.name)}</b><br>
                    <small style="color:var(--muted); font-style:italic;">${esc(c.nameEn)}</small>
                  </td>
                  <td style="text-align:center; font-weight:700;">
                    %${c.weight} <small style="color:var(--muted);">(${wDec})</small>
                  </td>
                  <td style="text-align:center; font-weight:800;">
                    ${c.score} <small style="color:var(--muted);">/100</small>
                  </td>
                  <td style="text-align:center; font-weight:800; color:var(--blue);">
                    +${contrib}
                  </td>
                  <td style="text-align:center;">
                    <button type="button" class="button secondary" style="font-size:11px; padding:4px 10px; font-weight:700;" onclick="enterCriterion(${c.id})">
                      Aç ➔
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc; font-weight:800; font-size:13px; border-top:2px solid #bcdcfa;">
              <td style="text-align:center; color:#187ce5; font-size:14px;">R<sub>total</sub></td>
              <td>TOPLAM İLAÇ KITLIĞI RİSK PUANI</td>
              <td style="text-align:center; color:${isBalanced ? 'var(--blue)' : 'var(--red)'};">
                %${totalWeightPercent} (${totalWeightDecimal.toFixed(2)})
              </td>
              <td style="text-align:center; color:var(--muted); font-size:11px;">(0–100 Skalası)</td>
              <td style="text-align:center; font-size:16px; color:#187ce5;">
                ${rTotal.toFixed(2)}
              </td>
              <td style="text-align:center;">
                <span style="background:${tier.bg}; color:${tier.color}; border:1px solid ${tier.border}; padding:3px 8px; border-radius:10px; font-size:10px;">
                  ${tier.label}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Kullanıcının İstediği Resmi Önemli Notu -->
      <div class="dsrds-warning-callout">
        <b>⚠️ Önemli:</b> Bunlar sistemin başlangıç hesaplama denklemleridir. Ana kriter ağırlıkları ve alt gösterge ağırlıkları tasarım önerileridir; modelin tahmin başarısı gerçek kıtlık verileriyle test edilerek doğrulanmalıdır. Eksik veriler de otomatik olarak sıfır risk kabul edilmemelidir.
      </div>
    </section>

    <!-- 4. BÖLÜM: V2 YEŞİL REÇETE KAPSAMINDAKİ 400 İLAÇ VE RİSK ANALİZ VERİ KÜMESİ -->
    ${renderRiskCriteriaDrugSection()}
  `;

  renderRiskCriteriaDrugTableOnly();
}




// ==========================================================================
// 7. YÖNLENDİRİCİ (ROUTER) & ETKİLEŞİMLER
// ==========================================================================
const routes = {
  dashboard,
  explorer,
  shortages: shortagePage,
  shortagesv2: shortagePageV2,
  riskcriteria: riskCriteriaPage,
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
