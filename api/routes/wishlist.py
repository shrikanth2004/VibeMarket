from fastapi import APIRouter, Depends, HTTPException, status
from api.supabase_client import supabase_admin
from api.dependencies import get_current_user
from api.storage_utils import resolve_nested_product_rows

router = APIRouter(prefix="/wishlist", tags=["wishlist"])

@router.get("")
async def get_wishlist(current_user: dict = Depends(get_current_user)):
    try:
        # Fetch wishlist and join product details
        # Supabase syntax: select("*, products(*)") joined by foreign key
        res = supabase_admin.table("wishlists").select("id, created_at, products(*, profiles(full_name))").eq("user_id", current_user["id"]).execute()
        return resolve_nested_product_rows(res.data or [])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
async def add_to_wishlist(product_id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Check if product exists
        prod = supabase_admin.table("products").select("id").eq("id", product_id).execute()
        if not prod.data:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        # Add to wishlist
        res = supabase_admin.table("wishlists").insert({
            "user_id": current_user["id"],
            "product_id": product_id
        }).execute()
        
        return {"message": "Product added to wishlist.", "data": res.data[0]}
    except Exception as e:
        # Handle unique constraint violation (already in wishlist)
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return {"message": "Product is already in your wishlist."}
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{product_id}")
async def remove_from_wishlist(product_id: str, current_user: dict = Depends(get_current_user)):
    try:
        res = supabase_admin.table("wishlists").delete().eq("user_id", current_user["id"]).eq("product_id", product_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Wishlist item not found.")
        return {"message": "Product removed from wishlist."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
