from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from api.supabase_client import supabase, supabase_admin
from api.dependencies import get_current_user
from api.storage_utils import upload_avatar_image, resolve_profile_avatar

router = APIRouter(prefix="/auth", tags=["auth"])

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignUpRequest):
    try:
        # Sign up the user in Supabase Auth
        res = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {
                "data": {
                    "full_name": body.full_name
                }
            }
        })
        
        if not res.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signup failed. Please try again."
            )
            
        return {
            "message": "User registered successfully.",
            "user": {
                "id": res.user.id,
                "email": res.user.email
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login")
async def login(body: LoginRequest):
    try:
        # Authenticate the user against Supabase Auth
        res = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password
        })
        
        if not res.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )
            
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "token_type": "bearer",
            "user": {
                "id": res.user.id,
                "email": res.user.email
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

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
        # Update in database profiles table using admin client (bypasses default restrictive write policies)
        res = supabase_admin.table("profiles").update(update_data).eq("id", current_user["id"]).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Profile not found.")
        return {
            "message": "Profile updated successfully.",
            "profile": resolve_profile_avatar(res.data[0])
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

        avatar_path = upload_avatar_image(current_user["id"], file_bytes, avatar.content_type)
        res = supabase_admin.table("profiles").update({"avatar_url": avatar_path}).eq(
            "id", current_user["id"]
        ).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Profile not found.")

        return {
            "message": "Profile photo updated successfully.",
            "profile": resolve_profile_avatar(res.data[0]),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
