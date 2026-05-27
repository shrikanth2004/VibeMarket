from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from api.supabase_client import supabase_admin
from api.dependencies import get_current_user

router = APIRouter(prefix="/comments", tags=["comments"])

class CommentRequest(BaseModel):
    content: str = Field(..., min_length=1)

@router.get("/{product_id}")
async def get_product_comments(product_id: str):
    try:
        res = supabase_admin.table("comments").select("*, profiles(full_name, avatar_url)").eq("product_id", product_id).order("created_at", desc=False).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
async def add_product_comment(product_id: str, body: CommentRequest, current_user: dict = Depends(get_current_user)):
    try:
        # Check if product exists
        prod_res = supabase_admin.table("products").select("title, seller_id").eq("id", product_id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_res.data[0]
        
        # Save comment
        comment_data = {
            "product_id": product_id,
            "user_id": current_user["id"],
            "content": body.content
        }
        res = supabase_admin.table("comments").insert(comment_data).execute()
        comment = res.data[0]
        
        # Trigger notification to seller
        if product["seller_id"] != current_user["id"]:
            supabase_admin.table("notifications").insert({
                "user_id": product["seller_id"],
                "type": "comment",
                "title": "New comment on your product!",
                "message": f"{current_user['full_name']} commented: \"{body.content[:50]}...\"",
                "link_url": f"/product.html?id={product_id}"
            }).execute()
            
        return comment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
