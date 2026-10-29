#!/usr/bin/env python3
import os
import sys
import csv
import json
import re
import sqlite3
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "Datasets", "DrugsFDA", "fda_tedarik_kriz_verileri_2026-10-29.csv")
PUBLIC_JSON_PATH = os.path.join(BASE_DIR, "public", "fda_shortages_records.json")
DATASET_JSON_PATH = os.path.join(BASE_DIR, "Datasets", "DrugsFDA", "drug-shortages.json")
SQLITE_PATH = os.path.join(BASE_DIR, "database.sqlite")

DOSAGE_FORMS = [
    'delayed release capsule', 'extended release tablet', 'extended release film', 
    'delayed-release tablet', 'extended-release capsule', 'extended-release suspension',
    'extended release capsule', 'extended release suspension',
    'ophthalmic solution', 'ophthalmic ointment', 'oral suspension', 'oral solution',
    'oral liquid', 'intraperitoneal injection', 'inhalation solution', 'nasal spray',
    'sublingual tablet', 'chewable tablet', 'topical tincture', 'liquid for inhalation',
    'transdermal system', 'for suspension', 'kit',
    'injection', 'tablet', 'capsule', 'solution', 'suppository', 'irrigant', 
    'powder', 'concentrate', 'film', 'spray', 'aerosol', 'cream', 'ointment', 
    'gel', 'lotion', 'patch', 'elixir'
]

def parse_drug_key(generic_name, presentation):
    gn = (generic_name or '').strip()
    pres = (presentation or '').strip()
    
    found_form = None
    pres_parts = [p.strip() for p in pres.split(',') if p.strip()]
    if len(pres_parts) >= 2:
        candidate = pres_parts[1].lower()
        for df in DOSAGE_FORMS:
            if df == candidate or candidate.startswith(df) or df in candidate:
                found_form = df
                break
                
    if not found_form:
        gn_low = gn.lower()
        for df in DOSAGE_FORMS:
            if re.search(r'\b' + re.escape(df) + r'\b', gn_low):
                found_form = df
                break
                
    if not found_form:
        found_form = 'Diğer Form'

    gn_clean = gn.lower()
    if found_form != 'Diğer Form':
        gn_clean = re.sub(r'\b' + re.escape(found_form) + r'\b', '', gn_clean)
        
    gn_clean = re.sub(r'[,;\s]*(extended release|delayed release|extended-release|delayed-release|immediate release)[\s,]*', ' ', gn_clean, flags=re.I)
    salt_pattern = r'\b(hydrochloride|hcl|sulfate|sulphate|sodium|potassium|calcium|acetate|phosphate|succinate|tartrate|fumarate|maleate|citrate|mesylate|nitrate|gluconate|dipropionate|propionate|valerate|lactate|chloride|tromethamine)\b'
    base_ing = re.sub(salt_pattern, '', gn_clean)
    base_ing = re.sub(r'[,\s]+', ' ', base_ing).strip(' ,-')
    if not base_ing:
        base_ing = gn.lower().strip()
        
    return base_ing.title(), found_form.title()
def parse_records():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"CSV file not found: {CSV_PATH}")

    raw_rows = []
    with open(CSV_PATH, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            raw_rows.append(r)

    # First pass: map all manufacturers by (active_ingredient, dosage_form)
    catalog_mfgs = defaultdict(set)
    for r in raw_rows:
        ing, form = parse_drug_key(r.get("İlaç Adı / Generic", ""), r.get("Sunum & Dozaj Formu", ""))
        mfg = (r.get("Üretici Firma") or "").strip()
        if ing and mfg:
            catalog_mfgs[(ing, form)].add(mfg)

    # Second pass: construct complete enriched records
    records = []
    for r in raw_rows:
        row_id = int(r["ID"]) if r["ID"].isdigit() else r["ID"]
        up_date = r.get("Son Güncelleme", "").strip()
        init_date = r.get("İlk İlan Tarihi", "").strip()
        year = None
        if up_date and len(up_date.split("/")) == 3:
            try:
                year = int(up_date.split("/")[2])
            except ValueError:
                pass
        elif init_date and len(init_date.split("/")) == 3:
            try:
                year = int(init_date.split("/")[2])
            except ValueError:
                pass

        risk_score_raw = r.get("Kırılganlık Riski (Puan)", "").strip()
        risk_score = int(risk_score_raw) if risk_score_raw.isdigit() else None
        is_green = (r.get("Yeşil Reçete", "").strip() == "Yeşil Reçete")

        gn = r.get("İlaç Adı / Generic", "").strip()
        pres = r.get("Sunum & Dozaj Formu", "").strip()
        mfg = r.get("Üretici Firma", "").strip()

        ing, form = parse_drug_key(gn, pres)
        all_mfgs = catalog_mfgs.get((ing, form), set())
        # Find alternative manufacturers: same active ingredient, same dosage form, but different manufacturer!
        alts = sorted([m for m in all_mfgs if m.lower() != mfg.lower()])
        alt_count = len(alts)
        alt_display = f"{alt_count} Üretici ({', '.join(alts)})" if alt_count > 0 else "Yok"

        raw_json = {
            "therapeutic_category": r.get("Terapötik Kategori", "").strip(),
            "presentation": pres,
            "availability": r.get("Bulunabilirlik (Stok)", "").strip(),
            "contact_info": r.get("İletişim Bilgisi", "").strip(),
            "update_date": up_date,
            "initial_posting_date": init_date,
            "manufacturer": mfg,
            "application_no": r.get("FDA Başvuru No (ANDA/NDA)", "").strip(),
            "ndc": r.get("NDC Kodu", "").strip(),
            "shortage_status": r.get("FDA Kriz Durumu", "").strip(),
            "shortage_reason": r.get("Sıkıntı Nedeni", "").strip(),
            "risk_score": risk_score,
            "risk_tier": r.get("Risk Seviyesi", "").strip(),
            "action": r.get("Önerilen Mühendislik Aksiyonu", "").strip(),
            "is_green": is_green,
            "active_ingredient": ing,
            "dosage_form": form,
            "alternative_manufacturers_count": alt_count,
            "alternative_manufacturers": alts,
            "alternative_manufacturers_display": alt_display
        }

        search_parts = [
            gn,
            r.get("Marka Adı", ""),
            r.get("Sıkıntı Nedeni", ""),
            r.get("Terapötik Kategori", ""),
            pres,
            mfg,
            r.get("NDC Kodu", ""),
            r.get("FDA Başvuru No (ANDA/NDA)", ""),
            ing,
            form,
            " ".join(alts) if alts else "Yok"
        ]
        search_text = " ".join(filter(None, [p.strip() for p in search_parts]))

        rec = {
            "id": row_id,
            "source": "Drug Shortages",
            "report_year": year,
            "generic_name": gn,
            "brand_name": r.get("Marka Adı", "").strip(),
            "shortage_status": r.get("FDA Kriz Durumu", "").strip(),
            "shortage_reason": r.get("Sıkıntı Nedeni", "").strip(),
            "therapeutic_category": r.get("Terapötik Kategori", "").strip(),
            "availability": r.get("Bulunabilirlik (Stok)", "").strip(),
            "presentation": pres,
            "manufacturer": mfg,
            "vendor": mfg,
            "contact_info": r.get("İletişim Bilgisi", "").strip(),
            "application_no": r.get("FDA Başvuru No (ANDA/NDA)", "").strip(),
            "ndc": r.get("NDC Kodu", "").strip(),
            "product_ndc": r.get("NDC Kodu", "").strip(),
            "package_ndc": r.get("NDC Kodu", "").strip(),
            "initial_posting_date": init_date,
            "update_date": up_date,
            "risk_score": risk_score,
            "risk_tier": r.get("Risk Seviyesi", "").strip(),
            "action": r.get("Önerilen Mühendislik Aksiyonu", "").strip(),
            "is_green": is_green,
            "active_ingredient": ing,
            "dosage_form": form,
            "alternative_manufacturers_count": alt_count,
            "alternative_manufacturers": alts,
            "alternative_manufacturers_display": alt_display,
            "search_text": search_text,
            "raw_json": raw_json
        }
        records.append(rec)

    return records, raw_rows

def save_json_files(records):
    print(f"Writing {len(records)} records to {PUBLIC_JSON_PATH}...")
    with open(PUBLIC_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Writing {len(records)} records to {DATASET_JSON_PATH}...")
    with open(DATASET_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

def update_csv_file(records, raw_rows):
    print(f"Updating {CSV_PATH} with alternative manufacturers columns...")
    fieldnames = list(raw_rows[0].keys())
    if "Alternatif Üretici Sayısı" not in fieldnames:
        idx = fieldnames.index("Üretici Firma") + 1 if "Üretici Firma" in fieldnames else len(fieldnames)
        fieldnames.insert(idx, "Alternatif Üretici Sayısı")
        fieldnames.insert(idx + 1, "Alternatif Üreticiler")

    updated_rows = []
    for r, rec in zip(raw_rows, records):
        row = dict(r)
        row["Alternatif Üretici Sayısı"] = str(rec["alternative_manufacturers_count"])
        row["Alternatif Üreticiler"] = "; ".join(rec["alternative_manufacturers"]) if rec["alternative_manufacturers"] else "Yok"
        updated_rows.append(row)

    with open(CSV_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)

def import_to_sqlite(records):
    print(f"Importing records into SQLite ({SQLITE_PATH})...")
    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS drug_records (id INTEGER PRIMARY KEY AUTOINCREMENT, source VARCHAR(48) NOT NULL, report_year SMALLINT NULL, generic_name TEXT NULL, brand_name TEXT NULL, manufacturer TEXT NULL, vendor TEXT NULL, ndc MEDIUMTEXT NULL, product_ndc MEDIUMTEXT NULL, package_ndc MEDIUMTEXT NULL, application_no TEXT NULL, shortage_status VARCHAR(100) NULL, shortage_reason TEXT NULL, search_text MEDIUMTEXT NOT NULL, raw_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    cursor.execute("CREATE TABLE IF NOT EXISTS source_fields (source VARCHAR(48) NOT NULL, field_name VARCHAR(255) NOT NULL, PRIMARY KEY (source, field_name))")

    cursor.execute("DELETE FROM drug_records WHERE source = 'Drug Shortages'")
    cursor.execute("DELETE FROM source_fields WHERE source = 'Drug Shortages'")

    inserted = 0
    for r in records:
        raw_json_str = json.dumps(r["raw_json"], ensure_ascii=False)
        cursor.execute("""
            INSERT INTO drug_records (
                id, source, report_year, generic_name, brand_name,
                manufacturer, vendor, ndc, product_ndc, package_ndc,
                application_no, shortage_status, shortage_reason, search_text, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r["id"], r["source"], r["report_year"], r["generic_name"], r["brand_name"],
            r["manufacturer"], r["vendor"], r["ndc"], r["product_ndc"], r["package_ndc"],
            r["application_no"], r["shortage_status"], r["shortage_reason"], r["search_text"], raw_json_str
        ))
        inserted += 1

    fields = [
        "generic_name", "brand_name", "shortage_status", "shortage_reason",
        "therapeutic_category", "availability", "presentation", "manufacturer",
        "contact_info", "application_no", "ndc", "initial_posting_date",
        "update_date", "risk_score", "risk_tier", "action", "is_green",
        "active_ingredient", "dosage_form", "alternative_manufacturers_count", "alternative_manufacturers"
    ]
    for f in fields:
        cursor.execute("INSERT OR IGNORE INTO source_fields (source, field_name) VALUES (?, ?)", ("Drug Shortages", f))

    conn.commit()
    conn.close()
    print(f"Successfully inserted {inserted} FDA Drug Shortages records into SQLite database.")

if __name__ == "__main__":
    recs, raw_rows = parse_records()
    print(f"Parsed {len(recs)} records from CSV.")
    update_csv_file(recs, raw_rows)
    save_json_files(recs)
    import_to_sqlite(recs)
    print("All tasks completed successfully!")
