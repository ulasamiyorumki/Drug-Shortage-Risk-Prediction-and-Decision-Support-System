"""Filter and analyze FDA drug shortage records."""

from __future__ import annotations

import pandas as pd
import streamlit as st

PAGE_TITLE = "Tedarik Sıkıntısı Analizi"
PAGE_ICON = "🚨"


def render(st, context):
    services = context["data_services"]
    st.title("🚨 Tedarik Sıkıntısı Analizi")
    st.write("FDA tedarik sıkıntısı kayıtlarında arama yapın, süzün ve güncelleme geçmişini inceleyin.")
    store = context.get("data_store")
    frame = store.search("Drug Shortages", "", limit=100_000) if store is not None and store.ready() else services.load_shortage_entities(str(context["datasets_dir"]))
    if frame.empty:
        st.warning("FDA tedarik sıkıntısı kaydı bulunamadı.")
        return

    query = st.text_input("İlaç, marka, NDC, üretici veya başvuru numarası ara", key="shortage_query")
    current = frame[frame["Status"].astype(str).str.lower().eq("current")]
    status_options = ["All", *sorted(frame["Status"].replace("", pd.NA).dropna().unique().tolist())]
    reason_options = ["All", *sorted(frame["Shortage reason"].replace("", pd.NA).dropna().unique().tolist())]
    category_options = ["All", *sorted(frame["Therapeutic category"].replace("", pd.NA).dropna().unique().tolist())]
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        status = st.selectbox("Durum", status_options, format_func=lambda value: {"Current": "Güncel", "Resolved": "Çözüldü"}.get(value, value), key="shortage_status_filter")
    with col2:
        reason = st.selectbox("Tedarik sıkıntısı nedeni", reason_options, key="shortage_reason_filter")
    with col3:
        category = st.selectbox("Tedavi kategorisi", category_options, key="shortage_category_filter")
    with col4:
        manufacturer = st.text_input("Üretici adında ara", key="shortage_manufacturer_filter")

    filtered = frame.copy()
    if query.strip():
        filtered = services.search_entities(filtered, query, limit=len(filtered))
    if status != "All":
        filtered = filtered[filtered["Status"].astype(str).eq(status)]
    if reason != "All":
        filtered = filtered[filtered["Shortage reason"].astype(str).eq(reason)]
    if category != "All":
        filtered = filtered[filtered["Therapeutic category"].astype(str).eq(category)]
    if manufacturer.strip():
        filtered = filtered[filtered["Company"].astype(str).str.contains(manufacturer, case=False, na=False)]

    metrics = st.columns(4)
    metrics[0].metric("Tüm tedarik sıkıntısı kayıtları", f"{len(frame):,}")
    metrics[1].metric("Güncel kayıtlar", f"{len(current):,}")
    metrics[2].metric("Süzülmüş kayıtlar", f"{len(filtered):,}")
    metrics[3].metric("Sonuçlardaki şirketler", f"{filtered['Company'].replace('', pd.NA).dropna().nunique():,}" if not filtered.empty else "0")

    if filtered.empty:
        st.info("Bu süzgeçlerle eşleşen tedarik sıkıntısı kaydı yok.")
        return
    col_a, col_b = st.columns(2)
    with col_a:
        st.markdown("#### Duruma göre kayıtlar")
        st.bar_chart(filtered["Status"].replace({"": "Mevcut değil", "Current": "Güncel", "Resolved": "Çözüldü"}).value_counts())
    with col_b:
        st.markdown("#### Tedarik sıkıntısı güncelleme zaman çizelgesi")
        dates = pd.to_datetime(filtered["Updated"], errors="coerce")
        timeline = dates.dt.to_period("M").astype(str).value_counts().sort_index()
        st.bar_chart(timeline)

    visible = ["Drug / product", "Brand name", "Status", "Shortage reason", "Availability", "Company", "NDC", "Application", "Therapeutic category", "Dosage form", "Presentation", "Initial posting date", "Updated"]
    visible = [column for column in visible if column in filtered]
    st.markdown("#### Eşleşen tedarik sıkıntısı kayıtları")
    shortage_table = filtered[visible].replace({None: "Mevcut değil", "": "Mevcut değil", "Not available": "Mevcut değil", "Current": "Güncel", "Resolved": "Çözüldü"}).fillna("Mevcut değil")
    st.dataframe(services.translated_frame(shortage_table), use_container_width=True, hide_index=True)
    st.download_button("Süzülmüş kayıtları dışa aktar", filtered[visible].to_csv(index=False).encode("utf-8-sig"), "shortage_analysis.csv", "text/csv")

    labels = [f"{row['Drug / product']} · {row.get('Updated', 'date unavailable')} · {row.get('Company', 'manufacturer unavailable')}" for _, row in filtered.head(500).iterrows()]
    selected_index = st.selectbox("Bir tedarik sıkıntısı kaydını inceleyin", list(range(len(labels))), format_func=lambda index: labels[index], key="shortage_record_detail")
    selected = filtered.iloc[selected_index]
    services.show_raw_fields(selected.get("_raw_record"), "FDA Drug Shortages", "shortage_selected")

    st.markdown("#### İlişkili kaynak kayıtları")
    if st.button("İlişkili FDA, NDC, CMS ve VA kayıtlarını bul", key="shortage_cross_link"):
        st.session_state["drug_explorer_query"] = str(selected.get("Drug / product", ""))
        st.session_state["drug_explorer_source"] = "Drug Shortages"
        st.session_state["page_navigation"] = "🔎 İlaç İnceleyici"
        st.rerun()
