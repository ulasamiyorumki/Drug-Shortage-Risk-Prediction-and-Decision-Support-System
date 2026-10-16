import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const sourceNames = ['FDA Drugs', 'Drug Shortages', 'NDC Products', 'NDC Packages', 'CMS Medicare Part D', 'VA Contracts'];
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 8, charset: 'utf8mb4', namedPlaceholders: true
});

const safeSource = source => sourceNames.includes(source) ? source : null;
const parse = row => ({ ...row, raw_json: typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json });

app.use(express.json({ limit: '1mb' }));
app.get('/Background.avif', (_req, res) => res.sendFile(path.join(root, 'Background.avif')));
app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false, message: 'Veritabanı bağlantısı bekleniyor.' }); }
});

app.get('/api/overview', async (_req, res, next) => {
  try {
    const [counts] = await pool.query('SELECT source, COUNT(*) count FROM drug_records GROUP BY source');
    const [current] = await pool.query("SELECT COUNT(*) count FROM drug_records WHERE source = 'Drug Shortages' AND LOWER(shortage_status) = 'current'");
    const [vendors] = await pool.query("SELECT COUNT(DISTINCT vendor) count FROM drug_records WHERE source = 'VA Contracts' AND vendor IS NOT NULL AND vendor <> ''");
    res.json({ counts, currentShortages: current[0].count, vendors: vendors[0].count });
  } catch (error) { next(error); }
});

app.get('/api/records', async (req, res, next) => {
  try {
    const source = safeSource(req.query.source);
    const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 2000);
    const q = String(req.query.q || '').trim(); const filters = []; const params = [];
    if (source) { filters.push('source = ?'); params.push(source); }
    if (q) { filters.push('(search_text LIKE ? OR ndc LIKE ? OR product_ndc LIKE ? OR package_ndc LIKE ? OR application_no LIKE ?)'); params.push(...Array(5).fill(`%${q}%`)); }
    if (req.query.status) { filters.push('shortage_status = ?'); params.push(req.query.status); }
    if (req.query.category) {
      filters.push('raw_json LIKE ?');
      params.push(`%${String(req.query.category).trim()}%`);
    }
    if (req.query.availability) {
      const av = String(req.query.availability).trim();
      filters.push('(raw_json LIKE ? OR raw_json LIKE ?)');
      params.push(`%"availability":"${av}%`, `%"Availability":"${av}%`);
    }
    const greenRegex = 'alprazolam|biperiden|diazepam|phenobarbital|fenobarbital|ketamine|ketamin|clonazepam|klonazepam|lorazepam|midazolam|pregabalin|tianeptine|tianeptin|thiopental|tiyopental|tramadol|zopiclone|zopiklon|xanax|akineton|diazem|nervium|valium|diastat|luminaletten|luminal|ketalar|ketanest|rivotril|klonopin|ativan|dormicum|versed|lyrica|galara|alyse|neogaba|regapen|symra|stablon|coaxil|ekipental|pentothal|contramal|ultracet|tramal|zaldiar|imovane';
    if (req.query.green || req.query.is_green) {
      filters.push('(generic_name REGEXP ? OR brand_name REGEXP ? OR search_text REGEXP ?)');
      params.push(greenRegex, greenRegex, greenRegex);
    } else if (req.query.non_green) {
      filters.push('(generic_name NOT REGEXP ? AND brand_name NOT REGEXP ? AND (search_text IS NULL OR search_text NOT REGEXP ?))');
      params.push(greenRegex, greenRegex, greenRegex);
    }
    if (req.query.green_substance) {
      const gs = String(req.query.green_substance).trim();
      filters.push('(generic_name REGEXP ? OR brand_name REGEXP ? OR search_text REGEXP ?)');
      params.push(gs, gs, gs);
    }
    if (req.query.reason) {
      const r = String(req.query.reason).trim();
      if (r === 'api') {
        filters.push('(shortage_reason LIKE ? OR shortage_reason LIKE ?)');
        params.push('%ingredient%', '%active ingredient%');
      } else if (r === 'logistics') {
        filters.push('(shortage_reason LIKE ? OR shortage_reason LIKE ? OR shortage_reason LIKE ?)');
        params.push('%shipping%', '%delay%', '%transit%');
      } else if (r === 'gmp') {
        filters.push('(shortage_reason LIKE ? OR shortage_reason LIKE ? OR shortage_reason LIKE ?)');
        params.push('%manufacturing%', '%gmp%', '%complying%');
      } else if (r === 'demand') {
        filters.push('shortage_reason LIKE ?');
        params.push('%demand%');
      } else if (r === 'discontinued') {
        filters.push('shortage_reason LIKE ?');
        params.push('%discontinu%');
      } else if (r === 'green_rx' || r === 'green_cases') {
        filters.push('(generic_name REGEXP ? OR brand_name REGEXP ? OR search_text REGEXP ?)');
        params.push(greenRegex, greenRegex, greenRegex);
      } else if (r === 'normal') {
        filters.push('(shortage_status IS NULL OR shortage_status = ?) AND (shortage_reason IS NULL OR shortage_reason = ?)');
        params.push('', '');
      } else if (r === 'Belirtilmemiş' || r === 'Not available') {
        filters.push('(shortage_reason IS NULL OR TRIM(shortage_reason) = ? OR shortage_reason = ?)');
        params.push('', 'Not available');
      } else {
        filters.push('(shortage_reason LIKE ? OR search_text LIKE ?)');
        params.push(`%${r}%`, `%${r}%`);
      }
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [[total]] = await pool.query(`SELECT COUNT(*) count FROM drug_records ${where}`, params);
    const orderBy = source ? 'ORDER BY id DESC' : `ORDER BY CASE 
      WHEN source = 'Drug Shortages' THEN 1 
      WHEN source = 'FDA Drugs' THEN 2 
      WHEN source = 'NDC Products' THEN 3 
      WHEN source = 'VA Contracts' THEN 4 
      ELSE 5 
    END, id DESC`;
    const [rows] = await pool.query(`SELECT id, source, report_year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application_no, shortage_status, shortage_reason, raw_json FROM drug_records ${where} ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    res.json({ total: total.count, page, limit, rows: rows.map(parse) });
  } catch (error) { next(error); }
});

app.get('/api/records/:id', async (req, res, next) => {
  try {
    const [[record]] = await pool.query('SELECT * FROM drug_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ message: 'Kayıt bulunamadı.' });
    
    const rawKeys = [record.ndc, record.product_ndc, record.package_ndc, record.application_no].filter(k => k && k !== '|' && k !== '-');
    const nameStr = (record.generic_name || record.brand_name || '');
    const firstWord = nameStr.split(/[\s|,/]+/)[0].trim();
    
    const clauses = [];
    const relatedParams = [];
    
    if (firstWord && firstWord.length >= 3) {
      clauses.push('(generic_name LIKE ? OR brand_name LIKE ?)');
      relatedParams.push(`${firstWord}%`, `${firstWord}%`);
    }
    
    for (const k of rawKeys) {
      clauses.push('(ndc = ? OR product_ndc = ? OR package_ndc = ? OR application_no = ?)');
      relatedParams.push(k, k, k, k);
    }
    
    let related = [];
    if (clauses.length) {
      const [rows] = await pool.query(
        `SELECT id, source, report_year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application_no, shortage_status, shortage_reason, raw_json 
         FROM drug_records 
         WHERE id <> ? AND (${clauses.join(' OR ')}) 
         ORDER BY CASE 
           WHEN source = 'Drug Shortages' THEN 1 
           WHEN source = 'FDA Drugs' THEN 2 
           WHEN source = 'VA Contracts' THEN 3 
           WHEN source = 'CMS Medicare Part D' THEN 4 
           ELSE 5 
         END, id DESC 
         LIMIT 250`, 
        [record.id, ...relatedParams]
      );
      related = rows;
    }
    res.json({ record: parse(record), related: related.map(parse) });
  } catch (error) { next(error); }
});

app.get('/api/analytics/:view', async (req, res, next) => {
  try {
    const view = req.params.view;
    if (view === 'shortages') {
      const [status] = await pool.query("SELECT COALESCE(shortage_status, 'Not available') label, COUNT(*) value FROM drug_records WHERE source = 'Drug Shortages' GROUP BY shortage_status ORDER BY value DESC");
      const [reasons] = await pool.query(`
        SELECT 
          CASE WHEN shortage_reason IS NULL OR TRIM(shortage_reason) = '' THEN 'Belirtilmemiş' ELSE TRIM(shortage_reason) END label, 
          COUNT(*) value 
        FROM drug_records 
        WHERE source = 'Drug Shortages' 
        GROUP BY CASE WHEN shortage_reason IS NULL OR TRIM(shortage_reason) = '' THEN 'Belirtilmemiş' ELSE TRIM(shortage_reason) END 
        ORDER BY value DESC 
        LIMIT 15
      `);
      const [topCompanies] = await pool.query(`
        SELECT manufacturer label, COUNT(*) value 
        FROM drug_records 
        WHERE source = 'Drug Shortages' AND manufacturer IS NOT NULL AND manufacturer <> '' 
        GROUP BY manufacturer 
        ORDER BY value DESC 
        LIMIT 10
      `);
      const [[companiesCount]] = await pool.query(`
        SELECT COUNT(DISTINCT manufacturer) count 
        FROM drug_records 
        WHERE source = 'Drug Shortages' AND manufacturer IS NOT NULL AND manufacturer <> ''
      `);
      return res.json({ status, reasons, topCompanies, totalCompanies: companiesCount?.count || 0 });
    }
    if (view === 'suppliers') {
      const [vendors] = await pool.query("SELECT COALESCE(vendor, 'Not available') label, COUNT(*) value FROM drug_records WHERE source = 'VA Contracts' GROUP BY vendor ORDER BY value DESC LIMIT 12");
      return res.json({ vendors });
    }
    if (view === 'demand') {
      const [years] = await pool.query("SELECT report_year label, COUNT(*) value FROM drug_records WHERE source = 'CMS Medicare Part D' AND report_year IS NOT NULL GROUP BY report_year ORDER BY report_year");
      return res.json({ years });
    }
    return res.status(400).json({ message: 'Bilinmeyen analiz görünümü.' });
  } catch (error) { next(error); }
});

app.post('/api/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ message: 'Chatbot için GROQ_API_KEY tanımlanmadı.' });
  const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-10) : [];
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', temperature: 0.5, max_completion_tokens: 800, messages: [{ role: 'system', content: 'You assist an industrial engineering drug shortage dashboard. Answer in Turkish. Never invent data.' }, ...messages] })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ message: data?.error?.message || 'Groq isteği başarısız.' });
    res.json({ answer: data.choices?.[0]?.message?.content || 'Yanıt oluşturulamadı.' });
  } catch { res.status(502).json({ message: 'Chatbot servisine ulaşılamadı.' }); }
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: 'Sunucu isteği işleyemedi.' }); });
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
app.listen(Number(process.env.PORT || 3000), () => console.log(`Dashboard running on port ${process.env.PORT || 3000}`));
