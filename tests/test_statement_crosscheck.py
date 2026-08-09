import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.statement_review.crosscheck import crosscheck
from api.statement_review.models import StatementTransaction


def tx(date, desc, amount, direction="debit"):
    return StatementTransaction(date=date, description=desc, amount=amount,
                                category="Other", direction=direction)


def app_row(id, name, amount, created_at, vendor=None):
    return {"id": id, "name": name, "amount": amount,
            "vendor": vendor, "created_at": created_at}


def test_exact_match_produces_no_discrepancies():
    report = crosscheck([tx("2026-06-01", "REWE SAGT DANKE", 54.30)],
                        [app_row("e1", "Groceries", 54.30, "2026-06-02T10:00:00+00:00",
                                 vendor="REWE")])
    assert report.missing_in_app == []
    assert report.missing_on_statement == []
    assert report.amount_mismatch == []


def test_unmatched_statement_tx_is_missing_in_app():
    report = crosscheck([tx("2026-06-05", "Lieferando", 28.90)], [])
    assert [t.description for t in report.missing_in_app] == ["Lieferando"]


def test_app_expense_inside_period_not_on_statement():
    txs = [tx("2026-06-01", "REWE", 54.30), tx("2026-06-30", "Netflix", 12.99)]
    rows = [app_row("e1", "REWE", 54.30, "2026-06-01T00:00:00+00:00"),
            app_row("e2", "Netflix", 12.99, "2026-06-30T00:00:00+00:00"),
            app_row("e3", "Gym", 29.99, "2026-06-15T00:00:00+00:00"),
            app_row("e4", "Outside period", 10.0, "2026-05-01T00:00:00+00:00")]
    report = crosscheck(txs, rows)
    assert [r["id"] for r in report.missing_on_statement] == ["e3"]


def test_similar_name_wrong_amount_is_mismatch_not_missing():
    report = crosscheck([tx("2026-06-10", "Netflix", 17.99)],
                        [app_row("e1", "Netflix", 12.99, "2026-06-10T00:00:00+00:00")])
    assert report.missing_in_app == []
    assert len(report.amount_mismatch) == 1
    assert round(report.amount_mismatch[0].delta, 2) == 5.00


def test_date_window_boundary_three_days_matches_four_does_not():
    row = [app_row("e1", "REWE", 54.30, "2026-06-05T00:00:00+00:00")]
    assert crosscheck([tx("2026-06-08", "REWE", 54.30)], row).missing_in_app == []
    assert len(crosscheck([tx("2026-06-09", "REWE", 54.30)], row).missing_in_app) == 1


def test_credits_are_ignored():
    report = crosscheck([tx("2026-06-01", "SALARY", 3000, direction="credit")], [])
    assert report.missing_in_app == []


def test_duplicate_amounts_each_match_a_distinct_row():
    txs = [tx("2026-06-01", "Coffee A", 4.50), tx("2026-06-01", "Coffee B", 4.50)]
    rows = [app_row("e1", "Coffee A", 4.50, "2026-06-01T00:00:00+00:00"),
            app_row("e2", "Coffee B", 4.50, "2026-06-01T00:00:00+00:00")]
    assert crosscheck(txs, rows).missing_in_app == []


def test_one_cent_delta_matches_despite_float_rounding():
    # abs(54.31 - 54.30) is slightly *over* 0.01 in binary float
    # (0.010000000000005116), so a naive float comparison misclassifies
    # this textbook 1-cent match as a mismatch. Cents-based comparison
    # must treat it as an exact, clean match.
    report = crosscheck([tx("2026-06-01", "REWE", 54.30)],
                        [app_row("e1", "REWE", 54.31, "2026-06-01T00:00:00+00:00")])
    assert report.missing_in_app == []
    assert report.amount_mismatch == []
    assert report.missing_on_statement == []


def test_two_cent_delta_with_similar_name_is_amount_mismatch():
    report = crosscheck([tx("2026-06-01", "REWE", 54.30)],
                        [app_row("e1", "REWE", 54.32, "2026-06-01T00:00:00+00:00")])
    assert report.missing_in_app == []
    assert len(report.amount_mismatch) == 1
    assert round(report.amount_mismatch[0].delta, 2) == -0.02


def test_matching_is_order_independent_across_ambiguous_candidates():
    # Two same-amount transactions where a naive per-transaction greedy pass
    # would let whichever transaction is processed first steal the only row
    # a later transaction could have matched, producing a false
    # missing_in_app that depends on input order. Both orderings must
    # produce a full match with no discrepancies.
    rows = [app_row("e1", "Coffee", 5.00, "2026-06-01T00:00:00+00:00"),
            app_row("e2", "Latte", 5.00, "2026-06-05T00:00:00+00:00")]
    forward = [tx("2026-06-03", "Coffee", 5.00), tx("2026-06-01", "Coffee", 5.00)]
    backward = [tx("2026-06-01", "Coffee", 5.00), tx("2026-06-03", "Coffee", 5.00)]
    for txs in (forward, backward):
        report = crosscheck(txs, rows)
        assert report.missing_in_app == []
        assert report.amount_mismatch == []
