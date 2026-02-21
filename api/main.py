from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Serve static files from the React dist folder if it exists
if os.path.isdir("dist"):
    # Mount everything else to the static files directory
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Allow serving standard files from dist if they exist
        file_path = os.path.join("dist", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Otherwise fallback to index.html for React Router
        return FileResponse("dist/index.html")
else:
    @app.get("/")
    async def root():
        return {"message": "Welcome to FinanceFlow API. React dist not found."}
