"""Landing page for the modular drug shortage dashboard."""

PAGE_TITLE = "Overview"
PAGE_ICON = "💊"

def render(st, context):
    st.title("💊 Drug Shortage Decision Support System")
    st.markdown(
        """Use the navigation menu to move between independent dashboard pages.

        The **Exploratory Data Analysis** page brings together FDA drug and shortage records,
        VA pharmaceutical contracts, NDC product/package directories, and Medicare Part D
        reports for 2016–2024. Add future features as separate Python modules alongside
        `eda.py`; each module provides a title, an icon, and a `render(st, context)` function."""
    )
    st.info("The EDA page is selected by default so the full data analysis is visible when the dashboard opens.")
