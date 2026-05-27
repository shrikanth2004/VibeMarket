import os
from dotenv import load_dotenv

# Load env variables for local development
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")  # Anon key
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

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
