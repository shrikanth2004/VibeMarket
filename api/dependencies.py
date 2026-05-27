from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from api.supabase_client import supabase, supabase_admin
from api.config import ADMIN_EMAILS

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # Validate the token with Supabase Auth
        auth_resp = supabase.auth.get_user(token)
        user = auth_resp.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session token.")
        
        # Retrieve user profile from the database
        profile_resp = supabase_admin.table("profiles").select("*").eq("id", user.id).execute()
        
        if not profile_resp.data:
            # If the profile trigger hasn't run or completed yet, auto-insert a fallback
            email = user.email or ""
            fallback_name = email.split("@")[0] if email else "User"
            
            # Check if this user is in the configured admin emails
            is_config_admin = email.lower() in ADMIN_EMAILS
            role = "admin" if is_config_admin else "user"
            
            insert_resp = supabase_admin.table("profiles").insert({
                "id": user.id,
                "full_name": fallback_name,
                "avatar_url": None,
                "role": role
            }).execute()
            profile = insert_resp.data[0]
        else:
            profile = profile_resp.data[0]
            
            # Double check if user's email is in ADMIN_EMAILS to dynamically elevate role if database says 'user'
            if profile.get("role") != "admin" and user.email and user.email.lower() in ADMIN_EMAILS:
                update_resp = supabase_admin.table("profiles").update({"role": "admin"}).eq("id", user.id).execute()
                if update_resp.data:
                    profile = update_resp.data[0]

        # Return a merged dictionary of auth user details and db profile
        return {
            "id": user.id,
            "email": user.email,
            "full_name": profile.get("full_name"),
            "avatar_url": profile.get("avatar_url"),
            "role": profile.get("role", "user"),
            "created_at": profile.get("created_at")
        }
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}"
        )

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Admin access required."
        )
    return current_user
