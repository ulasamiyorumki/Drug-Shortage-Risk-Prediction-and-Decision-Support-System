"""Shared dashboard shell with automatic page discovery."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import streamlit as st
from sqlite_store import DrugStore

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
data_store = DrugStore(PROJECT_ROOT / "Datasets" / "drug_data.sqlite3")

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
    "data_store": data_store,
})


def get_groq_api_key() -> str:
    # Streamlit Cloud's Secrets value must win over any stale deployment env var.
    try:
        secret = str(st.secrets["GROQ_API_KEY"]).strip()
        if secret:
            return secret
    except Exception:
        # A local run without .streamlit/secrets.toml may raise a Streamlit-specific
        # missing-secrets exception rather than KeyError/FileNotFoundError.
        pass

    env_file = PROJECT_ROOT / ".env"
    try:
        from dotenv import load_dotenv

        load_dotenv(env_file, override=False)
    except ImportError:
        # Keep local development working even when python-dotenv has not been
        # installed in the interpreter used to launch Streamlit.
        if env_file.is_file():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                entry = line.strip()
                if not entry or entry.startswith("#"):
                    continue
                if entry.startswith("export "):
                    entry = entry[7:].lstrip()
                name, separator, value = entry.partition("=")
                if separator and name.strip() == "GROQ_API_KEY" and not os.getenv(name.strip()):
                    value = value.strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                        value = value[1:-1]
                    os.environ[name.strip()] = value
    return os.getenv("GROQ_API_KEY", "").strip()


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
        "model": "openai/gpt-oss-120b",
        "messages": conversation,
        "temperature": 0.7,
        "max_completion_tokens": 1200,
        "reasoning_effort": "low",
    }).encode("utf-8")
    request = Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        return result["choices"][0]["message"]["content"].strip()
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        try:
            error_message = json.loads(detail).get("error", {}).get("message", "")
        except (AttributeError, json.JSONDecodeError):
            error_message = ""
        if error.code == 401:
            raise RuntimeError(
                "Groq 401: API anahtarı reddedildi. Streamlit Cloud Secrets'teki GROQ_API_KEY değerinin Groq Console'dan alınan "
                "tam, etkin anahtar olduğunu kontrol edin (yer tutucu 'key' veya maskeli kopya olmamalı)."
            ) from error
        if error.code == 403:
            reason = f" Groq yanıtı: {error_message}" if error_message else ""
            masked_key = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "Bilinmiyor"
            raise RuntimeError(
                f"Groq 403 (Erişim Reddedildi): Kullanılan API Anahtarı ({masked_key}) bu modele erişim iznine sahip değil. "
                "Lütfen Streamlit Cloud Secrets (veya .env) içindeki anahtarın doğruluğunu ve Groq Console'daki Limitleri kontrol edin."
                + reason
            ) from error
        raise RuntimeError(f"Groq API isteği başarısız oldu ({error.code}): {detail}") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError(f"Groq API'ye bağlanılamadı: {error}") from error


if "assistant_messages" not in st.session_state:
    st.session_state["assistant_messages"] = []
if "floating_chat_open" not in st.session_state:
    st.session_state["floating_chat_open"] = False


chat_background = "#262730" if st.context.theme.type == "dark" else "#ffffff"
chat_text = "#fafafa" if st.context.theme.type == "dark" else "#31333f"
chat_border = "rgba(255,255,255,.18)" if st.context.theme.type == "dark" else "rgba(49,51,63,.2)"

st.markdown(
    """
    <style>
    .st-key-floating_chat_launcher {
        position: fixed !important;
        left: 1.4rem;
        bottom: 1.4rem;
        z-index: 1000000;
        width: 3.7rem;
    }
    .st-key-floating_chat_launcher button {
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 50%;
        box-shadow: 0 4px 18px rgba(0,0,0,.22);
        font-size: 1.35rem;
    }
    .st-key-floating_chat_window {
        position: fixed !important;
        left: 1.2rem;
        bottom: 5.5rem;
        z-index: 999999;
        width: min(390px, calc(100vw - 2.4rem));
        max-height: min(72vh, 650px);
        overflow-y: auto;
        padding: .5rem .9rem .8rem;
        background: __CHAT_BACKGROUND__;
        color: __CHAT_TEXT__;
        border: 1px solid __CHAT_BORDER__;
        border-radius: 1rem;
        box-shadow: 0 8px 32px rgba(0,0,0,.22);
    }
    </style>
    """.replace("__CHAT_BACKGROUND__", chat_background)
    .replace("__CHAT_TEXT__", chat_text)
    .replace("__CHAT_BORDER__", chat_border),
    unsafe_allow_html=True,
)
with st.container(key="floating_chat_launcher"):
    if st.button("💬", key="open_floating_chat", help="İlaç ve veri asistanını aç"):
        st.session_state["floating_chat_open"] = not st.session_state["floating_chat_open"]

if st.session_state["floating_chat_open"]:
    with st.container(key="floating_chat_window", border=True):
        heading, close = st.columns([5, 1])
        heading.markdown("#### 💊 İlaç ve veri asistanı")
        if close.button("✕", key="close_floating_chat", help="Sohbet penceresini kapat"):
            st.session_state["floating_chat_open"] = False
            st.rerun()
        st.caption(f"{module.PAGE_TITLE} · Sohbet geçmişi sayfalar arasında korunur.")
        if not st.session_state["assistant_messages"]:
            st.markdown("Merhaba! İlaç verileri veya açık olan sayfa hakkında sorularınızı yazabilirsiniz.")
        for message in st.session_state["assistant_messages"][-12:]:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])
        with st.form("dashboard_chat_form", clear_on_submit=True):
            prompt = st.text_input("Mesajınız", placeholder="Bir mesaj yazın…", label_visibility="collapsed")
            submitted = st.form_submit_button("Gönder", width="stretch")
        if submitted and prompt.strip():
            st.session_state["assistant_messages"].append({"role": "user", "content": prompt.strip()})
            api_key = get_groq_api_key()
            if not api_key:
                answer = 'Groq API anahtarı bulunamadı. Yerelde `.env` dosyasına veya Streamlit Cloud Secrets alanına `GROQ_API_KEY = "gsk_..."` ekleyin.'
            else:
                try:
                    answer = ask_groq(st.session_state["assistant_messages"], module.PAGE_TITLE, api_key)
                except RuntimeError as error:
                    answer = f"İstek tamamlanamadı: {error}"
            st.session_state["assistant_messages"].append({"role": "assistant", "content": answer})
            st.rerun()
