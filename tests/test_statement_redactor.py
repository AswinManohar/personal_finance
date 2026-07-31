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


def test_local_format_phone_numbers_are_masked():
    text = "Mobile: 0176 12345678. Landline: 030-1234567. See you then."
    result = redact(text)
    assert "0176" not in result.text
    assert "12345678" not in result.text
    assert "1234567" not in result.text
    assert result.masked_counts["phone"] == 2


def test_international_phone_is_labeled_phone_not_card():
    result = redact(SAMPLE, extra_names=["Aswin Manohar"])
    # The +49 phone number must be tallied under "phone", not swallowed by
    # the looser card-number pattern (which should only catch the real
    # 4111 1111 1111 1111 card number).
    assert result.masked_counts["phone"] == 1
    assert result.masked_counts["card"] == 1


def test_bare_unlabeled_account_numbers_are_masked():
    # Real German statements print the Konto-Nr (9-10 digits) and BLZ
    # (8 digits) as bare numbers with no "Kontonummer:" label — too short
    # for the card pattern, no leading 0 for the phone pattern. Found
    # leaking on a real Auszug PDF.
    text = "Auszug 6/2026 Konto 1935718393 BLZ 37050198\nRef 1641384820 end"
    result = redact(text)
    assert "1935718393" not in result.text
    assert "37050198" not in result.text
    assert "1641384820" not in result.text
    assert result.masked_counts["long_number"] == 3


def test_german_kontostand_balance_lines_are_masked():
    # Sparkasse statements say "Kontostand", not "balance"/"saldo" — real
    # document showed opening/closing balances (i.e. account wealth)
    # surviving redaction.
    text = ("Kontostand am 29.05.2026, Auszug Nr. 5  3.630,55\n"
            "01.06.2026 REWE  -54.30\n"
            "Kontostand am 30.06.2026 um 20:03 Uhr  27,68")
    result = redact(text)
    assert "3.630,55" not in result.text
    assert "27,68" not in result.text
    assert "-54.30" in result.text
    assert result.masked_counts["balance_line"] == 2


def test_long_number_followed_by_trailing_punctuation_is_masked():
    # Found on a real Auszug: "Privat Komfort 1935718393, DE89..." — the
    # trailing comma must not shield the account number from masking.
    result = redact("Privat Komfort 1935718393, some tail")
    assert "1935718393" not in result.text


def test_long_number_pattern_spares_dates_and_amounts():
    text = "01.06.2026  REWE 44012  -54.30\n15.06.2026  Miete  -1.234,56"
    result = redact(text)
    assert result.text == text
    assert "long_number" not in result.masked_counts


def test_zero_leading_card_number_is_fully_masked_not_truncated():
    # A 0-leading 12-18-digit run must never be partially consumed by the
    # local-phone pattern and left with a leaking tail (e.g. old bug:
    # "Card: 0111 2233 4455 6677 (test)" -> "Card: [PHONE] 6677 (test)").
    text = "Card: 0111 2233 4455 6677 (test)"
    result = redact(text)
    for digits in ("0111", "2233", "4455", "6677"):
        assert digits not in result.text
