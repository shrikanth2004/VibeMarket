from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import uuid
from datetime import datetime
from api.firebase_client import db
from api.dependencies import get_current_user

router = APIRouter(prefix="/comments", tags=["comments"])

class CommentRequest(BaseModel):
    content: str = Field(..., min_length=1)

@router.get("/{product_id}")
async def get_product_comments(product_id: str):
    try:
        comments_ref = db.collection("comments").where("product_id", "==", product_id).stream()
        comments = []
        for doc in comments_ref:
            com = doc.to_dict()
            user_id = com.get("user_id")
            if user_id:
                prof_doc = db.collection("profiles").document(user_id).get()
                if prof_doc.exists:
                    prof_data = prof_doc.to_dict()
                    com["profiles"] = {
                        "full_name": prof_data.get("full_name"),
                        "avatar_url": prof_data.get("avatar_url")
                    }
                else:
                    com["profiles"] = {"full_name": "User", "avatar_url": None}
            else:
                com["profiles"] = {"full_name": "User", "avatar_url": None}
            comments.append(com)
            
        comments.sort(key=lambda x: x.get("created_at") or "")
        return comments
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
async def add_product_comment(product_id: str, body: CommentRequest, current_user: dict = Depends(get_current_user)):
    try:
        # Check if product exists
        prod_doc = db.collection("products").document(product_id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_doc.to_dict()
        
        # Save comment
        comment_id = str(uuid.uuid4())
        comment_data = {
            "id": comment_id,
            "product_id": product_id,
            "user_id": current_user["id"],
            "content": body.content,
            "created_at": datetime.utcnow().isoformat()
        }
        db.collection("comments").document(comment_id).set(comment_data)
        
        # Trigger notification to seller
        if product.get("seller_id") != current_user["id"]:
            notif_id = str(uuid.uuid4())
            db.collection("notifications").document(notif_id).set({
                "id": notif_id,
                "user_id": product["seller_id"],
                "type": "comment",
                "title": "New comment on your product!",
                "message": f"{current_user['full_name']} commented: \"{body.content[:50]}...\"",
                "link_url": f"/product.html?id={product_id}",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat()
            })
            
        return comment_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

