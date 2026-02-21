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
PERSONAL_API_TOKEN = os.getenv("PERSONAL_API_TOKEN")
PERSONAL_USER_ID = os.getenv("PERSONAL_USER_ID")

# Initialize lazily to avoid startup-time crashes in Cloud Run revisions.
_supabase_client: Optional[Client] = None
_supabase_init_error: Optional[str] = None


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
