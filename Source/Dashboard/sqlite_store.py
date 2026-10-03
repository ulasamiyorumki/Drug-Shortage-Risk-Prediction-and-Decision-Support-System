"""Disk-backed source-record store used to avoid loading full datasets into RAM."""

from __future__ import annotations

import json
import gzip
import re
import sqlite3
import tempfile
from pathlib import Path

import pandas as pd

DB_FILENAME = "drug_data.sqlite3"
SOURCES = (
    "FDA Drugs",
    "Drug Shortages",
    "NDC Products",
    "NDC Packages",
    "CMS Medicare Part D",
    "VA Contracts",
)


class DrugStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.is_file():
            compressed = self.path.with_suffix(self.path.suffix + ".gz")
            if compressed.is_file():
                fingerprint = f"{compressed.stat().st_size}-{compressed.stat().st_mtime_ns}"
                self.path = Path(tempfile.gettempdir()) / f"{self.path.stem}-{fingerprint}{self.path.suffix}"
                if not self.path.is_file():
                    temporary = self.path.with_suffix(self.path.suffix + ".building")
                    with gzip.open(compressed, "rb") as source, temporary.open("wb") as target:
                        while chunk := source.read(4 * 1024 * 1024):
                            target.write(chunk)
                    temporary.replace(self.path)

    def ready(self) -> bool:
        if not self.path.is_file():
            return False
        try:
            with sqlite3.connect(self.path.resolve().as_uri() + "?mode=ro", uri=True) as connection:
                return connection.execute("SELECT value FROM metadata WHERE key='complete'").fetchone() == ("1",)
        except sqlite3.Error:
            return False

    def count(self, source: str, query: str = "", filters: dict[str, object] | None = None) -> int:
        where, params = self._where(source, query=query, filters=filters)
        with self._connect() as connection:
            return int(connection.execute(f"SELECT COUNT(*) FROM records WHERE {where}", params).fetchone()[0])

    def counts(self) -> dict[str, int]:
        with self._connect() as connection:
            return {source: int(count) for source, count in connection.execute("SELECT source, COUNT(*) FROM records GROUP BY source")}

    def search(self, source: str, query: str, limit: int = 200, offset: int = 0, filters: dict[str, object] | None = None) -> pd.DataFrame:
        where, params = self._where(source, query=query, filters=filters)
        params.extend([int(limit), int(offset)])
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT id, source, year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application, status, reason, raw_json FROM records WHERE {where} ORDER BY id LIMIT ? OFFSET ?",
                params,
            ).fetchall()
        return self._frame(rows)

    def page(self, source: str, limit: int = 100, offset: int = 0, query: str = "") -> pd.DataFrame:
        return self.search(source, query, limit=limit, offset=offset)

    def related(self, source: str, anchor: pd.Series, limit: int = 300) -> pd.DataFrame:
        ndcs = [value for value in str(anchor.get("_ndcs", "")).split(" | ") if value]
        applications = [value for value in str(anchor.get("_applications", "")).split(" | ") if value]
        clauses = ["source=?"]
        params: list[object] = [source]
        matches = []
        if ndcs:
            for ndc in ndcs:
                parts = ndc.split("-")
                matches.append("(ndc=? OR product_ndc=? OR package_ndc=?)")
                params.extend([ndc, ndc, ndc])
                if len(parts) == 3:
                    # FDA sometimes relates an application package code to the product-level NDC.
                    product_code = "-".join(parts[:2])
                    matches.append("(ndc=? OR product_ndc=?)")
                    params.extend([product_code, product_code])
                elif len(parts) == 2:
                    matches.append("package_ndc LIKE ? ESCAPE '\\'")
                    params.append(ndc.replace("%", "\\%").replace("_", "\\_") + "-%")
        if applications:
            matches.append("application IN (" + ",".join("?" for _ in applications) + ")")
            params.extend(applications)
        # Link by a distinctive generic/brand name token only within drug-name fields.
        # Searching all raw text for any token created many false links (e.g. common dosage words).
        seen_names = set()
        seen_tokens = set()
        for column in ("Generic ingredient", "Generic name", "Brand name"):
            for name in str(anchor.get(column, "")).split(" | "):
                normalized_name = " ".join(name.lower().split())
                if not normalized_name or normalized_name in seen_names:
                    continue
                seen_names.add(normalized_name)
                tokens = [token for token in re.findall(r"[a-z0-9]+", name.lower()) if len(token) >= 5]
                token = next((item for item in tokens if item not in seen_tokens), None)
                if token:
                    seen_tokens.add(token)
                    matches.append("(lower(generic_name) LIKE ? OR lower(brand_name) LIKE ?)")
                    params.extend([f"%{token}%", f"%{token}%"])
        if not matches:
            return pd.DataFrame()
        clauses.append("(" + " OR ".join(matches) + ")")
        params.append(int(limit))
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, source, year, generic_name, brand_name, manufacturer, vendor, ndc, product_ndc, package_ndc, application, status, reason, raw_json FROM records WHERE "
                + " AND ".join(clauses) + " ORDER BY id LIMIT ?",
                params,
            ).fetchall()
        frame = self._frame(rows)
        if not frame.empty:
            frame.insert(0, "Match basis", "Olası bağlantı: NDC, başvuru numarası veya ilaç adı")
        return frame

    def raw(self, record_id: int) -> dict:
        with self._connect() as connection:
            row = connection.execute("SELECT raw_json FROM records WHERE id=?", (int(record_id),)).fetchone()
        return json.loads(row[0]) if row else {}

    @staticmethod
    def flatten(value: dict, prefix: str = "") -> list[dict]:
        rows = []
        for key, item in value.items():
            field = f"{prefix}.{key}" if prefix else str(key)
            if isinstance(item, dict):
                rows.extend(DrugStore.flatten(item, field))
            elif isinstance(item, list):
                for index, child in enumerate(item):
                    if isinstance(child, (dict, list)):
                        rows.extend(DrugStore.flatten(child, f"{field}[{index}]"))
                    else:
                        rows.append({"Original field": f"{field}[{index}]", "Value": str(child)})
            else:
                rows.append({"Original field": field, "Value": "Mevcut değil" if item is None else str(item)})
        return rows

    def _connect(self) -> sqlite3.Connection:
        if not self.ready():
            raise RuntimeError(f"SQLite veri tabanı hazır değil: {self.path}")
        connection = sqlite3.connect(self.path.resolve().as_uri() + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        return connection

    def fields(self, source: str) -> list[str]:
        with self._connect() as connection:
            return [row[0] for row in connection.execute("SELECT field FROM field_catalog WHERE source=? ORDER BY field", (source,))]

    def distinct_values(self, source: str, field: str, query: str = "", limit: int = 101) -> list[str]:
        where, params = self._where(source, query=query)
        json_path = '$."' + field.replace('"', '\\"') + '"'
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT DISTINCT json_extract(raw_json, ?) FROM records WHERE {where} AND json_extract(raw_json, ?) IS NOT NULL AND trim(CAST(json_extract(raw_json, ?) AS TEXT))!='' LIMIT ?",
                [json_path, *params, json_path, json_path, int(limit)],
            ).fetchall()
        return [str(row[0]) for row in rows]

    def value_counts(self, source: str, field: str, query: str = "", limit: int = 50, filters: dict[str, object] | None = None) -> pd.Series:
        where, params = self._where(source, query=query, filters=filters)
        json_path = '$."' + field.replace('"', '\\"') + '"'
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT CAST(json_extract(raw_json, ?) AS TEXT) AS label, COUNT(*) AS n FROM records WHERE {where} AND json_extract(raw_json, ?) IS NOT NULL AND trim(CAST(json_extract(raw_json, ?) AS TEXT))!='' GROUP BY label ORDER BY n DESC LIMIT ?",
                [json_path, *params, json_path, json_path, int(limit)],
            ).fetchall()
        return pd.Series({row["label"]: int(row["n"]) for row in rows}, name="Kayıt sayısı", dtype="int64")

    def distinct_count(self, source: str, field: str) -> int:
        json_path = '$."' + field.replace('"', '\\"') + '"'
        with self._connect() as connection:
            return int(connection.execute(
                "SELECT COUNT(DISTINCT CAST(json_extract(raw_json, ?) AS TEXT)) FROM records WHERE source=? AND json_extract(raw_json, ?) IS NOT NULL AND trim(CAST(json_extract(raw_json, ?) AS TEXT))!=''",
                (json_path, source, json_path, json_path),
            ).fetchone()[0])

    def cms_yearly_summary(self, query: str = "") -> pd.DataFrame:
        where, params = self._where("CMS Medicare Part D", query=query)
        expressions = {}
        for key, label in [
            ("Total Claims", "Total Claims"),
            ("Total Beneficiaries", "Total Beneficiaries"),
            ("Total Dosage Units", "Total Dosage Units"),
            ("Total Spending", "Total Spending"),
        ]:
            path = '$."' + key + '"'
            expressions[label] = (path, "SUM")
        select = ["year AS year"]
        query_params: list[object] = []
        for field, (path, aggregator) in expressions.items():
            select.append(f"{aggregator}(CAST(REPLACE(REPLACE(CAST(json_extract(raw_json, ?) AS TEXT), ',', ''), '$', '') AS REAL)) AS \"{field}\"")
            query_params.append(path)
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT {', '.join(select)} FROM records WHERE {where} GROUP BY year ORDER BY year",
                [*query_params, *params],
            ).fetchall()
        frame = pd.DataFrame([dict(row) for row in rows])
        if not frame.empty and {"Total Spending", "Total Dosage Units"}.issubset(frame.columns):
            frame["Average Spending Per Dosage Unit (Weighted)"] = frame["Total Spending"].div(frame["Total Dosage Units"].replace(0, pd.NA))
        return frame

    @staticmethod
    def _where(source: str, query: str = "", filters: dict[str, object] | None = None) -> tuple[str, list[object]]:
        clauses = ["source=?"]
        params: list[object] = [source]
        if query.strip():
            needle = "%" + query.strip().replace("%", "\\%").replace("_", "\\_").lower() + "%"
            clauses.append("(lower(search_text) LIKE ? ESCAPE '\\' OR ndc LIKE ? ESCAPE '\\' OR application LIKE ? ESCAPE '\\')")
            params.extend([needle, needle, needle])
        for field, value in (filters or {}).items():
            json_path = '$."' + field.replace('"', '\\"') + '"'
            if isinstance(value, list):
                if value:
                    clauses.append("CAST(json_extract(raw_json, ?) AS TEXT) IN (" + ",".join("?" for _ in value) + ")")
                    params.extend([json_path, *value])
            else:
                clauses.append("CAST(json_extract(raw_json, ?) AS TEXT) LIKE ?")
                params.extend([json_path, f"%{value}%"])
        return " AND ".join(clauses), params

    @staticmethod
    def _frame(rows) -> pd.DataFrame:
        records = []
        for row in rows:
            raw = json.loads(row["raw_json"])
            source = row["source"]
            entity = {
                "_db_id": row["id"],
                "Source": source,
                "Drug / product": raw.get("Drug / product") or row["brand_name"] or row["generic_name"] or raw.get("DRUGNAME") or raw.get("PROPRIETARYNAME") or "Mevcut değil",
                "Generic name": row["generic_name"] or "",
                "Generic ingredient": raw.get("Generic ingredient", row["generic_name"] or ""),
                "Brand name": row["brand_name"] or "",
                "Manufacturer / labeler": row["manufacturer"] or "",
                "Manufacturer": row["manufacturer"] or "",
                "Vendor": row["vendor"] or "",
                "NDC": row["ndc"] or "",
                "Product NDC": row["product_ndc"] or "",
                "Package NDC": row["package_ndc"] or "",
                "Application": row["application"] or "",
                "Report year": row["year"] or "",
                "Status": row["status"] or "",
                "Shortage reason": row["reason"] or "",
                "_raw_record": raw,
                "_raw_application": raw.get("_raw_application"),
                "_names": [row["generic_name"], row["brand_name"]],
                "_ndcs": " | ".join(x for x in [row["ndc"], row["product_ndc"], row["package_ndc"]] if x),
                "_applications": row["application"] or "",
                "_tokens": " | ".join(re.findall(r"[a-z0-9]+", " ".join(filter(None, [row["generic_name"], row["brand_name"]])).lower())),
                "_search": " ".join(str(value) for value in [row["generic_name"], row["brand_name"], row["manufacturer"], row["vendor"], row["ndc"], row["product_ndc"], row["package_ndc"], row["application"], row["status"], row["reason"]] if value),
            }
            entity.update({
                key: value for key, value in raw.items()
                if key not in {"_raw_record", "_raw_application"} and not isinstance(value, (dict, list))
            })
            entity["_db_id"] = row["id"]
            entity["_raw_record"] = raw
            records.append(entity)
        return pd.DataFrame(records)
