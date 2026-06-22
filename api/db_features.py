"""Detect optional DB features for Firebase migration (all always available)."""
from typing import Any, Dict, List, Optional

def has_listing_status_column() -> bool:
    return True

def has_saved_searches_table() -> bool:
    return True

def get_product_status(product: Dict[str, Any]) -> str:
    return product.get("status") or "active"

def fetch_products_columns(extra: str = "") -> str:
    return ""

def apply_listing_status_filter(query, status_value: str):
    # This was for Supabase postgrest query building.
    # In Firestore we will query differently. We keep a placeholder.
    return query

def migration_status() -> Dict[str, Any]:
    return {
        "listing_status": True,
        "saved_searches": True,
        "ready": True,
        "hint": None,
    }

