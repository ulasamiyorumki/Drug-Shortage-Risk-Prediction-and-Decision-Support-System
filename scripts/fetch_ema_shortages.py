#!/usr/bin/env python3
"""
EMA (European Medicines Agency) Medicine Shortages Fetcher & Parser
Source URL: https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/medicine-shortages-availability-issues/public-information-medicine-shortages
Direct Report: https://www.ema.europa.eu/en/documents/report/medicines-output-shortages-report_en.xlsx

Extracted DSRDS Fields:
- medicine_affected: Etkilenen ilaç
- international_non_proprietary_name_inn_or_common_name: Etken madde
- supply_shortage_status: Kıtlığın durumu
- therapeutic_area_mesh: Terapötik alan
- pharmaceutical_forms_affected: Etkilenen farmasötik formlar
- strengths_affected: Etkilenen dozlar
- availability_of_alternatives: Alternatiflerin bulunabilirliği
- start_of_shortage_date: Kıtlığın başlangıç tarihi
- expected_resolution_date: Beklenen çözülme tarihi
- expected_resolution: Beklenen çözülme periyodu / metni
- first_published_date: İlk yayımlanma tarihi
- last_updated_date: Son güncelleme tarihi
- shortage_url: EMA resmi bildirim bağlantısı
"""

import os
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
import json
import csv

REPORT_URL = "https://www.ema.europa.eu/en/documents/report/medicines-output-shortages-report_en.xlsx"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Datasets", "EMA")
RAW_XLSX = os.path.join(OUTPUT_DIR, "ema_medicines_output_shortages_report.xlsx")
JSON_OUT = os.path.join(OUTPUT_DIR, "ema_medicine_shortages.json")
CSV_OUT = os.path.join(OUTPUT_DIR, "ema_medicine_shortages.csv")

FIELD_MAPPING = {
    "Medicine affected": "medicine_affected",
    "International non-proprietary name (INN) or common name": "international_non_proprietary_name_inn_or_common_name",
    "Supply shortage status": "supply_shortage_status",
    "Therapeutic area (MeSH)": "therapeutic_area_mesh",
    "Pharmaceutical forms affected": "pharmaceutical_forms_affected",
    "Strengths affected": "strengths_affected",
    "Availability of alternatives": "availability_of_alternatives",
    "Start of shortage date": "start_of_shortage_date",
    "Expected resolution date": "expected_resolution_date",
    "Expected resolution": "expected_resolution",
    "First published date": "first_published_date",
    "Last updated date": "last_updated_date",
    "Shortage URL": "shortage_url",
    "Category": "category"
}

ORDERED_CSV_FIELDS = [
    "medicine_affected",
    "international_non_proprietary_name_inn_or_common_name",
    "supply_shortage_status",
    "therapeutic_area_mesh",
    "pharmaceutical_forms_affected",
    "strengths_affected",
    "availability_of_alternatives",
    "start_of_shortage_date",
    "expected_resolution_date",
    "expected_resolution",
    "first_published_date",
    "last_updated_date",
    "shortage_url",
    "category"
]

def download_report():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Downloading EMA report from: {REPORT_URL} ...")
    req = urllib.request.Request(
        REPORT_URL,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        with open(RAW_XLSX, "wb") as f:
            f.write(data)
    print(f"Downloaded {len(data):,} bytes -> {RAW_XLSX}")

def parse_xlsx():
    with zipfile.ZipFile(RAW_XLSX) as z:
        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in tree.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                shared_strings.append("".join(si.itertext()))

        tree = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

        rows = []
        for row in tree.findall(f"{ns}sheetData/{ns}row"):
            row_cells = []
            for c in row.findall(f"{ns}c"):
                cell_type = c.get("t")
                v = c.find(f"{ns}v")
                val = v.text if v is not None else None
                if cell_type == "s" and val is not None:
                    val = shared_strings[int(val)]
                row_cells.append(val)
            rows.append(row_cells)

    if len(rows) < 9:
        raise ValueError("Invalid format: fewer than 9 rows in sheetData")

    raw_headers = rows[8]
    records = []
    for r in rows[9:]:
        rec = {}
        for idx, h in enumerate(raw_headers):
            key = FIELD_MAPPING.get(h, h.lower().replace(" ", "_") if h else f"col_{idx}")
            val = r[idx] if idx < len(r) else None
            rec[key] = val.strip() if isinstance(val, str) else val
        records.append(rec)

    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    with open(CSV_OUT, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=ORDERED_CSV_FIELDS)
        writer.writeheader()
        for rec in records:
            writer.writerow({k: rec.get(k, "") or "" for k in ORDERED_CSV_FIELDS})

    print(f"Successfully processed {len(records)} shortage records:")
    print(f" - JSON: {JSON_OUT}")
    print(f" - CSV:  {CSV_OUT}")
    return records

if __name__ == "__main__":
    download_report()
    parse_xlsx()
