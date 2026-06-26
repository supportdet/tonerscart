"""Wave 84 — bulk crop + re-watermark script.

Existing product images in `printer-images` + `product-images` have an OLD
wrong dark watermark burned into the bottom-right corner (Wave 79) plus a
new correct CMYK watermark layered on top (Wave 82/83). Result: muddy
double-watermarked area.

This script removes BOTH watermarks by cropping the bottom strip (~12% of
the image height) where the watermark sits, then re-applies ONLY the new
correct watermark. The cropped result is rectangular and clean.

Each processed image's source bytes are uploaded to the private
`originals` bucket at `{source_bucket}/{path}` BEFORE the destructive
crop, so we keep what we have for the future.

USAGE:
    python3 /app/backend/scripts/wave84_crop_and_rewatermark.py --limit 5
    python3 /app/backend/scripts/wave84_crop_and_rewatermark.py
    python3 /app/backend/scripts/wave84_crop_and_rewatermark.py --bucket product-images
"""
import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from io import BytesIO

sys.path.insert(0, "/app/backend")

from server import sb_admin, compress_image, _load_watermark  # noqa: E402


# Wave 79 placed the watermark using `apply_watermark()`:
#   margin = max(8, int(W * 0.02))    # 2% of WIDTH on both axes
#   wm_w   = max(64, int(W * 0.18))   # 18% of WIDTH
#   wm_h   = int(wm_w * 336/1679) ≈ 0.20 * wm_w
# So old WM bottom strip height (from bottom of image) = margin + wm_h.
# We crop the bottom strip + a safety buffer of 8 px to fully remove the
# old burned-in watermark on EVERY aspect ratio (landscape OR portrait).
WM_ASPECT = 336 / 1679  # height / width of watermark logo
SAFETY_PX = 8


def compute_crop(W: int, H: int) -> tuple:
    """Return (new_W, new_H) — image cropped so old watermark pixels are gone."""
    margin = max(8, int(W * 0.02))
    wm_w = max(64, int(W * 0.18))
    wm_h = max(1, int(wm_w * WM_ASPECT))
    bottom_strip = margin + wm_h + SAFETY_PX
    right_strip = margin + SAFETY_PX  # only the margin to the right of the wm
    # Effective: we strip bottom AND a thin right gutter to also kill JPEG
    # bleed pixels on the right edge.
    new_W = max(1, W - right_strip)
    new_H = max(1, H - bottom_strip)
    return new_W, new_H


def setup_logger() -> logging.Logger:
    log_path = f"/tmp/wave84_crop_rewatermark_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    logger = logging.getLogger("wave84")
    logger.setLevel(logging.INFO)
    fh = logging.FileHandler(log_path)
    sh = logging.StreamHandler(sys.stdout)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh.setFormatter(fmt)
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)
    logger.info("Log file: %s", log_path)
    return logger


def list_all_objects(bucket: str, prefix: str = "") -> list:
    out = []
    stack = [prefix]
    while stack:
        cur = stack.pop()
        try:
            items = sb_admin.storage.from_(bucket).list(cur)
        except Exception as e:
            print(f"  list({cur!r}) failed: {e}")
            continue
        for it in items or []:
            name = it.get("name") or ""
            if not name:
                continue
            path = f"{cur.rstrip('/')}/{name}".lstrip("/") if cur else name
            if it.get("id") is None and it.get("metadata") is None:
                stack.append(path)
            else:
                out.append({"path": path, "size": (it.get("metadata") or {}).get("size", 0)})
    return out


def save_to_originals(bucket: str, path: str, raw: bytes, logger: logging.Logger) -> bool:
    """Upload the current (still-double-watermarked) bytes to originals as a
    safety snapshot before we destructively crop. Note: these are NOT clean
    originals — they're the current state. Useful for rollback if anything
    goes wrong."""
    try:
        sb_admin.storage.from_("originals").upload(
            f"{bucket}-pre-wave84/{path}", raw,
            {"content-type": "image/jpeg", "upsert": "true"},
        )
        return True
    except Exception as e:
        logger.warning("originals snapshot FAIL %s/%s — %s", bucket, path, e)
        return False


def process_object(bucket: str, path: str, logger: logging.Logger, *, dry_run: bool) -> bool:
    # Skip OEM partner brand logos — these are 3rd-party trademarks, must
    # not carry our watermark and should not be cropped.
    if path.startswith("oem/") and "/logo-" in path:
        logger.info("SKIP OEM logo %s", path)
        return True
    try:
        raw = sb_admin.storage.from_(bucket).download(path)
    except Exception as e:
        logger.error("download FAIL %s — %s", path, e)
        return False
    if not raw or len(raw) < 1024:
        logger.warning("file too small (%d bytes), skipping %s", len(raw) if raw else 0, path)
        return True

    # Safety snapshot
    save_to_originals(bucket, path, raw, logger)

    # Decode → crop → re-encode → run through compress_image (which re-watermarks)
    try:
        from PIL import Image
        im = Image.open(BytesIO(raw))
        im.load()
        if im.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA") else None)
            im = bg
        else:
            im = im.convert("RGB")

        W, H = im.size
        new_W, new_H = compute_crop(W, H)
        cropped = im.crop((0, 0, new_W, new_H))

        # Re-encode the cropped image to JPEG bytes (no watermark yet)
        buf = BytesIO()
        cropped.save(buf, format="JPEG", quality=92)
        cropped_bytes = buf.getvalue()

        # Run through compress_image so the NEW correct watermark is applied
        # at the SAME relative position (bottom-right, 18% width, 35% opacity)
        out = compress_image(cropped_bytes, max_side=1200, quality=85, watermark=True)
    except Exception as e:
        logger.error("crop+rewatermark FAIL %s — %s", path, e)
        return False

    if dry_run:
        logger.info("DRY-RUN %s — would replace %d → %d bytes (cropped %dx%d → %dx%d)",
                    path, len(raw), len(out), W, H, new_W, new_H)
        return True

    try:
        sb_admin.storage.from_(bucket).upload(
            path, out, {"content-type": "image/jpeg", "upsert": "true"}
        )
    except Exception as e:
        logger.error("upload FAIL %s — %s", path, e)
        return False
    logger.info("OK %s — %d → %d bytes (cropped %dx%d → %dx%d)",
                path, len(raw), len(out), W, H, new_W, new_H)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="cap number of objects (0 = no cap)")
    parser.add_argument("--bucket", default="both", choices=["both", "printer-images", "product-images"])
    parser.add_argument("--prefix", default="")
    args = parser.parse_args()

    logger = setup_logger()
    wm = _load_watermark()
    if wm is None:
        logger.error("Watermark not loaded — aborting")
        return 2
    logger.info("Watermark loaded (%dx%d, mode=%s)", wm.size[0], wm.size[1], wm.mode)
    logger.info("Crop config: dynamic per-image (margin + wm height + %d px safety)", SAFETY_PX)

    buckets = ["printer-images", "product-images"] if args.bucket == "both" else [args.bucket]

    grand_ok = grand_fail = 0
    started = time.time()
    for bucket in buckets:
        logger.info("=" * 60)
        logger.info("Bucket: %s", bucket)
        objs = list_all_objects(bucket, args.prefix)
        logger.info("  Found %d objects", len(objs))
        if args.limit:
            objs = objs[: args.limit]
            logger.info("  Limited to %d", len(objs))
        ok = fail = 0
        for i, obj in enumerate(objs, 1):
            if i % 10 == 0:
                logger.info("  Progress: %d/%d (ok=%d fail=%d)", i, len(objs), ok, fail)
            if process_object(bucket, obj["path"], logger, dry_run=args.dry_run):
                ok += 1
            else:
                fail += 1
        logger.info("  Bucket DONE — %d ok, %d failed", ok, fail)
        grand_ok += ok
        grand_fail += fail

    logger.info("=" * 60)
    logger.info("GRAND TOTAL — %d ok, %d failed in %.1fs", grand_ok, grand_fail, time.time() - started)
    return 0 if grand_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
