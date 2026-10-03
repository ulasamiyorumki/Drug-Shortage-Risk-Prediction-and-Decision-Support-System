"""Supplier and vendor concentration view using source-specific records."""

from __future__ import annotations

import pandas as pd
import streamlit as st

PAGE_TITLE = "Tedarikçi Analizi"
PAGE_ICON = "🏭"


def render(st, context):
    services = context["data_services"]
    root = str(context["datasets_dir"])
    store = context.get("data_store")
    if store is not None and store.ready():
        _render_sqlite(st, store)
        return
    st.title("🏭 Tedarikçi Analizi")
    st.write("VA sözleşmelerindeki tedarikçi kapsamını; FDA kaynaklarındaki üretici ve etiket sahibi bilgilerini inceleyin.")
    va = services.load_va_entities(root)
    shortages = services.load_shortage_entities(root)
    ndc = services.load_ndc_entities(root)
    col_a, col_b = st.columns(2)
    with col_a:
        vendor_filter = st.text_input("Tedarikçi adında ara", key="supplier_vendor_filter")
    with col_b:
        drug_filter = st.text_input("İlaç adında ara", key="supplier_drug_filter")
    filtered = va.copy()
    if vendor_filter.strip():
        filtered = filtered[filtered["Vendor"].astype(str).str.contains(vendor_filter, case=False, na=False)]
    if drug_filter.strip():
        filtered = services.search_entities(filtered, drug_filter, limit=len(filtered))

    metrics = st.columns(4)
    metrics[0].metric("VA sözleşme kayıtları", f"{len(filtered):,}")
    metrics[1].metric("VA tedarikçileri", f"{filtered['Vendor'].replace('', pd.NA).dropna().nunique():,}" if not filtered.empty else "0")
    metrics[2].metric("FDA/NDC etiket sahipleri", f"{ndc['Labeler'].replace('', pd.NA).dropna().nunique():,}" if "Labeler" in ndc else "Mevcut değil")
    metrics[3].metric("Tedarik sıkıntısı şirketleri", f"{shortages['Company'].replace('', pd.NA).dropna().nunique():,}" if "Company" in shortages else "Mevcut değil")

    if not filtered.empty:
        st.subheader("VA tedarikçi kapsamı")
        top_vendors = filtered["Vendor"].replace("", "Mevcut değil").value_counts().head(20)
        top_vendors = top_vendors.rename_axis("Tedarikçi").rename("Kayıt sayısı")
        st.bar_chart(top_vendors)
        vendor_summary = (
            filtered.groupby("Vendor", dropna=False)
            .agg(
                **{
                    "Sözleşme kayıtları": ("Contract number", "count"),
                    "Tekil sözleşmeler": ("Contract number", "nunique"),
                    "İlaçlar / ürünler": ("Drug / product", "nunique"),
                    "Paketler": ("NDC", "nunique"),
                }
            )
            .sort_values("Contract records", ascending=False)
            .reset_index()
        )
        st.dataframe(vendor_summary.rename(columns={"Vendor": "Tedarikçi"}), width="stretch", hide_index=True)

        price_columns = [column for column in ["FSS price", "NC price", "Big 4 price"] if column in filtered]
        if price_columns:
            prices = filtered.copy()
            for column in price_columns:
                prices[column] = pd.to_numeric(prices[column].astype(str).str.replace(r"[$,]", "", regex=True), errors="coerce")
            st.subheader("Sözleşme fiyat aralıkları")
            st.caption("VA tedarik/sözleşme fiyatlarıdır; genel piyasa fiyatı değildir.")
            price_summary = prices.groupby("Vendor")[price_columns].agg(["min", "median", "max"]).round(2)
            price_summary.index.name = "Tedarikçi"
            price_summary.columns = pd.MultiIndex.from_tuples([(services.FIELD_NAMES_TR.get(name, name), {"min": "En düşük", "median": "Medyan", "max": "En yüksek"}.get(stat, stat)) for name, stat in price_summary.columns])
            st.dataframe(price_summary, width="stretch")

        visible = [column for column in ["Drug / product", "Generic name", "Trade name", "Vendor", "Contract number", "NDC", "FSS price", "NC price", "Big 4 price", "Prime Vendor", "VA Class"] if column in filtered]
        st.subheader("VA tedarikçi ve sözleşme kayıtları")
        st.dataframe(filtered[visible].replace({"": "Mevcut değil", "Not available": "Mevcut değil"}).fillna("Mevcut değil").rename(columns=services.FIELD_NAMES_TR), width="stretch", hide_index=True)
        st.download_button("Süzülmüş VA kayıtlarını dışa aktar", filtered[visible].to_csv(index=False).encode("utf-8-sig"), "supplier_contracts.csv", "text/csv")

    st.subheader("Kaynağa göre üretici / etiket sahibi kapsamı")
    manufacturer_tabs = st.tabs(["NDC etiket sahipleri", "FDA başvuru sahipleri", "Tedarik sıkıntısı şirketleri"])
    with manufacturer_tabs[0]:
        st.caption("Etiket sahibi adları FDA NDC Ürün Dizini'nde verildiği biçimdedir.")
        st.dataframe(ndc["Labeler"].value_counts().head(100).rename_axis("Etiket sahibi").to_frame("NDC ürün kaydı"), width="stretch")
    with manufacturer_tabs[1]:
        fda = services.load_fda_entities(root)
        if "Sponsor" in fda:
            st.caption("FDA başvuru sahibi başvuru kaydından alınır; ürün üreticisi/etiket sahibinden farklı olabilir.")
            st.dataframe(fda["Sponsor"].value_counts().head(100).rename_axis("Başvuru sahibi").to_frame("FDA ürün kaydı"), width="stretch")
    with manufacturer_tabs[2]:
        st.caption("Şirket adı her FDA Tedarik Sıkıntısı kaydından alınmıştır.")
        st.dataframe(shortages["Company"].value_counts().head(100).rename_axis("Şirket").to_frame("Tedarik sıkıntısı kaydı"), width="stretch")


def _render_sqlite(st, store):
    st.title("🏭 Tedarikçi Analizi")
    st.write("VA sözleşmelerindeki tedarikçileri ve FDA/NDC kaynaklarındaki şirketleri SQLite üzerinden bellek dostu biçimde inceleyin.")
    col_a, col_b = st.columns(2)
    with col_a:
        vendor = st.text_input("Tedarikçi adında ara", key="supplier_vendor_filter")
    with col_b:
        drug = st.text_input("İlaç adında ara", key="supplier_drug_filter")
    filters = {"Vendor": vendor} if vendor else None
    total = store.count("VA Contracts", drug, filters)
    va = store.search("VA Contracts", drug, limit=500, filters=filters)
    top_vendors = store.value_counts("VA Contracts", "Vendor", drug, limit=20, filters=filters)
    labelers = store.value_counts("NDC Products", "Labeler", limit=100)
    sponsors = store.value_counts("FDA Drugs", "Sponsor", limit=100)
    shortage_companies = store.value_counts("Drug Shortages", "Company", limit=100)
    vendor_count = store.distinct_count("VA Contracts", "Vendor")

    metrics = st.columns(4)
    metrics[0].metric("Eşleşen VA sözleşmeleri", f"{total:,}")
    metrics[1].metric("Tedarikçiler", f"{vendor_count:,}")
    metrics[2].metric("NDC etiket sahipleri", f"{len(labelers):,}")
    metrics[3].metric("Tedarik sıkıntısı şirketleri", f"{len(shortage_companies):,}")

    if not top_vendors.empty:
        st.subheader("En çok VA sözleşme kaydı bulunan tedarikçiler")
        st.bar_chart(top_vendors)
    if not va.empty:
        st.subheader("Eşleşen VA sözleşme kayıtları")
        visible = [column for column in ["Drug / product", "Generic name", "Trade name", "Vendor", "Contract number", "NDC", "FSS price", "NC price", "Big 4 price", "Prime Vendor", "VA Class"] if column in va]
        st.dataframe(va[visible].astype("string"), width="stretch", hide_index=True)
        st.download_button("Gösterilen VA kayıtlarını indir", va[visible].to_csv(index=False).encode("utf-8-sig"), "supplier_contracts.csv", "text/csv")
        st.caption("Gösterilen liste en fazla 500 satırdır. Tüm eşleşen satırlara Veri Kümesi İnceleyici'den erişin.")
    st.subheader("Kaynağa göre üretici / etiket sahibi")
    tab_a, tab_b, tab_c = st.tabs(["NDC etiket sahipleri", "FDA başvuru sahipleri", "Tedarik sıkıntısı şirketleri"])
    with tab_a:
        st.dataframe(labelers.rename_axis("Etiket sahibi").to_frame("NDC ürün kaydı"), width="stretch")
    with tab_b:
        st.dataframe(sponsors.rename_axis("Başvuru sahibi").to_frame("FDA kayıt sayısı"), width="stretch")
    with tab_c:
        st.dataframe(shortage_companies.rename_axis("Şirket").to_frame("Tedarik sıkıntısı kaydı"), width="stretch")
