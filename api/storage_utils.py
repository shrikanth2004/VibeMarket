"""Local filesystem storage helpers for product and avatar images.

All images are stored under the directory configured by LOCAL_MEDIA_ROOT (default: 'media')
and served via the /media static route mounted in app.py."""

from typing import List, Optional
import os
from pathlib import Path
from api.config import LOCAL_MEDIA_ROOT


def extract_storage_path(stored: str) -> Optional[str]:
    """Normalise a stored path – strip leading slashes, pass through as-is."""
    if not stored or not isinstance(stored, str):
        return None
    stored = stored.strip()
    # If it's already an external http URL, just return it
    if stored.startswith("http"):
        return None
    return stored.lstrip("/")


def get_accessible_image_url(stored: str) -> str:
    """Return a browser-loadable URL for a locally stored image."""
    if not stored:
        return stored
    # External URLs or Data URIs – pass through unchanged
    if stored.startswith("http") or stored.startswith("data:"):
        return stored
    # Local path – serve via /media static route
    path = stored.lstrip("/")
    return f"/media/{path}"


def upload_product_image(file_path: str, file_bytes: bytes, content_type: str) -> str:
    """Write image bytes to the local media directory. Returns the relative path."""
    local_path = Path(LOCAL_MEDIA_ROOT) / file_path
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(file_bytes)
    return file_path



def delete_storage_files(paths: List[str]):
    """Delete multiple files from local storage."""
    for p in paths:
        if not p or p.startswith("http") or p.startswith("data:"):
            continue
        try:
            local_path = Path(LOCAL_MEDIA_ROOT) / p
            if local_path.is_file():
                local_path.unlink()
        except Exception as e:
            print(f"[storage] delete failed for {p}: {e}")


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
