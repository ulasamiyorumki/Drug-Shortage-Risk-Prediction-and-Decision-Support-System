#!/usr/bin/env python3
import os
import sys
import json
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(BASE_DIR, "Datasets", "EMA", "ema_medicine_shortages.json")
SQLITE_PATH = os.path.join(BASE_DIR, "database.sqlite")

def load_ema_records():
    if not os.path.exists(JSON_PATH):
        raise FileNotFoundError(f"EMA JSON not found at {JSON_PATH}")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def import_to_sqlite(records):
    conn = sqlite3.connect(SQLITE_PATH)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS drug_records (id INTEGER PRIMARY KEY AUTOINCREMENT, source VARCHAR(48) NOT NULL, report_year SMALLINT NULL, generic_name TEXT NULL, brand_name TEXT NULL, manufacturer TEXT NULL, vendor TEXT NULL, ndc MEDIUMTEXT NULL, product_ndc MEDIUMTEXT NULL, package_ndc MEDIUMTEXT NULL, application_no TEXT NULL, shortage_status VARCHAR(100) NULL, shortage_reason TEXT NULL, search_text MEDIUMTEXT NOT NULL, raw_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    cursor.execute("CREATE TABLE IF NOT EXISTS source_fields (source VARCHAR(48) NOT NULL, field_name VARCHAR(255) NOT NULL, PRIMARY KEY (source, field_name))")
    cursor.execute("DELETE FROM drug_records WHERE source = 'EMA Shortages'")
    cursor.execute("DELETE FROM source_fields WHERE source = 'EMA Shortages'")
    inserted = 0
    for r in records:
        medicine = r.get("medicine_affected") or ""
        inn = r.get("international_non_proprietary_name_inn_or_common_name") or ""
        status = r.get("supply_shortage_status") or ""
        mesh = r.get("therapeutic_area_mesh") or ""
        forms = r.get("pharmaceutical_forms_affected") or ""
        strengths = r.get("strengths_affected") or ""
        alt = r.get("availability_of_alternatives") or "Belirtilmemiş"
        exp_res = r.get("expected_resolution") or r.get("expected_resolution_date") or ""
        pub_date = r.get("first_published_date") or ""
        year = None
        if pub_date and len(pub_date.split("/")) == 3:
            try:
                year = int(pub_date.split("/")[2])
            except ValueError:
                pass
        reason = f"Alternatif: {alt} | Terapötik Alan: {mesh or 'Genel'}"
        search_parts = [medicine, inn, status, mesh, forms, strengths, alt, exp_res, "EMA Shortages", "Avrupa İlaç Ajansı"]
        search_text = " ".join(filter(None, search_parts))
        raw_json_str = json.dumps(r, ensure_ascii=False)
        cursor.execute("INSERT INTO drug_records (source, report_year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application_no, shortage_status, shortage_reason, search_text, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            "EMA Shortages", year, inn, medicine, "EMA / AB Ruhsat Sahibi", None, None, None, None, None, status, reason, search_text, raw_json_str
        ))
        inserted += 1
    ema_fields = list(records[0].keys()) if records else []
    for f in ema_fields:
        cursor.execute("INSERT OR IGNORE INTO source_fields (source, field_name) VALUES (?, ?)", ("EMA Shortages", f))
    conn.commit()
    conn.close()
    print(f"Successfully imported {inserted} EMA shortage records into SQLite ({SQLITE_PATH})")

if __name__ == "__main__":
    recs = load_ema_records()
    import_to_sqlite(recs)
