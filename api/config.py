import os
from dotenv import load_dotenv

# Load env variables for local development
load_dotenv()

FIREBASE_SERVICE_ACCOUNT_KEY = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
LOCAL_MEDIA_ROOT = os.getenv("LOCAL_MEDIA_ROOT", "media")


# Parse admin emails list
admin_emails_str = os.getenv("ADMIN_EMAILS", "")
ADMIN_EMAILS = [email.strip().lower() for email in admin_emails_str.split(",") if email.strip()]

CATEGORIES = [
    "Electronics",
    "Mobiles",
    "Furniture",
    "Fashion",
    "Vehicles",
    "Books",
    "Other"
]

CONDITIONS = [
    "New",
    "Like New",
    "Good",
    "Fair"
]

LISTING_STATUSES = [
    "active",
    "sold",
    "reserved",
    "draft",
]
