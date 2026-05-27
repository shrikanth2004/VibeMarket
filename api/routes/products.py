import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Form, File, UploadFile
from typing import List, Optional
from api.supabase_client import supabase, supabase_admin
from api.dependencies import get_current_user
from api.config import CATEGORIES, CONDITIONS
from api.storage_utils import (
    upload_product_image,
    extract_storage_path,
    resolve_product_images,
    resolve_products_list,
    BUCKET,
)

router = APIRouter(prefix="/products", tags=["products"])

@router.get("")
async def get_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    location: Optional[str] = None,
    seller_id: Optional[str] = None,
    sort_by: Optional[str] = "newest" # newest, price_asc, price_desc
):
    try:
        # Build query
        query = supabase_admin.table("products").select("*, profiles(full_name, avatar_url)").eq("is_approved", True)
        
        # Apply filters
        if category:
            query = query.eq("category", category)
        if condition:
            query = query.eq("condition", condition)
        if min_price is not None:
            query = query.gte("price", min_price)
        if max_price is not None:
            query = query.lte("price", max_price)
        if location:
            query = query.ilike("location", f"%{location}%")
        if seller_id:
            query = query.eq("seller_id", seller_id)
        if search:
            # Simple text search on title or description
            query = query.or_(f"title.ilike.%{search}%,description.ilike.%{search}%")
            
        # Apply sorting
        if sort_by == "newest":
            query = query.order("created_at", desc=True)
        elif sort_by == "price_asc":
            query = query.order("price", desc=False)
        elif sort_by == "price_desc":
            query = query.order("price", desc=True)
            
        res = query.execute()
        return resolve_products_list(res.data or [])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{id}")
async def get_product_details(id: str):
    try:
        # Get product and seller info
        res = supabase_admin.table("products").select("*, profiles(full_name, avatar_url, role)").eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = res.data[0]
        
        # Get reviews average rating and reviews count
        reviews_res = supabase_admin.table("reviews").select("rating").eq("product_id", id).execute()
        reviews = reviews_res.data
        
        avg_rating = 0.0
        reviews_count = len(reviews)
        if reviews_count > 0:
            avg_rating = sum(r["rating"] for r in reviews) / reviews_count
            
        product["average_rating"] = round(avg_rating, 1)
        product["reviews_count"] = reviews_count
        
        return resolve_product_images(product)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_product(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    condition: str = Form(...),
    location: str = Form(...),
    images: List[UploadFile] = File(default=[]),
    current_user: dict = Depends(get_current_user)
):
    # Validation
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of {CATEGORIES}")
    if condition not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid condition. Must be one of {CONDITIONS}")
    if price < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative.")
        
    product_id = str(uuid.uuid4())
    image_urls = []
    
    # Upload images to Supabase Storage (private bucket — store paths, sign URLs on read)
    for idx, image in enumerate(images):
        if not image.content_type or not image.content_type.startswith("image/"):
            continue

        try:
            file_bytes = await image.read()
            if not file_bytes:
                continue
            safe_name = "".join(
                c for c in (image.filename or f"image{idx}.jpg")
                if c.isalnum() or c in (".", "-", "_")
            ).strip() or f"image{idx}.jpg"
            file_path = f"{product_id}/{idx}_{safe_name}"

            upload_product_image(file_path, file_bytes, image.content_type)
            image_urls.append(file_path)
        except Exception as upload_err:
            print(f"Upload error: {upload_err}")
            raise HTTPException(
                status_code=400,
                detail=f"Image upload failed: {upload_err}",
            )
            
    # Default placeholder image if no images uploaded
    if not image_urls:
        image_urls.append("https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80")
        
    try:
        # Insert product into DB
        product_data = {
            "id": product_id,
            "seller_id": current_user["id"],
            "title": title,
            "description": description,
            "category": category,
            "price": price,
            "condition": condition,
            "location": location,
            "images": image_urls,
            "is_approved": True
        }
        
        res = supabase_admin.table("products").insert(product_data).execute()
        return resolve_product_images(res.data[0])
    except Exception as e:
        # Clean up uploaded files on error
        try:
            for stored in image_urls:
                path = extract_storage_path(stored)
                if path:
                    supabase_admin.storage.from_(BUCKET).remove([path])
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{id}")
async def update_product(
    id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    condition: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    existing_images: Optional[str] = Form(None), # comma-separated list of image URLs to keep
    new_images: List[UploadFile] = File(default=[]),
    current_user: dict = Depends(get_current_user)
):
    try:
        # Get existing product details
        prod_res = supabase_admin.table("products").select("*").eq("id", id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_res.data[0]
        
        # Access control: seller or admin
        if product["seller_id"] != current_user["id"] and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You are not the owner of this listing.")
            
        # Compile updates
        update_data = {}
        if title is not None:
            update_data["title"] = title
        if description is not None:
            update_data["description"] = description
        if category is not None:
            if category not in CATEGORIES:
                raise HTTPException(status_code=400, detail="Invalid category.")
            update_data["category"] = category
        if price is not None:
            if price < 0:
                raise HTTPException(status_code=400, detail="Price cannot be negative.")
            update_data["price"] = price
        if condition is not None:
            if condition not in CONDITIONS:
                raise HTTPException(status_code=400, detail="Invalid condition.")
            update_data["condition"] = condition
        if location is not None:
            update_data["location"] = location

        # Handle image list merging
        image_urls = []
        if existing_images is not None:
            image_urls = []
            for item in existing_images.split(","):
                item = item.strip()
                if not item:
                    continue
                path = extract_storage_path(item)
                image_urls.append(path if path else item)
        else:
            image_urls = list(product["images"] or [])

        # Upload new images
        for idx, image in enumerate(new_images):
            if not image.content_type or not image.content_type.startswith("image/"):
                continue

            file_bytes = await image.read()
            if not file_bytes:
                continue
            safe_name = "".join(
                c for c in (image.filename or f"image{idx}.jpg")
                if c.isalnum() or c in (".", "-", "_")
            ).strip() or f"image{idx}.jpg"
            file_path = f"{id}/new_{uuid.uuid4().hex[:6]}_{safe_name}"

            upload_product_image(file_path, file_bytes, image.content_type)
            image_urls.append(file_path)

        update_data["images"] = image_urls
        
        # Trigger notifications for updates to users who wishlisted this
        # Save product updates in database
        res = supabase_admin.table("products").update(update_data).eq("id", id).execute()
        
        # Create a notification for wishlist owners
        if title or price:
            wishers = supabase_admin.table("wishlists").select("user_id").eq("product_id", id).execute()
            for w in wishers.data:
                supabase_admin.table("notifications").insert({
                    "user_id": w["user_id"],
                    "type": "product_update",
                    "title": "Wishlist item updated!",
                    "message": f"The item '{product['title']}' has been updated by the seller.",
                    "link_url": f"/product.html?id={id}"
                }).execute()

        return resolve_product_images(res.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{id}")
async def delete_product(id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Check product
        prod_res = supabase_admin.table("products").select("*").eq("id", id).execute()
        if not prod_res.data:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_res.data[0]
        
        # Access control: seller or admin
        if product["seller_id"] != current_user["id"] and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You are not authorized to delete this listing.")
            
        # Delete from DB
        supabase_admin.table("products").delete().eq("id", id).execute()
        
        # Attempt to delete all images from Storage bucket under folder `id/`
        try:
            # List files in folder
            files_to_delete = []
            for stored in product["images"]:
                path = extract_storage_path(stored)
                if path:
                    files_to_delete.append(path)
            if files_to_delete:
                supabase_admin.storage.from_(BUCKET).remove(files_to_delete)
        except Exception:
            pass # Fail silently for storage deletion, main task is database deletion
            
        return {"message": "Listing deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
