"""The SPA catch-all serves files from dist/ and nothing outside it.

`os.path.join("dist", full_path)` with a request path of `..%2Fpyproject.toml`
used to resolve to `dist/../pyproject.toml`, which exists, so the route
happily returned it. Anything the container holds — the API source, the
lockfile, /etc/passwd — was one encoded slash away from a public GET.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import api.main as main


def test_resolves_a_file_inside_dist(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("ok")
    assert main.safe_dist_path(str(tmp_path), "assets/app.js") == str(tmp_path / "assets" / "app.js")


def test_missing_file_inside_dist_is_none(tmp_path):
    assert main.safe_dist_path(str(tmp_path), "nope.js") is None


@pytest.mark.parametrize("path", [
    "../secret.txt",
    "assets/../../secret.txt",
    "/etc/passwd",
    "../",
])
def test_refuses_anything_outside_dist(tmp_path, path):
    (tmp_path.parent / "secret.txt").write_text("leak")
    dist = tmp_path / "dist"
    dist.mkdir()
    assert main.safe_dist_path(str(dist), path) is None


@pytest.mark.skipif(not os.path.isdir("dist"), reason="needs a built frontend")
def test_encoded_traversal_falls_through_to_the_spa():
    client = TestClient(main.app)
    response = client.get("/..%2Fpyproject.toml")
    assert response.status_code == 200
    assert "[project]" not in response.text
    assert "<!DOCTYPE html>" in response.text
