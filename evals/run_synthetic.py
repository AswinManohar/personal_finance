"""End-to-end run of 10 synthetic Advanzia notifications.

Stage 1 shells out to `vite-node evals/parseNotifications.ts`, so the gate and
the parser are the *shipped* TypeScript, not a Python restatement of it.
Stage 2 feeds each surviving merchant descriptor to the real merchant-guess
agent and prints what the review sheet would actually be prefilled with.

    uv run python -m evals.run_synthetic

Needs OPENAI_API_KEY. Traced to Logfire when LOGFIRE_TOKEN is set.

The point is the whole chain, not the agent alone: a decline that reaches the
agent is already a bug, and no amount of good guessing would redeem it.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logfire  # noqa: E402

from api.observability import configure_observability  # noqa: E402
from api.routers.merchants import merchant_agent  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def parse_stage() -> list[dict]:
    """Runs the real TypeScript gate + parser over the synthetic notifications."""
    result = subprocess.run(
        ["npx", "vite-node", "evals/parseNotifications.ts"],
        cwd=REPO, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def outcome(item: dict) -> str:
    """What the inbox does with this capture, in the app's own terms."""
    if item["gate"] == "ignored":
        return "dropped (not shown)"
    parse = item["parse"]
    if parse["kind"] == "rejected":
        return f"REJECTED ({parse['marker']}) — no way to add it"
    if item["gate"] == "suspicious":
        return "capture-health alarm + raw inbox item"
    if parse["kind"] == "loose":
        return "pending, flagged NEEDS CHECKING"
    return "pending, normal"


async def main() -> int:
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set — this run calls the real model.")
        return 1

    configure_observability()
    items = parse_stage()

    with logfire.span("synthetic notification run ({count} notifications)", count=len(items)):
        for item in items:
            parse = item["parse"] or {}
            merchant = parse.get("merchant")
            amount = parse.get("amount")

            # One span per notification, carrying the *inference* step — the
            # gate and the parse tier. Without this Logfire only ever showed the
            # merchant guess, which is the least dangerous decision in the
            # chain: rejecting a decline and dropping to the flagged tier are
            # what actually protect the numbers, and they were invisible.
            # The agent call below nests inside this span, so a trace reads
            # notification → tier → guess.
            with logfire.span(
                "infer expense from {notification_id}",
                notification_id=item["id"],
                gate=item["gate"],
                tier=parse.get("kind", "not_parsed"),
                amount=amount,
                merchant=merchant,
                card_ending=parse.get("cardEnding"),
                reject_marker=parse.get("marker"),
                outcome=outcome(item),
                becomes_expense=item["gate"] != "ignored" and parse.get("kind") != "rejected",
                body=item["body"],
            ):
                print("\n" + "─" * 78)
                print(f"{item['id']}")
                print(f"  {item['note']}")
                print(f"  notification : {item['body']}")
                print(f"  gate         : {item['gate']}")
                print(f"  parsed       : tier={parse.get('kind', '—')} "
                      f"amount={amount if amount is not None else '—'} "
                      f"merchant={merchant or '—'}")
                print(f"  outcome      : {outcome(item)}")

                # Only descriptors that could actually become an expense reach
                # the agent. A rejected capture must never cost a model call —
                # if one shows up here, the parser let a decline through.
                if not merchant or parse.get("kind") == "rejected":
                    logfire.info(
                        "no guess needed for {notification_id}: {reason}",
                        notification_id=item["id"],
                        reason="rejected" if parse.get("kind") == "rejected" else "no merchant",
                    )
                    print("  guess        : not called")
                    continue

                try:
                    guess = (await merchant_agent.run(merchant)).output
                    print(f"  guess        : name={guess.name!r} category={guess.category}")
                    shown = amount if amount is not None else "you fill it in"
                    print(f"  review sheet : “{guess.name}” · {guess.category} · {shown}")
                except Exception as exc:
                    logfire.warn(
                        "guess failed for {merchant}, falling back to Other",
                        merchant=merchant, error=str(exc),
                    )
                    print(f"  guess        : FAILED ({type(exc).__name__}) → falls back to "
                          f"“{merchant}” · Other")

    print("\n" + "─" * 78)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
