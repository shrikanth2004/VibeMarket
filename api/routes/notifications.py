from fastapi import APIRouter, Depends, HTTPException
from api.supabase_client import supabase_admin
from api.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    try:
        res = supabase_admin.table("notifications").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{id}/read")
async def mark_as_read(id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Check and update
        res = supabase_admin.table("notifications").update({"is_read": True}).eq("id", id).eq("user_id", current_user["id"]).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Notification not found.")
        return {"message": "Notification marked as read.", "data": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
