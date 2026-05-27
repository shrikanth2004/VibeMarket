from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from api.supabase_client import supabase, supabase_admin
from api.dependencies import get_current_user

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
            "profile": res.data[0]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
