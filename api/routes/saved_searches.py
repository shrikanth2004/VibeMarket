from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from api.supabase_client import supabase_admin
from api.dependencies import get_current_user
from api.config import CATEGORIES, CONDITIONS
from api.db_features import has_saved_searches_table, MIGRATION_HINT

router = APIRouter(prefix="/saved-searches", tags=["saved-searches"])


class SavedSearchCreate(BaseModel):
    label: Optional[str] = None
    search: Optional[str] = None
    category: Optional[str] = None
    condition: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    location: Optional[str] = None
    sort_by: Optional[str] = "newest"
    alert_enabled: bool = True


class SavedSearchUpdate(BaseModel):
    label: Optional[str] = None
    alert_enabled: Optional[bool] = None


def _validate_search_fields(body: SavedSearchCreate) -> None:
    if body.category and body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category.")
    if body.condition and body.condition not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid condition.")
    if body.min_price is not None and body.min_price < 0:
        raise HTTPException(status_code=400, detail="min_price cannot be negative.")
    if body.max_price is not None and body.max_price < 0:
        raise HTTPException(status_code=400, detail="max_price cannot be negative.")
    has_filter = any([
        body.search,
        body.category,
        body.condition,
        body.location,
        body.min_price is not None,
        body.max_price is not None,
    ])
    if not has_filter:
        raise HTTPException(
            status_code=400,
            detail="Add at least one filter (search, category, location, price, etc.).",
        )


def _require_saved_searches_table():
    if not has_saved_searches_table():
        raise HTTPException(
            status_code=503,
            detail=f"Saved searches are not available yet. {MIGRATION_HINT}",
        )


@router.get("")
async def list_saved_searches(current_user: dict = Depends(get_current_user)):
    _require_saved_searches_table()
    try:
        res = supabase_admin.table("saved_searches").select("*").eq(
            "user_id", current_user["id"]
        ).order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_saved_search(
    body: SavedSearchCreate,
    current_user: dict = Depends(get_current_user),
):
    _require_saved_searches_table()
    _validate_search_fields(body)
    try:
        row = {
            "user_id": current_user["id"],
            "label": body.label or _default_label(body),
            "search": body.search or None,
            "category": body.category or None,
            "condition": body.condition or None,
            "min_price": body.min_price,
            "max_price": body.max_price,
            "location": body.location or None,
            "sort_by": body.sort_by or "newest",
            "alert_enabled": body.alert_enabled,
        }
        res = supabase_admin.table("saved_searches").insert(row).execute()
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{search_id}")
async def update_saved_search(
    search_id: str,
    body: SavedSearchUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_saved_searches_table()
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided.")
    try:
        res = supabase_admin.table("saved_searches").update(update_data).eq(
            "id", search_id
        ).eq("user_id", current_user["id"]).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Saved search not found.")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{search_id}")
async def delete_saved_search(
    search_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_saved_searches_table()
    try:
        res = supabase_admin.table("saved_searches").delete().eq(
            "id", search_id
        ).eq("user_id", current_user["id"]).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Saved search not found.")
        return {"message": "Saved search deleted."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _default_label(body: SavedSearchCreate) -> str:
    parts = []
    if body.search:
        parts.append(f'"{body.search}"')
    if body.category:
        parts.append(body.category)
    if body.location:
        parts.append(body.location)
    if body.min_price is not None or body.max_price is not None:
        lo = int(body.min_price) if body.min_price is not None else 0
        hi = int(body.max_price) if body.max_price is not None else "∞"
        parts.append(f"₹{lo}–{hi}")
    return " · ".join(parts) if parts else "Saved search"
