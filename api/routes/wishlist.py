from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
from api.firebase_client import db
from api.dependencies import get_current_user
from api.storage_utils import resolve_nested_product_rows

router = APIRouter(prefix="/wishlist", tags=["wishlist"])

@router.get("")
async def get_wishlist(current_user: dict = Depends(get_current_user)):
    try:
        wishlists_ref = db.collection("wishlists").where("user_id", "==", current_user["id"]).stream()
        wishlist_items = []
        
        for doc in wishlists_ref:
            item = doc.to_dict()
            prod_id = item.get("product_id")
            # Fetch product details
            prod_doc = db.collection("products").document(prod_id).get()
            if prod_doc.exists:
                product = prod_doc.to_dict()
                # Fetch seller name
                seller_id = product.get("seller_id")
                if seller_id:
                    prof_doc = db.collection("profiles").document(seller_id).get()
                    if prof_doc.exists:
                        prof_data = prof_doc.to_dict()
                        product["profiles"] = {"full_name": prof_data.get("full_name")}
                    else:
                        product["profiles"] = {"full_name": "User"}
                else:
                    product["profiles"] = {"full_name": "User"}
                
                item["products"] = product
                wishlist_items.append(item)
                
        return resolve_nested_product_rows(wishlist_items)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
async def add_to_wishlist(product_id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Check if product exists
        prod_doc = db.collection("products").document(product_id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        wishlist_id = f"{current_user['id']}_{product_id}"
        wishlist_ref = db.collection("wishlists").document(wishlist_id)
        if wishlist_ref.get().exists:
            return {"message": "Product is already in your wishlist."}
            
        wishlist_data = {
            "id": wishlist_id,
            "user_id": current_user["id"],
            "product_id": product_id,
            "created_at": datetime.utcnow().isoformat()
        }
        wishlist_ref.set(wishlist_data)
        
        return {"message": "Product added to wishlist.", "data": wishlist_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{product_id}")
async def remove_from_wishlist(product_id: str, current_user: dict = Depends(get_current_user)):
    try:
        wishlist_id = f"{current_user['id']}_{product_id}"
        wishlist_ref = db.collection("wishlists").document(wishlist_id)
        if not wishlist_ref.get().exists:
            raise HTTPException(status_code=404, detail="Wishlist item not found.")
            
        wishlist_ref.delete()
        return {"message": "Product removed from wishlist."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

