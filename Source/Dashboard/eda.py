"""Integrated EDA page for the drug shortage decision support dashboard."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import streamlit as st

PAGE_TITLE = "Exploratory Data Analysis"
PAGE_ICON = "📊"

ROOT = Path(__file__).resolve().parents[2]
DATASETS = ROOT / "Datasets"
MEDICARE_DIR = DATASETS / "Medicare Part D Spending by Drug-Excel Reports including Historical Data RY26"

@st.cache_data(show_spinner="Loading VA contract data…")
def load_va() -> pd.DataFrame:
    path = DATASETS / "VA National Pharma Contracts" / "va_national_phamara_contracts.csv"
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path, low_memory=False)
    for col in [c for c in df.columns if "price" in c.lower()]:
        df[col] = pd.to_numeric(
            df[col].astype(str).str.replace(r"[$,]", "", regex=True).str.strip(), errors="coerce"
        )
    return df


@st.cache_data(show_spinner="Loading FDA records…")
def load_fda(filename: str) -> tuple[pd.DataFrame, list, dict]:
    path = DATASETS / "DrugsFDA" / filename
    if not path.exists():
        return pd.DataFrame(), [], {}
    with path.open(encoding="utf-8") as f:
        payload = json.load(f)
    records = payload.get("results", payload if isinstance(payload, list) else [])
    # Keep the row grain at one FDA record and serialize nested values so profiling
    # (duplicates/cardinality) works without exploding large arrays into columns.
    df = pd.DataFrame(records)
    for col in df.columns:
        if df[col].map(lambda value: isinstance(value, (dict, list))).any():
            df[col] = df[col].map(
                lambda value: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
            )
    return df, records, payload.get("meta", {}) if isinstance(payload, dict) else {}


@st.cache_data(show_spinner="Loading NDC records…")
def load_ndc(filename: str) -> pd.DataFrame:
    path = DATASETS / "National Drug Code Directory" / filename
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, sep="\t", encoding="latin1", low_memory=False, dtype=str)


@st.cache_data(show_spinner="Reading Medicare Part D annual reports…")
def load_medicare(path_string: str) -> tuple[pd.DataFrame, dict]:
    path = Path(path_string)
    excel = pd.ExcelFile(path)
    main_sheet = next(
        (s for s in excel.sheet_names if "spending" in s.lower() or "utilization" in s.lower()),
        excel.sheet_names[0],
    )
    raw = pd.read_excel(path, sheet_name=main_sheet, header=None)
    header_idx = next(
        (i for i in range(min(15, len(raw))) if raw.iloc[i].astype(str).str.contains("Brand Name", case=False, na=False).any()),
        None,
    )
    if header_idx is None:
        return pd.DataFrame(), {"sheets": excel.sheet_names, "main_sheet": main_sheet, "header": None}
    df = pd.read_excel(path, sheet_name=main_sheet, header=header_idx)
    df.columns = [str(c).replace("\n", " ").strip() for c in df.columns]
    df = df.dropna(how="all").copy()
    return df, {"sheets": excel.sheet_names, "main_sheet": main_sheet, "header": header_idx}


def show_profile(df: pd.DataFrame, label: str, key: str, include_preview: bool = True) -> None:
    if df.empty:
        st.warning(f"{label} data was not found or is empty.")
        return
    missing = int(df.isna().sum().sum())
    total = max(1, df.shape[0] * df.shape[1])
    a, b, c, d = st.columns(4)
    a.metric("Records", f"{len(df):,}")
    b.metric("Variables", f"{df.shape[1]:,}")
    c.metric("Duplicate rows", f"{int(df.duplicated().sum()):,}")
    d.metric("Missing cells", f"{missing:,} ({missing / total:.1%})")
    with st.expander(f"{label}: field and missing-value profile", expanded=False):
        quality = pd.DataFrame(
            {
                "Type": df.dtypes.astype(str),
                "Missing": df.isna().sum(),
                "Missing %": (df.isna().mean() * 100).round(1),
                "Distinct values": df.nunique(dropna=True),
            }
        ).sort_values("Missing %", ascending=False)
        st.dataframe(quality, use_container_width=True)
        if include_preview:
            st.caption("First 10 records")
            st.dataframe(df.head(10), use_container_width=True, hide_index=True)


def show_counts(df: pd.DataFrame, candidates: list[str], title: str, key: str) -> None:
    col = next((c for c in candidates if c in df.columns), None)
    if col is None:
        return
    counts = df[col].fillna("(Blank)").astype(str).value_counts().head(15)
    st.markdown(f"**{title}**")
    fig, ax = plt.subplots(figsize=(9, max(3, min(6, 0.28 * len(counts)))))
    counts.sort_values().plot(kind="barh", ax=ax, color="#168c8c")
    ax.set_xlabel("Record count")
    ax.set_ylabel("")
    fig.tight_layout()
    st.pyplot(fig, use_container_width=True)
    plt.close(fig)



def render(st, context):
    st.title("💊 Drug Supply Data | Exploratory Data Analysis")
    st.markdown(
        """<div class="intro"><b>Exploratory data analysis across all sources</b><br>
        FDA drug and shortage records, VA national contracts, the NDC product/package directory, and Medicare Part D's
        2016–2024 annual reports are analyzed below. Expand sections to inspect field profiles and sample records.
        Each section also links to its dedicated EDA notebook.</div>""",
        unsafe_allow_html=True,
    )

    notebook_names = {
        "drugs.json": "fda_drugs_applications_products_eda.ipynb",
        "drug-shortages.json": "fda_drug_shortages_eda.ipynb",
        "va_national_phamara_contracts.csv": "va_pharmaceutical_contracts_eda.ipynb",
        "product.txt": "ndc_product_directory_eda.ipynb",
        "package.txt": "ndc_package_directory_eda.ipynb",
    }

    st.header("1. FDA | Drug applications and products")
    fda_drugs, drug_records, _ = load_fda("drugs.json")
    show_profile(fda_drugs, "FDA Drugs", "fda-drugs")
    st.caption(f"Notebook: `Notebooks/{notebook_names['drugs.json']}`")
    if not fda_drugs.empty:
        p1, p2 = st.columns(2)
        with p1:
            show_counts(fda_drugs, ["sponsor_name"], "Most common sponsors", "sponsors")
        with p2:
            products = [p for record in drug_records for p in (record.get("products") or [])]
            submissions = [s for record in drug_records for s in (record.get("submissions") or [])]
            st.metric("Product records", f"{len(products):,}")
            st.metric("Submission records", f"{len(submissions):,}")
            if products:
                prod_df = pd.json_normalize(products, sep=".")
                show_counts(prod_df, ["brand_name", "brand_name_base", "dosage_form", "product_type"], "Product categories", "products")

    st.header("2. FDA | Drug shortages")
    shortages, _, _ = load_fda("drug-shortages.json")
    show_profile(shortages, "FDA Drug Shortages", "fda-shortages")
    st.caption(f"Notebook: `Notebooks/{notebook_names['drug-shortages.json']}`")
    if not shortages.empty:
        s1, s2 = st.columns(2)
        with s1:
            show_counts(shortages, ["status"], "Shortage status", "shortage-status")
        with s2:
            show_counts(shortages, ["availability"], "Availability", "shortage-availability")
        for col in ["initial_posting_date", "update_date"]:
            if col in shortages:
                dates = pd.to_datetime(shortages[col], errors="coerce")
                yearly = dates.dt.year.value_counts().sort_index()
                if not yearly.empty:
                    st.markdown(f"**{col} Records by year**")
                    st.bar_chart(yearly)

    st.header("3. VA | National pharmaceutical contracts")
    va = load_va()
    show_profile(va, "VA Pharma Contracts", "va-contracts")
    st.caption(f"Notebook: `Notebooks/{notebook_names['va_national_phamara_contracts.csv']}`")
    if not va.empty:
        left, right = st.columns(2)
        with left:
            show_counts(va, ["Vendor"], "Vendors with the most records", "va-vendor")
        with right:
            show_counts(va, ["Generic Name"], "Most common generic names", "va-generic")
        price_cols = [c for c in va if "price" in c.lower()]
        if price_cols:
            st.markdown("**Price fields – summary statistics**")
            st.dataframe(va[price_cols].describe().T, use_container_width=True)
        if "PV" in va:
            st.markdown("**Prime Vendor (PV) indicator**")
            st.dataframe(va["PV"].fillna("Blank").value_counts().rename_axis("PV").to_frame("Records"), use_container_width=True)

    st.header("4. NDC | Product and package directory")
    ndc_product = load_ndc("product.txt")
    ndc_package = load_ndc("package.txt")
    ndc_tabs = st.tabs(["Product records", "Package records"])
    with ndc_tabs[0]:
        show_profile(ndc_product, "NDC Product Directory", "ndc-product")
        st.caption(f"Notebook: `Notebooks/{notebook_names['product.txt']}`")
        if not ndc_product.empty:
            x, y = st.columns(2)
            with x:
                show_counts(ndc_product, ["PRODUCTTYPENAME"], "Product types", "ndc-product-type")
            with y:
                show_counts(ndc_product, ["MARKETINGCATEGORYNAME"], "Marketing categories", "ndc-marketing")
            show_counts(ndc_product, ["LABELERNAME"], "Labelers with the most product records", "ndc-labeler")
    with ndc_tabs[1]:
        show_profile(ndc_package, "NDC Package Directory", "ndc-package")
        st.caption(f"Notebook: `Notebooks/{notebook_names['package.txt']}`")
        if not ndc_package.empty:
            x, y = st.columns(2)
            with x:
                show_counts(ndc_package, ["NDC_EXCLUDE_FLAG"], "Exclusion indicator", "ndc-exclude")
            with y:
                show_counts(ndc_package, ["SAMPLE_PACKAGE"], "Sample package indicator", "ndc-sample")

    st.header("5. Medicare Part D | Annual spending and utilization (2016–2024)")
    medicare_files = sorted(MEDICARE_DIR.glob("Medicare Part D Spending by Drug DYT*/*.xlsx")) if MEDICARE_DIR.exists() else []
    medicare_rows = []
    if not medicare_files:
        st.warning("Medicare Part D Excel reports were not found.")
    for idx, path in enumerate(medicare_files):
        year_match = "".join(c for c in path.parent.name if c.isdigit())[-4:]
        try:
            df_year, info = load_medicare(str(path))
        except Exception as exc:
            st.error(f"{year_match} report could not be read: {exc}")
            continue
        st.subheader(f"Medicare Part D {year_match}")
        st.caption(f"File: `{path.name}` · Main sheet: {info.get('main_sheet')} · Sheets: {', '.join(info.get('sheets', []))}")
        name = "medicare_part_d_2016_2024_consolidated_eda.ipynb"
        st.caption(f"Notebook: `Notebooks/{name}`")
        show_profile(df_year, f"Medicare {year_match}", f"medicare-{year_match}", include_preview=False)
        if not df_year.empty:
            spend_cols = [c for c in df_year.columns if c.lower().startswith("total spending")]
            money_col = spend_cols[-1] if spend_cols else None
            if money_col:
                spending = pd.to_numeric(df_year[money_col], errors="coerce")
                med = {
                    "Year": int(year_match),
                    "Latest report-year spending": spending.sum(),
                    "Median drug spending": spending.median(),
                    "Spending records": int(spending.notna().sum()),
                    "Main sheet rows": len(df_year),
                }
                medicare_rows.append(med)
                m1, m2, m3 = st.columns(3)
                m1.metric(f"{year_match} total spending", f"${spending.sum():,.0f}")
                m2.metric("Drug records", f"{len(df_year):,}")
                m3.metric("Records with spending", f"{spending.notna().sum():,}")
                brand = next((c for c in df_year.columns if "brand name" in c.lower()), None)
                if brand:
                    top = pd.DataFrame({"Drug": df_year[brand], "Spending": spending}).nlargest(10, "Spending")
                    st.dataframe(top, use_container_width=True, hide_index=True)
            with st.expander(f"{year_match} field profile and other worksheet samples"):
                quality = pd.DataFrame({"Type": df_year.dtypes.astype(str), "Missing": df_year.isna().sum(), "Missing %": (df_year.isna().mean()*100).round(1), "Distinct values": df_year.nunique()}).sort_values("Missing %", ascending=False)
                st.dataframe(quality, use_container_width=True)
                for sheet in info.get("sheets", []):
                    if sheet == info.get("main_sheet"):
                        continue
                    try:
                        other = pd.read_excel(path, sheet_name=sheet, nrows=8)
                        st.markdown(f"**{sheet}** — first 8 rows")
                        st.dataframe(other, use_container_width=True, hide_index=True)
                    except Exception as exc:
                        st.info(f"{sheet} sheet could not be displayed: {exc}")

    if medicare_rows:
        trend = pd.DataFrame(medicare_rows).sort_values("Year").set_index("Year")
        st.subheader("Total drug spending by report year")
        st.line_chart(trend["Latest report-year spending"])
        st.dataframe(trend.style.format({"Latest report-year spending": "${:,.0f}", "Median drug spending": "${:,.0f}"}), use_container_width=True)

    st.divider()
    st.caption("EDA results are descriptive. Sources use different definitions and time periods; validate key fields before integration or decision support.")
