"""Wave 86 — clean the burned-in Wave-79 wrong-watermark from all 60 images.

Root cause discovered: Wave 79 used a wrong watermark file that was 1918x991
(an emergent.sh screenshot). Applied at 18% width on every image, it burned a
~24%-of-height dark rectangle into the bottom-right of every JPEG. Wave 84/85
only cropped ~14% of height (sized for the CORRECT logo's 336/1679 ≈ 0.20
aspect) — so the top portion of the burned-in mark was still visible.

Fix: paint a clean WHITE rectangle (sized for the WRONG watermark's footprint
+ safety) over the bottom-right of every pre-Wave84 snapshot, then re-apply
the correct TonersCart CMYK logo on top of that clean plate via the standard
compress_image() pipeline.

USAGE:
    python3 /app/backend/scripts/wave86_whitebox_clean.py --limit 3
    python3 /app/backend/scripts/wave86_whitebox_clean.py
"""
import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from io import BytesIO

sys.path.insert(0, "/app/backend")

from server import sb_admin, compress_image, _load_watermark  # noqa: E402


# Wave 79 wrong-watermark footprint (1918x991, aspect 0.517) scaled to 18%
# of image width. We add a generous safety margin so even slight JPEG bleed
# or scaling differences are covered.
WRONG_WM_ASPECT = 991 / 1918  # ≈ 0.517
WIDTH_RATIO = 0.22            # 22% of image width (was 18% — adds margin)
HEIGHT_RATIO_BONUS = 0.04     # +4% of width as extra height safety


def setup_logger() -> logging.Logger:
    log_path = f"/tmp/wave86_whitebox_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    logger = logging.getLogger("wave86")
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


def compute_white_plate(W: int, H: int) -> tuple:
    """Return (x1, y1, x2, y2) for the white plate that covers the burned-in
    Wave-79 wrong-watermark mark in the bottom-right corner."""
    margin = max(8, int(W * 0.02))
    plate_w = max(96, int(W * WIDTH_RATIO))
    plate_h = max(48, int(plate_w * WRONG_WM_ASPECT + W * HEIGHT_RATIO_BONUS))
    x1 = max(0, W - plate_w - margin)
    y1 = max(0, H - plate_h - margin)
    x2 = W
    y2 = H
    return (x1, y1, x2, y2)


def list_originals(prefix: str) -> list:
    target_bucket = "printer-images" if prefix.startswith("printer-images") else "product-images"
    out, stack = [], [prefix]
    while stack:
        cur = stack.pop()
        try:
            items = sb_admin.storage.from_("originals").list(cur)
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
                target_path = path[len(prefix) + 1:]
                out.append({"originals_path": path, "target_bucket": target_bucket, "target_path": target_path})
    return out


def process(item: dict, logger: logging.Logger, *, dry_run: bool) -> bool:
    op = item["originals_path"]
    tb = item["target_bucket"]
    tp = item["target_path"]

    if tp.startswith("oem/") and "/logo-" in tp:
        logger.info("SKIP OEM logo %s", tp)
        return True

    try:
        raw = sb_admin.storage.from_("originals").download(op)
    except Exception as e:
        logger.error("download FAIL %s — %s", op, e)
        return False
    if not raw or len(raw) < 1024:
        logger.warning("too small (%d bytes), skipping", len(raw) if raw else 0)
        return True

    try:
        from PIL import Image, ImageDraw
        im = Image.open(BytesIO(raw))
        im.load()
        if im.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1] if im.mode in ("RGBA", "LA") else None)
            im = bg
        else:
            im = im.convert("RGB")

        W, H = im.size
        plate = compute_white_plate(W, H)
        # Paint the white plate over the burned-in wrong-watermark zone
        draw = ImageDraw.Draw(im)
        draw.rectangle(plate, fill=(255, 255, 255))

        # Re-encode to JPEG, then run through compress_image which re-applies
        # the correct CMYK watermark at the current 20% opacity onto the now
        # CLEAN white plate area.
        buf = BytesIO()
        im.save(buf, format="JPEG", quality=92)
        out = compress_image(buf.getvalue(), max_side=1200, quality=85, watermark=True)
    except Exception as e:
        logger.error("process FAIL %s — %s", op, e)
        return False

    if dry_run:
        logger.info("DRY %s/%s — %d→%d bytes (plate=%dx%d at %dx%d)", tb, tp, len(raw), len(out),
                    plate[2]-plate[0], plate[3]-plate[1], W, H)
        return True

    try:
        sb_admin.storage.from_(tb).upload(tp, out, {"content-type": "image/jpeg", "upsert": "true"})
    except Exception as e:
        logger.error("upload FAIL %s/%s — %s", tb, tp, e)
        return False
    logger.info("OK %s/%s — %d→%d bytes (plate=%dx%d at %dx%d)", tb, tp, len(raw), len(out),
                plate[2]-plate[0], plate[3]-plate[1], W, H)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    logger = setup_logger()
    wm = _load_watermark()
    if wm is None:
        logger.error("Watermark not loaded — aborting")
        return 2
    logger.info("Watermark: %dx%d %s", wm.size[0], wm.size[1], wm.mode)
    logger.info("Plate config: width=%.0f%% of W, height=%.0f%% × W + bonus", WIDTH_RATIO*100, WRONG_WM_ASPECT*100)

    all_items = []
    for prefix in ("printer-images-pre-wave84", "product-images-pre-wave84"):
        items = list_originals(prefix)
        logger.info("Found %d under originals/%s", len(items), prefix)
        all_items.extend(items)

    if args.limit:
        all_items = all_items[: args.limit]

    started = time.time()
    ok = fail = 0
    for i, it in enumerate(all_items, 1):
        if i % 10 == 0:
            logger.info("Progress: %d/%d (ok=%d, fail=%d)", i, len(all_items), ok, fail)
        if process(it, logger, dry_run=args.dry_run):
            ok += 1
        else:
            fail += 1

    logger.info("=" * 50)
    logger.info("GRAND TOTAL — %d ok, %d failed in %.1fs", ok, fail, time.time() - started)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
