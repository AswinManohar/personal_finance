import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pydantic_ai.models.test import TestModel

from api.routers.merchants import MerchantGuess, merchant_agent
from evals.merchant_guess import dataset

"""
Guards the eval suite itself.

An eval whose evaluators pass everything is worse than no eval — it reports a
green score while measuring nothing. These tests run the dataset against
deliberately good and deliberately bad stub models and assert the score moves,
which is the only way to know the evaluators discriminate.

The real evaluation (`python -m evals.merchant_guess`) calls the live model and
costs money, so it stays out of pytest.
"""


def run_with(name: str, category: str) -> float:
    async def guess(descriptor: str) -> MerchantGuess:
        with merchant_agent.override(
            model=TestModel(custom_output_args={"name": name, "category": category})
        ):
            result = await merchant_agent.run(descriptor)
            return result.output

    report = asyncio.run(dataset.evaluate(guess, max_concurrency=4))
    assertions = [
        passed
        for case in report.cases
        for passed in [a.value for a in case.assertions.values()]
    ]
    return sum(1 for a in assertions if a) / len(assertions)


def test_the_dataset_covers_the_descriptors_captured_from_the_phone():
    inputs = {case.inputs for case in dataset.cases}
    assert "REWE Bonn, Friedenspla" in inputs
    assert "DM DROGERIE SAGT DANKE" in inputs
    assert "MEGA LIMITED" in inputs
    assert "Der Kaffeeladen GmbH" in inputs


def test_a_useless_answer_scores_worse_than_a_plausible_one():
    """The discrimination check. A model that shouts the descriptor back and
    files everything under Other must not score as well as one that behaves."""
    lazy = run_with("DM DROGERIE SAGT DANKE", "Other")
    decent = run_with("dm", "Food")
    assert lazy < decent


def test_echoing_the_raw_descriptor_fails_the_readability_evaluator():
    """Echoing the descriptor unchanged defeats the entire point of the call."""
    echoed = run_with("DM DROGERIE SAGT DANKE", "Food")
    tidied = run_with("dm", "Food")
    assert echoed < tidied
