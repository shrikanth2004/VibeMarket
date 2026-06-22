"""Match new listings against saved searches and send notifications."""
from typing import Any, Dict, Optional
import uuid
from datetime import datetime

from api.firebase_client import db
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

    try:
        searches_ref = db.collection("saved_searches").where("alert_enabled", "==", True).stream()
        searches = [doc.to_dict() for doc in searches_ref]
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
            notif_id = str(uuid.uuid4())
            db.collection("notifications").document(notif_id).set({
                "id": notif_id,
                "user_id": s["user_id"],
                "type": "search_alert",
                "title": "New listing matches your alert",
                "message": f"'{title}' ({price}) matches {label}.",
                "link_url": f"/product.html?id={product_id}",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat()
            })
        except Exception as exc:
            print(f"[search_alerts] notification insert failed: {exc}")


def notify_wishlist_item_sold(product: Dict[str, Any]) -> None:
    """Notify wishlist users when a listing is marked sold."""
    product_id = product.get("id")
    title = product.get("title", "An item")

    try:
        wishers_ref = db.collection("wishlists").where("product_id", "==", product_id).stream()
        wishers = [doc.to_dict() for doc in wishers_ref]
    except Exception as exc:
        print(f"[search_alerts] wishlist lookup failed: {exc}")
        return

    for w in wishers:
        if w.get("user_id") == product.get("seller_id"):
            continue
        try:
            notif_id = str(uuid.uuid4())
            db.collection("notifications").document(notif_id).set({
                "id": notif_id,
                "user_id": w["user_id"],
                "type": "product_update",
                "title": "Wishlist item sold",
                "message": f"'{title}' has been marked as sold.",
                "link_url": f"/product.html?id={product_id}",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat()
            })
        except Exception as exc:
            print(f"[search_alerts] sold notification failed: {exc}")

