"""Match new listings against saved searches and send notifications."""
from typing import Any, Dict, Optional

from api.supabase_client import supabase_admin
from api.db_features import has_saved_searches_table


def _product_matches_search(product: Dict[str, Any], search: Dict[str, Any]) -> bool:
    if search.get("category") and product.get("category") != search["category"]:
        return False
    if search.get("condition") and product.get("condition") != search["condition"]:
        return False

    price = float(product.get("price") or 0)
    if search.get("min_price") is not None and price < float(search["min_price"]):
        return False
    if search.get("max_price") is not None and price > float(search["max_price"]):
        return False

    loc = (search.get("location") or "").strip()
    if loc and loc.lower() not in (product.get("location") or "").lower():
        return False

    term = (search.get("search") or "").strip().lower()
    if term:
        title = (product.get("title") or "").lower()
        desc = (product.get("description") or "").lower()
        if term not in title and term not in desc:
            return False

    return True


def notify_saved_search_matches(product: Dict[str, Any]) -> None:
    """Notify users whose saved searches match a newly active listing."""
    if product.get("status") not in (None, "active"):
        return

    if not has_saved_searches_table():
        return

    try:
        res = supabase_admin.table("saved_searches").select("*").eq("alert_enabled", True).execute()
        searches = res.data or []
    except Exception as exc:
        print(f"[search_alerts] failed to load saved searches: {exc}")
        return

    product_id = product.get("id")
    title = product.get("title", "New listing")
    price = product.get("price", 0)

    for s in searches:
        if s.get("user_id") == product.get("seller_id"):
            continue
        if not _product_matches_search(product, s):
            continue

        label = s.get("label") or "your saved search"
        try:
            supabase_admin.table("notifications").insert({
                "user_id": s["user_id"],
                "type": "search_alert",
                "title": "New listing matches your alert",
                "message": f"'{title}' ({price}) matches {label}.",
                "link_url": f"/product.html?id={product_id}",
            }).execute()
        except Exception as exc:
            print(f"[search_alerts] notification insert failed: {exc}")


def notify_wishlist_item_sold(product: Dict[str, Any]) -> None:
    """Notify wishlist users when a listing is marked sold."""
    product_id = product.get("id")
    title = product.get("title", "An item")

    try:
        wishers = supabase_admin.table("wishlists").select("user_id").eq(
            "product_id", product_id
        ).execute()
    except Exception as exc:
        print(f"[search_alerts] wishlist lookup failed: {exc}")
        return

    for w in wishers.data or []:
        if w["user_id"] == product.get("seller_id"):
            continue
        try:
            supabase_admin.table("notifications").insert({
                "user_id": w["user_id"],
                "type": "product_update",
                "title": "Wishlist item sold",
                "message": f"'{title}' has been marked as sold.",
                "link_url": f"/product.html?id={product_id}",
            }).execute()
        except Exception as exc:
            print(f"[search_alerts] sold notification failed: {exc}")
