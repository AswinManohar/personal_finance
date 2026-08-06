"""Logfire wiring: tracing for the API and for every LLM call it makes.

Configured once, from `api.main`, and deliberately harmless when unconfigured —
`send_to_logfire='if-token-present'` means a machine with no `LOGFIRE_TOKEN`
(local dev, CI, the test suite) runs exactly as before, with no network calls and
no noise. That matters because the backend is also what the phone talks to: an
observability dependency that could fail closed would take capture down with it.

What it buys: every merchant guess becomes a trace with the descriptor that went
in, the name and category that came out, token usage and latency — which is what
makes the guess quality reviewable after the fact, rather than only when someone
notices a wrong category in their expenses.
"""
import os

import logfire

_configured = False


def configure_observability(app=None) -> None:
    """Idempotent — safe to call from app startup and from eval scripts."""
    global _configured
    if _configured:
        return
    _configured = True

    logfire.configure(
        service_name="cashflow-api",
        # No token → no export. Nothing to disable in dev or tests.
        send_to_logfire="if-token-present",
        # The console exporter would interleave spans with pytest output and
        # with uvicorn's own logs; Logfire's UI is the intended surface.
        console=False,
        environment=os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
    )

    # Agent runs, model requests, tool calls, structured output validation.
    logfire.instrument_pydantic_ai()

    if app is not None:
        # Needs the `logfire[fastapi]` extra, and raises at *import* time without
        # it — which once took the whole API down on a missing optional
        # dependency. Tracing is never worth that: lose the spans, keep serving.
        try:
            logfire.instrument_fastapi(app, capture_headers=False)
        except Exception as exc:  # pragma: no cover - depends on install extras
            logfire.warn("FastAPI instrumentation unavailable: {error}", error=str(exc))
