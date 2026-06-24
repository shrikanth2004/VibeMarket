import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
from api.firebase_client import db
from api.dependencies import get_current_user
from api.storage_utils import resolve_profile_avatar

router = APIRouter(prefix="/sellers", tags=["sellers"])


@router.post("/{seller_id}/follow", status_code=status.HTTP_201_CREATED)
async def follow_seller(seller_id: str, current_user: dict = Depends(get_current_user)):
    """Follow a seller to get notified when they post new listings."""
    if seller_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot follow yourself.")

    # Check seller exists
    seller_doc = db.collection("profiles").document(seller_id).get()
    if not seller_doc.exists:
        raise HTTPException(status_code=404, detail="Seller not found.")

    follow_id = f"{current_user['id']}_{seller_id}"
    follow_ref = db.collection("seller_follows").document(follow_id)

    if follow_ref.get().exists:
        return {"message": "Already following this seller."}

    follow_data = {
        "id": follow_id,
        "follower_id": current_user["id"],
        "seller_id": seller_id,
        "created_at": datetime.utcnow().isoformat(),
    }
    follow_ref.set(follow_data)
    return {"message": "Now following seller.", "data": follow_data}


@router.delete("/{seller_id}/follow")
async def unfollow_seller(seller_id: str, current_user: dict = Depends(get_current_user)):
    """Unfollow a seller."""
    follow_id = f"{current_user['id']}_{seller_id}"
    follow_ref = db.collection("seller_follows").document(follow_id)

    if not follow_ref.get().exists:
        raise HTTPException(status_code=404, detail="You are not following this seller.")

    follow_ref.delete()
    return {"message": "Unfollowed seller successfully."}


@router.get("/following")
async def get_following(current_user: dict = Depends(get_current_user)):
    """Get list of sellers the current user is following."""
    try:
        follows_ref = db.collection("seller_follows") \
            .where("follower_id", "==", current_user["id"]) \
            .stream()

        result = []
        for doc in follows_ref:
            follow = doc.to_dict()
            seller_id = follow.get("seller_id")
            seller_doc = db.collection("profiles").document(seller_id).get()
            if seller_doc.exists:
                seller = seller_doc.to_dict()
                # Count their active listings
                listings = db.collection("products") \
                    .where("seller_id", "==", seller_id) \
                    .where("status", "==", "active") \
                    .stream()
                listing_count = sum(1 for _ in listings)

                result.append({
                    "follow_id": follow["id"],
                    "seller_id": seller_id,
                    "full_name": seller.get("full_name", "User"),
                    "avatar_url": seller.get("avatar_url"),
                    "role": seller.get("role", "user"),
                    "listing_count": listing_count,
                    "followed_at": follow.get("created_at"),
                })

        result.sort(key=lambda x: x.get("followed_at") or "", reverse=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{seller_id}/is-following")
async def check_is_following(seller_id: str, current_user: dict = Depends(get_current_user)):
    """Check if current user follows a specific seller."""
    follow_id = f"{current_user['id']}_{seller_id}"
    follow_ref = db.collection("seller_follows").document(follow_id)
    return {"is_following": follow_ref.get().exists}


@router.get("/{seller_id}/followers/count")
async def get_follower_count(seller_id: str):
    """Get the number of followers for a seller."""
    try:
        followers = db.collection("seller_follows") \
            .where("seller_id", "==", seller_id) \
            .stream()
        count = sum(1 for _ in followers)
        return {"seller_id": seller_id, "follower_count": count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
