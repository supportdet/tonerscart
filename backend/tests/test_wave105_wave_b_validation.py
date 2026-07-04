"""Wave 105-B — Security Hardening: input validation + file magic-byte tests."""
import os
import sys
import pytest
from pydantic import ValidationError

# Make backend/ importable when running pytest from anywhere.
_THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_THIS, "..")))

from server import (  # noqa: E402
    SellerApplication,
    validate_gstin, validate_pan, validate_ifsc, validate_pincode,
    validate_phone, validate_account_number,
    detect_file_type, require_file_type,
)
from fastapi import HTTPException  # noqa: E402


# ============================================================
# Format validators — happy paths + edge cases
# ============================================================

class TestGSTIN:
    def test_valid(self):
        assert validate_gstin("22AAAAA0000A1Z5") == "22AAAAA0000A1Z5"

    def test_lowercase_normalized(self):
        assert validate_gstin("22aaaaa0000a1z5") == "22AAAAA0000A1Z5"

    def test_empty_passes(self):
        assert validate_gstin("") == ""
        assert validate_gstin(None) == ""

    def test_bad_length_rejected(self):
        with pytest.raises(ValueError):
            validate_gstin("22AAAAA0000A1Z")   # 14 chars

    def test_bad_shape_rejected(self):
        with pytest.raises(ValueError):
            validate_gstin("XXXXXXXXXXXXXXX")  # 15 chars, wrong shape


class TestPAN:
    def test_valid(self):
        assert validate_pan("ABCDE1234F") == "ABCDE1234F"

    def test_lowercase_normalized(self):
        assert validate_pan("abcde1234f") == "ABCDE1234F"

    def test_empty_passes(self):
        assert validate_pan("") == ""

    def test_wrong_len_rejected(self):
        with pytest.raises(ValueError):
            validate_pan("ABC12345F")

    def test_wrong_shape_rejected(self):
        with pytest.raises(ValueError):
            validate_pan("1234567890")


class TestIFSC:
    def test_valid(self):
        assert validate_ifsc("SBIN0001234") == "SBIN0001234"
        assert validate_ifsc("hdfc0000123") == "HDFC0000123"

    def test_missing_zero_rejected(self):
        with pytest.raises(ValueError):
            validate_ifsc("SBIN1001234")

    def test_empty_passes(self):
        assert validate_ifsc("") == ""


class TestPincode:
    def test_valid(self):
        assert validate_pincode("560001") == "560001"

    def test_leading_zero_rejected(self):
        with pytest.raises(ValueError):
            validate_pincode("056001")

    def test_wrong_len_rejected(self):
        with pytest.raises(ValueError):
            validate_pincode("56001")

    def test_empty_passes(self):
        assert validate_pincode("") == ""


class TestPhone:
    def test_valid_indian(self):
        assert validate_phone("9876543210") == "9876543210"

    def test_intl_prefix_stripped_dashes(self):
        assert validate_phone("+91-9876-543210") == "+919876543210"

    def test_short_rejected(self):
        with pytest.raises(ValueError):
            validate_phone("123")

    def test_alpha_rejected(self):
        with pytest.raises(ValueError):
            validate_phone("abc12345")


class TestAccountNumber:
    def test_valid(self):
        assert validate_account_number("1234567890") == "1234567890"

    def test_short_rejected(self):
        with pytest.raises(ValueError):
            validate_account_number("12345")

    def test_alpha_rejected(self):
        with pytest.raises(ValueError):
            validate_account_number("ABC1234567")


# ============================================================
# SellerApplication — full model-level Pydantic validators
# ============================================================

_MIN_APP = {
    "business_name": "Test Biz",
    "contact_person": "Alice",
    "phone": "9876543210",
    "city": "Bangalore",
}


class TestSellerApplicationValidation:
    def test_minimal_ok(self):
        app = SellerApplication(**_MIN_APP)
        assert app.phone == "9876543210"

    def test_bad_gstin_rejected(self):
        with pytest.raises(ValidationError) as ex:
            SellerApplication(**_MIN_APP, gst_number="not-a-gstin")
        assert "GSTIN" in str(ex.value)

    def test_gstin_normalized(self):
        app = SellerApplication(**_MIN_APP, gst_number="22aaaaa0000a1z5")
        assert app.gst_number == "22AAAAA0000A1Z5"

    def test_bad_pan_rejected(self):
        with pytest.raises(ValidationError):
            SellerApplication(**_MIN_APP, pan_number="XXX")

    def test_bad_ifsc_rejected(self):
        with pytest.raises(ValidationError):
            SellerApplication(**_MIN_APP, ifsc_code="SBIN123")

    def test_bad_pincode_rejected(self):
        with pytest.raises(ValidationError):
            SellerApplication(**_MIN_APP, pincode="12")

    def test_bad_phone_rejected(self):
        base = dict(_MIN_APP)
        base["phone"] = "abc"
        with pytest.raises(ValidationError):
            SellerApplication(**base)

    def test_bad_account_number_rejected(self):
        with pytest.raises(ValidationError):
            SellerApplication(**_MIN_APP, account_number="ABC123")


# ============================================================
# File magic-byte validator
# ============================================================

class TestFileMagic:
    def test_pdf_detected(self):
        assert detect_file_type(b"%PDF-1.7\n...") == "pdf"

    def test_jpeg_detected(self):
        assert detect_file_type(b"\xff\xd8\xff\xe0\x00\x10JFIF") == "jpg"

    def test_png_detected(self):
        assert detect_file_type(b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR") == "png"

    def test_webp_detected(self):
        assert detect_file_type(b"RIFF\x24\x00\x00\x00WEBPVP8 ") == "webp"

    def test_gif_detected(self):
        assert detect_file_type(b"GIF89a" + b"\x00" * 8) == "gif"

    def test_empty_returns_none(self):
        assert detect_file_type(b"") is None

    def test_text_returns_none(self):
        assert detect_file_type(b"hello world plain text!") is None

    def test_fake_extension_rejected(self):
        """A .jpg-named text file (browser-spoofed content-type) is rejected."""
        with pytest.raises(HTTPException) as ex:
            require_file_type(b"malicious script content here", allowed=("jpg", "png"))
        assert ex.value.status_code == 400

    def test_wrong_type_rejected(self):
        """A real PDF submitted where only images are allowed → 400."""
        with pytest.raises(HTTPException) as ex:
            require_file_type(b"%PDF-1.7\ntest", allowed=("jpg", "png"))
        assert ex.value.status_code == 400
        assert "pdf" in str(ex.value.detail).lower()

    def test_pdf_accepted_when_allowed(self):
        assert require_file_type(b"%PDF-1.7\ntest", allowed=("pdf",)) == "pdf"
