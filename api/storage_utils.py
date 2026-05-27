"""Supabase Storage helpers for product images."""
from typing import Any, List, Optional
from api.supabase_client import supabase_admin

BUCKET = "product-images"
# 7 days — refreshed on each API read
SIGNED_URL_EXPIRY_SEC = 60 * 60 * 24 * 7


def _storage_bucket():
    return supabase_admin.storage.from_(BUCKET)


def extract_storage_path(stored: str) -> Optional[str]:
    """Get bucket-relative path from a stored path or legacy public/signed URL."""
    if not stored or not isinstance(stored, str):
        return None
    stored = stored.strip()
    if stored.startswith("http"):
        marker = f"/{BUCKET}/"
        if marker not in stored:
            return None
        rest = stored.split(marker, 1)[1]
        return rest.split("?")[0]
    return stored.lstrip("/")


def get_accessible_image_url(stored: str, expires_in: int = SIGNED_URL_EXPIRY_SEC) -> str:
    """Return a browser-loadable URL (signed) for Supabase storage, or pass through external URLs."""
    if not stored:
        return stored
    if stored.startswith("http") and f"/{BUCKET}/" not in stored:
        return stored

    path = extract_storage_path(stored)
    if not path:
        return stored

    try:
        result = _storage_bucket().create_signed_url(path, expires_in)
        return result.get("signedUrl") or result.get("signedURL") or stored
    except Exception as exc:
        print(f"[storage] signed URL failed for {path}: {exc}")
        return stored


def upload_product_image(file_path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload bytes to product-images; returns bucket-relative path for DB storage."""
    _storage_bucket().upload(
        path=file_path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return file_path


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
