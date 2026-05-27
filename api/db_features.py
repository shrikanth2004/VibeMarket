"""Detect optional DB columns/tables and provide safe fallbacks."""
from typing import Any, Dict, List, Optional

from api.supabase_client import supabase_admin

_status_column: Optional[bool] = None
_saved_searches_table: Optional[bool] = None

MIGRATION_HINT = (
    "Run migrations/add_features.sql in your Supabase project → SQL Editor, then reload."
)


def _is_missing_column_error(exc: Exception, column: str) -> bool:
    msg = str(exc).lower()
    return column.lower() in msg and "does not exist" in msg


def _is_missing_table_error(exc: Exception, table: str) -> bool:
    msg = str(exc).lower()
    return table.lower() in msg and ("does not exist" in msg or "could not find" in msg)


def has_listing_status_column() -> bool:
    global _status_column
    if _status_column is not None:
        return _status_column
    try:
        supabase_admin.table("products").select("status").limit(1).execute()
        _status_column = True
    except Exception as exc:
        if _is_missing_column_error(exc, "status"):
            _status_column = False
        else:
            raise
    return _status_column


def has_saved_searches_table() -> bool:
    global _saved_searches_table
    if _saved_searches_table is not None:
        return _saved_searches_table
    try:
        supabase_admin.table("saved_searches").select("id").limit(1).execute()
        _saved_searches_table = True
    except Exception as exc:
        if _is_missing_table_error(exc, "saved_searches"):
            _saved_searches_table = False
        else:
            raise
    return _saved_searches_table


def get_product_status(product: Dict[str, Any]) -> str:
    return product.get("status") or "active"


def fetch_products_columns(extra: str = "") -> str:
    base = "id, category, price, created_at"
    if extra:
        base = f"{base}, {extra}"
    if has_listing_status_column():
        return f"{base}, status" if "status" not in base else base
    return base


def apply_listing_status_filter(query, status_value: str):
    """Apply status filter only when the column exists."""
    if has_listing_status_column():
        return query.eq("status", status_value)
    return query


def migration_status() -> Dict[str, Any]:
    status_ok = has_listing_status_column()
    searches_ok = has_saved_searches_table()
    return {
        "listing_status": status_ok,
        "saved_searches": searches_ok,
        "ready": status_ok and searches_ok,
        "hint": None if (status_ok and searches_ok) else MIGRATION_HINT,
    }
