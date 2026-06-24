from fastapi import APIRouter, Depends, HTTPException
from api.firebase_client import db
from api.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

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

