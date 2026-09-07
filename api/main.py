from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from api.observability import configure_observability
from api.routers import expenses, integrations, merchants, statements
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="FinanceFlow API")

# Tracing for the API and every LLM call it makes. A no-op without LOGFIRE_TOKEN,
# so dev and CI are unaffected.
configure_observability(app)

# CORS Configuration
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # The Capacitor Android app. Its WebView serves the bundled assets from
    # https://localhost (androidScheme in capacitor.config.ts), so its /api
    # calls to this backend are cross-origin and need CORS.
    "https://localhost",
    "capacitor://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expenses.router, prefix="/api")
app.include_router(statements.router, prefix="/api")
app.include_router(merchants.router, prefix="/api")
# Read-only service-to-service feeds (e.g. Life OS). Registered before the SPA
# catch-all below so /v1/* resolves to the API, not index.html.
app.include_router(integrations.router)

# Health check route for Google Cloud Run Load Balancers
@app.get("/health")
async def health_check():
    """Zero-dependency health check for Google Cloud Run Load Balancer"""
    return {"status": "healthy"}

# Serve static files from the React dist folder if it exists.
DIST_DIR = "dist"
DIST_ASSETS_DIR = os.path.join(DIST_DIR, "assets")


def safe_dist_path(dist_root: str, requested: str) -> str | None:
    """The file under `dist_root` that `requested` names, or None.

    None means "serve index.html instead" — for a route the SPA owns, and
    just as much for a path that escapes the folder. A request path of
    `..%2Fpyproject.toml` decodes to `../pyproject.toml`, and joining that
    onto `dist/` used to produce a real file outside it, which the old
    `os.path.isfile` check then served. Resolving both sides and requiring
    the file to sit inside the root closes that.
    """
    root = os.path.realpath(dist_root)
    candidate = os.path.realpath(os.path.join(root, requested.lstrip("/")))
    if not candidate.startswith(root + os.sep):
        return None
    return candidate if os.path.isfile(candidate) else None


if os.path.isdir(DIST_DIR):
    if os.path.isdir(DIST_ASSETS_DIR):
        app.mount("/assets", StaticFiles(directory=DIST_ASSETS_DIR), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Serve static files directly when they exist; otherwise hand off to SPA router.
        file_path = safe_dist_path(DIST_DIR, full_path)
        if file_path:
            return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000"})
        # Never cache index.html so the browser always fetches the latest JS bundle hashes
        return FileResponse(
            os.path.join(DIST_DIR, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
else:
    @app.get("/")
    async def root():
        return {"message": "Welcome to FinanceFlow API. React dist not found."}
