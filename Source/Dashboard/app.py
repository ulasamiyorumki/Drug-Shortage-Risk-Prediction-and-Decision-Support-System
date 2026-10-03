"""Shared dashboard shell with automatic page discovery."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import streamlit as st

DASHBOARD_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DASHBOARD_DIR.parent.parent

st.set_page_config(
    page_title="Drug Shortage DSS",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded",
)
st.markdown(
    """<style>
    .stApp {background: linear-gradient(135deg, #f5f7fa 0%, #dce6f2 100%);}
    [data-testid="stSidebar"] {background: rgba(255,255,255,.72);}
    </style>""",
    unsafe_allow_html=True,
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
    st.error("No dashboard pages were found. Add a page module with PAGE_TITLE, PAGE_ICON, and render(st, context).")
    st.stop()

labels = [f"{module.PAGE_ICON} {module.PAGE_TITLE}" for module, _ in pages]
default_index = next((i for i, (module, _) in enumerate(pages) if module.PAGE_TITLE == "Exploratory Data Analysis"), 0)
selected = st.sidebar.radio("Navigate", labels, index=default_index)
module, _ = pages[labels.index(selected)]
module.render(st, {"project_root": PROJECT_ROOT, "dashboard_dir": DASHBOARD_DIR})
