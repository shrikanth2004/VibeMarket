import os
import webbrowser
import tempfile
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Import all routers from api/routes
from api.routes import auth, products, wishlist, reviews, comments, notifications, admin, saved_searches

# Initialize FastAPI App
app = FastAPI(
    title="VibeMarket API",
    description="Combined backend API and frontend server.",
    version="1.0.0"
)

# Set up CORS middleware to allow external calls if necessary
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Mount API routers under the /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(wishlist.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(saved_searches.router, prefix="/api")

# 2. Serve Frontend static assets
# Mount CSS and JS folders
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")

# Route HTML files directly
@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.get("/index.html")
async def serve_index_html():
    return FileResponse("index.html")

@app.get("/product.html")
async def serve_product_html():
    return FileResponse("product.html")

@app.get("/profile.html")
async def serve_profile_html():
    return FileResponse("profile.html")

@app.get("/login.html")
async def serve_login_html():
    return FileResponse("login.html")

@app.get("/admin.html")
async def serve_admin_html():
    return FileResponse("admin.html")

# 3. Startup Hook (local dev only — opens browser once on first run)
import sys
@app.on_event("startup")
def open_browser():
    if "vercel" in sys.argv[0].lower() or os.getenv("VERCEL"):
        return
    temp_file = os.path.join(tempfile.gettempdir(), "vibemarket_browser_opened.txt")
    if not os.path.exists(temp_file):
        with open(temp_file, "w") as f:
            f.write("opened")
        print("🚀 Server started! Opening the marketplace in your default browser...")
        webbrowser.open("http://127.0.0.1:8000")

# Local script runner execution
if __name__ == "__main__":
    # Clean up the browser opened flag file when restarting manually
    temp_file = os.path.join(tempfile.gettempdir(), "vibemarket_browser_opened.txt")
    if os.path.exists(temp_file):
        try:
            os.remove(temp_file)
        except Exception:
            pass
            
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
