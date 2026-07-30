"""Local, deterministic PII scrub. This is the privacy boundary: only the
text returned by redact() may ever be sent to an LLM."""
import re
from dataclasses import dataclass, field


@dataclass
class RedactionResult:
    text: str
    masked_counts: dict[str, int] = field(default_factory=dict)


# Order matters: IBAN before card so the card pattern can't eat IBAN digits.
_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("balance_line", re.compile(r"(?im)^.*\b(?:balance|saldo)\b.*$")),
    ("iban", re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,8}(?:\s?[A-Z0-9]{1,3})?\b")),
    ("card", re.compile(r"\b(?:\d[ -]?){12,18}\d\b")),
    ("partial_card", re.compile(r"\*{2,4}\s?-?\s?\d{4}\b")),
    ("phone", re.compile(r"(?:\+|00)\d{1,3}[\s\-/]?(?:\d[\s\-/]?){6,12}\d")),
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
