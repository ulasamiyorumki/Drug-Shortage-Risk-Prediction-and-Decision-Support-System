"""Shared dashboard shell with automatic page discovery."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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

st.sidebar.markdown("## 💊 Drug Shortage Risk Analysis & Decision Support System")
st.sidebar.caption("Developed by Ulaş, Cemre, Begüm, Melisa")
st.sidebar.divider()

default_index = next((i for i, (module, _) in enumerate(pages) if module.PAGE_TITLE == "Keşifsel Veri Analizi"), 0)
if st.session_state.get("page_navigation") not in labels:
    st.session_state["page_navigation"] = labels[default_index]
selected = st.sidebar.radio("Sayfalar", labels, key="page_navigation")
module, _ = pages[labels.index(selected)]
module.render(st, {
    "project_root": PROJECT_ROOT,
    "dashboard_dir": DASHBOARD_DIR,
    "datasets_dir": PROJECT_ROOT / "Datasets",
    "data_services": drug_page,
})


def get_groq_api_key() -> str:
    try:
        from dotenv import load_dotenv

        load_dotenv(PROJECT_ROOT / ".env")
    except ImportError:
        pass
    key = os.getenv("GROQ_API_KEY", "").strip()
    if key:
        return key
    try:
        return str(st.secrets["GROQ_API_KEY"]).strip()
    except (KeyError, FileNotFoundError):
        return ""


def ask_groq(messages: list[dict[str, str]], page_title: str, api_key: str) -> str:
    conversation = [{
        "role": "system",
        "content": (
            "You are a helpful assistant for an industrial engineering drug supply and shortage dashboard. "
            "Answer in Turkish unless the user writes in another language. Be clear that FDA, NDC, CMS Medicare Part D, "
            "and VA records have different meanings. Do not invent facts or claim to have read records that were not supplied. "
            f"The user is currently on the dashboard page: {page_title}."
        ),
    }, *messages[-12:]]
    payload = json.dumps({
        "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "messages": conversation,
        "temperature": 0.3,
        "max_tokens": 1200,
    }).encode("utf-8")
    request = Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        return result["choices"][0]["message"]["content"].strip()
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Groq API isteği başarısız oldu ({error.code}): {detail}") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError(f"Groq API'ye bağlanılamadı: {error}") from error


st.divider()
st.subheader("🤖 İlaç ve veri asistanı")
if "assistant_messages" not in st.session_state:
    st.session_state["assistant_messages"] = []
for message in st.session_state["assistant_messages"]:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

prompt = st.chat_input("Bu sayfa veya ilaç verileri hakkında soru sorun…", key="dashboard_chat_input")
if prompt:
    st.session_state["assistant_messages"].append({"role": "user", "content": prompt})
    api_key = get_groq_api_key()
    if not api_key:
        st.session_state["assistant_messages"].append({
            "role": "assistant",
            "content": "Groq API anahtarı bulunamadı. Yerelde `.env` dosyasına, Streamlit Cloud'da uygulamanın Secrets ayarına `GROQ_API_KEY` ekleyin.",
        })
    else:
        try:
            answer = ask_groq(st.session_state["assistant_messages"], module.PAGE_TITLE, api_key)
            st.session_state["assistant_messages"].append({"role": "assistant", "content": answer})
        except RuntimeError as error:
            st.session_state["assistant_messages"].append({"role": "assistant", "content": f"İstek tamamlanamadı: {error}"})
    st.rerun()
