from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from api.routers import expenses
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="FinanceFlow API")

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses.router, prefix="/api")

# Health check route for Google Cloud Run Load Balancers
@app.get("/health")
async def health_check():
    """Zero-dependency health check for Google Cloud Run Load Balancer"""
    return {"status": "healthy"}

# Serve static files from the React dist folder if it exists.
DIST_DIR = "dist"
DIST_ASSETS_DIR = os.path.join(DIST_DIR, "assets")

if os.path.isdir(DIST_DIR):
    if os.path.isdir(DIST_ASSETS_DIR):
        app.mount("/assets", StaticFiles(directory=DIST_ASSETS_DIR), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Serve static files directly when they exist; otherwise hand off to SPA router.
        file_path = os.path.join(DIST_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "Welcome to FinanceFlow API. React dist not found."}
