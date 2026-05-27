from supabase import create_client, Client
from api.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is missing!")

# Standard public client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY or "missing-key")

# Admin client (for server-side privileged tasks like bypassing RLS, updating profiles, uploads)
supabase_admin: Client = None
if SUPABASE_SERVICE_ROLE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
else:
    # Fallback to standard client if service role is not set yet
    supabase_admin = supabase
