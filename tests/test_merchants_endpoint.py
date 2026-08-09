import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from api.dependencies import get_current_user_id
from api.main import app
from api.routers.merchants import merchant_agent

client = TestClient(app)


@pytest.fixture(autouse=True)
def auth():
    app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    yield
    app.dependency_overrides.clear()


def returning(name: str, category: str) -> TestModel:
    """A model that answers with one fixed, already-valid MerchantGuess."""
    return TestModel(custom_output_args={"name": name, "category": category})


def failing(exc: Exception) -> FunctionModel:
    def raise_it(messages, info: AgentInfo):
        raise exc
    return FunctionModel(raise_it)


def prompt_sent_to_model() -> list[str]:
    """Captures what actually reached the model, so the test can assert the raw
    descriptor was not tidied up on the way — tidying it here would hide the very
    truncation the model is being asked to interpret."""
    seen: list[str] = []

    def capture(messages, info: AgentInfo):
        for part in messages[-1].parts:
            text = getattr(part, "content", None)
            if isinstance(text, str):
                seen.append(text)
        raise UnexpectedModelBehavior("captured")

    return seen, FunctionModel(capture)


def test_guesses_a_readable_name_and_category():
    with merchant_agent.override(model=returning("dm", "Food")):
        response = client.post("/api/merchants/guess", json={"merchant": "DM DROGERIE SAGT DANKE"})

    assert response.status_code == 200
    assert response.json() == {"name": "dm", "category": "Food"}


def test_passes_an_acquirer_truncated_descriptor_through_verbatim():
    seen, model = prompt_sent_to_model()
    with merchant_agent.override(model=model):
        client.post("/api/merchants/guess", json={"merchant": "REWE Bonn, Friedenspla"})

    assert "REWE Bonn, Friedenspla" in seen


def test_reports_llm_failure_as_unavailable_rather_than_inventing_a_guess():
    """The phone falls back to Other on a 503, so an outage costs the prefill and
    never the capture. Inventing a category here would be worse than none."""
    with merchant_agent.override(model=failing(RuntimeError("connection reset"))):
        response = client.post("/api/merchants/guess", json={"merchant": "MEGA LIMITED"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "LLM_UNAVAILABLE"


def test_reports_an_unusable_model_response_as_a_guess_failure():
    with merchant_agent.override(model=failing(UnexpectedModelBehavior("no valid output"))):
        response = client.post("/api/merchants/guess", json={"merchant": "MEGA LIMITED"})

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "GUESS_FAILED"


def test_the_schema_makes_an_invented_category_impossible():
    """The output type is the guardrail: a category outside the app's enum cannot
    reach the phone as a 200, however the model phrases it."""
    with merchant_agent.override(model=returning("Casino Royale", "Gambling")):
        response = client.post("/api/merchants/guess", json={"merchant": "CASINO ROYALE LTD"})

    assert response.status_code in (502, 503)
    assert response.json()["detail"]["code"] in ("GUESS_FAILED", "LLM_UNAVAILABLE")


def test_rejects_an_empty_merchant():
    with merchant_agent.override(model=returning("x", "Other")):
        response = client.post("/api/merchants/guess", json={"merchant": ""})

    assert response.status_code == 422


def test_requires_authentication():
    app.dependency_overrides.clear()
    with merchant_agent.override(model=returning("x", "Other")):
        response = client.post("/api/merchants/guess", json={"merchant": "MEGA LIMITED"})

    assert response.status_code == 401
