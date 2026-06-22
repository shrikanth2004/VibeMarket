from collections import defaultdict
from datetime import datetime, timedelta, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from api.firebase_client import db
from api.dependencies import get_current_admin
from api.storage_utils import extract_storage_path, resolve_products_list, delete_storage_files
from api.db_features import (
    get_product_status,
    migration_status,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)], tags=["admin"])

class UpdateRoleRequest(BaseModel):
    role: str

@router.get("/setup")
async def get_setup_status():
    """Report setup status (always ready for Firestore)."""
    return migration_status()


@router.get("/stats")
async def get_admin_stats():
    try:
        users_ref = db.collection("profiles").stream()
        products_ref = db.collection("products").stream()
        reviews_ref = db.collection("reviews").stream()
        wishlist_ref = db.collection("wishlists").stream()

        users = [doc.to_dict() for doc in users_ref]
        products = [doc.to_dict() for doc in products_ref]
        reviews_count = len([doc.id for doc in reviews_ref])
        wishlist_count = len([doc.id for doc in wishlist_ref])

        active_listings = sum(1 for p in products if get_product_status(p) == "active")
        sold_listings = sum(1 for p in products if get_product_status(p) == "sold")

        prices = [float(p["price"]) for p in products if p.get("price") is not None]
        avg_price = round(sum(prices) / len(prices), 2) if prices else 0

        by_category = defaultdict(int)
        for p in products:
            by_category[p.get("category") or "Other"] += 1
        listings_by_category = [
            {"category": k, "count": v}
            for k, v in sorted(by_category.items(), key=lambda x: -x[1])
        ]

        now = datetime.now(timezone.utc)
        listings_per_day = []
        users_per_day = []
        for i in range(6, -1, -1):
            day = (now - timedelta(days=i)).date()
            day_str = day.isoformat()
            listings_per_day.append({
                "date": day_str,
                "count": sum(
                    1 for p in products
                    if (p.get("created_at") or "")[:10] == day_str
                ),
            })
            users_per_day.append({
                "date": day_str,
                "count": sum(
                    1 for u in users
                    if (u.get("created_at") or "")[:10] == day_str
                ),
            })

        new_users_7d = sum(u["count"] for u in users_per_day)
        new_listings_7d = sum(d["count"] for d in listings_per_day)

        return {
            "total_users": len(users),
            "total_listings": len(products),
            "active_listings": active_listings,
            "sold_listings": sold_listings,
            "avg_price": avg_price,
            "total_reviews": reviews_count,
            "total_wishlists": wishlist_count,
            "new_users_7d": new_users_7d,
            "new_listings_7d": new_listings_7d,
            "listings_by_category": listings_by_category,
            "listings_per_day": listings_per_day,
            "users_per_day": users_per_day,
            "migration": migration_status(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/listings")
async def get_all_listings_admin():
    try:
        products_ref = db.collection("products").stream()
        products = [doc.to_dict() for doc in products_ref]
        
        # Sort descending by created_at
        products.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        
        # Join seller profiles info
        seller_ids = {p["seller_id"] for p in products if p.get("seller_id")}
        seller_profiles = {}
        for s_id in seller_ids:
            try:
                prof_doc = db.collection("profiles").document(s_id).get()
                if prof_doc.exists:
                    prof_data = prof_doc.to_dict()
                    seller_profiles[s_id] = {
                        "full_name": prof_data.get("full_name"),
                        "avatar_url": prof_data.get("avatar_url")
                    }
                else:
                    seller_profiles[s_id] = {"full_name": "User", "avatar_url": None}
            except Exception:
                seller_profiles[s_id] = {"full_name": "User", "avatar_url": None}
                
        for p in products:
            p["profiles"] = seller_profiles.get(p.get("seller_id"), {"full_name": "User", "avatar_url": None})
            
        return resolve_products_list(products)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users")
async def get_all_users():
    try:
        users_ref = db.collection("profiles").stream()
        users = [doc.to_dict() for doc in users_ref]
        # Sort descending by created_at
        users.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return users
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, body: UpdateRoleRequest):
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'user' or 'admin'.")
        
    try:
        profile_ref = db.collection("profiles").document(user_id)
        if not profile_ref.get().exists:
            raise HTTPException(status_code=404, detail="User profile not found.")
            
        profile_ref.update({"role": body.role})
        updated = profile_ref.get().to_dict()
        return {"message": "User role updated successfully.", "user": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/listings/{product_id}")
async def moderate_delete_listing(product_id: str):
    try:
        prod_ref = db.collection("products").document(product_id)
        prod_doc = prod_ref.get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Listing not found.")
            
        product = prod_doc.to_dict()
        
        # Delete from database
        prod_ref.delete()
        
        # Try to delete images from storage
        try:
            files_to_delete = []
            for stored in product.get("images") or []:
                path = extract_storage_path(stored)
                if path:
                    files_to_delete.append(path)
            if files_to_delete:
                delete_storage_files(files_to_delete)
        except Exception:
            pass
            
        # Insert system notification for user whose product was moderated
        try:
            notif_id = str(uuid.uuid4())
            db.collection("notifications").document(notif_id).set({
                "id": notif_id,
                "user_id": product["seller_id"],
                "type": "system",
                "title": "Listing removed by moderator",
                "message": f"Your listing for '{product['title']}' was removed because it violated marketplace guidelines.",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat()
            })
        except Exception:
            pass
        
        return {"message": "Listing deleted successfully by moderator."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

