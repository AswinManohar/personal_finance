"""Local, deterministic PII scrub. This is the privacy boundary: only the
text returned by redact() may ever be sent to an LLM."""
import re
from dataclasses import dataclass, field


@dataclass
class RedactionResult:
    text: str
    masked_counts: dict[str, int] = field(default_factory=dict)


# Order matters: IBAN before card so the card pattern can't eat IBAN digits,
# and phone before card so an international phone number (13+ digits with
# a leading +/00 prefix) is labeled "phone" and not swallowed by the
# looser card-number pattern.
_PHONE_INTL = r"(?:\+|00)\d{1,3}[\s\-/]?(?:\d[\s\-/]?){6,12}\d"
# Local-format phone (no + / 00 prefix): a leading 0 followed by 8-13 more
# digits, optionally separated by space/dash/slash. Dot is deliberately
# excluded from the separator set so this can't eat dotted dates like
# "01.06.2026" — the dot breaks the digit run and the match fails to reach
# its minimum length. Leading/trailing digit boundaries via lookaround keep
# it from starting mid-number (e.g. the "0" inside "2026" or "-54.30").
#
# The trailing lookahead is `(?![\s\-/]?\d)`, not the weaker `(?!\d)`: a
# plain `(?!\d)` only blocks the match from ending right before another
# digit, but the {8,13} cap can still stop mid-run at a separator (e.g.
# a space) even though more digits continue after it — that let a longer
# 0-leading digit run (like a 12-18 digit card/account number) get
# partially consumed as "phone", leaking its unconsumed tail in plaintext.
# Requiring "not followed by an optional separator then a digit" forces
# the match to end only where the digit run *actually* ends, so a
# card-length run fails to match here at all and falls through intact to
# the card pattern instead of being truncated.
_PHONE_LOCAL = r"(?<!\d)0(?:[\s\-/]?\d){8,13}(?![\s\-/]?\d)"
_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("balance_line", re.compile(r"(?im)^.*\b(?:balance|saldo)\b.*$")),
    ("iban", re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,8}(?:\s?[A-Z0-9]{1,3})?\b")),
    ("phone", re.compile(rf"{_PHONE_INTL}|{_PHONE_LOCAL}")),
    ("card", re.compile(r"\b(?:\d[ -]?){12,18}\d\b")),
    ("partial_card", re.compile(r"\*{2,4}\s?-?\s?\d{4}\b")),
    ("account", re.compile(r"(?i)(?:account\s*(?:no\.?|number)|kontonummer|a/c)\s*[:#]?\s*\S+")),
]


def redact(text: str, extra_names: list[str] | None = None) -> RedactionResult:
    counts: dict[str, int] = {}
    for label, pattern in _PATTERNS:
        text, n = pattern.subn(f"[{label.upper()}]", text)
        if n:
            counts[label] = n
    for name in extra_names or []:
        name = name.strip()
        if not name:
            continue
        text, n = re.subn(re.escape(name), "[NAME]", text, flags=re.IGNORECASE)
        if n:
            counts["name"] = counts.get("name", 0) + n
    return RedactionResult(text=text, masked_counts=counts)
