"""Side-by-side comparison of selected drugs across available sources."""

from __future__ import annotations

import pandas as pd
import streamlit as st

PAGE_TITLE = "İlaç Karşılaştırma"
PAGE_ICON = "⚖️"


def render(st, context):
    services = context["data_services"]
    root = str(context["datasets_dir"])
    st.title("⚖️ İlaç Karşılaştırma")
    st.write("Ürün kimliğini, tedarik sıkıntılarını, Medicare Part D ölçülerini ve VA tedarik bilgilerini yan yana karşılaştırın.")
    compare_sources = ["FDA Drugs", "Drug Shortages", "VA Contracts", "NDC Products", "NDC Packages"]
    source_names = {"FDA Drugs": "FDA İlaç Kayıtları", "Drug Shortages": "FDA Tedarik Sıkıntıları", "VA Contracts": "VA Sözleşmeleri", "NDC Products": "NDC Ürünleri", "NDC Packages": "NDC Paketleri"}
    source_name = st.selectbox("İlaçları hangi kaynaktan bulalım?", compare_sources, format_func=lambda value: source_names[value], key="compare_source")
    source_loaders = {
        "FDA Drugs": services.load_fda_entities,
        "Drug Shortages": services.load_shortage_entities,
        "VA Contracts": services.load_va_entities,
        "NDC Products": services.load_ndc_entities,
        "NDC Packages": services.load_ndc_package_entities,
    }
    catalog = source_loaders[source_name](root)
    query = st.text_input("Jenerik ad, marka, NDC veya başvuru numarası ara", key="compare_query")
    if not query.strip():
        st.info("Karşılaştırma listesini daraltmak için önce arama yapın. Ardından iki veya daha fazla kayıt seçebilirsiniz.")
        return
    results = services.search_entities(catalog, query, limit=200)
    if results.empty:
        st.warning("Aramayla eşleşen kayıt bulunamadı.")
        return
    options = list(range(len(results)))
    def label(index):
        row = results.iloc[index]
        name = row.get("Drug / product", "Drug")
        secondary = row.get("Generic ingredient", row.get("Generic name", ""))
        identifier = row.get("Application", row.get("NDC", row.get("Product NDC", "")))
        return " · ".join(str(value) for value in [name, secondary, identifier] if value and str(value) != "nan")
    chosen = st.multiselect("Karşılaştırılacak 2–5 kaydı seçin", options, format_func=label, max_selections=5, key="compare_records")
    if len(chosen) < 2:
        st.info("Karşılaştırma için en az iki kayıt seçin.")
        return

    other_sources = {
        "FDA Drugs": services.load_fda_entities(root),
        "Drug Shortages": services.load_shortage_entities(root),
        "VA Contracts": services.load_va_entities(root),
        "NDC Products": services.load_ndc_entities(root),
        "NDC Packages": services.load_ndc_package_entities(root),
        "Medicare Part D": services.load_medicare_entities(root),
    }
    entities = []
    for index in chosen:
        anchor = results.iloc[index]
        linked = {name: services.link_matches(frame, anchor) for name, frame in other_sources.items() if name != source_name}
        if source_name == "Drug Shortages":
            linked[source_name] = results.iloc[[index]]
        entities.append((anchor, linked))

    st.markdown("### Ürün kimliği")
    columns = st.columns(len(entities))
    compare_fields = ["Drug / product", "Generic ingredient", "Generic name", "Brand name", "Manufacturer / labeler", "Sponsor", "Vendor", "Application", "Product NDC", "NDC", "Dosage form", "Route"]
    for column, (anchor, _) in zip(columns, entities):
        values = []
        for field in compare_fields:
            value = anchor.get(field)
            if value is not None and str(value).strip() and str(value) != "nan":
                values.append({"Alan": services.FIELD_NAMES_TR.get(field, field), "Değer": str(value), "Kaynak": source_names[source_name]})
        with column:
            st.markdown(f"#### {anchor.get('Drug / product', 'Drug')}")
            st.dataframe(pd.DataFrame(values), use_container_width=True, hide_index=True)

    st.markdown("### Kaynaklar arası ölçüler")
    rows = []
    for anchor, linked in entities:
        name = anchor.get("Drug / product", "Drug")
        shortage = linked.get("Drug Shortages", pd.DataFrame())
        cms = linked.get("Medicare Part D", pd.DataFrame())
        va = linked.get("VA Contracts", pd.DataFrame())
        current = int(shortage.get("Status", pd.Series(dtype=str)).astype(str).str.lower().eq("current").sum()) if not shortage.empty else 0
        latest = cms.sort_values("Report year").tail(1) if not cms.empty else pd.DataFrame()
        rows.append({
            "Selected drug": name,
            "Shortage records": len(shortage),
            "Current shortage records": current,
            "Shortage reasons": "; ".join(shortage.get("Shortage reason", pd.Series(dtype=str)).dropna().astype(str).unique()[:4]),
            "CMS latest report year": latest.iloc[0].get("Report year", "Mevcut değil") if not latest.empty else "Eşleşen kayıt yok",
            "CMS spending": latest.iloc[0].get("Spending (latest year in report)", "Eşleşen kayıt yok") if not latest.empty else "Eşleşen kayıt yok",
            "CMS claims": latest.iloc[0].get("Total Claims", "Mevcut değil") if not latest.empty else "Eşleşen kayıt yok",
            "VA vendors": va.get("Vendor", pd.Series(dtype=str)).replace("", pd.NA).dropna().nunique() if not va.empty else 0,
            "VA contract records": len(va),
            "VA FSS prices": "; ".join(va.get("FSS price", pd.Series(dtype=str)).dropna().astype(str).head(3)) if not va.empty else "Eşleşen kayıt yok",
        })
    comparison = pd.DataFrame(rows).T.rename_axis("Ölçüt").reset_index().rename(columns={0: "Değer"})
    comparison["Ölçüt"] = comparison["Ölçüt"].replace({
        "Selected drug": "Seçilen ilaç", "Shortage records": "Tedarik sıkıntısı kayıtları",
        "Current shortage records": "Güncel tedarik sıkıntısı kayıtları", "Shortage reasons": "Tedarik sıkıntısı nedenleri",
        "CMS latest report year": "CMS son rapor yılı", "CMS spending": "CMS harcaması", "CMS claims": "CMS reçete talepleri",
        "VA vendors": "VA tedarikçileri", "VA contract records": "VA sözleşme kayıtları", "VA FSS prices": "VA FSS fiyatları",
    })
    comparison = comparison.rename(columns={col: f"İlaç {index}" for index, col in enumerate(comparison.columns[1:], start=1)})
    st.dataframe(comparison, use_container_width=True, hide_index=True)

    with st.expander("Temel kaynak kayıtları"):
        record_tabs = st.tabs([str(entity[0].get("Drug / product", f"Drug {i+1}")) for i, entity in enumerate(entities)])
        for tab, (anchor, linked) in zip(record_tabs, entities):
            with tab:
                for source, frame in linked.items():
                    st.markdown(f"**{source_names.get(source, source)}**")
                    services.display_matches(frame, max_rows=100, key=f"compare_{source}_{services.normalize(anchor.get('Drug / product', 'drug'))[:30]}")
