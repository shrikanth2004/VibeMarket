# sanity_check_firestore.py
import os, firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate(
    os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY", "serviceAccountKey.json")
)
firebase_admin.initialize_app(cred)

db = firestore.client()
print("Listing collections (should be empty or show your data):")
for coll in db.collections():
    print(" -", coll.id)

# Try a simple write/read
doc_ref = db.collection("healthcheck").document("test")
doc_ref.set({"ping": "pong"})
print("Read back:", doc_ref.get().to_dict())