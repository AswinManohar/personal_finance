"""Statement upload → review report. Ephemeral: nothing is persisted."""
import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from api.dependencies import get_current_user_id, get_supabase_client
from api.statement_review.errors import StatementReviewError
from api.statement_review.models import ReviewReport
from api.statement_review.pipeline import run_review

router = APIRouter(prefix="/statements", tags=["statements"])

MAX_PDF_BYTES = 10 * 1024 * 1024

_STATUS_BY_CODE = {
    "PDF_UNREADABLE": 422,
    "NO_TRANSACTIONS_FOUND": 422,
    "EXTRACTION_FAILED": 502,
    "LLM_UNAVAILABLE": 503,
}


def get_openai_client():
    """Dependency so tests can override with a fake."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail={
            "code": "LLM_UNAVAILABLE", "message": "OPENAI_API_KEY is not configured"})
    from openai import OpenAI
    return OpenAI(api_key=api_key)


def get_supabase_for_review():
    """Indirection point so tests can swap in a fake Supabase."""
    return get_supabase_client()


@router.post("/review", response_model=ReviewReport, operation_id="review_statement")
async def review_statement(
    file: UploadFile = File(...),
    redact: bool = Form(True),
    statement_type: Literal["bank", "credit_card"] = Form("bank"),
    redact_names: Optional[str] = Form(
        None, description="Comma-separated names to mask before any LLM call, "
                           "merged with the server-side REDACT_NAMES env list"),
    user_id: str = Depends(get_current_user_id),
    llm=Depends(get_openai_client),
):
    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail={
            "code": "PDF_UNREADABLE", "message": "PDF larger than 10 MB"})
    supabase = get_supabase_for_review()
    if not supabase:
        raise HTTPException(status_code=500, detail={
            "code": "STATEMENT_REVIEW_ERROR", "message": "Supabase client is not configured"})
    extra_names = [n.strip() for n in (redact_names or "").split(",") if n.strip()]
    try:
        # run_review does synchronous PDF parsing + two OpenAI calls; running it
        # inline would block the event loop for the duration of both LLM round
        # trips, so hand it off to the threadpool instead.
        return await run_in_threadpool(
            run_review,
            pdf_bytes,
            redact_enabled=redact,
            statement_type=statement_type,
            user_id=user_id,
            supabase=supabase,
            client=llm,
            model=os.getenv("OPENAI_MODEL", "gpt-5.1"),
            extra_names=extra_names,
        )
    except StatementReviewError as exc:
        raise HTTPException(
            status_code=_STATUS_BY_CODE.get(exc.code, 500),
            detail={"code": exc.code, "message": str(exc)},
        )
