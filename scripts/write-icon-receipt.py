"""Record which icons the bundled font subset was built from.

Written by scripts/fetch-icon-font.sh after a successful fetch, and read by
tests/frontend/iconSubset.test.ts. Separate from the shell script only because
a Python heredoc inside it would be one quoting mistake away from silence.
"""

import hashlib
import json
import sys
from pathlib import Path

names, font = sys.argv[1].split(","), Path(sys.argv[2])
receipt = font.parent / "icons.json"
receipt.write_text(
    json.dumps(
        {
            "note": "Written by scripts/fetch-icon-font.sh. Do not edit by hand.",
            "icons": names,
            "font": font.name,
            "sha256": hashlib.sha256(font.read_bytes()).hexdigest(),
        },
        indent=2,
    )
    + "\n"
)
print(f"Wrote {receipt} ({len(names)} icons)")
