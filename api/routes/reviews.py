from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import uuid
from datetime import datetime
from api.firebase_client import db
from api.dependencies import get_current_user

router = APIRouter(prefix="/reviews", tags=["reviews"])

class ReviewRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(..., min_length=2)

@router.get("/{product_id}")
async def get_product_reviews(product_id: str):
    try:
        reviews_ref = db.collection("reviews").where("product_id", "==", product_id).stream()
        reviews = []
        for doc in reviews_ref:
            rev = doc.to_dict()
            user_id = rev.get("user_id")
            if user_id:
                prof_doc = db.collection("profiles").document(user_id).get()
                if prof_doc.exists:
                    prof_data = prof_doc.to_dict()
                    rev["profiles"] = {
                        "full_name": prof_data.get("full_name"),
                        "avatar_url": prof_data.get("avatar_url")
                    }
                else:
                    rev["profiles"] = {"full_name": "User", "avatar_url": None}
            else:
                rev["profiles"] = {"full_name": "User", "avatar_url": None}
            reviews.append(rev)
            
        # Sort in memory descending by created_at
        reviews.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return reviews
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
async def add_product_review(product_id: str, body: ReviewRequest, current_user: dict = Depends(get_current_user)):
    try:
        # Check if product exists and get seller_id
        prod_doc = db.collection("products").document(product_id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")
        
        product = prod_doc.to_dict()
        
        # Save review
        review_id = f"{product_id}_{current_user['id']}"
        review_ref = db.collection("reviews").document(review_id)
        
        review_data = {
            "id": review_id,
            "product_id": product_id,
            "user_id": current_user["id"],
            "rating": body.rating,
            "comment": body.comment,
            "created_at": datetime.utcnow().isoformat()
        }
        review_ref.set(review_data)
        
        # Trigger notification to seller (if review is not written by the seller themselves)
        if product.get("seller_id") != current_user["id"]:
            notif_id = str(uuid.uuid4())
            db.collection("notifications").document(notif_id).set({
                "id": notif_id,
                "user_id": product["seller_id"],
                "type": "review",
                "title": "New rating on your product!",
                "message": f"{current_user['full_name']} rated your item '{product['title']}' with {body.rating} stars.",
                "link_url": f"/product.html?id={product_id}",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat()
            })
            
        return review_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

