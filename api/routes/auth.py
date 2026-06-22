from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
import io
import base64
from PIL import Image
from firebase_admin import auth as firebase_auth
from api.firebase_client import db
from api.dependencies import get_current_user
from api.storage_utils import resolve_profile_avatar

router = APIRouter(prefix="/auth", tags=["auth"])

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


@router.post("/verify-token")
async def verify_token(current_user: dict = Depends(get_current_user)):
    """Verify a Firebase ID token and return the user profile.
    The frontend sends the Firebase ID token, and this endpoint validates it
    and returns/creates the Firestore profile."""
    return current_user


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.put("/profile")
async def update_profile(body: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    update_data = {}
    if body.full_name is not None:
        update_data["full_name"] = body.full_name
    if body.avatar_url is not None:
        update_data["avatar_url"] = body.avatar_url

    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided.")

    try:
        profile_ref = db.collection("profiles").document(current_user["id"])
        profile_doc = profile_ref.get()
        if not profile_doc.exists:
            # Create profile first
            update_data["id"] = current_user["id"]
            update_data["email"] = current_user.get("email") or ""
            update_data["role"] = current_user.get("role") or "user"
            update_data["created_at"] = current_user.get("created_at") or ""
            profile_ref.set(update_data)
        else:
            profile_ref.update(update_data)

        updated_profile = profile_ref.get().to_dict()
        return {
            "message": "Profile updated successfully.",
            "profile": resolve_profile_avatar(updated_profile)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/profile/avatar")
async def upload_profile_avatar(
    avatar: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if not avatar.content_type or not avatar.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed.")

    try:
        file_bytes = await avatar.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty image file.")

        if len(file_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller.")

        # Process image using Pillow to resize and compress it
        image = Image.open(io.BytesIO(file_bytes))

        # Convert RGBA to RGB if necessary for JPEG conversion
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")

        # Get standard resize filter (LANCZOS)
        resample_filter = Image.LANCZOS
        if hasattr(Image, 'Resampling'):
            resample_filter = Image.Resampling.LANCZOS
        elif hasattr(Image, 'ANTIALIAS'):
            resample_filter = Image.ANTIALIAS

        # Resize to 200x200
        image = image.resize((200, 200), resample_filter)

        # Save as JPEG in bytes buffer
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG", quality=85)

        # Base64 encode the compressed JPEG bytes
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        avatar_path = f"data:image/jpeg;base64,{img_str}"

        profile_ref = db.collection("profiles").document(current_user["id"])
        profile_doc = profile_ref.get()
        if not profile_doc.exists:
            profile_ref.set({
                "id": current_user["id"],
                "email": current_user.get("email") or "",
                "role": current_user.get("role") or "user",
                "avatar_url": avatar_path,
                "created_at": current_user.get("created_at") or ""
            })
        else:
            profile_ref.update({"avatar_url": avatar_path})

        updated_profile = profile_ref.get().to_dict()

        return {
            "message": "Profile photo updated successfully.",
            "profile": resolve_profile_avatar(updated_profile),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
