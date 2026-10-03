"""Interactive cross-source drug lookup page."""

from __future__ import annotations

import importlib.util
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd
import streamlit as st

PAGE_TITLE = "İlaç İnceleyici"
PAGE_ICON = "🔎"

SOURCE_NAMES_TR = {
    "FDA Drugs": "FDA İlaç Kayıtları", "Drug Shortages": "FDA Tedarik Sıkıntıları",
    "VA Contracts": "VA Sözleşmeleri", "NDC Products": "NDC Ürünleri",
    "NDC Packages": "NDC Paketleri", "Medicare Part D": "CMS Medicare Part D",
    "FDA Drugs@FDA": "FDA İlaç Kayıtları", "FDA Drug Shortages": "FDA Tedarik Sıkıntıları",
    "VA National Pharmaceutical Catalog": "VA Ulusal İlaç Kataloğu",
}
FIELD_NAMES_TR = {
    "Match basis": "Eşleşme dayanağı", "Drug / product": "İlaç / ürün", "Generic ingredient": "Jenerik etken madde",
    "Generic name": "Jenerik ad", "Brand name": "Marka adı", "Manufacturer / labeler": "Üretici / etiket sahibi",
    "Manufacturer": "Üretici", "Sponsor": "Başvuru sahibi", "Vendor": "Tedarikçi", "Contract number": "Sözleşme numarası",
    "Prime Vendor": "Ana tedarikçi (PV)", "Package": "Paket", "NDC": "NDC", "Product NDC": "Ürün NDC'si",
    "Package NDC": "Paket NDC'si", "Application": "Başvuru numarası", "Application number": "Başvuru numarası", "Dosage form": "Farmasötik biçim",
    "Route": "Uygulama yolu", "Status": "Durum", "Availability": "Bulunabilirlik", "Shortage reason": "Tedarik sıkıntısı nedeni",
    "Therapeutic category": "Tedavi kategorisi", "Presentation": "Ürün sunumu", "Updated": "Güncelleme tarihi",
    "Initial posting date": "İlk yayın tarihi", "Changed": "Değişiklik tarihi", "Discontinued": "Sonlandırılma tarihi",
    "Contact information": "İletişim bilgisi", "Related information": "İlişkili bilgi", "Related information link": "İlişkili bilgi bağlantısı",
    "Resolved note": "Çözüm notu", "Labeler": "Etiket sahibi", "Product type": "Ürün türü", "Report year": "Rapor yılı",
    "FSS price": "FSS fiyatı", "NC price": "Ulusal sözleşme fiyatı", "Big 4 price": "Big 4 fiyatı",
    "Package description": "Paket açıklaması", "Spending (latest year in report)": "Harcama (rapordaki son yıl)",
    "Total Claims": "Toplam reçete talebi", "Total Beneficiaries": "Toplam yararlanıcı", "Total Dosage Units": "Toplam doz birimi",
    "Company": "Şirket",
}

_EDA_SPEC = importlib.util.spec_from_file_location("drug_explorer_eda_helpers", Path(__file__).with_name("eda.py"))
_EDA = importlib.util.module_from_spec(_EDA_SPEC)
_EDA_SPEC.loader.exec_module(_EDA)

STOP_WORDS = {
    "and", "the", "for", "with", "oral", "tablet", "tablets", "capsule", "capsules",
    "injection", "solution", "extended", "release", "delayed", "sodium", "hydrochloride",
}


def normalize(value) -> str:
    if value is None or pd.isna(value):
        return ""
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def translated_frame(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.rename(columns=lambda column: FIELD_NAMES_TR.get(column, column)).copy()
    for column in result.select_dtypes(include=["object"]).columns:
        result[column] = result[column].map(lambda value: pd.NA if pd.isna(value) else str(value)).astype("string")
    for column in ["Durum", "Eşleşme dayanağı"]:
        if column in result:
            mapping = {"Current": "Güncel", "Resolved": "Çözüldü", "Identifier": "Kimlik bilgisi", "Identifier + name": "Kimlik bilgisi + ad", "Name token": "Ad benzerliği"}
            result[column] = result[column].replace(mapping)
    return result


def values(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if isinstance(value, str):
        return [value] if value.strip() else []
    return [str(value)]


def make_entity(source: str, names: list, ndcs: list, applications: list, fields: dict) -> dict:
    names = list(dict.fromkeys(str(name).strip() for name in names if name and str(name).strip()))
    ndcs = list(dict.fromkeys(str(item).strip() for item in ndcs if item and str(item).strip()))
    applications = list(dict.fromkeys(str(item).strip() for item in applications if item and str(item).strip()))
    name_norm = " | ".join(normalize(name) for name in names)
    tokens = sorted(
        {
            token
            for name in names
            for token in normalize(name).split()
            if len(token) >= 4 and token not in STOP_WORDS and not token.isdigit()
        }
    )
    return {
        "Source": source,
        **fields,
        "_names": names,
        "_name_norm": name_norm,
        "_tokens": " | ".join(tokens),
        "_ndcs": " | ".join(re.sub(r"[^0-9-]", "", code) for code in ndcs),
        "_applications": " | ".join(normalize(code).replace(" ", "") for code in applications),
        "_search": normalize(" ".join(names + ndcs + applications + [str(x) for x in fields.values() if x is not None])),
    }


@st.cache_data(show_spinner="Loading FDA drug products…")
def load_fda_entities(datasets_dir: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "DrugsFDA" / "drugs.json"
    with path.open(encoding="utf-8") as stream:
        payload = json.load(stream)
    rows = []
    for application in payload.get("results", []):
        app_number = application.get("application_number", "")
        openfda = application.get("openfda") or {}
        app_ids = values(app_number) + values(openfda.get("application_number"))
        common_names = values(openfda.get("brand_name")) + values(openfda.get("generic_name"))
        ndcs = values(openfda.get("product_ndc")) + values(openfda.get("package_ndc"))
        products = application.get("products") or [{}]
        for product in products:
            ingredients = [item.get("name", "") for item in (product.get("active_ingredients") or [])]
            names = values(product.get("brand_name")) + ingredients + common_names
            fields = {
                "Drug / product": product.get("brand_name") or (ingredients[0] if ingredients else "Unnamed FDA product"),
                "Generic ingredient": "; ".join(dict.fromkeys(x for x in ingredients if x)) or "; ".join(common_names),
                "Brand name": product.get("brand_name", ""),
                "Application": app_number,
                "Sponsor": application.get("sponsor_name", ""),
                "Manufacturer / labeler": ", ".join(values(openfda.get("manufacturer_name"))),
                "Product type": ", ".join(values(openfda.get("product_type"))),
                "Dosage form": product.get("dosage_form", ""),
                "Route": product.get("route", ""),
                "Product number": product.get("product_number", ""),
                "NDCs": ", ".join(ndcs[:8]),
                "RxCUI": ", ".join(values(openfda.get("rxcui"))),
                "SPL ID": ", ".join(values(openfda.get("spl_id"))),
                "SPL Set ID": ", ".join(values(openfda.get("spl_set_id"))),
                "UNII": ", ".join(values(openfda.get("unii"))),
                "Pharmaceutical classification": ", ".join(values(openfda.get("pharm_class_epc")) + values(openfda.get("pharm_class_cs")) + values(openfda.get("pharm_class_moa"))),
            }
            entity = make_entity("FDA Drugs", names, ndcs, app_ids, fields)
            entity["_raw_application"] = application
            entity["_raw_product"] = product
            rows.append(entity)
    return pd.DataFrame(rows)


@st.cache_data(show_spinner="Loading FDA shortage records…")
def load_shortage_entities(datasets_dir: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "DrugsFDA" / "drug-shortages.json"
    with path.open(encoding="utf-8") as stream:
        records = json.load(stream).get("results", [])
    rows = []
    for item in records:
        openfda = item.get("openfda") or {}
        names = values(item.get("generic_name")) + values(item.get("presentation"))
        names += values(openfda.get("brand_name")) + values(openfda.get("generic_name"))
        ndcs = values(item.get("package_ndc")) + values(openfda.get("package_ndc")) + values(openfda.get("product_ndc"))
        apps = values(openfda.get("application_number"))
        fields = {
            "Drug / product": item.get("generic_name") or item.get("presentation", "Unknown drug"),
            "Brand name": ", ".join(values(openfda.get("brand_name"))),
            "Status": item.get("status", ""),
            "Availability": item.get("availability", ""),
            "Company": item.get("company_name", ""),
            "Shortage reason": item.get("shortage_reason", ""),
            "Therapeutic category": ", ".join(values(item.get("therapeutic_category"))),
            "Dosage form": item.get("dosage_form", ""),
            "Presentation": item.get("presentation", ""),
            "Updated": item.get("update_date", ""),
            "Initial posting date": item.get("initial_posting_date", ""),
            "Changed": item.get("change_date", ""),
            "Discontinued": item.get("discontinued_date", ""),
            "NDC": item.get("package_ndc", ""),
            "Application": ", ".join(apps),
            "Contact information": item.get("contact_info", ""),
            "Related information": item.get("related_info", ""),
            "Related information link": item.get("related_info_link", ""),
            "Resolved note": item.get("resolved_note", ""),
        }
        entity = make_entity("Drug Shortages", names, ndcs, apps, fields)
        entity["_raw_record"] = item
        rows.append(entity)
    return pd.DataFrame(rows)


@st.cache_data(show_spinner="Loading VA contract records…")
def load_va_entities(datasets_dir: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "VA National Pharma Contracts" / "va_national_phamara_contracts.csv"
    source = pd.read_csv(path, low_memory=False, dtype=str).fillna("")
    rows = []
    for item in source.to_dict("records"):
        fields = {
            "Drug / product": item.get("Generic Name") or item.get("Trade Name", "Unknown drug"),
            "Generic name": item.get("Generic Name", ""),
            "Trade name": item.get("Trade Name", ""),
            "Vendor": item.get("Vendor", ""),
            "Contract number": item.get("Contract Number", ""),
            "Prime Vendor": item.get("PV", ""),
            "Package": item.get("PKG", ""),
            "NDC": item.get("NDC", ""),
            "FSS price": item.get("FSS Price", ""),
            "NC price": item.get("NC Price", ""),
            "Big 4 price": item.get("Big 4 Price", ""),
            "VA Class": item.get("VA Class", ""),
            **{key: value for key, value in item.items() if key not in {"NDC", "Generic Name", "Trade Name", "Vendor", "Contract Number", "PV", "PKG", "FSS Price", "NC Price", "Big 4 Price"}},
        }
        entity = make_entity("VA Contracts", [fields["Generic name"], fields["Trade name"]], [fields["NDC"]], [], fields)
        entity["_raw_record"] = item
        rows.append(entity)
    return pd.DataFrame(rows)


@st.cache_data(show_spinner="Loading NDC product records…")
def load_ndc_entities(datasets_dir: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "National Drug Code Directory" / "product.txt"
    source = pd.read_csv(path, sep="\t", encoding="latin1", low_memory=False, dtype=str).fillna("")
    rows = []
    for item in source.to_dict("records"):
        fields = {
            "Drug / product": item.get("PROPRIETARYNAME") or item.get("NONPROPRIETARYNAME", "Unknown drug"),
            "Generic name": item.get("NONPROPRIETARYNAME", ""),
            "Brand name": item.get("PROPRIETARYNAME", ""),
            "Application": item.get("APPLICATIONNUMBER", ""),
            "Labeler": item.get("LABELERNAME", ""),
            "Dosage form": item.get("DOSAGEFORMNAME", ""),
            "Route": item.get("ROUTENAME", ""),
            "Product NDC": item.get("PRODUCTNDC", ""),
            "Product type": item.get("PRODUCTTYPENAME", ""),
            **item,
        }
        names = [fields["Generic name"], fields["Brand name"], item.get("SUBSTANCENAME", "")]
        entity = make_entity("NDC Products", names, [fields["Product NDC"]], [fields["Application"]], fields)
        entity["_raw_record"] = item
        rows.append(entity)
    return pd.DataFrame(rows)


@st.cache_data(show_spinner="Loading NDC package records…")
def load_ndc_package_entities(datasets_dir: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "National Drug Code Directory" / "package.txt"
    source = pd.read_csv(path, sep="\t", encoding="latin1", low_memory=False, dtype=str).fillna("")
    product_path = Path(datasets_dir) / "National Drug Code Directory" / "product.txt"
    products = pd.read_csv(product_path, sep="\t", encoding="latin1", low_memory=False, dtype=str).fillna("")
    product_lookup = products.drop_duplicates("PRODUCTID").set_index("PRODUCTID")
    rows = []
    for item in source.to_dict("records"):
        product = product_lookup.loc[item["PRODUCTID"]].to_dict() if item.get("PRODUCTID") in product_lookup.index else {}
        fields = {
            "Drug / product": product.get("PROPRIETARYNAME") or product.get("NONPROPRIETARYNAME", "Unknown drug"),
            "Generic name": product.get("NONPROPRIETARYNAME", ""),
            "Brand name": product.get("PROPRIETARYNAME", ""),
            "Package NDC": item.get("NDCPACKAGECODE", ""),
            "Product NDC": item.get("PRODUCTNDC") or product.get("PRODUCTNDC", ""),
            "Package description": item.get("PACKAGEDESCRIPTION", ""),
            "Labeler": product.get("LABELERNAME", ""),
            "Dosage form": product.get("DOSAGEFORMNAME", ""),
            "Route": product.get("ROUTENAME", ""),
            "Application": product.get("APPLICATIONNUMBER", ""),
            **item,
        }
        names = [fields["Generic name"], fields["Brand name"], product.get("SUBSTANCENAME", "")]
        entity = make_entity("NDC Packages", names, [fields["Package NDC"], fields["Product NDC"]], [fields["Application"]], fields)
        entity["_raw_record"] = item
        entity["_raw_product"] = product
        rows.append(entity)
    return pd.DataFrame(rows)


@st.cache_data(show_spinner="Indexing Medicare Part D drug names…")
def load_medicare_entities(datasets_dir: str) -> pd.DataFrame:
    folder = Path(datasets_dir) / "Medicare Part D Spending by Drug-Excel Reports including Historical Data RY26"
    paths = sorted(folder.glob("Medicare Part D Spending by Drug DYT*/*.xlsx"))
    rows = []
    for path in paths:
        match = re.search(r"DYT(\d{4})", path.parent.name)
        year = int(match.group(1)) if match else ""
        frame, _ = _EDA.load_medicare(str(path))
        brand = next((col for col in frame.columns if "brand name" in col.lower()), None)
        generic = next((col for col in frame.columns if "generic name" in col.lower()), None)
        spending_cols = [col for col in frame.columns if col.lower().startswith("total spending")]
        spending_col = spending_cols[-1] if spending_cols else None
        if brand is None and generic is None:
            continue
        for _, record in frame.iterrows():
            brand_name = str(record.get(brand, "")) if brand else ""
            generic_name = str(record.get(generic, "")) if generic else ""
            spending = record.get(spending_col, "") if spending_col else ""
            fields = {
                "Drug / product": brand_name or generic_name,
                "Brand name": brand_name,
                "Generic name": generic_name,
                "Report year": year,
                "Spending (latest year in report)": spending,
                **record.to_dict(),
            }
            entity = make_entity("Medicare Part D", [brand_name, generic_name], [], [], fields)
            entity["_raw_record"] = record.to_dict()
            rows.append(entity)
    return pd.DataFrame(rows)


def search_entities(frame: pd.DataFrame, query: str, limit: int = 150) -> pd.DataFrame:
    if frame.empty:
        return frame
    normalized_query = normalize(query)
    if not normalized_query:
        return frame.head(0)
    mask = frame["_search"].str.contains(re.escape(normalized_query), case=False, na=False)
    if not mask.any():
        # Search all query tokens when punctuation or dosage text differs by source.
        tokens = [token for token in normalized_query.split() if len(token) >= 3]
        if tokens:
            mask = pd.Series(True, index=frame.index)
            for token in tokens:
                mask &= frame["_search"].str.contains(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", case=False, na=False)
    return frame.loc[mask].head(limit).copy()


def link_matches(frame: pd.DataFrame, anchor: pd.Series) -> pd.DataFrame:
    if frame.empty:
        return frame
    id_mask = pd.Series(False, index=frame.index)
    ndc_ids = [item for item in str(anchor.get("_ndcs", "")).split(" | ") if item]
    for ndc in ndc_ids:
        pattern = rf"(?:^| \| ){re.escape(ndc)}(?:-[0-9]+)?(?: \| |$)"
        id_mask |= frame["_ndcs"].str.contains(pattern, regex=True, na=False)
    app_ids = [item for item in str(anchor.get("_applications", "")).split(" | ") if item]
    for app in app_ids:
        pattern = rf"(?:^| \| ){re.escape(app)}(?: \| |$)"
        id_mask |= frame["_applications"].str.contains(pattern, regex=True, na=False)

    anchor_tokens = [
        token for token in str(anchor.get("_tokens", "")).split(" | ")
        if token and token not in STOP_WORDS
    ]
    name_mask = pd.Series(False, index=frame.index)
    # Longest specific name tokens make cross-source discovery useful despite added strengths/forms.
    for token in sorted(anchor_tokens, key=len, reverse=True)[:3]:
        name_mask |= frame["_tokens"].str.contains(rf"(?:^| \| ){re.escape(token)}(?: \| |$)", regex=True, na=False)
    matched = frame.loc[id_mask | name_mask].copy()
    matched.insert(0, "Match basis", ["Identifier + name" if i in frame.index[id_mask & name_mask] else "Identifier" if id_mask.loc[i] else "Name token" for i in matched.index])
    return matched


def display_matches(frame: pd.DataFrame, max_rows: int = 50, key: str = "matches") -> None:
    if frame.empty:
        st.info("Bu seçimle ilişkili kaynak kaydı bulunamadı.")
        return
    hidden = {"_names", "_name_norm", "_tokens", "_ndcs", "_applications", "_search", "Source"}
    visible = [column for column in frame.columns if column not in hidden and not column.startswith("_")]
    st.caption(f"{len(frame):,} olası bağlantılı kayıt. Ad benzerliğine dayalı sonuçlar öneridir; kimlik bilgilerini ve ürün ayrıntılarını kontrol edin.")
    output = frame[visible].head(max_rows).copy()
    output = output.replace({None: "Mevcut değil", "": "Mevcut değil", "Not available": "Mevcut değil", "No matching record": "Eşleşen kayıt yok"}).fillna("Mevcut değil")
    for column in output.columns:
        output[column] = output[column].map(str).astype("string")
    output = translated_frame(output)
    st.dataframe(output, use_container_width=True, hide_index=True)
    st.download_button(
        "Eşleşen satırları CSV olarak indir",
        frame[visible].to_csv(index=False).encode("utf-8-sig"),
        file_name=f"{key}_matches.csv",
        mime="text/csv",
        key=f"export_{key}",
    )
    if len(frame) > max_rows:
        st.caption(f"İlk {max_rows} eşleşme gösteriliyor.")


def flatten_raw(value, prefix: str = "") -> list[dict]:
    rows = []
    if isinstance(value, dict):
        for key, item in value.items():
            field = f"{prefix}.{key}" if prefix else str(key)
            rows.extend(flatten_raw(item, field))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            rows.extend(flatten_raw(item, f"{prefix}[{index}]"))
    else:
        rows.append({"Original field": prefix, "Value": "Mevcut değil" if value is None or (isinstance(value, float) and pd.isna(value)) else str(value)})
    return rows


def show_raw_fields(record, source_name: str, key: str) -> None:
    if not isinstance(record, dict):
        return
    with st.expander(f"Ham / ayrıntılı alanlar · {SOURCE_NAMES_TR.get(source_name, source_name)}"):
        details = flatten_raw(record)
        if not details:
            st.info("Bu kayıt için ham alan bulunamadı.")
            return
        frame = pd.DataFrame(details)
        frame.insert(0, "Kaynak veri kümesi", SOURCE_NAMES_TR.get(source_name, source_name))
        frame["Anlaşılır alan adı"] = frame["Original field"].map(lambda name: name.replace(".", " · ").replace("_", " ").replace("[", " ").replace("]", ""))
        frame = frame.rename(columns={"Original field": "Kaynak alanın özgün adı", "Value": "Değer"})
        st.dataframe(frame[["Kaynak veri kümesi", "Kaynak alanın özgün adı", "Anlaşılır alan adı", "Değer"]], use_container_width=True, hide_index=True)
        field_name = st.selectbox("Kopyalanacak alan değerini seçin", frame["Kaynak alanın özgün adı"].tolist(), key=f"copy_{key}")
        value = frame.loc[frame["Kaynak alanın özgün adı"] == field_name, "Değer"].iloc[0]
        st.code(value, language=None)
        st.download_button(
            "Bu kaynak kaydını CSV olarak indir",
            pd.DataFrame(details).to_csv(index=False).encode("utf-8-sig"),
            file_name=f"{key}_raw_record.csv",
            mime="text/csv",
            key=f"download_{key}",
        )


def show_linked_raw_records(frame: pd.DataFrame, source_name: str, key: str, limit: int = 50) -> None:
    """Make complete original source records available for every linked result."""
    if frame.empty:
        return
    with st.expander(f"Kaynağın tüm kayıt ayrıntıları · {SOURCE_NAMES_TR.get(source_name, source_name)}"):
        st.caption("Kaynak alan adları ve değerleri korunur. İç içe FDA alanları düzleştirilmiş alan yollarıyla gösterilir.")
        candidates = frame.head(limit)
        labels = []
        for number, (_, row) in enumerate(candidates.iterrows(), start=1):
            title = row.get("Drug / product", f"Record {number}")
            identifier = row.get("NDC", row.get("Product NDC", row.get("Application", "")))
            suffix = f" · {identifier}" if identifier is not None and str(identifier).strip() and str(identifier) != "nan" else ""
            labels.append(f"{number}. {title}{suffix}")
        selected_index = st.selectbox("Bağlantılı kaynak kaydını seçin", range(len(candidates)), format_func=lambda i: labels[i], key=f"raw_link_{key}")
        row = candidates.iloc[selected_index]
        record = row.get("_raw_record")
        if not isinstance(record, dict):
            record = row.get("_raw_application")
        product = row.get("_raw_product")
        parts = flatten_raw(record) if isinstance(record, dict) else []
        if isinstance(product, dict) and product:
            parts.extend(flatten_raw(product, "related_product"))
        if not parts:
            parts = flatten_raw(row[[column for column in row.index if not column.startswith("_")]].to_dict())
        details = pd.DataFrame(parts)
        details.insert(0, "Kaynak veri kümesi", SOURCE_NAMES_TR.get(source_name, source_name))
        details["Anlaşılır alan adı"] = details["Original field"].map(
            lambda name: name.replace(".", " · ").replace("_", " ").replace("[", " ").replace("]", "")
        )
        details = details.rename(columns={"Original field": "Kaynak alanın özgün adı", "Value": "Değer"})
        st.dataframe(details[["Kaynak veri kümesi", "Kaynak alanın özgün adı", "Anlaşılır alan adı", "Değer"]], use_container_width=True, hide_index=True)
        st.download_button(
            "Seçili bağlantılı kaydı dışa aktar",
            details.to_csv(index=False).encode("utf-8-sig"),
            file_name=f"{key}_linked_record.csv",
            mime="text/csv",
            key=f"raw_export_{key}",
        )
        if len(frame) > limit:
            st.caption(f"{len(frame):,} bağlantılı kaydın ilk {limit} tanesinin ayrıntıları gösteriliyor.")


def render(st, context):
    datasets_dir = Path(context.get("project_root", Path(__file__).resolve().parents[2])) / "Datasets"
    if not datasets_dir.is_dir():
        datasets_dir = _EDA.resolve_datasets_dir(context)

    st.title("🔎 İlaç İnceleyici")
    st.write("Bir kaynaktaki ilacı arayın ve FDA, tedarik sıkıntısı, VA, NDC ve Medicare Part D kayıtlarındaki olası bağlantıları izleyin.")

    store = context.get("data_store")
    use_sqlite = store is not None and store.ready()
    if use_sqlite:
        source_frames = {}
        source_options = ["FDA Drugs", "Drug Shortages", "VA Contracts", "NDC Products", "NDC Packages", "CMS Medicare Part D"]
        source_counts = store.counts()
    else:
        source_frames = {
            "FDA Drugs": load_fda_entities(str(datasets_dir)),
            "Drug Shortages": load_shortage_entities(str(datasets_dir)),
            "VA Contracts": load_va_entities(str(datasets_dir)),
            "NDC Products": load_ndc_entities(str(datasets_dir)),
            "NDC Packages": load_ndc_package_entities(str(datasets_dir)),
        }
        source_options = [*source_frames, "Medicare Part D"]
        source_counts = {name: len(frame) for name, frame in source_frames.items()}
        source_counts["CMS Medicare Part D"] = 0
    with st.expander("CMS Medicare Part D içinde ara", expanded=False):
        medicare_query = st.text_input("İlaç adı", key="medicare_direct_query", placeholder="Marka veya jenerik ad yazın")
        if medicare_query.strip():
            medicare_frame = store.search("CMS Medicare Part D", medicare_query, limit=100) if use_sqlite else search_entities(load_medicare_entities(str(datasets_dir)), medicare_query, limit=100)
            display_matches(medicare_frame, max_rows=100, key="cms_direct_search")

    col_a, col_b = st.columns([1, 2])
    with col_a:
        start_source = st.selectbox("Aramaya başla", source_options, format_func=lambda value: SOURCE_NAMES_TR.get(value, value), key="drug_explorer_source")
    with col_b:
        query = st.text_input("İlaç adı, marka, başvuru numarası veya NDC ile ara", key="drug_explorer_query", placeholder="Örnek: levothyroxine, Naropin, NDA020533")

    if not query.strip():
        st.info("Kayıt bulmak için arama terimi girin. FDA ilaç kayıtlarından, tedarik sıkıntılarından, VA sözleşmelerinden veya NDC ürün/paket kayıtlarından başlayabilirsiniz.")
        summary_cols = st.columns(len(source_options))
        for col, name in zip(summary_cols, source_options):
            col.metric(SOURCE_NAMES_TR.get(name, name), f"{source_counts.get(name, 0):,}")
        return

    if use_sqlite:
        matches = store.search(start_source, query, limit=200)
    else:
        if start_source == "Medicare Part D":
            source_frames[start_source] = load_medicare_entities(str(datasets_dir))
        matches = search_entities(source_frames[start_source], query)
    if matches.empty:
        st.warning(f"**{query}** için {SOURCE_NAMES_TR.get(start_source, start_source)} kaydı eşleşmedi. Jenerik adı, marka adını, NDC'yi veya başvuru numarasını deneyin.")
        return

    def label_for(index):
        row = matches.iloc[index]
        product = row.get("Drug / product", "Drug")
        generic = row.get("Generic ingredient", row.get("Generic name", ""))
        identifier = row.get("Application", row.get("NDC", row.get("Product NDC", "")))
        return " · ".join(dict.fromkeys(str(value) for value in [product, generic, identifier] if value and str(value) != "nan"))

    selection = st.selectbox(
        f"{SOURCE_NAMES_TR.get(start_source, start_source)} kaydını seçin ({len(matches):,} sonuç)",
        options=list(range(len(matches))),
        format_func=label_for,
        key="drug_explorer_selection",
    )
    anchor = matches.iloc[selection]
    related = {}
    if use_sqlite:
        for source_name in source_options:
            if source_name != start_source:
                related[source_name] = store.related(source_name, anchor)
    else:
        medicare_frame = source_frames.get("Medicare Part D")
        if medicare_frame is None:
            medicare_frame = load_medicare_entities(str(datasets_dir))
            source_frames["Medicare Part D"] = medicare_frame
        for source_name, frame in source_frames.items():
            if source_name != start_source:
                related[source_name] = link_matches(frame, anchor)

    st.markdown("### Birleşik ilaç profili")
    overview_fields = [
        ("Drug / product", anchor.get("Drug / product")),
        ("Generic name", anchor.get("Generic ingredient", anchor.get("Generic name"))),
        ("Brand name", anchor.get("Brand name", anchor.get("Trade name"))),
        ("Manufacturer", anchor.get("Manufacturer / labeler", anchor.get("Manufacturer", anchor.get("Sponsor", anchor.get("Labeler"))))),
        ("Vendor", anchor.get("Vendor")),
        ("NDC", anchor.get("Product NDC", anchor.get("NDC"))),
        ("Package NDC", anchor.get("Package NDC", anchor.get("NDC"))),
        ("Application number", anchor.get("Application")),
        ("Route", anchor.get("Route")),
        ("Dosage form", anchor.get("Dosage form")),
    ]
    st.dataframe(
        pd.DataFrame([{"Alan": FIELD_NAMES_TR.get(name, name), "Değer": value if value is not None and str(value).strip() else "Mevcut değil", "Kaynak": SOURCE_NAMES_TR.get(start_source, start_source)} for name, value in overview_fields]),
        use_container_width=True,
        hide_index=True,
    )

    shortage_catalog = source_frames.get("Drug Shortages", pd.DataFrame())
    shortage_matches = store.related("Drug Shortages", anchor) if use_sqlite and start_source != "Drug Shortages" else link_matches(shortage_catalog, anchor) if not use_sqlite else pd.DataFrame()
    if shortage_matches.empty and start_source == "Drug Shortages":
        shortage_matches = matches.iloc[[selection]].copy()
    if start_source == "Drug Shortages":
        related["Drug Shortages"] = shortage_matches
    current_shortages = shortage_matches[shortage_matches.get("Status", pd.Series(dtype=str)).astype(str).str.lower().eq("current")] if not shortage_matches.empty else pd.DataFrame()
    cms_matches = related.get("CMS Medicare Part D", related.get("Medicare Part D", pd.DataFrame()))
    va_matches = related.get("VA Contracts", pd.DataFrame())
    latest_cms = cms_matches.sort_values("Report year").tail(1) if not cms_matches.empty and "Report year" in cms_matches else pd.DataFrame()
    price_values = []
    if not va_matches.empty:
        for col in ["FSS price", "NC price", "Big 4 price"]:
            if col in va_matches:
                price_values.extend(pd.to_numeric(va_matches[col].astype(str).str.replace(r"[$,]", "", regex=True), errors="coerce").dropna().tolist())
    duration = "Mevcut değil"
    if not current_shortages.empty and "Initial posting date" in current_shortages:
        starts = pd.to_datetime(current_shortages["Initial posting date"], errors="coerce").dropna()
        if not starts.empty:
            duration = f"{max(0, (pd.Timestamp(date.today()) - starts.min()).days):,} days (from first listed posting)"
    min_va_price = min(price_values) if price_values else None
    summary_cols = st.columns(8)
    summary_cols[0].metric("Tedarik sıkıntısı durumu", "Güncel" if not current_shortages.empty else "Eşleşen kayıt yok" if shortage_matches.empty else "Güncel sıkıntı yok")
    summary_cols[1].metric("Tedarik sıkıntısı süresi", duration.replace("days (from first listed posting)", "gün (ilk yayın tarihinden itibaren)"))
    summary_cols[2].metric("Tedarik sıkıntısı kayıtları", f"{len(shortage_matches):,}" if not shortage_matches.empty else "Eşleşen kayıt yok")
    summary_cols[3].metric("CMS Part D reçete talepleri", str(latest_cms.iloc[0].get("Total Claims", "Mevcut değil")) if not latest_cms.empty else "Eşleşen kayıt yok")
    summary_cols[4].metric("CMS harcaması", f"${float(latest_cms.iloc[0].get('Spending (latest year in report)', 0)):,.0f}" if not latest_cms.empty and pd.notna(latest_cms.iloc[0].get("Spending (latest year in report)")) else "Mevcut değil")
    summary_cols[5].metric("En düşük VA sözleşme fiyatı", f"${min_va_price:,.2f}" if min_va_price is not None else "Eşleşen kayıt yok")
    summary_cols[6].metric("Üretici", str(anchor.get("Manufacturer / labeler", anchor.get("Company", anchor.get("Sponsor", "Mevcut değil"))))[:32])
    summary_cols[7].metric("VA tedarikçi sayısı", str(va_matches["Vendor"].replace("", pd.NA).dropna().nunique()) if not va_matches.empty and "Vendor" in va_matches else "Eşleşen kayıt yok")

    match_status = []
    for source_name, frame in related.items():
        if frame.empty:
            status = "Eşleşme yok"
        elif "Match basis" in frame and frame["Match basis"].astype(str).str.contains("Identifier", case=False).any():
            status = "Kimlik bilgisiyle eşleşti"
        else:
            status = "Olası bağlantı · NDC / başvuru / ad"
        match_status.append({"Veri kümesi": SOURCE_NAMES_TR.get(source_name, source_name), "Eşleşme durumu": status, "Kayıt sayısı": len(frame)})
    st.markdown("#### Veri kümeleri arası eşleşme durumu")
    st.dataframe(pd.DataFrame(match_status), use_container_width=True, hide_index=True)

    st.markdown("### Veri kümeleri arasındaki olası bağlantılar")
    match_tabs = st.tabs([SOURCE_NAMES_TR.get(source, source) for source in related])
    for tab, (source_name, frame) in zip(match_tabs, related.items()):
        with tab:
            st.subheader(SOURCE_NAMES_TR.get(source_name, source_name))
            if source_name == "Drug Shortages" and not frame.empty:
                history = frame.copy()
                history["Date"] = pd.to_datetime(history.get("Updated"), errors="coerce")
                history_table = pd.DataFrame(
                    {
                        "Tarih": history["Date"],
                        "Durum": history.get("Status", "").replace({"Current": "Güncel", "Resolved": "Çözüldü"}),
                        "Neden": history.get("Shortage reason", ""),
                        "Bulunabilirlik": history.get("Availability", ""),
                        "Üretici": history.get("Company", ""),
                    }
                ).sort_values("Tarih", ascending=False)
                st.markdown("#### Tedarik sıkıntısı geçmişi")
                st.dataframe(history_table, use_container_width=True, hide_index=True)
                if history["Date"].notna().any():
                    timeline = history.dropna(subset=["Date"]).groupby("Date").size().sort_index()
                    st.markdown("#### Tedarik sıkıntısı güncellemelerinin zaman çizelgesi")
                    st.line_chart(timeline)
            display_matches(frame, key=normalize(source_name).replace(" ", "_"))
            show_linked_raw_records(frame, source_name, normalize(source_name).replace(" ", "_"))

    raw_application = anchor.get("_raw_application")
    raw_product = anchor.get("_raw_product")
    if isinstance(raw_application, dict):
        with st.expander("FDA Drugs@FDA · yapılandırılmış ürün ve başvuru bilgileri"):
            product_rows = []
            for product in raw_application.get("products", []):
                ingredients = product.get("active_ingredients") or []
                product_rows.append(
                    {
                        "Ürün numarası": product.get("product_number", "Mevcut değil"),
                        "Marka": product.get("brand_name", "Mevcut değil"),
                        "Etken maddeler": "; ".join(i.get("name", "") for i in ingredients) or "Mevcut değil",
                        "Doz": "; ".join(i.get("strength", "") for i in ingredients) or "Mevcut değil",
                        "Farmasötik biçim": product.get("dosage_form", "Mevcut değil"),
                        "Uygulama yolu": product.get("route", "Mevcut değil"),
                        "Pazarlama durumu": product.get("marketing_status", "Mevcut değil"),
                        "Referans ilaç": product.get("reference_drug", "Mevcut değil"),
                    }
                )
            st.markdown("**Ürünler**")
            if product_rows:
                st.dataframe(pd.DataFrame(product_rows), use_container_width=True, hide_index=True)
            submissions = raw_application.get("submissions", [])
            st.markdown("**Düzenleyici işlemler**")
            if submissions:
                st.dataframe(pd.json_normalize(submissions, sep="."), use_container_width=True, hide_index=True)
            openfda = raw_application.get("openfda")
            if openfda:
                st.markdown("**Drugs@FDA kimlikleri ve sınıflandırmaları**")
                st.dataframe(pd.DataFrame(flatten_raw(openfda)).rename(columns={"Original field": "Kaynak alanın özgün adı", "Value": "Değer"}), use_container_width=True, hide_index=True)
            show_raw_fields(raw_application, "FDA Drugs@FDA", "fda_application")
    elif isinstance(anchor.get("_raw_record"), dict):
        source_label = start_source
        if start_source == "Drug Shortages":
            st.markdown("### FDA tedarik sıkıntısı bilgileri")
        show_raw_fields(anchor.get("_raw_record"), source_label, normalize(source_label).replace(" ", "_"))
        if isinstance(anchor.get("_raw_product"), dict) and anchor.get("_raw_product"):
            show_raw_fields(anchor.get("_raw_product"), "İlişkili NDC ürün kaydı", "ndc_package_product")

    profile_rows = []
    for source_name, frame in related.items():
        if not frame.empty:
            for _, row in frame.iterrows():
                record = row.get("_raw_record") or row.get("_raw_application") or row.to_dict()
                profile_rows.append({"Source": source_name, "Record": json.dumps(record, ensure_ascii=False, default=str)})
    if profile_rows:
        st.download_button(
            "Bağlantılı ilaç profilini indir (CSV)",
            pd.DataFrame(profile_rows).to_csv(index=False).encode("utf-8-sig"),
            file_name="linked_drug_profile.csv",
            mime="text/csv",
            key="download_unified_profile",
        )

    st.caption("Mevcutsa tam başvuru/NDC kimlikleri kullanılır; diğer sonuçlar ada göre önerilir. Önerilen eşleşmeyi kullanmadan önce kaynak kaydıyla doğrulayın.")
