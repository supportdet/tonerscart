"""Wave 79 — one-time batch watermark script.

Iterates every object in the `printer-images` Supabase Storage bucket,
downloads it, applies the TonersCart watermark via `compress_image()`,
and re-uploads it back to the same path with `upsert=true`.

USAGE:
    python3 /app/backend/scripts/wave79_watermark_existing.py
    python3 /app/backend/scripts/wave79_watermark_existing.py --dry-run
    python3 /app/backend/scripts/wave79_watermark_existing.py --prefix <user_id>/

Idempotent — re-running on an already-watermarked image just overlays the
mark again at 35% opacity (negligible visual difference). All actions and
errors are logged to /tmp/wave79_watermark_<timestamp>.log.
"""
import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone

# Allow `from server import …`
sys.path.insert(0, "/app/backend")

from server import sb_admin, compress_image, _load_watermark  # noqa: E402


BUCKET = "printer-images"


def setup_logger() -> logging.Logger:
    log_path = f"/tmp/wave79_watermark_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    logger = logging.getLogger("wave79")
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


def list_all_objects(prefix: str = "") -> list:
    """Recursively list every object under `prefix` in the bucket.
    Supabase storage `list()` only returns immediate children, so we recurse
    into every "folder" entry (objects without a content-length / id)."""
    out = []
    stack = [prefix]
    while stack:
        cur = stack.pop()
        try:
            items = sb_admin.storage.from_(BUCKET).list(cur)
        except Exception as e:
            print(f"  list({cur!r}) failed: {e}")
            continue
        for it in items or []:
            name = it.get("name") or ""
            if not name:
                continue
            path = f"{cur.rstrip('/')}/{name}".lstrip("/") if cur else name
            # Folders have `id` == None in Supabase responses
            if it.get("id") is None and it.get("metadata") is None:
                stack.append(path)
            else:
                out.append({"path": path, "size": (it.get("metadata") or {}).get("size", 0)})
    return out


def process_object(path: str, logger: logging.Logger, *, dry_run: bool) -> bool:
    """Download → watermark → upload-back. Returns True on success."""
    try:
        raw = sb_admin.storage.from_(BUCKET).download(path)
    except Exception as e:
        logger.error("download FAIL %s — %s", path, e)
        return False
    if not raw or len(raw) == 0:
        logger.warning("empty file, skipping %s", path)
        return False
    try:
        out = compress_image(raw, max_side=1200, quality=85, max_bytes=500 * 1024, watermark=True)
    except Exception as e:
        logger.error("compress FAIL %s — %s", path, e)
        return False
    if dry_run:
        logger.info("DRY-RUN %s — would re-upload %d → %d bytes", path, len(raw), len(out))
        return True
    try:
        # upsert=true overwrites the existing object at the same path
        sb_admin.storage.from_(BUCKET).upload(
            path, out, {"content-type": "image/jpeg", "upsert": "true"}
        )
    except Exception as e:
        logger.error("upload FAIL %s — %s", path, e)
        return False
    logger.info("OK %s — %d → %d bytes", path, len(raw), len(out))
    return True


def main() -> int:
    global BUCKET
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="don't re-upload, just download + report")
    parser.add_argument("--prefix", default="", help="limit to objects under this prefix")
    parser.add_argument("--limit", type=int, default=0, help="cap number of objects processed (0 = no cap)")
    parser.add_argument("--bucket", default=BUCKET, help="Supabase Storage bucket to process (default: printer-images)")
    args = parser.parse_args()

    # Override module-level BUCKET so list/process helpers pick up the override
    BUCKET = args.bucket

    logger = setup_logger()
    wm = _load_watermark()
    if wm is None:
        logger.error("Watermark file /app/frontend/public/TONERSCART-bg.png could not be loaded — aborting")
        return 2
    logger.info("Watermark loaded (%dx%d, mode=%s)", wm.size[0], wm.size[1], wm.mode)
    logger.info("Listing bucket %r prefix=%r…", BUCKET, args.prefix)
    objs = list_all_objects(args.prefix)
    if args.limit:
        objs = objs[: args.limit]
    logger.info("Found %d objects", len(objs))
    ok = fail = 0
    started = time.time()
    for i, obj in enumerate(objs, 1):
        if i % 25 == 0:
            logger.info("Progress: %d/%d (ok=%d fail=%d elapsed=%.1fs)", i, len(objs), ok, fail, time.time() - started)
        if process_object(obj["path"], logger, dry_run=args.dry_run):
            ok += 1
        else:
            fail += 1
    logger.info("=" * 60)
    logger.info("DONE — %d ok, %d failed in %.1fs", ok, fail, time.time() - started)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    os.makedirs("/app/backend/scripts", exist_ok=True)
    sys.exit(main())
