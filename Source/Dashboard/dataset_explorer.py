"""Searchable browser for complete source datasets."""

from __future__ import annotations

import json
import pandas as pd
import streamlit as st

PAGE_TITLE = "Veri Kümesi İnceleyici"
PAGE_ICON = "🗂️"


def _display_safe_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Convert mixed object columns to consistent display strings for Arrow."""
    safe = frame.copy()
    for column in safe.select_dtypes(include=["object"]).columns:
        safe[column] = safe[column].map(lambda value: pd.NA if pd.isna(value) else str(value)).astype("string")
    return safe

FIELD_LABELS_TR = {
    "Drug / product": "İlaç / ürün", "Generic ingredient": "Jenerik etken madde", "Generic name": "Jenerik ad",
    "Brand name": "Marka adı", "Manufacturer / labeler": "Üretici / etiket sahibi", "Manufacturer": "Üretici",
    "Sponsor": "Başvuru sahibi", "Vendor": "Tedarikçi", "NDC": "NDC", "Product NDC": "Ürün NDC'si",
    "Package NDC": "Paket NDC'si", "Application": "Başvuru numarası", "Dosage form": "Farmasötik biçim",
    "Route": "Uygulama yolu", "Status": "Durum", "Shortage reason": "Tedarik sıkıntısı nedeni",
    "Report year": "Rapor yılı", "Total Spending": "Toplam harcama", "Total Claims": "Toplam reçete talebi",
    "Total Beneficiaries": "Toplam yararlanıcı", "FSS price": "FSS fiyatı", "NC price": "Ulusal sözleşme fiyatı",
    "Big 4 price": "Big 4 fiyatı", "Source": "Kaynak", "Availability": "Bulunabilirlik",
    "Package description": "Paket açıklaması", "Contract number": "Sözleşme numarası",
}


def render(st, context):
    services = context["data_services"]
    store = context.get("data_store")
    datasets_dir = str(context["datasets_dir"])
    st.title("🗂️ Veri Kümesi İnceleyici")
    st.write("Kaynak dosyalarını açmadan kayıtları arayın, süzün, sıralayın, inceleyin ve dışa aktarın.")
    sources = ["FDA Drugs@FDA", "FDA Drug Shortages", "NDC Products", "NDC Packages", "CMS Medicare Part D", "VA Contracts"]
    source_names = {"FDA Drugs@FDA": "FDA İlaç Kayıtları", "FDA Drug Shortages": "FDA Tedarik Sıkıntıları", "NDC Products": "NDC Ürünleri", "NDC Packages": "NDC Paketleri", "CMS Medicare Part D": "CMS Medicare Part D", "VA Contracts": "VA Sözleşmeleri"}
    source = st.selectbox("Veri kümesi", sources, format_func=lambda value: source_names[value], key="dataset_browser_source")

    if store is not None and store.ready():
        database_source = {
            "FDA Drugs@FDA": "FDA Drugs", "FDA Drug Shortages": "Drug Shortages",
            "NDC Products": "NDC Products", "NDC Packages": "NDC Packages",
            "CMS Medicare Part D": "CMS Medicare Part D", "VA Contracts": "VA Contracts",
        }[source]
        _render_sqlite_browser(st, store, database_source, source_names[source])
        return

    loaders = {
        "FDA Drugs@FDA": lambda: services.load_fda_entities(datasets_dir),
        "FDA Drug Shortages": lambda: services.load_shortage_entities(datasets_dir),
        "NDC Products": lambda: services.load_ndc_entities(datasets_dir),
        "NDC Packages": lambda: services.load_ndc_package_entities(datasets_dir),
        "VA Contracts": lambda: services.load_va_entities(datasets_dir),
        "CMS Medicare Part D": lambda: services.load_medicare_entities(datasets_dir),
    }
    frame = loaders[source]()
    if frame.empty:
        st.warning("Bu kaynakta kullanılabilir kayıt yok.")
        return
    st.metric("Kaynak kayıtları", f"{len(frame):,}")

    with st.expander("Arama ve süzgeçler", expanded=True):
        query = st.text_input("Aranabilir tüm alanlarda ara", key="dataset_query")
        searchable = frame
        if query.strip():
            searchable = services.search_entities(searchable, query, limit=len(searchable))
        fields = [
            column for column in frame.columns
            if not column.startswith("_") and frame[column].nunique(dropna=True) <= 500
        ]
        selected_fields = st.multiselect("Süzgeç eklenecek alanlar", fields, format_func=lambda value: FIELD_LABELS_TR.get(value, value), key="dataset_filter_fields")
        filtered = searchable
        for index, column in enumerate(selected_fields):
            values = sorted(filtered[column].dropna().astype(str).unique().tolist())
            if not values:
                continue
            if len(values) <= 100:
                chosen = st.multiselect(column, values, key=f"dataset_filter_{index}_{column}")
                if chosen:
                    filtered = filtered[filtered[column].astype(str).isin(chosen)]
            else:
                text_filter = st.text_input(f"{column} içinde ara", key=f"dataset_filter_text_{index}_{column}")
                if text_filter.strip():
                    filtered = filtered[filtered[column].astype(str).str.contains(text_filter, case=False, na=False)]

    if filtered.empty:
        st.info("Seçilen süzgeçlerle eşleşen kayıt bulunamadı.")
        return

    visible_columns = [column for column in filtered.columns if not column.startswith("_")]
    default_columns = [
        column for column in [
            "Drug / product", "Generic ingredient", "Generic name", "Brand name", "Manufacturer / labeler",
            "Manufacturer", "Sponsor", "Vendor", "NDC", "Product NDC", "Application", "Dosage form",
            "Route", "Status", "Shortage reason", "Report year", "Total Spending", "Total Claims",
            "Total Beneficiaries", "FSS price", "NC price", "Big 4 price", "Source",
        ] if column in visible_columns
    ]
    shown_columns = st.multiselect("Görünür sütunlar", visible_columns, default=default_columns or visible_columns[:8], format_func=lambda value: FIELD_LABELS_TR.get(value, value), key="dataset_columns")
    page_size = st.selectbox("Sayfa başına satır", [25, 50, 100, 250], index=1)
    page_count = max(1, (len(filtered) + page_size - 1) // page_size)
    page_number = st.number_input("Sayfa", min_value=1, max_value=page_count, value=1, step=1)
    start = (page_number - 1) * page_size
    current = filtered.iloc[start : start + page_size]
    st.caption(f"Süzgeçlerden geçen {len(filtered):,} kaydın {start + 1:,}–{min(start + page_size, len(filtered)):,} arası gösteriliyor. Kaydın tüm alanlarını incelemek için satır seçin.")
    visible_frame = current[shown_columns].rename(columns=lambda value: FIELD_LABELS_TR.get(value, value))
    st.dataframe(_display_safe_frame(visible_frame), width="stretch", hide_index=True, on_select="rerun", selection_mode="single-row", key=f"table_{source}")

    st.download_button(
        "Süzülmüş sonuçları CSV olarak indir",
        filtered[visible_columns].to_csv(index=False).encode("utf-8-sig"),
        file_name=f"{source.lower().replace(' ', '_')}_filtered.csv",
        mime="text/csv",
        key=f"export_filtered_{source}",
    )

    selected_rows = st.session_state.get(f"table_{source}", {}).get("selection", {}).get("rows", [])
    if selected_rows:
        selected = current.iloc[selected_rows[0]]
        raw_record = selected.get("_raw_record") or selected.get("_raw_application")
        with st.expander("Seçili satır · kaynağın tüm ayrıntıları", expanded=True):
            if isinstance(raw_record, dict):
                details = services.flatten_raw(raw_record)
                detail_frame = pd.DataFrame(details).rename(columns={"Original field": "Kaynak alanın özgün adı", "Value": "Değer"})
                st.dataframe(detail_frame, width="stretch", hide_index=True)
            else:
                public_values = selected[[col for col in selected.index if not col.startswith("_")]]
                st.dataframe(public_values.rename(index=lambda value: FIELD_LABELS_TR.get(value, value)).rename("Değer").to_frame(), width="stretch")
            st.download_button(
                "Seçili kaydı dışa aktar",
                pd.DataFrame([selected.drop(labels=[col for col in selected.index if col.startswith("_")]).to_dict()]).to_csv(index=False).encode("utf-8-sig"),
                file_name="selected_source_record.csv",
                mime="text/csv",
                key=f"export_selected_{source}",
            )


def _render_sqlite_browser(st, store, source: str, source_label: str) -> None:
    st.caption("Kayıtlar SQLite üzerinde sayfalı olarak okunur; tüm kaynak tablosu belleğe alınmaz.")
    with st.expander("Arama ve süzgeçler", expanded=True):
        query = st.text_input("Kaynağın bütün alanlarında ara", key="sqlite_dataset_query")
        fields = store.fields(source)
        selected_fields = st.multiselect(
            "Tam eşleşmeli süzgeç alanları",
            fields,
            format_func=lambda value: FIELD_LABELS_TR.get(value, value),
            key="sqlite_dataset_filter_fields",
        )
        filters = {}
        for index, field in enumerate(selected_fields):
            values = store.distinct_values(source, field, query=query)
            if len(values) <= 100:
                selection = st.multiselect(
                    FIELD_LABELS_TR.get(field, field),
                    values,
                    key=f"sqlite_filter_{index}_{field}",
                )
                if selection:
                    filters[field] = selection
            else:
                partial = st.text_input(
                    f"{FIELD_LABELS_TR.get(field, field)} içinde ara",
                    key=f"sqlite_filter_text_{index}_{field}",
                )
                if partial:
                    filters[field] = partial

    matching_count = store.count(source, query=query, filters=filters)
    if matching_count == 0:
        st.info("Bu arama ve süzgeçlerle eşleşen kayıt yok.")
        return
    st.metric("Eşleşen kaynak kayıtları", f"{matching_count:,}")
    page_size = st.selectbox("Sayfa başına satır", [25, 50, 100, 250], index=1, key="sqlite_dataset_page_size")
    page_count = max(1, (matching_count + page_size - 1) // page_size)
    page_number = st.number_input("Sayfa", min_value=1, max_value=page_count, value=1, step=1, key="sqlite_dataset_page")
    offset = (page_number - 1) * page_size
    current = store.search(source, query, limit=page_size, offset=offset, filters=filters)
    columns = [column for column in current.columns if not column.startswith("_")]
    defaults = [column for column in ["Drug / product", "Generic name", "Brand name", "Manufacturer", "Vendor", "NDC", "Product NDC", "Package NDC", "Application", "Status", "Report year"] if column in columns]
    visible = st.multiselect("Görünür sütunlar", columns, default=defaults or columns[:10], key="sqlite_dataset_columns")
    st.caption(f"{offset + 1:,}–{min(offset + len(current), matching_count):,} / {matching_count:,} kayıt")
    table = current[visible].rename(columns=lambda value: FIELD_LABELS_TR.get(value, value))
    st.dataframe(_display_safe_frame(table), width="stretch", hide_index=True, on_select="rerun", selection_mode="single-row", key=f"sqlite_table_{source}")
    st.download_button(
        "Görünen sayfayı CSV olarak indir",
        current[columns].to_csv(index=False).encode("utf-8-sig"),
        file_name=f"{source.lower().replace(' ', '_')}_page_{page_number}.csv",
        mime="text/csv",
        key=f"sqlite_export_{source}",
    )
    selected = st.session_state.get(f"sqlite_table_{source}", {}).get("selection", {}).get("rows", [])
    if selected:
        row = current.iloc[selected[0]]
        raw = row.get("_raw_record")
        if isinstance(raw, dict):
            with st.expander("Seçili kaydın tüm özgün alanları", expanded=True):
                details = store.flatten(raw)
                detail_frame = pd.DataFrame(details).rename(columns={"Original field": "Kaynak alanın özgün adı", "Value": "Değer"})
                st.dataframe(detail_frame, width="stretch", hide_index=True)
                st.download_button("Seçili kaydı JSON olarak indir", json.dumps(raw, ensure_ascii=False, indent=2), f"record_{row.get('_db_id')}.json", "application/json")
