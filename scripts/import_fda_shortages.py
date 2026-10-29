#!/usr/bin/env python3
import os
import sys
import csv
import json
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "Datasets", "DrugsFDA", "fda_tedarik_kriz_verileri_2026-10-29.csv")
PUBLIC_JSON_PATH = os.path.join(BASE_DIR, "public", "fda_shortages_records.json")
DATASET_JSON_PATH = os.path.join(BASE_DIR, "Datasets", "DrugsFDA", "drug-shortages.json")
SQLITE_PATH = os.path.join(BASE_DIR, "database.sqlite")

def parse_records():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"CSV file not found: {CSV_PATH}")

    records = []
    with open(CSV_PATH, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
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

            raw_json = {
                "therapeutic_category": r.get("Terapötik Kategori", "").strip(),
                "presentation": r.get("Sunum & Dozaj Formu", "").strip(),
                "availability": r.get("Bulunabilirlik (Stok)", "").strip(),
                "contact_info": r.get("İletişim Bilgisi", "").strip(),
                "update_date": up_date,
                "initial_posting_date": init_date,
                "manufacturer": r.get("Üretici Firma", "").strip(),
                "application_no": r.get("FDA Başvuru No (ANDA/NDA)", "").strip(),
                "ndc": r.get("NDC Kodu", "").strip(),
                "shortage_status": r.get("FDA Kriz Durumu", "").strip(),
                "shortage_reason": r.get("Sıkıntı Nedeni", "").strip(),
                "risk_score": risk_score,
                "risk_tier": r.get("Risk Seviyesi", "").strip(),
                "action": r.get("Önerilen Mühendislik Aksiyonu", "").strip(),
                "is_green": is_green
            }

            search_parts = [
                r.get("İlaç Adı / Generic", ""),
                r.get("Marka Adı", ""),
                r.get("Sıkıntı Nedeni", ""),
                r.get("Terapötik Kategori", ""),
                r.get("Sunum & Dozaj Formu", ""),
                r.get("Üretici Firma", ""),
                r.get("NDC Kodu", ""),
                r.get("FDA Başvuru No (ANDA/NDA)", "")
            ]
            search_text = " ".join(filter(None, [p.strip() for p in search_parts]))

            rec = {
                "id": row_id,
                "source": "Drug Shortages",
                "report_year": year,
                "generic_name": r.get("İlaç Adı / Generic", "").strip(),
                "brand_name": r.get("Marka Adı", "").strip(),
                "shortage_status": r.get("FDA Kriz Durumu", "").strip(),
                "shortage_reason": r.get("Sıkıntı Nedeni", "").strip(),
                "therapeutic_category": r.get("Terapötik Kategori", "").strip(),
                "availability": r.get("Bulunabilirlik (Stok)", "").strip(),
                "presentation": r.get("Sunum & Dozaj Formu", "").strip(),
                "manufacturer": r.get("Üretici Firma", "").strip(),
                "vendor": r.get("Üretici Firma", "").strip(),
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
                "search_text": search_text,
                "raw_json": raw_json
            }
            records.append(rec)

    return records

def save_json_files(records):
    print(f"Writing {len(records)} records to {PUBLIC_JSON_PATH}...")
    with open(PUBLIC_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Writing {len(records)} records to {DATASET_JSON_PATH}...")
    with open(DATASET_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

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
        "update_date", "risk_score", "risk_tier", "action", "is_green"
    ]
    for f in fields:
        cursor.execute("INSERT OR IGNORE INTO source_fields (source, field_name) VALUES (?, ?)", ("Drug Shortages", f))

    conn.commit()
    conn.close()
    print(f"Successfully inserted {inserted} FDA Drug Shortages records into SQLite database.")

if __name__ == "__main__":
    recs = parse_records()
    print(f"Parsed {len(recs)} records from CSV.")
    save_json_files(recs)
    import_to_sqlite(recs)
    print("All tasks completed successfully!")
