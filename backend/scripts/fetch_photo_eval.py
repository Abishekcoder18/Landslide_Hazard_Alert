"""Phase 7c - photo evaluation set from Wikimedia Commons (freely licensed images only).

API: https://commons.wikimedia.org/w/api.php (generator=search in the File namespace, prop=imageinfo with extmetadata).
Kept licences: CC0, public domain, CC BY, CC BY-SA (any version). Licence, author and file page come from the API
metadata. Images are downloaded at <= 1280 px (Commons thumbnail) into backend/inputs/photo_eval/ (git-ignored;
labels.csv is committed and lists the source of every file, so the set can be rebuilt).

IMPORTANT: `class` in labels.csv is only a PROPOSAL derived from the search term that found the image. The owner
must look at every photo, correct `class` / fill `blocked_share`, and set label_confirmed=yes. The model under test
never produces ground truth. eval_photo_check.py uses confirmed rows only.

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\fetch_photo_eval.py [--per-term 20]
"""
from __future__ import annotations

import argparse
import csv
import html
import re
import sys
import time
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[1] / "inputs" / "photo_eval"
API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia User-Agent policy: tool name + contact URL (https://meta.wikimedia.org/wiki/User-Agent_policy)
UA = "RESILION-2.0-photo-eval/1.0 (https://github.com/Abishekcoder18/Landslide_Hazard_Alert) python-httpx"
TERMS = [  # (search term, proposed class)
    ("landslide road", "debris"),
    ("road blocked landslide", "debris"),
    ("road crack", "crack"),
    ("fallen tree road", "fallen_tree"),
    ("flooded road", "water"),
    ("mountain road", "clear"),
]
OK_LICENCE = re.compile(r"^(cc0|public domain|pd|cc[- ]by(-sa)?([- ]\d(\.\d)?)?)", re.I)


def strip(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def search(client: httpx.Client, term: str, n: int) -> list[dict]:
    params = {"action": "query", "format": "json", "generator": "search", "gsrsearch": f"{term} filetype:bitmap",
              "gsrnamespace": 6, "gsrlimit": min(50, n * 3), "prop": "imageinfo", "iiprop": "url|extmetadata|mime|size",
              "iiurlwidth": 1280}
    r = client.get(API, params=params)
    r.raise_for_status()
    pages = sorted((r.json().get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata") or {}
        lic = strip(meta.get("LicenseShortName", {}).get("value", ""))
        if ii.get("mime") not in ("image/jpeg", "image/png") or not OK_LICENCE.match(lic):
            continue
        out.append({"title": p["title"], "thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
                    "license": lic, "license_url": strip(meta.get("LicenseUrl", {}).get("value", "")),
                    "artist": strip(meta.get("Artist", {}).get("value", ""))[:120]})
        if len(out) >= n:
            break
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-term", type=int, default=20)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    rows, seen = [], set()
    with httpx.Client(headers={"User-Agent": UA}, timeout=60, follow_redirects=True) as client:
        for term, cls in TERMS:
            got = 0
            for it in search(client, term, a.per_term):
                if it["title"] in seen:
                    continue
                seen.add(it["title"])
                ext = ".png" if it["thumb"].lower().endswith(".png") else ".jpg"
                name = f"{cls}_{len(rows) + 1:03d}{ext}"
                try:
                    img = client.get(it["thumb"])
                    img.raise_for_status()
                except httpx.HTTPError as e:
                    print("  skip", it["title"], e)
                    continue
                (OUT / name).write_bytes(img.content)
                rows.append({"file": name, "class": cls, "blocked_share": "", "source_url": it["page"], "license": it["license"],
                             "notes": f"proposed from search '{term}'; {it['title']}; author: {it['artist']}; licence url: {it['license_url']}",
                             "label_confirmed": ""})
                got += 1
                time.sleep(0.3)  # be gentle with Commons
            print(f"{term!r}: {got} images (proposed class {cls})")
    with (OUT / "labels.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["file", "class", "blocked_share", "source_url", "license", "notes", "label_confirmed"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} images -> {OUT}; labels.csv written (label_confirmed blank: owner must confirm every label)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
