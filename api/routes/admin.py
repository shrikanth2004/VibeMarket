from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from api.supabase_client import supabase_admin
from api.dependencies import get_current_admin
from api.storage_utils import extract_storage_path, resolve_products_list, BUCKET
from api.db_features import (
    fetch_products_columns,
    get_product_status,
    migration_status,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)], tags=["admin"])

class UpdateRoleRequest(BaseModel):
    role: str

@router.get("/setup")
async def get_setup_status():
    """Report whether optional DB migrations have been applied."""
    return migration_status()


@router.get("/stats")
async def get_admin_stats():
    try:
        users_res = supabase_admin.table("profiles").select("id, created_at").execute()
        products_res = supabase_admin.table("products").select(
            fetch_products_columns()
        ).execute()
        reviews_res = supabase_admin.table("reviews").select("id").execute()
        wishlist_res = supabase_admin.table("wishlists").select("id").execute()

        users = users_res.data or []
        products = products_res.data or []
        reviews_count = len(reviews_res.data or [])
        wishlist_count = len(wishlist_res.data or [])

        active_listings = sum(1 for p in products if get_product_status(p) == "active")
        sold_listings = sum(1 for p in products if get_product_status(p) == "sold")
        setup = migration_status()

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
            "sold_listings": sold_listings if setup["listing_status"] else 0,
            "avg_price": avg_price,
            "total_reviews": reviews_count,
            "total_wishlists": wishlist_count,
            "new_users_7d": new_users_7d,
            "new_listings_7d": new_listings_7d,
            "listings_by_category": listings_by_category,
            "listings_per_day": listings_per_day,
            "users_per_day": users_per_day,
            "migration": setup,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/listings")
async def get_all_listings_admin():
    try:
        res = supabase_admin.table("products").select(
            "*, profiles(full_name, avatar_url)"
        ).order("created_at", desc=True).execute()
        return resolve_products_list(res.data or [])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users")
async def get_all_users():
    try:
        # Fetch all user profiles from the profiles table
        res = supabase_admin.table("profiles").select("*").order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, body: UpdateRoleRequest):
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'user' or 'admin'.")
        
    try:
        # Update user role in the profiles table
        res = supabase_admin.table("profiles").update({"role": body.role}).eq("id", user_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="User profile not found.")
        return {"message": "User role updated successfully.", "user": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/listings/{product_id}")
async def moderate_delete_listing(product_id: str):
    try:
        # Fetch product details first to clean up storage
        prod_res = supabase_admin.table("products").select("*").eq("id", product_id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail="Listing not found.")
            
        product = prod_res.data[0]
        
        # Delete from database
        supabase_admin.table("products").delete().eq("id", product_id).execute()
        
        # Try to delete images from storage
        try:
            files_to_delete = []
            for stored in product["images"]:
                path = extract_storage_path(stored)
                if path:
                    files_to_delete.append(path)
            if files_to_delete:
                supabase_admin.storage.from_(BUCKET).remove(files_to_delete)
        except Exception:
            pass
            
        # Optional: insert system notification for user whose product was moderated
        supabase_admin.table("notifications").insert({
            "user_id": product["seller_id"],
            "type": "system",
            "title": "Listing removed by moderator",
            "message": f"Your listing for '{product['title']}' was removed because it violated marketplace guidelines."
        }).execute()
        
        return {"message": "Listing deleted successfully by moderator."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
