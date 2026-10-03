"""Integrated EDA page for the drug shortage decision support dashboard."""

from __future__ import annotations

import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import matplotlib.pyplot as plt
import pandas as pd
import streamlit as st

PAGE_TITLE = "Keşifsel Veri Analizi"
PAGE_ICON = "📊"

XLSX_NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "package_rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

COLUMN_MEANINGS = {
    "application_number": "FDA application identifier (NDA, ANDA, or BLA). One application can contain multiple products and packages.",
    "sponsor_name": "Organization associated with the regulatory application; it can differ from a current manufacturer or labeler.",
    "products": "Structured FDA product entries under an application. See the Drug Explorer for a product table.",
    "submissions": "Regulatory submissions and their dates, types, review status, and class where reported.",
    "status": "Shortage status stated by FDA for this shortage listing.",
    "initial_posting_date": "Date the shortage listing was first posted; it may not be the actual interruption start date.",
    "update_date": "Date the shortage listing was updated.",
    "change_date": "Date associated with a status or listing change, when provided.",
    "discontinued_date": "Discontinuation date reported in the listing, when provided.",
    "generic_name": "Generic or nonproprietary drug name as represented by this source.",
    "brand_name": "Brand name as represented by this source.",
    "company_name": "Company named on the FDA shortage entry; the role may not be identical to labeler or sponsor.",
    "package_ndc": "Package-level National Drug Code reported for the shortage entry.",
    "product_ndc": "Product-level NDC; identifies a product listing, not one package configuration.",
    "ndc": "NDC identifier as supplied by this source. Check whether it is product-level or package-level before linking.",
    "dosage_form": "Physical formulation, such as tablet, capsule, or injection.",
    "route": "Administration pathway, such as oral, intravenous, or topical.",
    "availability": "Availability statement reported in the FDA shortage listing.",
    "shortage_reason": "Reason text/category reported for the shortage listing.",
    "therapeutic_category": "Therapeutic category assigned in the FDA shortage data.",
    "presentation": "Strength, form, or package presentation text associated with the shortage entry.",
    "related_info": "Additional explanatory text associated with the shortage entry.",
    "related_info_link": "Source link supplied for additional shortage information.",
    "resolved_note": "Resolution note, when included in the shortage record.",
    "productid": "FDA NDC Directory internal product-row identifier; it is not an NDC code.",
    "productndc": "Product-level NDC identifying the labeler/product combination in the directory.",
    "ndcpackagecode": "Package-level NDC that adds the package segment to the product identifier.",
    "packagedescription": "Directory description of package count, container, or configuration.",
    "proprietaryname": "Brand or proprietary product name.",
    "nonproprietaryname": "Generic or nonproprietary product name.",
    "labelername": "Company listed as the product labeler in the NDC Directory.",
    "dosageformname": "FDA directory dosage-form description.",
    "routename": "FDA directory route of administration.",
    "applicationnumber": "Application associated with an NDC product, where one is supplied.",
    "producttypename": "FDA NDC product category/type.",
    "marketingcategoryname": "Regulatory marketing category reported for the listed product.",
    "startmarketingdate": "Start of marketing date reported for the directory listing.",
    "endmarketingdate": "End of marketing date reported for the directory listing; a blank does not by itself prove current availability.",
    "vendor": "Supplier/vendor named on the VA catalog contract item.",
    "contract number": "Identifier for the VA contract associated with the catalog item.",
    "pkg": "Package quantity or package description from the VA catalog.",
    "pv": "Prime Vendor indicator as defined by the VA catalog; it is not a drug identifier.",
    "fss price": "Federal Supply Schedule contract price; a VA procurement price, not a universal market price.",
    "nc price": "National Contract price in the VA catalog; a VA procurement price.",
    "big 4 price": "VA Big 4 program price field; a VA procurement price.",
    "total spending": "CMS Medicare Part D spending for the year/period identified by the workbook column.",
    "total dosage units": "CMS-reported dosage units dispensed; unit definitions can vary by drug.",
    "total claims": "CMS-reported prescription claims; not a count of unique patients.",
    "total beneficiaries": "CMS-reported beneficiaries for the period; not a cross-year unique-patient count.",
    "average spending per dosage unit (weighted)": "CMS weighted spending per dosage unit for the stated period; interpret with the workbook methodology.",
    "number of manufacturers": "CMS-reported manufacturer count for the drug and stated period.",
}


def column_meaning(column: str) -> str:
    key = re.sub(r"\s+", " ", str(column).strip().lower())
    key = re.sub(r"\s+(?:19|20)\d{2}$", "", key)
    compact = re.sub(r"[^a-z0-9]", "", key)
    turkish_meanings = {
        "application_number": "FDA ruhsat/başvuru kimliği (NDA, ANDA veya BLA). Bir başvuruda birden fazla ürün ve paket bulunabilir.",
        "applicationnumber": "Bu ürünle ilişkilendirilen FDA başvurusu; her kayıtta bulunmayabilir.",
        "sponsor_name": "Ruhsat başvurusuyla ilişkili kuruluş; güncel üretici veya etiket sahibiyle aynı olmayabilir.",
        "products": "FDA başvurusu altındaki yapılandırılmış ürün kayıtları. İlaç İnceleyici'de ürün tablosu olarak görüntülenir.",
        "submissions": "Varsa düzenleyici başvuru türü, tarihi, durumu ve sınıfını içeren geçmiş kayıtları.",
        "status": "FDA'nın bu tedarik sıkıntısı kaydı için bildirdiği durum.",
        "initial_posting_date": "Duyurunun ilk yayımlandığı tarih; tedarik kesintisinin fiilî başlangıcı olmak zorunda değildir.",
        "update_date": "Tedarik sıkıntısı kaydının güncellendiği tarih.",
        "change_date": "Varsa durum veya kayıt değişikliğiyle ilişkili tarih.",
        "discontinued_date": "Kayıtta bildirilen sonlandırılma tarihi; mevcut değilse boş kalabilir.",
        "generic_name": "Bu kaynağın kullandığı jenerik/etken madde adı.",
        "brand_name": "Bu kaynağın kullandığı marka adı.",
        "company_name": "FDA tedarik sıkıntısı kaydında belirtilen şirket; rolü üretici veya etiket sahibiyle aynı olmayabilir.",
        "package_ndc": "Tedarik sıkıntısı kaydında verilen paket düzeyindeki NDC.",
        "product_ndc": "Ürün düzeyindeki NDC; belirli bir paket boyutunu tek başına tanımlamaz.",
        "ndc": "Kaynakta sunulan NDC. Eşleştirmeden önce ürün düzeyinde mi, paket düzeyinde mi olduğunu kontrol edin.",
        "dosage_form": "Tablet, kapsül veya enjeksiyon gibi ilacın farmasötik biçimi.",
        "route": "Oral, damar içi veya topikal gibi ilacın uygulanma yolu.",
        "availability": "FDA tedarik sıkıntısı kaydında bildirilen bulunabilirlik bilgisi.",
        "shortage_reason": "Tedarik sıkıntısı için bildirilen neden veya kategori.",
        "therapeutic_category": "FDA tedarik sıkıntısı verisinde belirtilen tedavi kategorisi.",
        "presentation": "Tedarik sıkıntısı kaydındaki doz, biçim veya ambalaj sunumu.",
        "related_info": "Kayıtla ilgili ek açıklama.",
        "related_info_link": "Ek tedarik sıkıntısı bilgisi için kaynakta verilen bağlantı.",
        "resolved_note": "Kayıtta varsa çözüm/sonuç notu.",
        "productid": "FDA NDC dizinindeki iç ürün satırı kimliği; NDC kodu değildir.",
        "productndc": "Dizinde etiket sahibi ve ürünü tanımlayan ürün düzeyindeki NDC.",
        "ndcpackagecode": "Ürün kimliğine paket bölümünün de eklendiği paket düzeyindeki NDC.",
        "packagedescription": "Paket adedi, kap veya ambalaj düzeninin açıklaması.",
        "proprietaryname": "Ticari/marka ürün adı.",
        "nonproprietaryname": "Jenerik veya ticari olmayan ürün adı.",
        "labelername": "FDA NDC dizininde ürünün etiket sahibi olarak listelenen şirket.",
        "dosageformname": "FDA dizininde belirtilen farmasötik biçim.",
        "routename": "FDA dizininde belirtilen uygulama yolu.",
        "producttypename": "FDA NDC ürün türü/kategorisi.",
        "marketingcategoryname": "Ürün için bildirilen düzenleyici pazarlama kategorisi.",
        "startmarketingdate": "Dizindeki ürün/paket kaydı için bildirilen pazarlama başlangıç tarihi.",
        "endmarketingdate": "Dizinde bildirilen pazarlama bitiş tarihi; boş olması tek başına ürünün hâlen satıldığını kanıtlamaz.",
        "vendor": "VA sözleşme kaleminde belirtilen tedarikçi.",
        "contract number": "İlgili VA sözleşmesinin kimlik numarası.",
        "pkg": "VA kataloğunda verilen paket miktarı veya açıklaması.",
        "pv": "VA kataloğundaki Prime Vendor göstergesi; ilaç kimliği değildir.",
        "fss price": "Federal Tedarik Çizelgesi sözleşme fiyatı; genel piyasa fiyatı değil, VA tedarik fiyatıdır.",
        "nc price": "VA kataloğundaki National Contract fiyatı; VA tedarik fiyatıdır.",
        "big 4 price": "VA Big 4 programı için verilen fiyat alanı; VA tedarik fiyatıdır.",
        "total spending": "İlgili CMS çalışma kitabında belirtilen yıl/dönem için Medicare Part D harcaması.",
        "total dosage units": "CMS'in bildirdiği dağıtılmış doz birimi; birimin tanımı ilaca göre değişebilir.",
        "total claims": "CMS'in bildirdiği reçete/işlem talebi sayısı; tekil hasta sayısı değildir.",
        "total beneficiaries": "Dönemde ilaçla ilişkilendirilen CMS yararlanıcıları; yıllar boyunca tekilleştirilmiş kişi sayısı değildir.",
        "average spending per dosage unit (weighted)": "CMS yöntemine göre ağırlıklandırılmış doz birimi başına ortalama harcama; çalışma kitabındaki tanımı ve birimiyle yorumlayın.",
        "number of manufacturers": "CMS raporunda bu ilaç ve dönem için bildirilen üretici sayısı.",
    }
    if key in turkish_meanings:
        return turkish_meanings[key]
    if compact in turkish_meanings:
        return turkish_meanings[compact]
    if "rxcui" in key:
        return "RxNorm kavram kimliği; aynı kimlik farklı kaynaklarda yer alıyorsa kavramsal eşleştirmeye yardımcı olur."
    if "spl" in key:
        return "FDA Yapılandırılmış Ürün Etiketi belgesi veya etiket kümesi kimliği."
    if "unii" in key:
        return "Etken madde veya başka bir madde için FDA kimliği."
    if "pharm_class" in key or "pharmaceutical classification" in key:
        return "Kaynağın bildirdiği farmasötik sınıf; etki mekanizması, farmakolojik sınıf veya tedavi kullanımını gösterebilir."
    if "strength" in key or "ingredient" in key or "substance" in key:
        return "Kaynağın bildirdiği etken madde veya doz bilgisi; karşılaştırmadan önce birimi ve yazımı kontrol edin."
    if "price" in key or "spending" in key:
        return "Maliyet veya harcama ölçüsü. Başka bir fiyatla karşılaştırmadan önce kaynağı, kapsanan grubu, dönemi ve birimi kontrol edin."
    if "date" in key or "year" in key:
        return "Veri kümesinin tarih/yıl alanı; anlamı kaynağa bağlıdır ve başka kaynaktaki olay tarihiyle aynı olduğu varsayılmamalıdır."
    if "ndc" in key:
        return "Ulusal İlaç Kodu (NDC). Ürünü mü yoksa belirli bir paketi mi tanımladığını kontrol edin; baştaki sıfırları koruyun."
    if "name" in key:
        return "Kaynağın verdiği ilaç/kurum adı; başka kaynaklarda aynı ad farklı yazılmış olabilir."
    return "Kaynakta yer alan alan. Ayrıntılı anlamı için ham kaydı veya kaynağın veri sözlüğünü inceleyin."


def _display_safe_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Normalize mixed Excel object columns for Streamlit/Arrow display."""
    safe = frame.copy()
    for column in safe.select_dtypes(include=["object"]).columns:
        safe[column] = safe[column].map(lambda value: pd.NA if pd.isna(value) else str(value)).astype("string")
    return safe


def resolve_datasets_dir(context: dict) -> Path:
    """Resolve the project data directory from the app context or this module path."""
    candidates = [
        Path(context.get("project_root", ".")),
        Path(__file__).resolve().parents[2],
        Path.cwd(),
        *Path.cwd().parents,
    ]
    for candidate in candidates:
        if (candidate / "Datasets").is_dir():
            return candidate / "Datasets"
        if candidate.name.lower() == "datasets" and candidate.is_dir():
            return candidate
    return Path(__file__).resolve().parents[2] / "Datasets"


@st.cache_data(show_spinner="Loading FDA records…")
def load_fda(datasets_dir: str, filename: str) -> tuple[pd.DataFrame, list]:
    path = Path(datasets_dir) / "DrugsFDA" / filename
    if not path.is_file():
        return pd.DataFrame(), []
    with path.open(encoding="utf-8") as f:
        payload = json.load(f)
    records = payload.get("results", payload if isinstance(payload, list) else [])
    df = pd.DataFrame(records)
    for col in df.columns:
        if df[col].map(lambda value: isinstance(value, (dict, list))).any():
            df[col] = df[col].map(
                lambda value: json.dumps(value, ensure_ascii=False)
                if isinstance(value, (dict, list))
                else value
            )
    return df, records


@st.cache_data(show_spinner="Loading VA contract data…")
def load_va(datasets_dir: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "VA National Pharma Contracts" / "va_national_phamara_contracts.csv"
    if not path.is_file():
        return pd.DataFrame()
    df = pd.read_csv(path, low_memory=False)
    for col in [c for c in df.columns if "price" in c.lower()]:
        df[col] = pd.to_numeric(
            df[col].astype(str).str.replace(r"[$,]", "", regex=True).str.strip(), errors="coerce"
        )
    return df


@st.cache_data(show_spinner="Loading NDC records…")
def load_ndc(datasets_dir: str, filename: str) -> pd.DataFrame:
    path = Path(datasets_dir) / "National Drug Code Directory" / filename
    if not path.is_file():
        return pd.DataFrame()
    return pd.read_csv(path, sep="\t", encoding="latin1", low_memory=False, dtype=str)


@st.cache_data(show_spinner="Reading Medicare Part D reports…")
def load_medicare(path_string: str) -> tuple[pd.DataFrame, dict]:
    path = Path(path_string)
    sheets = list_xlsx_sheets(path)
    main_sheet = next(
        (sheet for sheet in sheets if "spending" in sheet.lower() or "utilization" in sheet.lower()),
        sheets[0],
    )
    raw = read_xlsx_sheet(path, main_sheet, header=None, nrows=15)
    header_idx = next(
        (
            i
            for i in range(min(15, len(raw)))
            if raw.iloc[i].astype(str).str.contains("Brand Name", case=False, na=False).any()
        ),
        None,
    )
    if header_idx is None:
        return pd.DataFrame(), {"sheets": sheets, "main_sheet": main_sheet}
    df = read_xlsx_sheet(path, main_sheet, header=header_idx)
    df.columns = [str(col).replace("\n", " ").strip() for col in df.columns]
    return df.dropna(how="all").copy(), {"sheets": sheets, "main_sheet": main_sheet}


def _column_index(cell_ref: str) -> int:
    value = 0
    for char in cell_ref:
        if char.isalpha():
            value = value * 26 + ord(char.upper()) - ord("A") + 1
        else:
            break
    return value - 1


def list_xlsx_sheets(path: Path) -> list[str]:
    """Read worksheet names without requiring an optional Excel engine."""
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        return [sheet.attrib["name"] for sheet in workbook.findall("main:sheets/main:sheet", XLSX_NS)]


def read_xlsx_sheet(path: Path, sheet_name: str, header: int | None = 0, nrows: int | None = None) -> pd.DataFrame:
    """Read a standard .xlsx worksheet using the Python standard library."""
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in relationships.findall("package_rel:Relationship", XLSX_NS)
        }
        sheet_path = None
        for sheet in workbook.findall("main:sheets/main:sheet", XLSX_NS):
            if sheet.attrib["name"] == sheet_name:
                target = targets[sheet.attrib[f"{{{XLSX_NS['rel']}}}id"]]
                sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
                break
        if sheet_path is None or sheet_path not in archive.namelist():
            raise ValueError(f"Worksheet '{sheet_name}' is missing from {path.name}.")

        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = ["".join(item.itertext()) for item in shared_root]
        root = ET.fromstring(archive.read(sheet_path))
        rows = []
        for row_node in root.findall("main:sheetData/main:row", XLSX_NS):
            cells = {}
            for cell in row_node.findall("main:c", XLSX_NS):
                ref = cell.attrib.get("r", "A1")
                col = _column_index(ref)
                value_node = cell.find("main:v", XLSX_NS)
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    value = "".join(cell.find("main:is", XLSX_NS).itertext()) if cell.find("main:is", XLSX_NS) is not None else ""
                elif value_node is None:
                    value = None
                elif cell_type == "s":
                    value = shared_strings[int(value_node.text)]
                elif cell_type in {"str", "e"}:
                    value = value_node.text
                elif cell_type == "b":
                    value = value_node.text == "1"
                else:
                    try:
                        number = float(value_node.text)
                        value = int(number) if number.is_integer() else number
                    except (TypeError, ValueError):
                        value = value_node.text
                cells[col] = value
            if cells:
                row = [None] * (max(cells) + 1)
                for col, value in cells.items():
                    row[col] = value
                rows.append(row)
            else:
                rows.append([])
            if nrows is not None and len(rows) >= nrows + (1 if header is not None else 0):
                break

    frame = pd.DataFrame(rows)
    if header is not None:
        if header >= len(frame):
            return pd.DataFrame()
        columns = []
        seen = {}
        for i, value in enumerate(frame.iloc[header]):
            name = str(value).strip() if pd.notna(value) else f"Unnamed: {i}"
            occurrence = seen.get(name, 0)
            columns.append(name if occurrence == 0 else f"{name}.{occurrence}")
            seen[name] = occurrence + 1
        frame.columns = columns
        frame = frame.iloc[header + 1 :].reset_index(drop=True)
    return frame


def show_profile(df: pd.DataFrame, title: str, key: str, preview: bool = True) -> None:
    if df.empty:
        st.warning(f"{title} boş veya yüklenemedi.")
        return
    missing = int(df.isna().sum().sum())
    total = max(1, df.shape[0] * df.shape[1])
    cols = st.columns(4)
    cols[0].metric("Kayıt sayısı", f"{len(df):,}")
    cols[1].metric("Alan sayısı", f"{df.shape[1]:,}")
    cols[2].metric("Yinelenen satırlar", f"{int(df.duplicated().sum()):,}")
    cols[3].metric("Eksik hücreler", f"{missing:,} ({missing / total:.1%})")
    with st.expander("Sütunlar ne anlama geliyor?", expanded=False):
        st.dataframe(
            pd.DataFrame({"Kaynak sütunun özgün adı": df.columns, "Türkçe açıklama": [column_meaning(column) for column in df.columns]}),
            use_container_width=True,
            hide_index=True,
        )
    with st.expander("Veri kalitesi ve örnek kayıtlar"):
        profile = pd.DataFrame(
            {
                "Veri türü": df.dtypes.astype(str),
                "Eksik değer": df.isna().sum(),
                "Eksik %": (df.isna().mean() * 100).round(1),
                "Farklı değer sayısı": df.nunique(dropna=True),
            }
        ).sort_values("Eksik %", ascending=False)
        st.dataframe(profile, use_container_width=True)
        if preview:
            st.dataframe(_display_safe_frame(df.head(10)), use_container_width=True, hide_index=True)


def show_bar(df: pd.DataFrame, columns: list[str], title: str, key: str) -> None:
    column = next((candidate for candidate in columns if candidate in df.columns), None)
    if column is None:
        st.info(f"{title} için kullanılabilir alan bulunmuyor.")
        return
    counts = df[column].fillna("(Boş)").astype(str).value_counts().head(12).sort_values()
    if column.lower() == "status":
        counts.index = counts.index.to_series().replace({"Current": "Güncel", "Resolved": "Çözüldü"})
    fig, ax = plt.subplots(figsize=(8, max(3, min(5, 0.3 * len(counts)))))
    counts.plot(kind="barh", ax=ax, color="#167d8d")
    ax.set_title(title, loc="left", fontsize=12, pad=10)
    ax.set_xlabel("Kayıt sayısı")
    ax.set_ylabel("")
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.grid(axis="x", alpha=0.2)
    fig.tight_layout()
    st.pyplot(fig, use_container_width=True)
    plt.close(fig)


def render(st, context):
    datasets_dir = resolve_datasets_dir(context)
    fda_drugs, drug_records = load_fda(str(datasets_dir), "drugs.json")
    shortages, _ = load_fda(str(datasets_dir), "drug-shortages.json")
    va = load_va(str(datasets_dir))
    ndc_products = load_ndc(str(datasets_dir), "product.txt")
    ndc_packages = load_ndc(str(datasets_dir), "package.txt")

    medicare_dir = datasets_dir / "Medicare Part D Spending by Drug-Excel Reports including Historical Data RY26"
    medicare_files = sorted(medicare_dir.glob("Medicare Part D Spending by Drug DYT*/*.xlsx"))
    reports = []
    for path in medicare_files:
        match = re.search(r"DYT(\d{4})", path.parent.name)
        year = int(match.group(1)) if match else None
        try:
            frame, info = load_medicare(str(path))
            spend_columns = [c for c in frame.columns if c.lower().startswith("total spending")]
            latest_column = spend_columns[-1] if spend_columns else None
            spend = pd.to_numeric(frame[latest_column], errors="coerce") if latest_column else pd.Series(dtype=float)
            reports.append({"year": year, "path": path, "data": frame, "info": info, "spend": spend})
        except Exception as exc:
            reports.append({"year": year, "path": path, "error": str(exc)})

    st.title("İlaç Tedarik Verileri")
    st.caption("FDA, VA, NDC ve Medicare Part D kaynaklarının keşifsel analizi")
    st.write(
        "Veri kalitesini, dağılımları ve Medicare'ın yıllara göre özetlerini aşağıdaki kaynak sekmelerinden inceleyin. "
        "Her kaynak bölümünde ilgili analiz defterinin adı da yer alır."
    )

    with st.expander("Önce buradan başlayın · terimler ve veri kümelerini okuma rehberi", expanded=True):
        st.write(
            "FDA başvuru ve ürün kayıtları, tedarik sıkıntısı duyuruları, NDC listeleri, Medicare Part D kullanım ölçüleri ve VA sözleşme fiyatları farklı şeyleri anlatır. "
            "Eşleşen kayıtlar olası bağlantılardır; tüm alanların aynı paketi veya kullanıcı grubunu tanımladığını kanıtlamaz. "
            "Kaynak dosyalarındaki özgün sütun adları korunur; aşağıdaki sözlükler bu alanları Türkçe açıklar."
        )
        guide_tabs = st.tabs(["İlaç kimlikleri", "FDA ve tedarik sıkıntısı", "CMS Medicare Part D", "VA sözleşmeleri", "Eşleştirme ve eksik veri"])
        with guide_tabs[0]:
            st.markdown("#### Ürün kimliği ve kullanım yolu")
            st.dataframe(pd.DataFrame([
                {"Terim / kaynak alanı": "NDC", "Türkçe açıklama": "Ulusal İlaç Kodu. Baştaki sıfırları koruyun; gösterim kaynaklara göre değişebilir."},
                {"Terim / kaynak alanı": "Product NDC · Ürün NDC'si", "Türkçe açıklama": "Etiket sahibini ve belirli bir ilaç ürününü tanımlar; paket boyutunu tek başına tanımlamaz."},
                {"Terim / kaynak alanı": "Package NDC · Paket NDC'si", "Türkçe açıklama": "Ürün kimliğine paket bölümünü ekleyerek ambalaj biçimini tanımlar. Bir ürünün farklı paket kodları olabilir."},
                {"Terim / kaynak alanı": "PRODUCTID", "Türkçe açıklama": "FDA NDC dizinindeki ürün satırı kimliği; NDC kodu değildir."},
                {"Terim / kaynak alanı": "Application Number · Başvuru numarası", "Türkçe açıklama": "NDA, ANDA veya BLA ile başlayan FDA düzenleyici başvuru kimliği; belirli bir paketi değil başvuruyu tanımlar."},
                {"Terim / kaynak alanı": "RxCUI", "Türkçe açıklama": "RxNorm ilaç kavramı kimliği; farklı kaynaklardaki kavramsal eşleşmelere yardımcı olabilir."},
                {"Terim / kaynak alanı": "SPL ID / SPL Set ID", "Türkçe açıklama": "Yapılandırılmış Ürün Etiketi belgesi veya etiket kümesinin kimliği."},
                {"Terim / kaynak alanı": "UNII", "Türkçe açıklama": "FDA'nın etken madde veya başka bir madde için verdiği kimlik."},
                {"Terim / kaynak alanı": "Dosage form · Farmasötik biçim", "Türkçe açıklama": "Tablet, kapsül veya enjeksiyon gibi ilacın hazırlanış biçimi."},
                {"Terim / kaynak alanı": "Route · Uygulama yolu", "Türkçe açıklama": "Oral, damar içi veya topikal gibi ilacın uygulanma yolu."},
            ]), use_container_width=True, hide_index=True)
        with guide_tabs[1]:
            st.markdown("#### FDA İlaç ve Tedarik Sıkıntısı kayıtları")
            st.dataframe(pd.DataFrame([
                {"Alan": "Sponsor name · Başvuru sahibi", "Kaynak": "Drugs@FDA", "Türkçe açıklama": "Düzenleyici başvuruyla ilişkili kuruluş; güncel üretici veya etiket sahibinden farklı olabilir."},
                {"Alan": "Manufacturer / labeler · Üretici / etiket sahibi", "Kaynak": "OpenFDA / NDC", "Türkçe açıklama": "İlgili kaynakta ürün için listelenen şirket. Şirket rolleri kaynaklar arasında farklı olabilir."},
                {"Alan": "Products / submissions · Ürünler / işlemler", "Kaynak": "Drugs@FDA", "Türkçe açıklama": "Bir başvuruda birden fazla ürün ve düzenleyici işlem olabilir; her biri ayrı kayıttır."},
                {"Alan": "Status · Durum", "Kaynak": "Tedarik sıkıntısı", "Türkçe açıklama": "FDA'nın bu tedarik sıkıntısı kaydı için bildirdiği durum."},
                {"Alan": "Initial posting / update date · İlk yayın / güncelleme tarihi", "Kaynak": "Tedarik sıkıntısı", "Türkçe açıklama": "Kaydın yayın ve güncelleme tarihi; kesintinin fiilî başlangıç veya bitiş tarihi olmayabilir."},
                {"Alan": "Shortage reason / availability · Neden / bulunabilirlik", "Kaynak": "Tedarik sıkıntısı", "Türkçe açıklama": "FDA kaydında bildirilen tedarik sıkıntısı nedeni ve bulunabilirlik bilgisi."},
                {"Alan": "Therapeutic category / presentation · Tedavi kategorisi / sunum", "Kaynak": "Tedarik sıkıntısı", "Türkçe açıklama": "FDA'nın ilaç için verdiği kategori ve ürün sunumu bilgisi."},
            ]), use_container_width=True, hide_index=True)
        with guide_tabs[2]:
            st.markdown("#### CMS Medicare Part D ölçüleri")
            st.info("Bu değerler Medicare Part D kapsamında raporlanır. Reçete talepleri ve doz birimleri bu programdaki kullanım/talep göstergesidir; ABD genelindeki toplam talep değildir.")
            st.dataframe(pd.DataFrame([
                {"Alan": "Brand Name / Generic Name · Marka / jenerik adı", "Türkçe açıklama": "CMS raporundaki adlar; yazım ve gruplama FDA veya VA kayıtlarından farklı olabilir."},
                {"Alan": "Manufacturer · Üretici", "Türkçe açıklama": "CMS çalışma kitabında ilaçla ilişkilendirilen üretici; tüm tedarikçileri kapsamayabilir."},
                {"Alan": "Number of Manufacturers · Üretici sayısı", "Türkçe açıklama": "Çalışma kitabında bu ilaç için raporlanan üretici sayısı."},
                {"Alan": "Total Spending · Toplam harcama", "Türkçe açıklama": "Belirtilen yıldaki Medicare Part D ilaç harcaması."},
                {"Alan": "Total Dosage Units · Toplam doz birimi", "Türkçe açıklama": "Dağıtıldığı raporlanan doz birimleri; ölçü birimi ilaca göre değişebilir."},
                {"Alan": "Total Claims · Toplam reçete talebi", "Türkçe açıklama": "Raporlanan reçete talepleri; tekil hasta sayısı değildir."},
                {"Alan": "Total Beneficiaries · Yararlanıcı sayısı", "Türkçe açıklama": "Dönemde ilaçla ilişkilendirilen yararlanıcılar; yıllar boyunca tekil kişi sayısı olmayabilir."},
                {"Alan": "Average Spending Per Dosage Unit (Weighted) · Ağırlıklı doz birimi harcaması", "Türkçe açıklama": "CMS yöntemine göre ağırlıklandırılmış doz birimi başına harcama; birimi ve yöntemiyle yorumlayın."},
                {"Alan": "Çakışan rapor yılları", "Türkçe açıklama": "Yıllık çalışma kitaplarında birden fazla yıl bulunabilir. Yıllık özet her raporun en son yılını kullanır."},
            ]), use_container_width=True, hide_index=True)
            if medicare_files:
                try:
                    latest_book = medicare_files[-1]
                    dictionary = read_xlsx_sheet(latest_book, "Data Dictionary", header=1)
                    st.markdown(f"**CMS çalışma kitabı veri sözlüğü · {latest_book.parent.name}**")
                    if dictionary.empty or not len(dictionary.columns):
                        st.info("Çalışma kitabında veri sözlüğü alanı bulunamadı.")
                        cms_dictionary = pd.DataFrame(columns=["Kaynak alanın özgün adı"])
                    else:
                        field_column = next((column for column in dictionary.columns if any(word in str(column).lower() for word in ["field", "element", "name"])), dictionary.columns[0])
                        cms_dictionary = pd.DataFrame({
                            "Kaynak alanın özgün adı": dictionary[field_column].dropna().astype(str),
                        })
                    cms_dictionary["Türkçe açıklama"] = cms_dictionary["Kaynak alanın özgün adı"].map(column_meaning)
                    st.dataframe(cms_dictionary, use_container_width=True, hide_index=True)
                    st.caption("CMS'in özgün alan adları korunur; açıklamalar Türkçedir.")
                except Exception as exc:
                    st.caption(f"Çalışma kitabının veri sözlüğü yüklenemedi: {exc}")
        with guide_tabs[3]:
            st.markdown("#### VA Ulusal Edinim Merkezi kataloğu")
            st.dataframe(pd.DataFrame([
                {"Alan": "Vendor · Tedarikçi", "Türkçe açıklama": "VA sözleşme kaydında belirtilen tedarikçi."},
                {"Alan": "Contract Number · Sözleşme numarası", "Türkçe açıklama": "İlgili VA sözleşmesinin kimlik numarası."},
                {"Alan": "PKG · Paket", "Türkçe açıklama": "VA kataloğundaki paket miktarı veya açıklaması."},
                {"Alan": "PV · Ana tedarikçi", "Türkçe açıklama": "Kaynak katalogdaki Prime Vendor göstergesi; X işareti bu tanımı belirtir."},
                {"Alan": "FSS Price · FSS fiyatı", "Türkçe açıklama": "Federal Tedarik Çizelgesi sözleşme fiyatı."},
                {"Alan": "NC Price · Ulusal sözleşme fiyatı", "Türkçe açıklama": "Kaynak katalogdaki National Contract fiyatı."},
                {"Alan": "Big 4 Price · Big 4 fiyatı", "Türkçe açıklama": "VA Big 4 satın alma programına ait fiyat alanı."},
            ]), use_container_width=True, hide_index=True)
            st.warning("VA fiyatları VA tedarik/sözleşme fiyatlarıdır; genel eczane, toptancı veya piyasa fiyatı değildir.")
        with guide_tabs[4]:
            st.markdown("#### Kayıtlar nasıl eşleştirilir?")
            st.write("Tam başvuru numarası ve NDC eşleşmeleri daha güçlüdür. Ürün NDC'si ile paket NDC'si farklı düzeyleri tanımlar; biçimini kontrol etmeden eşdeğer saymayın. İsim parçasına göre bulunan sonuçlar kesin eşleşme değil, inceleme önerisidir.")
            st.dataframe(pd.DataFrame([
                {"Gösterim": "Mevcut değil", "Anlamı": "Kaynak kaydı var; ancak bu alan boş veya kayıtta bulunmuyor."},
                {"Gösterim": "Eşleşen kayıt yok", "Anlamı": "Seçilen ilaç için bu veri kümesinde bağlantılı kayıt bulunamadı."},
                {"Gösterim": "Uygulanamaz", "Anlamı": "Alan bu kayıt türü için geçerli değil."},
            ]), use_container_width=True, hide_index=True)

    tabs = st.tabs(["Genel Bakış", "FDA İlaçları", "FDA Tedarik Sıkıntıları", "VA Sözleşmeleri", "NDC Dizini", "CMS Medicare Part D"])

    with tabs[0]:
        st.subheader("Veri kümesi kapsamı")
        metric_cols = st.columns(5)
        metric_cols[0].metric("FDA başvuruları", f"{len(fda_drugs):,}" if not fda_drugs.empty else "—")
        metric_cols[1].metric("Tedarik sıkıntısı kayıtları", f"{len(shortages):,}" if not shortages.empty else "—")
        metric_cols[2].metric("VA sözleşmeleri", f"{len(va):,}" if not va.empty else "—")
        metric_cols[3].metric("NDC ürün / paket", f"{len(ndc_products):,} / {len(ndc_packages):,}")
        metric_cols[4].metric("Medicare raporları", f"{len(reports)}" if medicare_files else "—")
        st.markdown("#### İçerilen kaynaklar")
        overview_rows = [
            {"Source": "FDA İlaç Kayıtları", "File": "drugs.json", "Records": len(fda_drugs), "Status": "Loaded" if not fda_drugs.empty else "Unavailable"},
            {"Source": "FDA Tedarik Sıkıntıları", "File": "drug-shortages.json", "Records": len(shortages), "Status": "Loaded" if not shortages.empty else "Unavailable"},
            {"Source": "VA Ulusal İlaç Sözleşmeleri", "File": "va_national_phamara_contracts.csv", "Records": len(va), "Status": "Loaded" if not va.empty else "Unavailable"},
            {"Source": "FDA NDC Ürün Dizini", "File": "product.txt", "Records": len(ndc_products), "Status": "Loaded" if not ndc_products.empty else "Unavailable"},
            {"Source": "FDA NDC Paket Dizini", "File": "package.txt", "Records": len(ndc_packages), "Status": "Loaded" if not ndc_packages.empty else "Unavailable"},
            {"Source": "CMS Medicare Part D", "File": "9 yıllık Excel raporu", "Records": sum(len(r.get("data", [])) for r in reports if "data" in r), "Status": f"{len(reports)} rapor" if reports else "Unavailable"},
        ]
        overview = pd.DataFrame(overview_rows).rename(columns={"Source": "Kaynak", "File": "Dosya", "Records": "Kayıt sayısı", "Status": "Durum"})
        overview["Durum"] = overview["Durum"].replace({"Loaded": "Yüklendi", "Unavailable": "Mevcut değil"})
        st.dataframe(overview, use_container_width=True, hide_index=True)
        if not medicare_files:
            st.error(f"Medicare raporları şu konumda bulunamadı: `{medicare_dir}`")
        failed_reports = [report for report in reports if "error" in report]
        if failed_reports:
            with st.expander(f"{len(failed_reports)} rapor okunamadı — ayrıntıları göster"):
                for report in failed_reports:
                    st.error(f"{report.get('year', 'Bilinmeyen yıl')}: {report['error']}")
        if any(df.empty for df in [fda_drugs, shortages, va, ndc_products, ndc_packages]):
            st.warning(f"En az bir kaynak dosyası `{datasets_dir}` konumundan yüklenemedi. Dosya yolunu ve erişim izinlerini kontrol edin.")
        st.caption("Sonuçlar betimleyicidir. Alan profilleri ve görsel özetler için kaynak sekmelerine bakın.")

    with tabs[1]:
        st.subheader("FDA ilaç başvuruları ve ürünleri")
        show_profile(fda_drugs, "FDA İlaç Kayıtları", "fda-drugs")
        st.caption("Analiz defteri: `Notebooks/fda_drugs_applications_products_eda.ipynb`")
        if not fda_drugs.empty:
            col_a, col_b = st.columns(2)
            with col_a:
                show_bar(fda_drugs, ["sponsor_name"], "Önde gelen başvuru sahipleri", "fda-sponsors")
            with col_b:
                product_records = [product for record in drug_records for product in (record.get("products") or [])]
                submissions = [item for record in drug_records for item in (record.get("submissions") or [])]
                st.metric("Ürün kayıtları", f"{len(product_records):,}")
                st.metric("Düzenleyici işlem kayıtları", f"{len(submissions):,}")
                if product_records:
                    product_df = pd.json_normalize(product_records, sep=".")
                    show_bar(product_df, ["brand_name", "brand_name_base", "dosage_form", "product_type"], "Ürün kategorileri", "fda-products")

    with tabs[2]:
        st.subheader("FDA tedarik sıkıntısı kayıtları")
        show_profile(shortages, "FDA Tedarik Sıkıntıları", "shortages")
        st.caption("Analiz defteri: `Notebooks/fda_drug_shortages_eda.ipynb`")
        if not shortages.empty:
            col_a, col_b = st.columns(2)
            with col_a:
                show_bar(shortages, ["status"], "Tedarik sıkıntısı durumu", "shortage-status")
            with col_b:
                show_bar(shortages, ["availability"], "Bulunabilirlik", "shortage-availability")
            date_cols = st.columns(2)
            for slot, column in zip(date_cols, ["initial_posting_date", "update_date"]):
                if column in shortages:
                    dates = pd.to_datetime(shortages[column], errors="coerce").dt.year.value_counts().sort_index()
                    with slot:
                        st.markdown(f"**{column.replace('_', ' ')} alanındaki yıla göre kayıtlar**")
                        st.bar_chart(dates)

    with tabs[3]:
        st.subheader("VA ulusal ilaç sözleşmeleri")
        show_profile(va, "VA Ulusal İlaç Sözleşmeleri", "va-contracts")
        st.caption("Analiz defteri: `Notebooks/va_pharmaceutical_contracts_eda.ipynb`")
        if not va.empty:
            col_a, col_b = st.columns(2)
            with col_a:
                show_bar(va, ["Vendor"], "Önde gelen tedarikçiler", "va-vendors")
            with col_b:
                show_bar(va, ["Generic Name"], "En yaygın jenerik adlar", "va-generics")
            price_cols = [column for column in va if "price" in column.lower()]
            if price_cols:
                st.markdown("#### Sözleşme fiyatı özeti")
                st.dataframe(va[price_cols].describe().T, use_container_width=True)
            if "PV" in va:
                st.markdown("#### Ana tedarikçi göstergesi")
                st.dataframe(va["PV"].fillna("Boş").value_counts().rename_axis("PV").to_frame("Kayıt sayısı"), use_container_width=True)

    with tabs[4]:
        st.subheader("Ulusal İlaç Kodu (NDC) dizini")
        product_tab, package_tab = st.tabs(["Ürünler", "Paketler"])
        with product_tab:
            show_profile(ndc_products, "FDA NDC Ürün Dizini", "ndc-products")
            st.caption("Analiz defteri: `Notebooks/ndc_product_directory_eda.ipynb`")
            if not ndc_products.empty:
                col_a, col_b = st.columns(2)
                with col_a:
                    show_bar(ndc_products, ["PRODUCTTYPENAME"], "Ürün türleri", "ndc-product-types")
                with col_b:
                    show_bar(ndc_products, ["MARKETINGCATEGORYNAME"], "Pazarlama kategorileri", "ndc-marketing")
                show_bar(ndc_products, ["LABELERNAME"], "Önde gelen etiket sahipleri", "ndc-labelers")
        with package_tab:
            show_profile(ndc_packages, "FDA NDC Paket Dizini", "ndc-packages")
            st.caption("Analiz defteri: `Notebooks/ndc_package_directory_eda.ipynb`")
            if not ndc_packages.empty:
                col_a, col_b = st.columns(2)
                with col_a:
                    show_bar(ndc_packages, ["NDC_EXCLUDE_FLAG"], "Dizin dışı bırakma göstergesi", "ndc-exclusion")
                with col_b:
                    show_bar(ndc_packages, ["SAMPLE_PACKAGE"], "Numune paket göstergesi", "ndc-sample")

    with tabs[5]:
        st.subheader("Medicare Part D yıllık raporları · 2016–2024")
        st.caption("Analiz defteri: `Notebooks/medicare_part_d_2016_2024_consolidated_eda.ipynb`")
        annual_rows = []
        valid_reports = [report for report in reports if "data" in report and not report["data"].empty]
        for report in valid_reports:
            spend = report["spend"]
            annual_rows.append(
                {
                    "Yıl": report["year"],
                    "Toplam harcama": spend.sum(),
                    "İlaç başına medyan harcama": spend.median(),
                    "Harcaması raporlanan ilaç kayıtları": int(spend.notna().sum()),
                    "Satır sayısı": len(report["data"]),
                }
            )
        if annual_rows:
            annual = pd.DataFrame(annual_rows).sort_values("Yıl").set_index("Yıl")
            st.line_chart(annual["Toplam harcama"])
            st.dataframe(
                annual.style.format({"Toplam harcama": "${:,.0f}", "İlaç başına medyan harcama": "${:,.0f}"}),
                use_container_width=True,
            )
            with st.expander("Yıllık raporları ve en yüksek harcamalı ilaçları inceleyin"):
                report_tabs = st.tabs([str(report["year"]) for report in valid_reports])
                for tab, report in zip(report_tabs, valid_reports):
                    with tab:
                        frame = report["data"]
                        info = report["info"]
                        spending = report["spend"]
                        left, right = st.columns([1, 2])
                        left.metric("Rapor yılındaki harcama", f"${spending.sum():,.0f}")
                        left.metric("İlaç kayıtları", f"{len(frame):,}")
                        brand = next((col for col in frame.columns if "brand name" in col.lower()), None)
                        if brand:
                            top = pd.DataFrame({"Marka adı": frame[brand], "Harcama": spending}).nlargest(10, "Harcama")
                            right.dataframe(_display_safe_frame(top).style.format({"Harcama": "${:,.0f}"}), use_container_width=True, hide_index=True)
                        with st.expander("Çalışma sayfaları ve örnek satırlar"):
                            st.write("Çalışma sayfaları:", ", ".join(info["sheets"]))
                            for sheet in info["sheets"]:
                                if sheet == info["main_sheet"]:
                                    continue
                                sample = read_xlsx_sheet(report["path"], sheet, nrows=5)
                                st.markdown(f"**{sheet}**")
                                st.dataframe(_display_safe_frame(sample), use_container_width=True, hide_index=True)
                        with st.expander("CMS raporundaki sütunlar ne anlama geliyor?"):
                            st.dataframe(
                                pd.DataFrame({"Kaynak sütunun özgün adı": frame.columns, "Türkçe açıklama": [column_meaning(column) for column in frame.columns]}),
                                use_container_width=True,
                                hide_index=True,
                            )
        else:
            if failed_reports:
                st.error("Medicare çalışma kitapları bulundu ancak hiçbiri okunamadı. Hataların ayrıntıları için Genel Bakış sekmesini açın.")
            else:
                st.error(f"`{medicare_dir}` konumunda okunabilir Medicare çalışma kitabı bulunamadı.")

    st.divider()
    st.caption("Keşifsel analiz sonuçları betimleyicidir; operasyonel kararlarda kullanmadan önce doğrulanmalıdır.")
