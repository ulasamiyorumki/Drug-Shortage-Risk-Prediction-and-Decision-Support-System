import streamlit as st
import pandas as pd
import numpy as np
import os
import json

PAGE_TITLE = "Formül Editörü (IE)"
PAGE_ICON = "🧮"

def load_drug_data(datasets_dir):
    va_path = os.path.join(datasets_dir, "VA National Pharma Contracts/va_national_phamara_contracts.csv")
    try:
        va_df = pd.read_csv(va_path)
        va_df['FSS Price'] = pd.to_numeric(va_df['FSS Price'].astype(str).str.replace('$', '').str.replace(',', ''), errors='coerce')
        
        drug_stats = va_df.groupby('Generic Name').agg(
            Vendor_Count=('Vendor', 'nunique'),
            Avg_Price=('FSS Price', 'mean')
        ).reset_index()
        return drug_stats
    except:
        return pd.DataFrame()

def render(st, shared_state=None):
    st.title(f"{PAGE_ICON} {PAGE_TITLE}")
    st.markdown("""
    Endüstri Mühendisliği Karar Destek Sistemi (DSS) için Çok Kriterli Karar Verme (MCDM) formül ağırlıklarını 
    bu sayfadan dinamik olarak belirleyebilirsiniz. Ağırlıklar tarayıcı hafızasına (Session Storage) kaydedilir.
    """)
    
    # Initialize session state for weights
    if 'ie_weights' not in st.session_state:
        st.session_state['ie_weights'] = {
            'vendor': 40,
            'history': 30,
            'price': 15,
            'form': 15
        }

    st.subheader("⚙️ Ağırlık Belirleme (Weight Allocation)")
    st.info("Lütfen 4 kriterin toplamı 100 olacak şekilde ağırlıkları ayarlayın.")
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        w_vendor = st.number_input("Tedarikçi Bağımlılığı (%)", 0, 100, st.session_state['ie_weights']['vendor'])
    with col2:
        w_history = st.number_input("FDA Kıtlık Sicili (%)", 0, 100, st.session_state['ie_weights']['history'])
    with col3:
        w_price = st.number_input("Kâr Marjı / Fiyat (%)", 0, 100, st.session_state['ie_weights']['price'])
    with col4:
        w_form = st.number_input("Üretim Formu (%)", 0, 100, st.session_state['ie_weights']['form'])

    total_weight = w_vendor + w_history + w_price + w_form
    
    if total_weight != 100:
        st.error(f"⚠️ Ağırlıkların toplamı %100 olmalıdır! Şu anki toplam: %{total_weight}")
    else:
        st.success("✅ Ağırlıklar geçerli. Formül kullanıma hazır.")
        # Save to local storage (Session State)
        if st.button("Formülü Kaydet"):
            st.session_state['ie_weights'] = {
                'vendor': w_vendor, 'history': w_history, 'price': w_price, 'form': w_form
            }
            st.toast("Formül hafızaya kaydedildi!")

    st.divider()
    
    st.subheader("🧪 Formül Test Simülasyonu")
    
    datasets_dir = shared_state.get("datasets_dir") if shared_state else "../../Datasets"
    df = load_drug_data(datasets_dir)
    
    if not df.empty:
        search_term = st.text_input("Test Etmek İçin İlaç Arayın (Örn: LIDOCAINE, DEXTROSE)")
        if search_term:
            matches = df[df['Generic Name'].str.contains(search_term, case=False, na=False)]
            if not matches.empty:
                selected_drug = st.selectbox("İlaç Seçin", matches['Generic Name'].tolist())
                data = matches[matches['Generic Name'] == selected_drug].iloc[0]
                
                # Mock IE Scoring Logic based on real data
                v_count = data['Vendor_Count']
                v_score = 100 if v_count <= 2 else (50 if v_count <= 4 else 10)
                
                price = data['Avg_Price']
                p_score = 100 if price < 10 else (50 if price < 50 else 10) # Basit bir metrik
                
                # Sabit örnek skorlar (History ve Form FDA tablosundan tam çekilmediği için)
                h_score = 100 if "LIDOCAINE" in selected_drug or "DEXTROSE" in selected_drug else 0
                f_score = 80 if "INJ" in selected_drug else 20
                
                final_score = (v_score * (w_vendor/100)) + (h_score * (w_history/100)) + (p_score * (w_price/100)) + (f_score * (w_form/100))
                
                st.markdown(f"### Hesaplanan Risk Puanı: **%{final_score:.1f}**")
                
                st.markdown("#### Formül Adımları:")
                st.code(f'''
Tedarikçi Puanı ({v_count} firma) = {v_score} Puan * %{w_vendor} -> {v_score * w_vendor / 100}
Geçmiş Sicil Puanı        = {h_score} Puan * %{w_history} -> {h_score * w_history / 100}
Fiyat Puanı (${price:.1f})      = {p_score} Puan * %{w_price} -> {p_score * w_price / 100}
Form Puanı                = {f_score} Puan * %{w_form} -> {f_score * w_form / 100}
---------------------------------------------------------
TOPLAM RİSK SKORU         = %{final_score:.1f}
                ''')
            else:
                st.warning("Eşleşen ilaç bulunamadı.")
