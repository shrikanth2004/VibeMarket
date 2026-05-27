from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from api.supabase_client import supabase_admin
from api.dependencies import get_current_admin
from api.storage_utils import extract_storage_path, BUCKET

router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_admin)], tags=["admin"])

class UpdateRoleRequest(BaseModel):
    role: str

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
