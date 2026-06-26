"""Wave 85 — re-watermark all 60 existing product images from the
`originals/` bucket pre-Wave84 snapshots at the new 20% opacity.

Important caveat: the pre-Wave84 snapshots still contain the Wave 79
burned-in dark watermark + Wave 82 correct watermark. So we still need
to crop the bottom strip BEFORE applying the new clean 20% watermark.

This is essentially Wave 84 with opacity lowered to 20% — sourced from
the safety snapshots in `originals/` instead of the already-Wave-84-cropped
files in the public buckets (which would otherwise get cropped a 2nd time
and lose more detail).

USAGE:
    python3 /app/backend/scripts/wave85_rewatermark_from_originals.py --limit 5
    python3 /app/backend/scripts/wave85_rewatermark_from_originals.py
"""
import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from io import BytesIO

sys.path.insert(0, "/app/backend")

from server import sb_admin, compress_image, _load_watermark  # noqa: E402


WM_ASPECT = 336 / 1679  # h/w of the TonersCart logo PNG
SAFETY_PX = 8


def setup_logger() -> logging.Logger:
    log_path = f"/tmp/wave85_rewatermark_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    logger = logging.getLogger("wave85")
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


def compute_crop(W: int, H: int) -> tuple:
    """Crop bottom strip + right gutter to fully eliminate Wave-79 burned-in WM."""
    margin = max(8, int(W * 0.02))
    wm_w = max(64, int(W * 0.18))
    wm_h = max(1, int(wm_w * WM_ASPECT))
    bottom_strip = margin + wm_h + SAFETY_PX
    right_strip = margin + SAFETY_PX
    return max(1, W - right_strip), max(1, H - bottom_strip)


def list_originals(prefix: str) -> list:
    """Walk the originals/ bucket under the given prefix and return
    list of {originals_path, target_bucket, target_path}.
    """
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
                target_path = path[len(prefix) + 1:]  # strip "<bucket>-pre-wave84/"
                out.append({"originals_path": path, "target_bucket": target_bucket, "target_path": target_path})
    return out


def process(item: dict, logger: logging.Logger, *, dry_run: bool) -> bool:
    op = item["originals_path"]
    tb = item["target_bucket"]
    tp = item["target_path"]

    # Skip OEM partner brand logos
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
        new_W, new_H = compute_crop(W, H)
        cropped = im.crop((0, 0, new_W, new_H))
        buf = BytesIO()
        cropped.save(buf, format="JPEG", quality=92)
        # compress_image re-applies watermark at the CURRENT module-level
        # opacity (now 20%) — we just call it with watermark=True.
        out = compress_image(buf.getvalue(), max_side=1200, quality=85, watermark=True)
    except Exception as e:
        logger.error("process FAIL %s — %s", op, e)
        return False

    if dry_run:
        logger.info("DRY %s/%s — %d→%d bytes (%dx%d→%dx%d)", tb, tp, len(raw), len(out), W, H, new_W, new_H)
        return True

    try:
        sb_admin.storage.from_(tb).upload(tp, out, {"content-type": "image/jpeg", "upsert": "true"})
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
    wm = _load_watermark()
    if wm is None:
        logger.error("Watermark not loaded — aborting")
        return 2
    logger.info("Watermark loaded: %dx%d %s", wm.size[0], wm.size[1], wm.mode)
    logger.info("Re-watermarking from originals at 20%% opacity (server.py constant)")

    all_items = []
    for prefix in ("printer-images-pre-wave84", "product-images-pre-wave84"):
        items = list_originals(prefix)
        logger.info("Found %d items under originals/%s", len(items), prefix)
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
