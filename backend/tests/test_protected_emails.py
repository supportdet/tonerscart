"""Regression test for permanently protected supplier emails.

These accounts were restored after the 12-Jun-2026 cleanup-script incident
and must NEVER be deletable by any script — even ones that obtain the env
opt-in and the correct confirm token.
"""
import os

import pytest

os.environ.setdefault("ENABLE_DESTRUCTIVE_OPS", "i-understand")

from data_safety import (  # noqa: E402
    PROTECTED_EMAILS,
    DataSafetyError,
    approval_to_delete_token,
    is_protected_email,
    safe_delete_supplier,
)
from supabase_client import sb_admin  # noqa: E402

EXPECTED = {
    "support@digitaledgeindia.com",
    "sairam@digitaledgeindia.com",
    "sales@bigctech.com",
}


def test_protected_emails_contains_all_three():
    assert EXPECTED.issubset(PROTECTED_EMAILS)


def test_is_protected_email_case_insensitive():
    assert is_protected_email("Support@DigitalEdgeIndia.com")
    assert is_protected_email("SAIRAM@digitaledgeindia.com")
    assert is_protected_email("sales@BIGCTECH.com")
    assert not is_protected_email("random@example.com")
    assert not is_protected_email("")
    assert not is_protected_email(None)


@pytest.mark.parametrize("email", sorted(EXPECTED))
def test_protected_supplier_rows_exist_and_are_approved(email):
    row = sb_admin.table("suppliers").select(
        "id,email,business_name,approved_at,is_suspended"
    ).eq("email", email).maybe_single().execute().data
    assert row, f"protected supplier missing from DB: {email}"
    assert row["approved_at"], f"{email} must have approved_at set"
    assert row["is_suspended"] is False, f"{email} must not be suspended"


@pytest.mark.parametrize("email", sorted(EXPECTED))
def test_safe_delete_supplier_refuses_protected(email):
    row = sb_admin.table("suppliers").select("id").eq("email", email).maybe_single().execute().data
    assert row, f"protected supplier {email} missing — fix DB before testing"
    sid = row["id"]
    tok = approval_to_delete_token(sb_admin, sid)
    with pytest.raises(DataSafetyError, match="PROTECTED_EMAILS"):
        safe_delete_supplier(
            sb_admin,
            sid,
            tok,
            reason="regression test attempting to delete a protected dealer",
        )
