from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from api.firebase_client import db
from api.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushSubscriptionRequest(BaseModel):
    subscription: Any  # Raw JSON from browser PushManager.subscribe()


@router.get("")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    try:
        notifications_ref = db.collection("notifications").where("user_id", "==", current_user["id"]).stream()
        notifications = [doc.to_dict() for doc in notifications_ref]
        # Sort descending by created_at
        notifications.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return notifications
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/read-all")
async def mark_all_as_read(current_user: dict = Depends(get_current_user)):
    try:
        unread_refs = db.collection("notifications")\
            .where("user_id", "==", current_user["id"])\
            .where("is_read", "==", False)\
            .stream()
        for doc in unread_refs:
            doc.reference.update({"is_read": True})
        return {"message": "All notifications marked as read."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{id}/read")
async def mark_as_read(id: str, current_user: dict = Depends(get_current_user)):
    try:
        notif_ref = db.collection("notifications").document(id)
        notif_doc = notif_ref.get()
        if not notif_doc.exists or notif_doc.to_dict().get("user_id") != current_user["id"]:
            raise HTTPException(status_code=404, detail="Notification not found.")

        notif_ref.update({"is_read": True})
        updated = notif_ref.get().to_dict()
        return {"message": "Notification marked as read.", "data": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/push-subscribe")
async def push_subscribe(body: PushSubscriptionRequest, current_user: dict = Depends(get_current_user)):
    """Save a browser Web Push subscription for the current user."""
    try:
        db.collection("push_subscriptions").document(current_user["id"]).set({
            "user_id": current_user["id"],
            "subscription": body.subscription,
        })
        return {"message": "Push subscription saved."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/push-unsubscribe")
async def push_unsubscribe(current_user: dict = Depends(get_current_user)):
    """Remove the push subscription for the current user."""
    try:
        db.collection("push_subscriptions").document(current_user["id"]).delete()
        return {"message": "Push subscription removed."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/push-status")
async def push_status(current_user: dict = Depends(get_current_user)):
    """Check if the current user has an active push subscription stored."""
    try:
        doc = db.collection("push_subscriptions").document(current_user["id"]).get()
        return {"subscribed": doc.exists}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
