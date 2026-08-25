"""
The service-role key gate.

`SUPABASE_SERVICE_ROLE_KEY` used to fall back to the anon key, which silently
degraded the "service-role" client into an anon one. That was invisible while
RLS went unenforced, and would have turned into empty integration feeds with no
error the moment RLS was switched on. These tests pin the loud behaviour.
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.dependencies import _is_service_role_key


def _jwt(role: str) -> str:
    """A JWT-shaped token carrying `role`. Signature is irrelevant — the gate
    inspects our own configuration, it does not authenticate anything."""
    payload = base64.urlsafe_b64encode(
        json.dumps({"iss": "supabase", "role": role}).encode()
    ).decode().rstrip("=")  # JWTs strip base64 padding; the gate must re-pad
    return f"header.{payload}.signature"


def test_service_role_jwt_is_accepted():
    assert _is_service_role_key(_jwt("service_role")) is True


def test_anon_jwt_is_refused():
    # The whole point: an anon key must never pass as a service-role key.
    assert _is_service_role_key(_jwt("anon")) is False


def test_missing_key_is_refused():
    assert _is_service_role_key("") is False


def test_opaque_secret_key_is_accepted():
    assert _is_service_role_key("sb_secret_abc123") is True


def test_opaque_publishable_key_is_refused():
    assert _is_service_role_key("sb_publishable_abc123") is False


def test_unrecognised_shape_is_refused():
    # Refuse rather than assume something unknown bypasses RLS.
    for junk in ("not-a-jwt", "a.b", "a.!!!.c", "....."):
        assert _is_service_role_key(junk) is False


def test_padding_stripped_payload_still_decodes():
    # A payload whose base64 length is not a multiple of 4 must not throw and
    # be swallowed as "refuse" for the wrong reason.
    for role_padding in ("service_role", "service_role ", "service_role  "):
        token = _jwt(role_padding.strip())
        assert _is_service_role_key(token) is True
