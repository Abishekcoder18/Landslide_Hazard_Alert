"""Phase 7c - photo evaluation set from Wikimedia Commons (freely licensed images only).

API: https://commons.wikimedia.org/w/api.php (generator=search in the File namespace, prop=imageinfo with extmetadata).
No key. Kept licences (extmetadata LicenseShortName): CC0, public domain, CC BY, CC BY-SA (any version). Every kept
file records its source page URL, author and licence (labels.csv + CREDITS.md).

Images are downloaded as Commons thumbnails, re-encoded to JPEG with the longer side <= 1280 px, and saved as
backend/inputs/photo_eval/img001.jpg ... The file name says nothing about the search term, so the person labelling
is not steered by it.

GROUND TRUTH: labels.csv is written with `class` and `blocked_share` EMPTY and label_confirmed=no. No model labels
anything; the owner labels every photo in label.html. eval_photo_check.py uses only rows with label_confirmed=yes.

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\fetch_eval_photos.py [--total 150]
"""
from __future__ import annotations

import argparse
import csv
import html
import io
import random
import re
import sys
import time
from pathlib import Path

import httpx
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "inputs" / "photo_eval"
API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia User-Agent policy: descriptive tool name + project URL (https://meta.wikimedia.org/wiki/User-Agent_policy)
UA = "RESILION2-eval/1.0 (https://github.com/Abishekcoder18/Landslide_Hazard_Alert; photo evaluation set) python-httpx"
# (search term, how many to keep). Totals ~150. The term is recorded in `notes` only, never as a label.
TERMS = [
    ("landslide road", 20),
    ("road blocked by landslide", 15),
    ("road crack", 15),
    ("cracked asphalt road", 12),
    ("fallen tree on road", 18),
    ("flooded road", 15),
    ("waterlogged road India", 10),
    ("mountain road India", 15),
    ("highway India", 12),
    ("crowd of people", 6),
    ("office building", 6),
    ("portrait photograph", 6),
]
OK_LICENCE = re.compile(r"^(cc0|cc[- ]?zero|public domain|pd\b|pd-|cc[- ]by(-sa)?(\s*\d(\.\d)?)?\s*$)", re.I)
FIELDS = ["file", "class", "blocked_share", "source_url", "license", "author", "label_confirmed", "notes"]
MAX_SIDE = 1280


def strip(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def licence_ok(lic: str) -> bool:
    lic = lic.strip()
    if re.search(r"\bnc\b|\bnd\b|non-?commercial|no ?deriv|fair use", lic, re.I):
        return False
    return bool(OK_LICENCE.match(lic))


def search(client: httpx.Client, term: str, want: int) -> list[dict]:
    out, offset = [], 0
    while len(out) < want * 2 and offset < 300:
        params = {"action": "query", "format": "json", "generator": "search", "gsrsearch": f"{term} filetype:bitmap",
                  "gsrnamespace": 6, "gsrlimit": 50, "gsroffset": offset, "prop": "imageinfo",
                  "iiprop": "url|extmetadata|mime|size", "iiurlwidth": MAX_SIDE}
        r = client.get(API, params=params)
        r.raise_for_status()
        data = r.json()
        pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata") or {}
            lic = strip(meta.get("LicenseShortName", {}).get("value", ""))
            if ii.get("mime") not in ("image/jpeg", "image/png") or not licence_ok(lic):
                continue
            if min(ii.get("width", 0), ii.get("height", 0)) < 300:
                continue
            out.append({"title": p["title"], "thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
                        "license": lic, "artist": strip(meta.get("Artist", {}).get("value", ""))[:160] or "unknown"})
        if "continue" not in data:
            break
        offset = data["continue"].get("gsroffset", offset + 50)
    return out


def to_jpeg(raw: bytes) -> bytes:
    im = Image.open(io.BytesIO(raw))
    im = im.convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--total", type=int, default=150)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    picked, seen = [], set()
    with httpx.Client(headers={"User-Agent": UA}, timeout=60, follow_redirects=True) as client:
        for term, want in TERMS:
            got = 0
            for it in search(client, term, want):
                if got >= want:
                    break
                if it["title"] in seen:
                    continue
                try:
                    img = client.get(it["thumb"])
                    img.raise_for_status()
                    jpg = to_jpeg(img.content)
                except Exception as e:  # noqa: BLE001 - a bad candidate is skipped, never fatal
                    print("  skip", it["title"], type(e).__name__, e)
                    continue
                seen.add(it["title"])
                picked.append((term, it, jpg))
                got += 1
                time.sleep(0.5)  # be gentle with Commons
            print(f"{term!r}: {got} images")
    random.Random(7).shuffle(picked)  # order unrelated to search term
    picked = picked[: a.total]
    for old in OUT.glob("img*.jpg"):
        old.unlink()
    rows = []
    for i, (term, it, jpg) in enumerate(picked, 1):
        name = f"img{i:03d}.jpg"
        (OUT / name).write_bytes(jpg)
        rows.append({"file": name, "class": "", "blocked_share": "", "source_url": it["page"], "license": it["license"],
                     "author": it["artist"], "label_confirmed": "no", "notes": f"{it['title']} (search: {term})"})
    with (OUT / "labels.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    with (OUT / "CREDITS.md").open("w", encoding="utf-8") as f:
        f.write("# Photo evaluation set - credits\n\nAll images are from Wikimedia Commons, used under the licence shown, "
                "resized to at most 1280 px and re-encoded as JPEG (no other changes). Fetched by "
                "`backend/scripts/fetch_eval_photos.py`.\n\n| File | Source | Author | Licence |\n|---|---|---|---|\n")
        for r in rows:
            author = r["author"].replace("|", "/")
            f.write(f"| {r['file']} | [{r['notes'].split(' (search:')[0].replace('|', '/')}]({r['source_url']}) | {author} | {r['license']} |\n")
    print(f"{len(rows)} images -> {OUT}; labels.csv (class/blocked_share EMPTY, label_confirmed=no) and CREDITS.md written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
