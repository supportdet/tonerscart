"""DISABLED — see incident report 12-Jun-2026.

This script previously bulk-deleted every supplier whose business_name did
not contain "big c". That wiped out DET (Digital Edge Technologies) and
their listings. To prevent recurrence, the body has been replaced with a
hard refusal. See `data_safety.py` for the sanctioned path forward.

If you genuinely need to delete a dealer:
  1. Suspend them via the admin UI (`/admin` → Dealers → Suspend) so the
     `is_suspended` flag is set.
  2. Use `safe_delete_supplier()` in `data_safety.py`, one row at a time,
     after obtaining a fresh confirmation token from `approval_to_delete_token()`.
"""
from __future__ import annotations

import sys

from data_safety import block_bulk_delete

if __name__ == "__main__":
    print(
        "\n  cleanup_keep_real_only.py is DISABLED.\n"
        "  This script caused the 12-Jun-2026 supplier-wipe incident.\n"
        "  Use data_safety.safe_delete_supplier(...) for any future\n"
        "  per-supplier removals — never a bulk delete.\n",
        file=sys.stderr,
    )
    block_bulk_delete()
