"""Raw card-network merchant descriptor → a readable name and a category.

Notifications carry the acquirer's string, not a name anyone would choose:
`MEGA LIMITED`, `DM DROGERIE SAGT DANKE`, `REWE Bonn, Friedenspla` (truncated
mid-word at 22 characters). The phone asks this endpoint once per *unseen*
merchant and then remembers the answer locally, so repeat merchants never come
back here.

Charting originally put this call in the WebView against Gemini. Gemini is gone
— `services/geminiService.ts` no longer exists — so the guess lives here instead,
as a Pydantic AI agent over OpenAI, traced by Logfire. Nothing is persisted.

The agent shape is doing real work: `output_type=MerchantGuess` means the model
cannot answer with an unlisted category or a free-text apology. Anything it
returns is already a validated `MerchantGuess` or the run has failed loudly —
which is what keeps a bad guess from silently becoming an expense category.
"""
import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior

import logfire

from api.dependencies import get_current_user_id

router = APIRouter(prefix="/merchants", tags=["merchants"])

CATEGORIES = ("Housing", "Food", "Transport", "Utilities", "Entertainment", "Other")


class MerchantGuess(BaseModel):
    name: str = Field(description="Short human-readable merchant name")
    category: Literal["Housing", "Food", "Transport", "Utilities", "Entertainment", "Other"]


class MerchantGuessRequest(BaseModel):
    merchant: str = Field(min_length=1, max_length=200)


_INSTRUCTIONS = (
    "You are given the raw merchant descriptor from a European card "
    "transaction, as printed by the acquirer. These are often uppercase, "
    "abbreviated, padded with marketing words, or truncated mid-word at a "
    "fixed width (e.g. 'REWE Bonn, Friedenspla' is a REWE store on "
    "Friedensplatz). Return a short human-readable merchant name as a person "
    "would write it in an expense tracker, and the best-fitting category from: "
    + ", ".join(CATEGORIES) + ". "
    "If you cannot tell what the merchant is, echo a tidied version of the "
    "descriptor as the name and use category Other rather than inventing a "
    "business. Never guess an amount, a date, or anything not present."
)

# `defer_model_check` keeps import working without OPENAI_API_KEY — the module is
# imported by the test suite and by `api.main` on machines that have no key, and
# a missing key should surface as a 503 on the one endpoint that needs it, not as
# an import error that takes the whole API down.
merchant_agent = Agent(
    f"openai:{os.getenv('OPENAI_MODEL', 'gpt-5.1')}",
    output_type=MerchantGuess,
    instructions=_INSTRUCTIONS,
    name="merchant-guess",
    defer_model_check=True,
)


@router.post("/guess", response_model=MerchantGuess, operation_id="guess_merchant")
async def guess_merchant(
    payload: MerchantGuessRequest,
    user_id: str = Depends(get_current_user_id),
):
    # The descriptor is the whole input, so it is worth having on the span: a
    # wrong category months later is only diagnosable next to the string that
    # produced it.
    with logfire.span("guess merchant {descriptor}", descriptor=payload.merchant):
        try:
            result = await merchant_agent.run(payload.merchant)
        except UnexpectedModelBehavior as exc:
            # Model could not produce a valid MerchantGuess even after retries.
            raise HTTPException(status_code=502, detail={
                "code": "GUESS_FAILED", "message": str(exc)}) from exc
        except Exception as exc:
            # No API key, network failure, rate limit, provider outage. The phone
            # treats any failure as "no guess" and falls back to Other with the
            # raw descriptor, so this never blocks capture — it costs the prefill.
            raise HTTPException(status_code=503, detail={
                "code": "LLM_UNAVAILABLE", "message": str(exc)}) from exc

        logfire.info(
            "guessed {descriptor} as {name} ({category})",
            descriptor=payload.merchant,
            name=result.output.name,
            category=result.output.category,
        )
        return result.output
