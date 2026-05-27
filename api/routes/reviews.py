from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from api.supabase_client import supabase_admin
from api.dependencies import get_current_user

router = APIRouter(prefix="/reviews", tags=["reviews"])

class ReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(..., min_length=2)

@router.get("/{product_id}")
async def get_product_reviews(product_id: str):
    try:
        res = supabase_admin.table("reviews").select("*, profiles(full_name, avatar_url)").eq("product_id", product_id).order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
async def add_product_review(product_id: str, body: ReviewRequest, current_user: dict = Depends(get_current_user)):
    try:
        # Check if product exists and get seller_id
        prod_res = supabase_admin.table("products").select("title, seller_id").eq("id", product_id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail="Product not found.")
        
        product = prod_res.data[0]
        
        # Save review
        review_data = {
            "product_id": product_id,
            "user_id": current_user["id"],
            "rating": body.rating,
            "comment": body.comment
        }
        res = supabase_admin.table("reviews").insert(review_data).execute()
        review = res.data[0]
        
        # Trigger notification to seller (if review is not written by the seller themselves)
        if product["seller_id"] != current_user["id"]:
            supabase_admin.table("notifications").insert({
                "user_id": product["seller_id"],
                "type": "review",
                "title": "New rating on your product!",
                "message": f"{current_user['full_name']} rated your item '{product['title']}' with {body.rating} stars.",
                "link_url": f"/product.html?id={product_id}"
            }).execute()
            
        return review
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
