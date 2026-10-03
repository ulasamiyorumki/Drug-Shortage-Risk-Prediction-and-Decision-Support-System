"""Build the shared SQLite catalog from the original FDA, NDC, CMS, and VA files.

Run from the project root with: python Source/Dashboard/build_sqlite.py
"""

from __future__ import annotations

import csv
import gzip
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATASETS = ROOT / "Datasets"
TARGET = DATASETS / "drug_data.sqlite3"
TEMP = DATASETS / "drug_data.building.sqlite3"
FIELD_CATALOG: dict[str, set[str]] = {}
sys.path.insert(0, str(Path(__file__).resolve().parent))
import eda  # noqa: E402


SCHEMA = """
CREATE TABLE records (
 id INTEGER PRIMARY KEY, source TEXT NOT NULL, year INTEGER,
 generic_name TEXT, brand_name TEXT, manufacturer TEXT, vendor TEXT,
 ndc TEXT, product_ndc TEXT, package_ndc TEXT, application TEXT,
 status TEXT, reason TEXT, search_text TEXT NOT NULL, raw_json TEXT NOT NULL
);
CREATE INDEX records_source ON records(source, id);
CREATE INDEX records_ndc ON records(ndc);
CREATE INDEX records_product_ndc ON records(product_ndc);
CREATE INDEX records_package_ndc ON records(package_ndc);
CREATE INDEX records_application ON records(application);
CREATE INDEX records_year ON records(source, year);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE field_catalog (source TEXT NOT NULL, field TEXT NOT NULL, PRIMARY KEY(source, field));
"""


def clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " | ".join(clean(item) for item in value if item is not None)
    return str(value).strip()


def put(connection, source, raw, *, year=None, generic="", brand="", manufacturer="", vendor="", ndc="", product_ndc="", package_ndc="", application="", status="", reason=""):
    FIELD_CATALOG.setdefault(source, set()).update(key for key in raw if not key.startswith("_"))
    raw_json = json.dumps(raw, ensure_ascii=False, separators=(",", ":"), default=str)
    search_text = " ".join(clean(x) for x in [generic, brand, manufacturer, vendor, ndc, product_ndc, package_ndc, application, status, reason] if clean(x)).lower()
    connection.execute(
        "INSERT INTO records(source,year,generic_name,brand_name,manufacturer,vendor,ndc,product_ndc,package_ndc,application,status,reason,search_text,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (source, year, clean(generic), clean(brand), clean(manufacturer), clean(vendor), clean(ndc), clean(product_ndc), clean(package_ndc), clean(application), clean(status), clean(reason), search_text, raw_json),
    )


def iter_json_results(path: Path):
    """Yield objects from the root results array without loading the JSON file in RAM."""
    decoder = json.JSONDecoder()
    buffer = ""
    pattern = re.compile(r'"results"\s*:\s*\[')
    with path.open(encoding="utf-8") as stream:
        while True:
            chunk = stream.read(64 * 1024)
            if not chunk:
                raise ValueError(f"Root results array not found in {path}")
            buffer += chunk
            match = pattern.search(buffer)
            if match:
                buffer = buffer[match.end():]
                break
        position = 0
        while True:
            while position < len(buffer) and (buffer[position].isspace() or buffer[position] == ","):
                position += 1
            if position < len(buffer) and buffer[position] == "]":
                return
            try:
                item, end = decoder.raw_decode(buffer, position)
            except json.JSONDecodeError:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    raise
                buffer = buffer[position:] + chunk
                position = 0
                continue
            yield item
            position = end
            if position > 1024 * 1024:
                buffer = buffer[position:]
                position = 0


def main():
    TEMP.unlink(missing_ok=True)
    connection = sqlite3.connect(TEMP)
    connection.executescript(SCHEMA)
    connection.execute("PRAGMA journal_mode=OFF")
    connection.execute("PRAGMA synchronous=OFF")
    connection.execute("PRAGMA temp_store=MEMORY")

    drugs_path = DATASETS / "DrugsFDA" / "drugs.json"
    print("[1/6] FDA Drugs@FDA")
    for index, app in enumerate(iter_json_results(drugs_path), 1):
        openfda = app.get("openfda") or {}
        products = app.get("products") or []
        brand = [p.get("brand_name", "") for p in products]
        generic = [name for p in products for ingredient in (p.get("active_ingredients") or []) for name in [ingredient.get("name", "")]]
        ndcs = clean(openfda.get("package_ndc")) + " | " + clean(openfda.get("product_ndc"))
        row = {"Drug / product": clean(brand) or clean(generic) or app.get("application_number", "FDA application"), "Generic ingredient": clean(generic) or clean(openfda.get("generic_name")), "Brand name": clean(brand) or clean(openfda.get("brand_name")), "Application": app.get("application_number", ""), "Sponsor": app.get("sponsor_name", ""), "Manufacturer / labeler": clean(openfda.get("manufacturer_name")), "Dosage form": clean([p.get("dosage_form", "") for p in products]), "Route": clean([p.get("route", "") for p in products]), "NDCs": ndcs, "RxCUI": clean(openfda.get("rxcui")), "SPL ID": clean(openfda.get("spl_id")), "SPL Set ID": clean(openfda.get("spl_set_id")), "UNII": clean(openfda.get("unii")), "Pharmaceutical classification": clean(openfda.get("pharm_class_epc", []) + openfda.get("pharm_class_cs", []) + openfda.get("pharm_class_moa", [])), "_raw_application": app}
        put(connection, "FDA Drugs", row, generic=row["Generic ingredient"], brand=row["Brand name"], manufacturer=row["Manufacturer / labeler"], ndc=ndcs, application=app.get("application_number", ""))
        if index % 500 == 0:
            connection.commit()
            print(f"  {index:,} applications indexed")

    print("[2/6] FDA Drug Shortages")
    for item in iter_json_results(DATASETS / "DrugsFDA" / "drug-shortages.json"):
        openfda = item.get("openfda") or {}
        raw = {**item, "Brand name": clean(openfda.get("brand_name")), "Generic name": clean(item.get("generic_name")), "NDC": item.get("package_ndc", ""), "Application": clean(openfda.get("application_number")), "Status": item.get("status", ""), "Company": item.get("company_name", ""), "Shortage reason": item.get("shortage_reason", ""), "Availability": item.get("availability", ""), "Updated": item.get("update_date", ""), "Initial posting date": item.get("initial_posting_date", ""), "Dosage form": item.get("dosage_form", ""), "Presentation": item.get("presentation", ""), "Therapeutic category": clean(item.get("therapeutic_category"))}
        put(connection, "Drug Shortages", raw, generic=item.get("generic_name"), brand=openfda.get("brand_name"), manufacturer=item.get("company_name"), ndc=item.get("package_ndc"), application=openfda.get("application_number"), status=item.get("status"), reason=item.get("shortage_reason"))

    ndc_dir = DATASETS / "National Drug Code Directory"
    print("[3/6] NDC products")
    with (ndc_dir / "product.txt").open(encoding="latin1", newline="") as stream:
        for item in csv.DictReader(stream, delimiter="\t"):
            raw = {**item, "Drug / product": item.get("PROPRIETARYNAME") or item.get("NONPROPRIETARYNAME", ""), "Generic name": item.get("NONPROPRIETARYNAME", ""), "Brand name": item.get("PROPRIETARYNAME", ""), "Product NDC": item.get("PRODUCTNDC", ""), "Labeler": item.get("LABELERNAME", ""), "Application": item.get("APPLICATIONNUMBER", ""), "Dosage form": item.get("DOSAGEFORMNAME", ""), "Route": item.get("ROUTENAME", ""), "Product type": item.get("PRODUCTTYPENAME", "")}
            put(connection, "NDC Products", raw, generic=item.get("NONPROPRIETARYNAME"), brand=item.get("PROPRIETARYNAME"), manufacturer=item.get("LABELERNAME"), ndc=item.get("PRODUCTNDC"), product_ndc=item.get("PRODUCTNDC"), application=item.get("APPLICATIONNUMBER"))

    print("[4/6] NDC packages")
    with (ndc_dir / "package.txt").open(encoding="latin1", newline="") as stream:
        for item in csv.DictReader(stream, delimiter="\t"):
            raw = {**item, "Drug / product": item.get("PRODUCTNDC", ""), "NDC": item.get("NDCPACKAGECODE", ""), "Package NDC": item.get("NDCPACKAGECODE", ""), "Product NDC": item.get("PRODUCTNDC", ""), "Package description": item.get("PACKAGEDESCRIPTION", "")}
            put(connection, "NDC Packages", raw, ndc=item.get("NDCPACKAGECODE"), product_ndc=item.get("PRODUCTNDC"), package_ndc=item.get("NDCPACKAGECODE"))

    print("[5/6] CMS Medicare Part D (one workbook at a time)")
    cms_dir = DATASETS / "Medicare Part D Spending by Drug-Excel Reports including Historical Data RY26"
    workbooks = sorted(cms_dir.glob("Medicare Part D Spending by Drug DYT*/*.xlsx"))
    for path in workbooks:
        match = re.search(r"DYT(\d{4})", path.parent.name)
        year = int(match.group(1)) if match else None
        frame, _ = eda.load_medicare(str(path))
        for record in frame.to_dict("records"):
            brand_col = next((key for key in record if "brand name" in key.lower()), "")
            generic_col = next((key for key in record if "generic name" in key.lower()), "")
            manufacturer_col = next((key for key in record if "manufacturer" in key.lower()), "")
            brand = record.get(brand_col, "") if brand_col else ""
            generic = record.get(generic_col, "") if generic_col else ""
            # In CMS reports the unsuffixed field is the report year; .1, .2, ... are older years.
            claims_col = next((key for key in record if key.lower().startswith("total claims")), "")
            beneficiaries_col = next((key for key in record if key.lower().startswith("total  beneficiaries")), "")
            dosage_col = next((key for key in record if key.lower().startswith("total dosage units")), "")
            unit_spending_col = next((key for key in record if key.lower().startswith("average spending per dosage unit (weighted)")), "")
            spending_cols = [key for key in record if key.lower().startswith("total spending")]
            spending_col = spending_cols[0] if spending_cols else ""
            raw = {**record, "Drug / product": clean(brand) or clean(generic), "Brand name": brand, "Generic name": generic, "Report year": year, "Total Claims": record.get(claims_col, "") if claims_col else "", "Total Beneficiaries": record.get(beneficiaries_col, "") if beneficiaries_col else "", "Total Dosage Units": record.get(dosage_col, "") if dosage_col else "", "Average Spending Per Dosage Unit (Weighted)": record.get(unit_spending_col, "") if unit_spending_col else "", "Total Spending": record.get(spending_col, "") if spending_col else "", "Spending (latest year in report)": record.get(spending_col, "") if spending_col else ""}
            put(connection, "CMS Medicare Part D", raw, year=year, generic=generic, brand=brand, manufacturer=record.get(manufacturer_col, "") if manufacturer_col else "")
        connection.commit()
        print(f"  {year}: {len(frame):,} CMS rows")
        del frame

    print("[6/6] VA pharmaceutical contracts")
    va_path = DATASETS / "VA National Pharma Contracts" / "va_national_phamara_contracts.csv"
    with va_path.open(encoding="utf-8-sig", newline="") as stream:
        for item in csv.DictReader(stream):
            raw = {**item, "Drug / product": item.get("Generic Name") or item.get("Trade Name", ""), "Generic name": item.get("Generic Name", ""), "Brand name": item.get("Trade Name", ""), "Trade name": item.get("Trade Name", ""), "Manufacturer": item.get("Vendor", ""), "NDC": item.get("NDC", ""), "FSS price": item.get("FSS Price", ""), "NC price": item.get("NC Price", ""), "Big 4 price": item.get("Big 4 Price", ""), "Contract number": item.get("Contract Number", ""), "Prime Vendor": item.get("PV", ""), "Package": item.get("PKG", ""), "VA Class": item.get("VA Class", "")}
            put(connection, "VA Contracts", raw, generic=item.get("Generic Name"), brand=item.get("Trade Name"), manufacturer=item.get("Vendor"), vendor=item.get("Vendor"), ndc=item.get("NDC"))

    connection.executemany(
        "INSERT INTO field_catalog(source,field) VALUES(?,?)",
        [(source, field) for source, fields in FIELD_CATALOG.items() for field in sorted(fields)],
    )
    connection.execute("INSERT INTO metadata(key,value) VALUES('complete','1')")
    connection.commit()
    connection.execute("PRAGMA optimize")
    connection.close()
    TEMP.replace(TARGET)
    print(f"SQLite catalog ready: {TARGET} ({TARGET.stat().st_size / (1024**2):,.1f} MiB)")
    compressed = TARGET.with_suffix(TARGET.suffix + ".gz")
    with TARGET.open("rb") as source, compressed.open("wb") as output, gzip.GzipFile(fileobj=output, mode="wb", compresslevel=6, mtime=0) as archive:
        while chunk := source.read(4 * 1024 * 1024):
            archive.write(chunk)
    print(f"Compressed deployment catalog: {compressed} ({compressed.stat().st_size / (1024**2):,.1f} MiB)")


if __name__ == "__main__":
    main()
