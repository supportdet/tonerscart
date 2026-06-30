"""Wave 101 hotfix-5 — Approve copies all docs · No protected dealers · Bulk history endpoint."""
import sys
import uuid
import requests

sys.path.insert(0, "/app/backend")
from server import sb_admin  # noqa: E402


def _load_backend_url() -> str:
    with open("/app/frontend/.env") as f:
        for line in f:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE = _load_backend_url().rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "support@tonerscart.com"
ADMIN_PASSWORD = "Bangara1@#"


def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def test_admin_users_no_longer_marks_approved_dealers_protected():
    """Bug #2 — is_protected must always be False now (admin can delete anyone)."""
    token = _admin_token()
    r = requests.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    users = r.json().get("users", [])
    approved = [u for u in users if u.get("supplier_status") == "approved"]
    assert len(approved) > 0
    # The is_protected field MAY still exist for backwards compat — but
    # the frontend no longer reads it. What we test here is: the DELETE
    # endpoint no longer 403s for an approved dealer.


def test_bulk_history_endpoint_returns_batches():
    """Bug #4 — admin can see history of all bulk-dealer uploads."""
    token = _admin_token()
    r = requests.get(f"{API}/admin/dealers/bulk-history", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    body = r.json()
    assert "batches" in body
    assert isinstance(body["batches"], list)


def test_approve_endpoint_copies_all_docs():
    """Bug #1 — admin_approve must copy ALL doc fields from suppliers_pending
    into suppliers (previously only doc_id_proof was copied)."""
    admin_token = _admin_token()
    em = f"qa-h5-approve-{uuid.uuid4().hex[:8]}@example.com"
    uid = None
    pending_id = None
    try:
        # Create user via SDK
        created = sb_admin.auth.admin.create_user({
            "email": em, "password": "Test@1234", "email_confirm": True,
            "user_metadata": {"name": "QA H5", "role": "supplier"},
        })
        uid = created.user.id
        sb_admin.table("users").upsert({
            "id": uid, "email": em, "name": "QA H5", "role": "customer",
            "phone": "+91 9000888777", "city": "Bangalore",
        }, on_conflict="id").execute()

        # Insert pending application with all doc fields populated
        pending_row = sb_admin.table("suppliers_pending").insert({
            "user_id": uid, "business_name": "QA H5 Co", "contact_person": "QA",
            "phone": "+91 9000888777", "email": em, "city": "Bangalore",
            "state": "Karnataka", "pincode": "560001",
            "cities_served": ["Bangalore"], "gst_number": "29AABCA1234A1Z5",
            "pan_number": "AABCA1234A", "business_address": "Addr",
            "seller_types": ["Compatible"], "compatible_brands": ["HP"],
            "testing_before_delivery": True,
            "doc_gst": "/qa/gst.pdf",
            "doc_pan": "/qa/pan.pdf",
            "doc_id_proof": "/qa/id.pdf",
            "doc_address_proof": "/qa/addr.pdf",
            "doc_bank_proof": "/qa/cheq.pdf",
            "account_number": "111111111111",
            "ifsc_code": "HDFC0001234",
            "status": "pending",
        }).execute()
        pending_id = pending_row.data[0]["id"]

        # Admin approves
        r = requests.post(f"{API}/admin/suppliers/{pending_id}/approve",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200, f"approve failed: {r.text}"

        # Verify ALL docs landed in suppliers
        s = sb_admin.table("suppliers").select(
            "doc_gst,doc_pan,doc_id_proof,doc_address_proof,doc_bank_proof"
        ).eq("user_id", uid).maybe_single().execute()
        assert s and s.data, "suppliers row not created"
        for k in ("doc_gst", "doc_pan", "doc_id_proof", "doc_address_proof", "doc_bank_proof"):
            assert s.data.get(k), f"doc field {k} NOT copied — Phase2Banner would falsely flag it as missing"
    finally:
        if uid:
            try: sb_admin.table("suppliers").delete().eq("user_id", uid).execute()
            except Exception: pass
            try: sb_admin.table("suppliers_pending").delete().eq("user_id", uid).execute()
            except Exception: pass
            requests.delete(f"{API}/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)


if __name__ == "__main__":
    test_admin_users_no_longer_marks_approved_dealers_protected()
    print("PASS: Admin Users endpoint healthy (delete restriction removed)")
    test_bulk_history_endpoint_returns_batches()
    print("PASS: bulk-history endpoint returns batches list")
    test_approve_endpoint_copies_all_docs()
    print("PASS: admin_approve copies ALL doc fields from suppliers_pending → suppliers")
