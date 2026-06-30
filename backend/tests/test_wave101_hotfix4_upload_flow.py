"""Wave 101 hotfix-4 — Full end-to-end document upload + submit-for-review flow.

Bypasses the /signup-supplier rate limiter by creating the auth user directly
through the Supabase admin SDK. Exercises:
  1. /auth/apply-seller (draft)
  2. /auth/supplier-document-upload (3 mandatory docs)
  3. /auth/supplier-phase2 (bank details + doc path persistence)
  4. /auth/submit-for-review (draft → pending)
  5. /auth/me — verifies the uploaded doc fields are returned so the
     frontend's Submit gate sees them.
"""
import io
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


def _create_user_via_sdk(email: str, password: str = "Test@1234"):
    """Bypass rate limiter by using the admin SDK directly."""
    created = sb_admin.auth.admin.create_user({
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"name": "QA Hotfix4", "role": "supplier"},
    })
    uid = created.user.id
    sb_admin.table("users").upsert({
        "id": uid, "email": email, "name": "QA Hotfix4",
        "role": "supplier", "phone": "+91 9000555444",
        "company": "QA Hotfix4 Co", "city": "Bangalore",
    }, on_conflict="id").execute()
    return uid


def test_step3_full_upload_and_submit_flow():
    """End-to-end happy path:
       signup → apply (draft) → upload 3 docs → save bank → submit → pending."""
    admin_token = _admin_token()
    em = f"qa-h4-flow-{uuid.uuid4().hex[:8]}@example.com"
    uid = None
    try:
        # === Create user (bypass rate limiter via SDK) ===
        uid = _create_user_via_sdk(em)
        login = requests.post(f"{API}/auth/login", json={"email": em, "password": "Test@1234"}, timeout=20)
        login.raise_for_status()
        tok = login.json()["access_token"]
        H = {"Authorization": f"Bearer {tok}"}

        # === Step 1: apply-seller with submit_for_review=False → draft ===
        apply = requests.post(f"{API}/auth/apply-seller", json={
            "business_name": "QA H4 Co", "contact_person": "QA",
            "phone": "+91 9000555444", "city": "Bangalore",
            "state": "Karnataka", "pincode": "560001",
            "cities_served": ["Bangalore"], "gst_number": "29AABCA1234A1Z5",
            "pan_number": "AABCA1234A", "business_address": "Addr",
            "seller_types": ["Compatible"], "compatible_brands": ["HP"],
            "testing_before_delivery": True, "agreed_to_terms": True,
            "submit_for_review": False,
        }, headers=H, timeout=20)
        apply.raise_for_status()
        assert apply.json()["status"] == "draft"
        me1 = requests.get(f"{API}/auth/me", headers=H, timeout=20).json()
        assert me1["application_status"] == "draft", f"Expected draft, got {me1.get('application_status')}"

        # === Step 2: BUG #2 — upload 3 mandatory docs, verify each is persisted ===
        # Crucial — the frontend Submit button reads from supplier.application.doc_*
        # The endpoint must:
        #   (a) accept the file upload
        #   (b) /auth/supplier-phase2 must persist the doc path
        #   (c) /auth/me must return the persisted doc path in application[]
        fake_pdf = b"%PDF-1.4\n% fake content\n%%EOF"
        uploaded_paths = {}
        for key in ("doc_gst", "doc_pan", "doc_id_proof"):
            r = requests.post(
                f"{API}/auth/supplier-document-upload?field={key}",
                files={"file": (f"{key}.pdf", io.BytesIO(fake_pdf), "application/pdf")},
                headers=H, timeout=30,
            )
            assert r.status_code == 200, f"{key} upload failed: {r.status_code} {r.text}"
            path = r.json()["path"]
            uploaded_paths[key] = path
            # Persist path via /auth/supplier-phase2
            p2 = requests.post(f"{API}/auth/supplier-phase2", json={key: path}, headers=H, timeout=20)
            assert p2.status_code == 200, f"{key} persist failed: {p2.status_code} {p2.text}"

        # === Step 3: save bank details ===
        bank = requests.post(f"{API}/auth/supplier-phase2", json={
            "account_holder_name": "QA Hotfix4 Co",
            "account_number": "123456789012",
            "ifsc_code": "HDFC0001234",
            "bank_name": "HDFC Bank",
            "bank_branch": "MG Road",
        }, headers=H, timeout=20)
        assert bank.status_code == 200, f"bank save failed: {bank.text}"

        # === Step 4: /auth/me must surface all uploaded docs + bank ===
        me2 = requests.get(f"{API}/auth/me", headers=H, timeout=20).json()
        app = me2.get("application") or {}
        for key in ("doc_gst", "doc_pan", "doc_id_proof"):
            assert app.get(key), f"/auth/me did NOT surface {key} ({app.get(key)})"
        assert app.get("account_number") == "123456789012"
        assert app.get("ifsc_code") == "HDFC0001234"
        # ⇒ frontend's `docs = {...supplier, ...uploadedPatch}` would see all 3 docs.
        # ⇒ readyToSubmit = allMandatoryDocsUploaded && bankOK = TRUE
        # ⇒ Submit button would be ENABLED.

        # === Step 5: submit-for-review → status=pending ===
        sub = requests.post(f"{API}/auth/submit-for-review", headers=H, timeout=20)
        assert sub.status_code == 200, f"submit failed: {sub.text}"
        assert sub.json()["status"] == "pending"
        me3 = requests.get(f"{API}/auth/me", headers=H, timeout=20).json()
        assert me3["application_status"] == "pending"
    finally:
        if uid:
            requests.delete(f"{API}/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)


def test_approved_dealer_partial_upload_persists():
    """Bug #4 regression — when an approved dealer uploads a missing doc,
    /auth/me must reflect it on the next call so the Phase2Banner can
    auto-update its missing-docs list."""
    admin_token = _admin_token()
    em = f"qa-h4-appr-{uuid.uuid4().hex[:8]}@example.com"
    uid = None
    try:
        uid = _create_user_via_sdk(em)
        # Promote to approved supplier (skip the full pending flow)
        sb_admin.table("suppliers").insert({
            "user_id": uid, "business_name": "QA Approved", "contact_person": "QA",
            "phone": "+91 9000666555", "email": em, "city": "Bangalore",
            "state": "Karnataka", "pincode": "560001",
            "gst_number": "29AABCA1234A1Z5", "pan_number": "AABCA1234A",
            "business_address": "Addr", "seller_types": ["Compatible"],
            "compatible_brands": ["HP"], "testing_before_delivery": True,
            # Pre-uploaded GST + PAN but missing ID proof
            "doc_gst": "/qa/gst.pdf", "doc_pan": "/qa/pan.pdf",
            "account_number": "111111111111", "ifsc_code": "HDFC0001234",
        }).execute()

        login = requests.post(f"{API}/auth/login", json={"email": em, "password": "Test@1234"}, timeout=20).json()
        H = {"Authorization": f"Bearer {login['access_token']}"}

        me_before = requests.get(f"{API}/auth/me", headers=H, timeout=20).json()
        assert me_before["supplier_status"] == "approved"
        s_before = me_before.get("supplier") or {}
        assert s_before.get("doc_gst") == "/qa/gst.pdf"
        assert not s_before.get("doc_id_proof"), "doc_id_proof should be missing initially"

        # Upload ID proof
        fake_pdf = b"%PDF-1.4\n% fake\n%%EOF"
        r = requests.post(
            f"{API}/auth/supplier-document-upload?field=doc_id_proof",
            files={"file": ("id.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=H, timeout=30,
        )
        assert r.status_code == 200
        path = r.json()["path"]
        p2 = requests.post(f"{API}/auth/supplier-phase2", json={"doc_id_proof": path}, headers=H, timeout=20)
        assert p2.status_code == 200

        # Now /auth/me must surface the doc_id_proof — proving Bug #4 fix:
        # the approved-dealer banner WILL auto-update when re-fetched.
        me_after = requests.get(f"{API}/auth/me", headers=H, timeout=20).json()
        s_after = me_after.get("supplier") or {}
        assert s_after.get("doc_id_proof"), f"/auth/me didn't surface doc_id_proof — banner will be stale"
        assert s_after["doc_id_proof"] == path
    finally:
        if uid:
            requests.delete(f"{API}/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
            sb_admin.table("suppliers").delete().eq("user_id", uid).execute()


if __name__ == "__main__":
    test_step3_full_upload_and_submit_flow()
    print("PASS: fresh dealer → upload 3 docs → save bank → submit → pending")
    test_approved_dealer_partial_upload_persists()
    print("PASS: approved dealer uploads missing doc, /auth/me reflects it for banner refresh")
