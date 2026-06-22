import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

db = None

service_account_env = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")

# Check if Firebase application is already initialized
if not firebase_admin._apps:
    cred = None
    # Check if the env var contains the JSON string directly
    if service_account_env.strip().startswith("{"):
        try:
            service_account_info = json.loads(service_account_env)
            cred = credentials.Certificate(service_account_info)
            print("[Firebase] Initializing with service account JSON string.")
        except Exception as e:
            print(f"[Firebase] Error parsing service account JSON string: {e}")
    # Else check if it's a path that exists
    elif os.path.exists(service_account_env):
        try:
            cred = credentials.Certificate(service_account_env)
            print(f"[Firebase] Initialized with service account certificate from path: {service_account_env}")
        except Exception as e:
            print(f"[Firebase] Error initializing with service account certificate from path: {e}")

    # Initialize app
    try:
        if cred:
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
            print("[Firebase] Initialized with application default credentials.")
    except Exception as e:
        print(f"[Firebase] Failed to initialize: {e}")

try:
    db = firestore.client()
except Exception as e:
    print(f"[Firebase] Failed to get Firestore client: {e}")

