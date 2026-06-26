"""Wave 89 — final clean restore.

Restores all 60 existing product images from the pre-Wave84 snapshots in
the `originals/` bucket, applies COMPRESSION ONLY (no watermark, no white
plate, no logo overlay), and replaces the live versions in `printer-images`
and `product-images`.

Note on burned-in Wave-79 mark: the pre-Wave84 snapshots still contain the
emergent.sh screenshot that was burned into the JPEG bytes during Wave 79.
This script crops the bottom strip using the WRONG-watermark's footprint
math (991/1918 aspect, 22% width) to physically remove those baked-in
pixels — otherwise the dark rectangle would reappear when we strip the
white plate that was covering it.

After this run, the `originals` bucket can be safely deleted.

USAGE:
    python3 /app/backend/scripts/wave89_clean_restore.py --dry-run --limit 3
    python3 /app/backend/scripts/wave89_clean_restore.py
"""
import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from io import BytesIO

sys.path.insert(0, "/app/backend")

from server import sb_admin, compress_image  # noqa: E402


WRONG_WM_ASPECT = 991 / 1918  # ≈ 0.517 — Wave-79 wrong-watermark footprint
WIDTH_RATIO = 0.22
HEIGHT_RATIO_BONUS = 0.04


def setup_logger() -> logging.Logger:
    log_path = f"/tmp/wave89_clean_restore_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    logger = logging.getLogger("wave89")
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


def compute_crop_box(W: int, H: int) -> tuple:
    """Compute (new_W, new_H) such that the bottom-right Wave-79
    burned-in mark is fully cropped out. We trim the bottom strip
    AND a small right gutter."""
    margin = max(8, int(W * 0.02))
    burned_w = max(96, int(W * WIDTH_RATIO))
    burned_h = max(48, int(burned_w * WRONG_WM_ASPECT + W * HEIGHT_RATIO_BONUS))
    bottom_trim = burned_h + margin + 4
    right_trim = margin + 4
    return max(1, W - right_trim), max(1, H - bottom_trim)


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
                out.append({
                    "originals_path": path,
                    "target_bucket": target_bucket,
                    "target_path": target_path,
                })
    return out


def process(item: dict, logger: logging.Logger, *, dry_run: bool) -> bool:
    op = item["originals_path"]
    tb = item["target_bucket"]
    tp = item["target_path"]

    # OEM partner logos: don't crop / no compress — restore as-is
    if tp.startswith("oem/") and "/logo-" in tp:
        logger.info("SKIP OEM logo %s", tp)
        return True

    try:
        raw = sb_admin.storage.from_("originals").download(op)
    except Exception as e:
        logger.error("download FAIL %s — %s", op, e)
        return False
    if not raw or len(raw) < 1024:
        logger.warning("too small (%d bytes), skipping %s", len(raw) if raw else 0, op)
        return True

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
        new_W, new_H = compute_crop_box(W, H)
        cropped = im.crop((0, 0, new_W, new_H))
        buf = BytesIO()
        cropped.save(buf, format="JPEG", quality=92)
        # Pure compression — no watermark anywhere.
        out = compress_image(buf.getvalue(), max_side=1200, quality=85)
    except Exception as e:
        logger.error("process FAIL %s — %s", op, e)
        return False

    if dry_run:
        logger.info("DRY %s/%s — %d→%d bytes (%dx%d→%dx%d)", tb, tp, len(raw), len(out), W, H, new_W, new_H)
        return True

    try:
        sb_admin.storage.from_(tb).upload(
            tp, out, {"content-type": "image/jpeg", "upsert": "true"}
        )
    except Exception as e:
        logger.error("upload FAIL %s/%s — %s", tb, tp, e)
        return False
    logger.info("OK %s/%s — %d→%d bytes (%dx%d→%dx%d)", tb, tp, len(raw), len(out), W, H, new_W, new_H)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    logger = setup_logger()
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
