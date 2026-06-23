"""Cloudinary storage helpers for product and avatar images.

Images are uploaded to Cloudinary and served via their CDN URL.
Falls back to local filesystem storage only in local development
when CLOUDINARY_CLOUD_NAME is not configured.
"""

from typing import List, Optional
import os
import io
from pathlib import Path
from api.config import LOCAL_MEDIA_ROOT

# Cloudinary config from environment
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))


def _cloudinary_configured() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


def _upload_to_cloudinary(file_bytes: bytes, file_path: str, content_type: str) -> str:
    """Upload bytes to Cloudinary and return the secure CDN URL."""
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True
    )

    # Derive a clean public_id from the file_path (no extension)
    public_id = file_path.rsplit(".", 1)[0].replace("\\", "/")

    result = cloudinary.uploader.upload(
        file_bytes,
        public_id=public_id,
        resource_type="image",
        overwrite=True,
    )
    return result["secure_url"]


def upload_product_image(file_path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload image to Cloudinary. Returns a public CDN URL.
    Falls back to local filesystem only in local dev when Cloudinary is not configured."""

    if _cloudinary_configured():
        try:
            url = _upload_to_cloudinary(file_bytes, file_path, content_type)
            print(f"[storage] Uploaded to Cloudinary: {url}")
            return url
        except Exception as e:
            if IS_VERCEL:
                raise RuntimeError(f"Image upload failed (Cloudinary error): {e}")
            print(f"[storage] Cloudinary upload failed, falling back to local: {e}")
    elif IS_VERCEL:
        raise RuntimeError(
            "Image upload failed: Cloudinary env variables are not set on Vercel. "
            "Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
        )

    # Local filesystem fallback (dev only)
    local_path = Path(LOCAL_MEDIA_ROOT) / file_path
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(file_bytes)
    return f"/media/{file_path}"


def upload_avatar_image(file_path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload avatar to Cloudinary. Returns a public CDN URL."""
    return upload_product_image(file_path, file_bytes, content_type)


def delete_storage_files(paths: List[str]):
    """Delete files from Cloudinary or local filesystem."""
    if _cloudinary_configured():
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True
        )

    for p in paths:
        if not p:
            continue
        if p.startswith("https://res.cloudinary.com"):
            # Extract public_id from Cloudinary URL
            try:
                import cloudinary.uploader
                # URL format: https://res.cloudinary.com/CLOUD/image/upload/vXXXX/public_id.ext
                parts = p.split("/upload/")
                if len(parts) == 2:
                    public_id = parts[1].split("/", 1)[-1].rsplit(".", 1)[0]
                    cloudinary.uploader.destroy(public_id)
                    print(f"[storage] Deleted from Cloudinary: {public_id}")
            except Exception as e:
                print(f"[storage] Cloudinary delete failed for {p}: {e}")
        elif p.startswith("http"):
            continue  # External URL we don't own
        else:
            # Local file
            try:
                local_path = Path(LOCAL_MEDIA_ROOT) / p.lstrip("/media/").lstrip("/")
                if local_path.is_file():
                    local_path.unlink()
            except Exception as e:
                print(f"[storage] Local delete failed for {p}: {e}")


def extract_storage_path(stored: str) -> Optional[str]:
    """Return None for external URLs (stored as-is), relative path for local."""
    if not stored or not isinstance(stored, str):
        return None
    stored = stored.strip()
    if stored.startswith("http"):
        return None
    return stored.lstrip("/")


def get_accessible_image_url(stored: str) -> str:
    """Return a browser-loadable URL. Cloudinary/external URLs returned as-is."""
    if not stored:
        return stored
    if stored.startswith("http") or stored.startswith("data:"):
        return stored
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
