import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from api.firebase_client import db
from api.dependencies import get_current_user
from api.storage_utils import resolve_product_images

router = APIRouter(prefix="/transactions", tags=["transactions"])


class RecordSaleRequest(BaseModel):
    product_id: str
    buyer_id: Optional[str] = None   # Optional — seller may not know buyer's account
    buyer_name: Optional[str] = None  # Free-text fallback
    sale_price: Optional[float] = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def record_sale(body: RecordSaleRequest, current_user: dict = Depends(get_current_user)):
    """Record a sale transaction. Called when seller marks a product as sold."""
    try:
        # Verify product exists and belongs to seller
        prod_doc = db.collection("products").document(body.product_id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")

        product = prod_doc.to_dict()
        if product["seller_id"] != current_user["id"] and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: you are not the seller of this product.")

        # If buyer_id is provided, verify buyer exists
        buyer_info = {}
        if body.buyer_id:
            buyer_doc = db.collection("profiles").document(body.buyer_id).get()
            if buyer_doc.exists:
                bd = buyer_doc.to_dict()
                buyer_info = {
                    "buyer_id": body.buyer_id,
                    "buyer_name": bd.get("full_name", "User"),
                    "buyer_avatar": bd.get("avatar_url"),
                }
            else:
                buyer_info = {"buyer_id": body.buyer_id, "buyer_name": body.buyer_name or "Unknown"}
        else:
            buyer_info = {"buyer_id": None, "buyer_name": body.buyer_name or "Anonymous / Cash"}

        txn_id = str(uuid.uuid4())
        txn_data = {
            "id": txn_id,
            "product_id": body.product_id,
            "product_title": product.get("title", ""),
            "product_images": product.get("images", []),
            "product_category": product.get("category", ""),
            "seller_id": current_user["id"],
            "seller_name": current_user.get("full_name", ""),
            "sale_price": body.sale_price if body.sale_price is not None else product.get("price", 0),
            "created_at": datetime.utcnow().isoformat(),
            **buyer_info,
        }

        db.collection("transactions").document(txn_id).set(txn_data)

        # Mark product as sold
        db.collection("products").document(body.product_id).update({
            "status": "sold",
            "buyer_id": buyer_info.get("buyer_id"),
            "updated_at": datetime.utcnow().isoformat(),
        })

        # Notify buyer (if they have an account)
        if buyer_info.get("buyer_id"):
            notif_id = str(uuid.uuid4())
            db.collection("notifications").document(notif_id).set({
                "id": notif_id,
                "user_id": buyer_info["buyer_id"],
                "type": "purchase_confirmed",
                "title": "Purchase confirmed! 🎉",
                "message": f"The seller confirmed your purchase of '{product.get('title', '')}'.",
                "link_url": f"/product.html?id={body.product_id}",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat(),
            })

        return {"message": "Sale recorded successfully.", "transaction": txn_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/selling")
async def get_selling_transactions(current_user: dict = Depends(get_current_user)):
    """Get all sales made by the current user (as seller)."""
    try:
        txns_ref = db.collection("transactions") \
            .where("seller_id", "==", current_user["id"]) \
            .stream()

        txns = [doc.to_dict() for doc in txns_ref]
        txns.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return txns
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/buying")
async def get_buying_transactions(current_user: dict = Depends(get_current_user)):
    """Get all purchases made by the current user (as buyer)."""
    try:
        txns_ref = db.collection("transactions") \
            .where("buyer_id", "==", current_user["id"]) \
            .stream()

        txns = [doc.to_dict() for doc in txns_ref]
        txns.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return txns
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
