# Modular Streamlit dashboard

Start the dashboard from the project root:

```bash
streamlit run Source/Dashboard/app.py
```

`app.py` is the shared shell. It discovers page modules in this directory and shows them in the sidebar. The EDA page is selected on startup so its analysis remains the initial dashboard view.

## Add a page

Create a Python file beside `app.py` (for example, `risk_model.py`) and define the page metadata and renderer:

```python
PAGE_TITLE = "Risk Model"
PAGE_ICON = "⚠️"

def render(st, context):
    st.title("Risk Model")
    st.write("Build this page's interface here.")
```

The shared shell passes the Streamlit module as `st` and a context dictionary containing `project_root` and `dashboard_dir`. A page is discovered when it defines `PAGE_TITLE`, `PAGE_ICON`, and `render`. Keep page-specific data loading and UI in that module; shared application configuration and navigation stay in `app.py`.
