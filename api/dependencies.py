import hashlib
import os
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
from supabase import create_client, Client
from typing import Optional

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
# Service-role key bypasses RLS so the backend can read across household users
# for read-only integrations (e.g. Life OS). Falls back to SUPABASE_KEY when the
# deployment already configures a service-role key there.
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or SUPABASE_KEY
PERSONAL_API_TOKEN = os.getenv("PERSONAL_API_TOKEN")
PERSONAL_USER_ID = os.getenv("PERSONAL_USER_ID")

# Initialize lazily to avoid startup-time crashes in Cloud Run revisions.
_supabase_client: Optional[Client] = None
_supabase_init_error: Optional[str] = None
_service_supabase_client: Optional[Client] = None
_service_supabase_init_error: Optional[str] = None


def get_supabase_client() -> Optional[Client]:
    global _supabase_client, _supabase_init_error

    if _supabase_client is not None:
        return _supabase_client
    if _supabase_init_error is not None:
        return None
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None

    try:
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return _supabase_client
    except Exception as exc:
        _supabase_init_error = str(exc)
        print(f"Supabase initialization error: {exc}")
        return None


def get_service_supabase_client() -> Optional[Client]:
    """Service-role client used only by read-only integration endpoints."""
    global _service_supabase_client, _service_supabase_init_error

    if _service_supabase_client is not None:
        return _service_supabase_client
    if _service_supabase_init_error is not None:
        return None
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    try:
        _service_supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        return _service_supabase_client
    except Exception as exc:
        _service_supabase_init_error = str(exc)
        print(f"Service Supabase initialization error: {exc}")
        return None


# Security scheme
security = HTTPBearer(auto_error=False)
personal_token_header = APIKeyHeader(name="X-Personal-Token", auto_error=False)

def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    personal_token: Optional[str] = Depends(personal_token_header),
) -> str:
    """
    Returns the user ID from either:
    1) Supabase Bearer JWT (default app auth), or
    2) X-Personal-Token + PERSONAL_USER_ID (automation auth).
    """
    if credentials and credentials.credentials:
        supabase = get_supabase_client()
        if not supabase:
            detail = "Supabase credentials are not configured on the server"
            if _supabase_init_error:
                detail = "Supabase client failed to initialize on the server"
            raise HTTPException(status_code=500, detail=detail)
        token = credentials.credentials
        try:
            # Verify the token using Supabase Auth
            user = supabase.auth.get_user(token)
            if user and user.user:
                return user.user.id
        except Exception as e:
            print(f"Auth Error (Bearer): {e}")

    if personal_token:
        if not PERSONAL_API_TOKEN or not PERSONAL_USER_ID:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="PERSONAL_API_TOKEN and PERSONAL_USER_ID must be set for personal token auth",
            )
        if personal_token == PERSONAL_API_TOKEN:
            return PERSONAL_USER_ID

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


# --- Service-to-service integration auth (read-only, e.g. Life OS) ---------

# Integration tokens are accepted either as `Authorization: Bearer <token>` or as
# the dedicated `X-Integration-Token` header. They are stored hashed at rest, so
# a leaked database row cannot be replayed as a live credential.
integration_bearer = HTTPBearer(auto_error=False)
integration_token_header = APIKeyHeader(name="X-Integration-Token", auto_error=False)


def hash_integration_token(raw_token: str) -> str:
    """SHA-256 hex digest used to look up a token without storing it in clear text."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def get_integration_user_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(integration_bearer),
    integration_token: Optional[str] = Depends(integration_token_header),
) -> str:
    """
    Validate a per-user integration token and return its owner's user_key.

    This grants read-only access scoped to a single user. Each household member
    generates (and can revoke) their own token in Settings, so the allow-list is
    simply "whoever holds a valid, un-revoked token."
    """
    raw_token = integration_token
    if not raw_token and credentials and credentials.credentials:
        raw_token = credentials.credentials

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing integration token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    supabase = get_service_supabase_client()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Integration backend is not configured (service-role key missing)",
        )

    token_hash = hash_integration_token(raw_token)
    try:
        response = (
            supabase.table("integration_tokens")
            .select("user_key")
            .eq("token_hash", token_hash)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Token validation failed: {exc}")

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked integration token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return response.data[0]["user_key"]
