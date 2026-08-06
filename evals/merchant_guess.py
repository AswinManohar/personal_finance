"""Evaluation suite for the merchant-guess agent.

Unit tests prove the endpoint's *plumbing* — auth, error mapping, the fact that
an out-of-enum category can never reach the phone. They say nothing about
whether the guesses are any good, because they stub the model out entirely.
This does the other half: it runs the real agent against real acquirer
descriptors captured from the phone and scores the answers.

Not part of `pytest` by default: it costs money and needs `OPENAI_API_KEY`.
Run it deliberately:

    uv run python -m evals.merchant_guess

Results stream to Logfire when `LOGFIRE_TOKEN` is set, so runs can be compared
across prompt or model changes rather than judged one console dump at a time.

The category expectations are `accepted` *sets*, not single values. Real
descriptors are genuinely ambiguous — dm is a drugstore, which a reasonable
person files under Food or Other — and an eval that demands one blessed answer
measures agreement with its author instead of quality.
"""
from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass

from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import Evaluator, EvaluatorContext

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.observability import configure_observability  # noqa: E402
from api.routers.merchants import MerchantGuess, merchant_agent  # noqa: E402


@dataclass
class CategoryAccepted(Evaluator[str, MerchantGuess]):
    """Did the category land in the set a reasonable person would accept?"""

    def evaluate(self, ctx: EvaluatorContext[str, MerchantGuess]) -> bool:
        accepted = (ctx.metadata or {}).get("accepted_categories", set())
        return ctx.output.category in accepted


@dataclass
class NameIsReadable(Evaluator[str, MerchantGuess]):
    """The whole point of the call: turn an acquirer string into something a
    human would recognise in an expense list.

    Deliberately mechanical rather than an LLM judge — these properties are
    cheap to check and the failures they catch (echoing the descriptor
    unchanged, keeping SHOUTING CAPS, dragging marketing filler along) are the
    ones actually seen in practice.
    """

    def evaluate(self, ctx: EvaluatorContext[str, MerchantGuess]) -> dict[str, bool]:
        name = ctx.output.name
        unintelligible = bool((ctx.metadata or {}).get("unintelligible"))
        return {
            "non_empty": bool(name.strip()),
            # An unintelligible reference code has no readable form, and the
            # instructions tell the model to echo it — so caps are correct there.
            # The first version of this rule failed that case and was measuring
            # the evaluator's naivety, not the agent.
            "not_shouting": unintelligible or name != name.upper() or len(name) <= 4,
            "no_filler": "SAGT DANKE" not in name.upper(),
        }
        # Removed: "not_longer_than_descriptor". It punished the single most
        # valuable thing the model does — the live run turned the acquirer's
        # truncated "REWE Bonn, Friedenspla" back into "REWE Bonn
        # Friedensplatz", and this rule scored that as a failure.


@dataclass
class DoesNotInventABusiness(Evaluator[str, MerchantGuess]):
    """Unintelligible descriptors must fall back to Other rather than the model
    confabulating a plausible shop. A wrong-but-confident category is worse than
    a vague one: it silently skews the category breakdown."""

    def evaluate(self, ctx: EvaluatorContext[str, MerchantGuess]) -> bool:
        if not (ctx.metadata or {}).get("unintelligible"):
            return True
        return ctx.output.category == "Other"


# Descriptors captured from the phone with `dumpsys notification --noredact`
# (.scratch/advanzia-notification-capture/issues/02-*), plus hostile variations.
dataset = Dataset[str, MerchantGuess, dict](
    name="merchant-guess",
    cases=[
        Case(
            name="supermarket-truncated-midword",
            inputs="REWE Bonn, Friedenspla",
            metadata={"accepted_categories": {"Food"}},
        ),
        Case(
            name="coffee-shop-with-legal-suffix",
            inputs="Der Kaffeeladen GmbH",
            metadata={"accepted_categories": {"Food", "Entertainment"}},
        ),
        Case(
            name="drugstore-with-marketing-filler",
            inputs="DM DROGERIE SAGT DANKE",
            metadata={"accepted_categories": {"Food", "Other", "Utilities"}},
        ),
        Case(
            name="opaque-holding-company-name",
            inputs="MEGA LIMITED",
            metadata={"accepted_categories": {"Other", "Entertainment"}},
        ),
        Case(
            name="payment-processor-prefix",
            inputs="PAYPAL *SPOTIFY",
            metadata={"accepted_categories": {"Entertainment"}},
        ),
        Case(
            name="transit-operator",
            inputs="DB VERTRIEB GMBH",
            metadata={"accepted_categories": {"Transport"}},
        ),
        Case(
            name="unintelligible-reference",
            inputs="X4J9 8812 REF",
            metadata={"accepted_categories": {"Other"}, "unintelligible": True},
        ),
    ],
    evaluators=[CategoryAccepted(), NameIsReadable(), DoesNotInventABusiness()],
)


async def guess(descriptor: str) -> MerchantGuess:
    result = await merchant_agent.run(descriptor)
    return result.output


def main() -> int:
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set — this eval calls the real model.")
        return 1

    configure_observability()
    report = asyncio.run(dataset.evaluate(guess))
    report.print(include_input=True, include_output=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
