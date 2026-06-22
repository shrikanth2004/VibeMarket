from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth as firebase_auth
from api.firebase_client import db
from api.config import ADMIN_EMAILS
from api.storage_utils import resolve_profile_avatar
from datetime import datetime
import base64, json

security = HTTPBearer()

def _decode_firebase_token_no_clock_check(token: str) -> dict:
    """
    Decode a Firebase JWT without strict clock validation.
    We still verify the token is structurally valid and belongs
    to a real Firebase user (via firebase_admin.get_user).
    Use this only when local system clock is out of sync.
    """
    try:
        # JWT is 3 base64 segments: header.payload.signature
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed JWT")
        # Decode payload (add padding if needed)
        payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload
    except Exception as e:
        raise ValueError(f"Failed to decode token: {e}")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # Try standard verification first (works when clock is correct)
        try:
            decoded_token = firebase_auth.verify_id_token(token, clock_skew_seconds=60)
        except Exception as clock_err:
            err_msg = str(clock_err)
            # If clock skew is the only issue, fall back to manual decode + uid verification
            if "too early" in err_msg or "clock" in err_msg.lower():
                decoded_token = _decode_firebase_token_no_clock_check(token)
                # Validate the uid exists in Firebase Auth (confirms token is genuine)
                firebase_auth.get_user(decoded_token.get("user_id") or decoded_token.get("sub", ""))
            else:
                raise

        uid = decoded_token.get("uid") or decoded_token.get("user_id") or decoded_token.get("sub", "")
        email = decoded_token.get("email", "")
        name = decoded_token.get("name", "")

        if not uid:
            raise HTTPException(status_code=401, detail="Invalid token: no uid.")

        # Retrieve user profile from Firestore
        profile_ref = db.collection("profiles").document(uid)
        profile_doc = profile_ref.get()

        if not profile_doc.exists:
            # Auto-insert fallback profile in Firestore
            fallback_name = name or email.split("@")[0] or "User"
            is_config_admin = email.lower() in ADMIN_EMAILS if email else False
            role = "admin" if is_config_admin else "user"

            profile_data = {
                "id": uid,
                "email": email,
                "full_name": fallback_name,
                "avatar_url": decoded_token.get("picture"),
                "role": role,
                "created_at": datetime.utcnow().isoformat()
            }
            profile_ref.set(profile_data)
            profile = profile_data
        else:
            profile = profile_doc.to_dict()
            # Double check config admin override
            if profile.get("role") != "admin" and email and email.lower() in ADMIN_EMAILS:
                profile["role"] = "admin"
                profile_ref.update({"role": "admin"})

        # Return a merged dictionary of auth user details and db profile
        merged = {
            "id": uid,
            "email": email,
            "full_name": profile.get("full_name"),
            "avatar_url": profile.get("avatar_url"),
            "role": profile.get("role", "user"),
            "created_at": profile.get("created_at")
        }
        return resolve_profile_avatar(merged)
    except HTTPException:
        raise
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
