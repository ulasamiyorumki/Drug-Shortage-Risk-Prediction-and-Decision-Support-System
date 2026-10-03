"""Medicare Part D utilization and VA procurement price analysis."""

from __future__ import annotations

import pandas as pd
import streamlit as st

PAGE_TITLE = "Talep ve Maliyet"
PAGE_ICON = "📈"


def render(st, context):
    services = context["data_services"]
    root = str(context["datasets_dir"])
    st.title("📈 Talep ve Maliyet")
    st.write("Medicare Part D kullanım/harcama ölçülerini ve VA tedarik fiyatlarını ayrı kaynaklar olarak inceleyin.")
    st.info("Medicare Part D kullanımı bu program için talep göstergesidir; ABD genelindeki toplam talep değildir. VA değerleri tedarik/sözleşme fiyatlarıdır; genel eczane veya toptancı fiyatı değildir.")

    query = st.text_input("İsteğe bağlı ilaç süzgeci", placeholder="Marka, jenerik ad veya ürün", key="demand_cost_query")
    cms = services.load_medicare_entities(root)
    va = services.load_va_entities(root)
    if query.strip():
        cms = services.search_entities(cms, query, limit=len(cms))
        va = services.search_entities(va, query, limit=len(va))

    st.subheader("CMS Medicare Part D")
    if cms.empty:
        st.info("CMS kaydı eşleşmedi." if query.strip() else "CMS kaydı bulunamadı.")
    else:
        years = sorted(cms["Report year"].dropna().unique())
        if len(years) > 1:
            year_min, year_max = st.select_slider("Rapor yılı aralığı", options=years, value=(years[0], years[-1]), key="cms_year_range")
            cms = cms[cms["Report year"].between(year_min, year_max)]
        measures = {}
        for col, title in [
            ("Total Claims", "Medicare Part D reçete talepleri"),
            ("Total Beneficiaries", "Yararlanıcılar"),
            ("Total Dosage Units", "Doz birimleri"),
            ("Total Spending", "Harcama (USD)"),
            ("Average Spending Per Dosage Unit (Weighted)", "Doz birimi başına harcama (USD)"),
        ]:
            candidates = [name for name in cms.columns if name.lower().startswith(col.lower())]
            if candidates:
                latest_column = candidates[-1]
                measures[title] = pd.to_numeric(cms[latest_column], errors="coerce")
        by_year = cms.groupby("Report year", dropna=True)
        chart_data = pd.DataFrame(index=sorted(cms["Report year"].dropna().unique()))
        for label, values in measures.items():
            aggregate = values.groupby(cms["Report year"]).sum(min_count=1)
            chart_data[label] = aggregate
        if "Medicare Part D reçete talepleri" in chart_data:
            st.markdown("#### Kullanım eğilimi · Medicare Part D talep göstergesi")
            st.line_chart(chart_data["Medicare Part D reçete talepleri"])
            chart_data["Yıllık kullanım değişimi (%)"] = chart_data["Medicare Part D reçete talepleri"].pct_change().mul(100).round(2)
        if "Harcama (USD)" in chart_data:
            st.markdown("#### Harcama eğilimi")
            st.line_chart(chart_data["Harcama (USD)"])
        if "Doz birimi başına harcama (USD)" in chart_data:
            st.markdown("#### Doz birimi başına ortalama harcama")
            st.line_chart(chart_data["Doz birimi başına harcama (USD)"])
        st.dataframe(chart_data, use_container_width=True)
        st.caption("CMS ölçüleri yıllık çalışma kitaplarında verildiği biçimde gösterilir. Çakışan yılları tekrar saymamak için her raporun en son yıl bloğu kullanılır.")
        st.download_button("CMS kayıtlarını dışa aktar", cms[[c for c in cms.columns if not c.startswith("_")]].to_csv(index=False).encode("utf-8-sig"), "cms_medicare_part_d.csv", "text/csv")

    st.subheader("VA tedarik / sözleşme fiyatları")
    if va.empty:
        st.info("VA sözleşme kaydı eşleşmedi." if query.strip() else "VA sözleşme kaydı bulunamadı.")
    else:
        vendors = va["Vendor"].replace("", pd.NA).dropna().nunique()
        st.metric("Eşleşen sözleşme kayıtları", f"{len(va):,}", help=f"{vendors:,} tedarikçide")
        price_cols = [column for column in ["FSS price", "NC price", "Big 4 price"] if column in va]
        price_data = va.copy()
        for column in price_cols:
            price_data[column] = pd.to_numeric(price_data[column].astype(str).str.replace(r"[$,]", "", regex=True), errors="coerce")
        st.dataframe(price_data.drop(columns=[c for c in price_data if c.startswith("_")]), use_container_width=True, hide_index=True)
        if price_cols:
            st.markdown("#### Fiyat dağılımları")
            st.bar_chart(price_data[price_cols].describe().loc[["min", "50%", "mean", "max"]].T)
        st.download_button("VA sözleşme kayıtlarını dışa aktar", va[[c for c in va.columns if not c.startswith("_")]].to_csv(index=False).encode("utf-8-sig"), "va_contract_prices.csv", "text/csv")
