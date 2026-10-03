"""Shared dashboard shell with automatic page discovery."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import streamlit as st

DASHBOARD_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DASHBOARD_DIR.parent.parent

st.set_page_config(
    page_title="İlaç Tedarik Karar Destek Sistemi",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded",
)
def discover_pages():
    """Load page modules that implement PAGE_TITLE, PAGE_ICON, and render()."""
    pages = []
    for path in sorted(DASHBOARD_DIR.glob("*.py")):
        if path.name == Path(__file__).name or path.name.startswith("_"):
            continue
        module_name = f"dashboard_page_{path.stem}"
        spec = importlib.util.spec_from_file_location(module_name, path)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if all(hasattr(module, attr) for attr in ("PAGE_TITLE", "PAGE_ICON", "render")):
            pages.append((module, path))
    return pages


pages = discover_pages()
if not pages:
    st.error("Pano sayfası bulunamadı.")
    st.stop()

labels = [f"{module.PAGE_ICON} {module.PAGE_TITLE}" for module, _ in pages]
page_by_title = {module.PAGE_TITLE: module for module, _ in pages}
drug_page = page_by_title.get("İlaç İnceleyici")

with st.sidebar.expander("🔍 Genel ilaç arama", expanded=False):
    global_query = st.text_input(
        "İlaç adı, NDC, başvuru no, üretici, tedarikçi, RxCUI veya SPL ID ara",
        key="global_drug_search",
        placeholder="İlaç adı veya kimlik bilgisi yazın",
    )
    if global_query.strip() and drug_page is not None:
        datasets_dir = PROJECT_ROOT / "Datasets"
        search_sources = {
            "FDA Drugs": drug_page.load_fda_entities(str(datasets_dir)),
            "Drug Shortages": drug_page.load_shortage_entities(str(datasets_dir)),
            "VA Contracts": drug_page.load_va_entities(str(datasets_dir)),
            "NDC Products": drug_page.load_ndc_entities(str(datasets_dir)),
            "NDC Packages": drug_page.load_ndc_package_entities(str(datasets_dir)),
            "CMS Medicare Part D": drug_page.load_medicare_entities(str(datasets_dir)),
        }
        source_labels = {
            "FDA Drugs": "FDA İlaç Kayıtları", "Drug Shortages": "FDA Tedarik Sıkıntıları",
            "VA Contracts": "VA Sözleşmeleri", "NDC Products": "NDC Ürünleri",
            "NDC Packages": "NDC Paketleri", "CMS Medicare Part D": "CMS Medicare Part D",
        }
        suggestions = []
        for source_name, source_frame in search_sources.items():
            found = drug_page.search_entities(source_frame, global_query, limit=8)
            for _, row in found.iterrows():
                identity = next(
                    (
                        row.get(col) for col in ["Application", "NDC", "Package NDC", "Product NDC", "Report year"]
                        if row.get(col) is not None and str(row.get(col)).strip() not in {"", "nan", "<NA>"}
                    ),
                    "",
                )
                drug_name = row.get("Drug / product")
                if drug_name is None or str(drug_name).strip() in {"", "nan", "<NA>"}:
                    drug_name = row.get("Generic name")
                if drug_name is None or str(drug_name).strip() in {"", "nan", "<NA>"}:
                    drug_name = "İlaç kaydı"
                label = f"{source_labels[source_name]} · {drug_name}" + (f" · {identity}" if identity else "")
                suggestions.append((label, source_name, str(drug_name)))
        if suggestions:
            labels_by_suggestion = [item[0] for item in suggestions]
            picked = st.selectbox("Eşleşen kayıtlar", labels_by_suggestion, key="global_drug_suggestion")
            if st.button("İlaç İnceleyici'de aç", use_container_width=True):
                _, source_name, drug_name = suggestions[labels_by_suggestion.index(picked)]
                st.session_state["drug_explorer_query"] = drug_name
                st.session_state["drug_explorer_source"] = source_name
                st.session_state["page_navigation"] = next(
                    label for label, (candidate, _) in zip(labels, pages) if candidate.PAGE_TITLE == "İlaç İnceleyici"
                )
                st.rerun()
        else:
            st.caption("Eşleşen kayıt bulunamadı.")

default_index = next((i for i, (module, _) in enumerate(pages) if module.PAGE_TITLE == "Keşifsel Veri Analizi"), 0)
if st.session_state.get("page_navigation") not in labels:
    st.session_state["page_navigation"] = labels[default_index]
selected = st.sidebar.radio("Sayfalar", labels, index=default_index, key="page_navigation")
module, _ = pages[labels.index(selected)]
module.render(st, {
    "project_root": PROJECT_ROOT,
    "dashboard_dir": DASHBOARD_DIR,
    "datasets_dir": PROJECT_ROOT / "Datasets",
    "data_services": drug_page,
})
