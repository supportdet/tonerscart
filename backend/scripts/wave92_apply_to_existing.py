"""Wave 92 — apply the new watermark to ALL existing product images.

User reversed Wave-91's "don't touch existing images" decision after
seeing the live site had no visible watermarks. This script does:

  1. List every JPG/PNG in `printer-images` + `product-images` buckets.
  2. Download each, run through `compress_image(... watermark=True)`.
  3. Replace the live version (upsert=true).

No cropping. No white plate. Just the new clean 20%-opacity TonersCart
watermark composited onto whatever is currently in storage.

OEM partner brand logos (`oem/*/logo-*`) are explicitly skipped — those
are 3rd-party trademarks and must not carry our watermark.

USAGE:
    python3 /app/backend/scripts/wave92_apply_to_existing.py --limit 3
    python3 /app/backend/scripts/wave92_apply_to_existing.py
"""
import argparse
import logging
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

from server import sb_admin, compress_image  # noqa: E402


def setup_logger() -> logging.Logger:
    log_path = f"/tmp/wave92_apply_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    logger = logging.getLogger("wave92")
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


def list_all(bucket: str) -> list:
    out, stack = [], [""]
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
                out.append(path)
    return out


def process(bucket: str, path: str, logger: logging.Logger, *, dry_run: bool) -> bool:
    if path.startswith("oem/") and "/logo-" in path:
        logger.info("SKIP OEM logo %s", path)
        return True

    try:
        raw = sb_admin.storage.from_(bucket).download(path)
    except Exception as e:
        logger.error("download FAIL %s — %s", path, e)
        return False
    if not raw or len(raw) < 1024:
        logger.warning("too small (%d bytes), skipping %s", len(raw) if raw else 0, path)
        return True

    try:
        out = compress_image(raw, max_side=1200, quality=85, watermark=True)
    except Exception as e:
        logger.error("compress FAIL %s — %s", path, e)
        return False

    if dry_run:
        logger.info("DRY %s/%s — %d→%d bytes", bucket, path, len(raw), len(out))
        return True

    try:
        sb_admin.storage.from_(bucket).upload(
            path, out, {"content-type": "image/jpeg", "upsert": "true"}
        )
    except Exception as e:
        logger.error("upload FAIL %s/%s — %s", bucket, path, e)
        return False
    logger.info("OK %s/%s — %d→%d bytes", bucket, path, len(raw), len(out))
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--bucket", default="both", choices=["both", "printer-images", "product-images"])
    args = parser.parse_args()

    logger = setup_logger()
    buckets = ["printer-images", "product-images"] if args.bucket == "both" else [args.bucket]

    grand_ok = grand_fail = 0
    started = time.time()
    for bucket in buckets:
        logger.info("=" * 50)
        logger.info("Bucket: %s", bucket)
        objs = list_all(bucket)
        logger.info("  Found %d objects", len(objs))
        if args.limit:
            objs = objs[: args.limit]
        ok = fail = 0
        for i, p in enumerate(objs, 1):
            if i % 10 == 0:
                logger.info("  Progress: %d/%d (ok=%d fail=%d)", i, len(objs), ok, fail)
            if process(bucket, p, logger, dry_run=args.dry_run):
                ok += 1
            else:
                fail += 1
        logger.info("  Bucket DONE — %d ok, %d failed", ok, fail)
        grand_ok += ok
        grand_fail += fail

    logger.info("=" * 50)
    logger.info("GRAND TOTAL — %d ok, %d failed in %.1fs", grand_ok, grand_fail, time.time() - started)
    return 0 if grand_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
