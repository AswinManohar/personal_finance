"""Redactor is the privacy boundary: PII must be masked, transaction lines
must survive untouched. All local, no network."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.statement_review.redactor import redact

SAMPLE = """ACME Bank Monthly Statement
Account Holder: Aswin Manohar
IBAN: DE89 3704 0044 0532 0130 00
Account Number: 532013000
Card: 4111 1111 1111 1111 (**** 1111)
Phone: +49 176 12345678
Opening balance: 2,500.00

01.06.2026  REWE SAGT DANKE 44012  -54.30
03.06.2026  Lieferando.de           -28.90
15.06.2026  Netflix.com             -12.99

Closing balance: 2,403.81
"""


def test_masks_all_pii_types():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    assert "DE89" not in result.text
    assert "4111" not in result.text
    assert "532013000" not in result.text
    assert "12345678" not in result.text
    assert "Aswin Manohar" not in result.text
    assert "2,500.00" not in result.text  # balance line dropped
    assert "2,403.81" not in result.text


def test_counts_reported_per_type():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    assert result.masked_counts["iban"] == 1
    assert result.masked_counts["name"] == 1
    assert result.masked_counts["card"] >= 1
    assert result.masked_counts["balance_line"] == 2


def test_transaction_lines_survive():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    for keep in ("REWE SAGT DANKE", "-54.30", "Lieferando.de", "-28.90",
                 "Netflix.com", "-12.99", "01.06.2026"):
        assert keep in result.text


def test_no_names_arg_is_fine():
    result = redact("hello world")
    assert result.text == "hello world"
    assert result.masked_counts == {}
