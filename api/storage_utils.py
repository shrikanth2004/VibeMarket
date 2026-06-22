"""Firebase Storage helpers for product and avatar images.

Images are uploaded to Firebase Storage and served via their public download URL.
Falls back to local filesystem storage when Firebase Storage bucket is not configured
(useful for local development without a storage bucket).
"""

from typing import List, Optional
import os
import io
from pathlib import Path
from api.config import LOCAL_MEDIA_ROOT

# Firebase Storage bucket name from env
STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "")


def _get_bucket():
    """Return the Firebase Storage bucket, or None if not configured."""
    if not STORAGE_BUCKET:
        return None
    try:
        from firebase_admin import storage
        return storage.bucket(STORAGE_BUCKET)
    except Exception as e:
        print(f"[storage] Firebase Storage not available: {e}")
        return None


def upload_product_image(file_path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload image to Firebase Storage. Returns a public download URL.
    Falls back to local filesystem if Firebase Storage is not configured."""
    bucket = _get_bucket()

    if bucket:
        try:
            blob = bucket.blob(file_path)
            blob.upload_from_string(file_bytes, content_type=content_type)
            blob.make_public()
            url = blob.public_url
            print(f"[storage] Uploaded to Firebase Storage: {url}")
            return url
        except Exception as e:
            print(f"[storage] Firebase Storage upload failed, falling back to local: {e}")

    # Local filesystem fallback
    local_path = Path(LOCAL_MEDIA_ROOT) / file_path
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(file_bytes)
    return f"/media/{file_path}"


def upload_avatar_image(file_path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload avatar to Firebase Storage. Returns a public download URL."""
    return upload_product_image(file_path, file_bytes, content_type)


def delete_storage_files(paths: List[str]):
    """Delete files from Firebase Storage or local filesystem."""
    bucket = _get_bucket()

    for p in paths:
        if not p:
            continue
        # Firebase Storage URL
        if p.startswith("https://storage.googleapis.com") or p.startswith("https://firebasestorage.googleapis.com"):
            if bucket:
                try:
                    # Extract blob path from URL
                    # Public URL format: https://storage.googleapis.com/BUCKET/PATH
                    blob_path = p.split(f"/{STORAGE_BUCKET}/")[-1]
                    blob = bucket.blob(blob_path)
                    blob.delete()
                    print(f"[storage] Deleted from Firebase Storage: {blob_path}")
                except Exception as e:
                    print(f"[storage] Firebase Storage delete failed for {p}: {e}")
        elif p.startswith("http"):
            # External URL we don't own — skip
            continue
        else:
            # Local file
            try:
                local_path = Path(LOCAL_MEDIA_ROOT) / p.lstrip("/media/").lstrip("/")
                if local_path.is_file():
                    local_path.unlink()
            except Exception as e:
                print(f"[storage] Local delete failed for {p}: {e}")


def extract_storage_path(stored: str) -> Optional[str]:
    """Return None for external URLs (they are stored as-is), relative path for local."""
    if not stored or not isinstance(stored, str):
        return None
    stored = stored.strip()
    if stored.startswith("http"):
        return None
    return stored.lstrip("/")


def get_accessible_image_url(stored: str) -> str:
    """Return a browser-loadable URL. Firebase Storage URLs are returned as-is."""
    if not stored:
        return stored
    # External URLs or Data URIs — pass through unchanged
    if stored.startswith("http") or stored.startswith("data:"):
        return stored
    # Local path — serve via /media static route
    path = stored.lstrip("/")
    return f"/media/{path}"


def resolve_profile_avatar(profile: Optional[dict]) -> Optional[dict]:
    """Convert stored avatar paths to browser-loadable URLs."""
    if not profile:
        return profile
    avatar = profile.get("avatar_url")
    if avatar:
        profile = {**profile, "avatar_url": get_accessible_image_url(avatar)}
    return profile


def resolve_product_images(product: dict) -> dict:
    if not product:
        return product
    images = product.get("images")
    if images and isinstance(images, list):
        product["images"] = [get_accessible_image_url(img) for img in images]
    return product


def resolve_products_list(products: List[dict]) -> List[dict]:
    return [resolve_product_images(p) for p in products]


def resolve_nested_product_rows(rows: List[dict], product_key: str = "products") -> List[dict]:
    """Wishlist rows: { ..., products: { ... } }"""
    for row in rows:
        nested = row.get(product_key)
        if isinstance(nested, dict):
            resolve_product_images(nested)
    return rows
