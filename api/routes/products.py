import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Form, File, UploadFile
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from api.firebase_client import db
from api.dependencies import get_current_user
from api.config import CATEGORIES, CONDITIONS, LISTING_STATUSES
from api.search_alerts import notify_saved_search_matches, notify_wishlist_item_sold
from api.db_features import (
    get_product_status,
    has_listing_status_column,
)
from api.storage_utils import (
    upload_product_image,
    extract_storage_path,
    resolve_product_images,
    resolve_products_list,
    delete_storage_files,
)

router = APIRouter(prefix="/products", tags=["products"])


class StatusUpdateRequest(BaseModel):
    status: str


@router.get("")
async def get_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    location: Optional[str] = None,
    seller_id: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = "newest" # newest, price_asc, price_desc
):
    try:
        query_ref = db.collection("products")
        if seller_id:
            query_ref = query_ref.where("seller_id", "==", seller_id)
            
        docs = query_ref.stream()
        products = []
        
        for doc in docs:
            prod = doc.to_dict()
            # Standard marketplace query requires is_approved to be True (default fallback is True)
            if not prod.get("is_approved", True):
                continue
                
            prod_status = prod.get("status") or "active"
            if seller_id:
                if status:
                    if status not in LISTING_STATUSES:
                        raise HTTPException(status_code=400, detail="Invalid status.")
                    if prod_status != status:
                        continue
            else:
                target_status = status if status else "active"
                if prod_status != target_status:
                    continue
            
            # Apply filters in-memory
            if category:
                if prod.get("category") != category:
                    continue
            if condition:
                if prod.get("condition") != condition:
                    continue
            if min_price is not None:
                if float(prod.get("price", 0)) < min_price:
                    continue
            if max_price is not None:
                if float(prod.get("price", 0)) > max_price:
                    continue
            if location:
                if location.lower() not in (prod.get("location") or "").lower():
                    continue
            if search:
                term = search.lower()
                title = (prod.get("title") or "").lower()
                desc = (prod.get("description") or "").lower()
                if term not in title and term not in desc:
                    continue
                    
            products.append(prod)
            
        # Apply sorting
        if sort_by == "newest":
            products.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        elif sort_by == "price_asc":
            products.sort(key=lambda x: float(x.get("price") or 0))
        elif sort_by == "price_desc":
            products.sort(key=lambda x: float(x.get("price") or 0), reverse=True)
            
        # Join profiles info
        seller_ids = {p["seller_id"] for p in products if p.get("seller_id")}
        seller_profiles = {}
        for s_id in seller_ids:
            try:
                prof_doc = db.collection("profiles").document(s_id).get()
                if prof_doc.exists:
                    prof_data = prof_doc.to_dict()
                    seller_profiles[s_id] = {
                        "full_name": prof_data.get("full_name"),
                        "avatar_url": prof_data.get("avatar_url")
                    }
                else:
                    seller_profiles[s_id] = {"full_name": "User", "avatar_url": None}
            except Exception:
                seller_profiles[s_id] = {"full_name": "User", "avatar_url": None}
                
        for p in products:
            p["profiles"] = seller_profiles.get(p.get("seller_id"), {"full_name": "User", "avatar_url": None})
            
        return resolve_products_list(products)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{id}")
async def get_product_details(id: str):
    try:
        # Get product
        prod_doc = db.collection("products").document(id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_doc.to_dict()
        
        # Get seller profile details
        seller_id = product.get("seller_id")
        if seller_id:
            prof_doc = db.collection("profiles").document(seller_id).get()
            if prof_doc.exists:
                prof_data = prof_doc.to_dict()
                product["profiles"] = {
                    "full_name": prof_data.get("full_name"),
                    "avatar_url": prof_data.get("avatar_url"),
                    "role": prof_data.get("role", "user")
                }
            else:
                product["profiles"] = {"full_name": "User", "avatar_url": None, "role": "user"}
        else:
            product["profiles"] = {"full_name": "User", "avatar_url": None, "role": "user"}
        
        # Get reviews average rating and reviews count
        reviews_ref = db.collection("reviews").where("product_id", "==", id).stream()
        reviews = [doc.to_dict() for doc in reviews_ref]
        
        avg_rating = 0.0
        reviews_count = len(reviews)
        if reviews_count > 0:
            avg_rating = sum(r.get("rating", 0) for r in reviews) / reviews_count
            
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
    
    # Upload images to Storage
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
            file_path = f"products/{product_id}/{idx}_{safe_name}"

            image_url = upload_product_image(file_path, file_bytes, image.content_type)
            image_urls.append(image_url)
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
        # Insert product into Firestore
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
            "is_approved": True,
            "status": "active",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

        db.collection("products").document(product_id).set(product_data)
        notify_saved_search_matches(product_data)
        return resolve_product_images(product_data)
    except Exception as e:
        # Clean up uploaded files on error
        try:
            delete_storage_files(image_urls)
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
        prod_doc = db.collection("products").document(id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_doc.to_dict()
        
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
            for item in existing_images.split(","):
                item = item.strip()
                if not item:
                    continue
                path = extract_storage_path(item)
                image_urls.append(path if path else item)
        else:
            image_urls = list(product.get("images") or [])

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
            file_path = f"products/{id}/new_{uuid.uuid4().hex[:6]}_{safe_name}"

            image_url = upload_product_image(file_path, file_bytes, image.content_type)
            image_urls.append(image_url)

        update_data["images"] = image_urls
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        # Save product updates in database
        db.collection("products").document(id).update(update_data)
        
        # Trigger notifications for updates to users who wishlisted this
        if title or price:
            wishers_ref = db.collection("wishlists").where("product_id", "==", id).stream()
            for w in wishers_ref:
                w_data = w.to_dict()
                notif_id = str(uuid.uuid4())
                db.collection("notifications").document(notif_id).set({
                    "id": notif_id,
                    "user_id": w_data["user_id"],
                    "type": "product_update",
                    "title": "Wishlist item updated!",
                    "message": f"The item '{product['title']}' has been updated by the seller.",
                    "link_url": f"/product.html?id={id}",
                    "is_read": False,
                    "created_at": datetime.utcnow().isoformat()
                })

        updated_product = db.collection("products").document(id).get().to_dict()
        return resolve_product_images(updated_product)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{id}/status")
async def update_listing_status(
    id: str,
    body: StatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    if body.status not in LISTING_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of {LISTING_STATUSES}",
        )
    try:
        prod_doc = db.collection("products").document(id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")

        product = prod_doc.to_dict()
        if product["seller_id"] != current_user["id"] and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden.")

        previous_status = get_product_status(product)
        
        db.collection("products").document(id).update({
            "status": body.status,
            "updated_at": datetime.utcnow().isoformat()
        })
        
        updated = db.collection("products").document(id).get().to_dict()

        if body.status == "sold" and previous_status != "sold":
            notify_wishlist_item_sold(updated)

        return resolve_product_images(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{id}")
async def delete_product(id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Check product
        prod_doc = db.collection("products").document(id).get()
        if not prod_doc.exists:
            raise HTTPException(status_code=404, detail="Product not found.")
            
        product = prod_doc.to_dict()
        
        # Access control: seller or admin
        if product["seller_id"] != current_user["id"] and current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You are not authorized to delete this listing.")
            
        # Delete from DB
        db.collection("products").document(id).delete()
        
        # Attempt to delete all images from Storage
        try:
            files_to_delete = []
            for stored in product.get("images") or []:
                path = extract_storage_path(stored)
                if path:
                    files_to_delete.append(path)
            if files_to_delete:
                delete_storage_files(files_to_delete)
        except Exception:
            pass # Fail silently for storage deletion, main task is database deletion
            
        return {"message": "Listing deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

