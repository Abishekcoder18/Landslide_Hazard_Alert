"""Clean-up 4c - real-corridor evidence for ST-11 / AC-12 (FR-16 window closing, BR-11).

On the real NH-27 corridor (FastAPI + PostGIS backend, Vite frontend, as for e2e_walkthrough.py): reset, rainfall date
10 May 2022, pick a Yellow segment whose own zones are GO_CAUTION, and set IMD Orange on it as the administrator (the
same `imdWarning` input the SACHET feed writes). Expected (BR-11): the segment stays Yellow, its zones (and zones
looking at it from behind, FR-09) show "Window closing", and the traveller advisory has no hurry wording. Screenshots -> docs/evidence/43-window-closing-real.png, 44-window-closing-segment.png.

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\screenshot_window_closing.py
"""
from __future__ import annotations

import re
import sys

from playwright.sync_api import sync_playwright

import e2e_walkthrough as W


def main() -> int:
    adm = W.api("POST", "/api/auth/login", body={"userId": "admin", "role": "admin"})["token"]
    off = W.api("POST", "/api/auth/login", body={"userId": "officer", "role": "officer"})["token"]
    W.api("POST", "/api/admin/reset-sample-data", adm)
    snap = W.api("GET", "/api/snapshot", off)
    assert snap["corridor"]["source"] == "postgis", "backend is not on the real corridor"
    dec = {d["zoneId"]: d for d in snap["decisions"]}
    zones = {}
    for z in snap["zones"]:
        zones.setdefault(z["segmentId"], []).append(z["id"])
    cand = [s for s in snap["segments"] if not s.get("offCorridor") and s["riskLevel"] == "YELLOW" and s["roadState"] == "OPEN"
            and all(dec[z]["result"]["decision"] == "GO_CAUTION" for z in zones.get(s["id"], []))]
    seg = max(cand, key=lambda s: s["riskIndex"] or 0)  # the Yellow segment closest to Orange
    W.api("PATCH", f"/api/segments/{seg['id']}/inputs", adm, {"imdWarning": "ORANGE"})
    snap = W.api("GET", "/api/snapshot", off)
    s = next(x for x in snap["segments"] if x["id"] == seg["id"])
    flagged = [d for d in snap["decisions"] if d["result"]["windowClosing"]]
    print(f"segment {seg['id']} {seg['name']}: level {s['riskLevel']} (index {s['riskIndex']}), IMD {s['inputs']['imdWarning']}")
    print(f"zones with window closing: {[d['zoneId'] for d in flagged]}")
    assert s["riskLevel"] == "YELLOW" and flagged, "no window-closing flag"
    assert all(d["result"]["decision"] == "GO_CAUTION" for d in flagged)
    assert not any(re.search(r"hurry|go now|quickly|before it closes", d["result"]["travellerAdvisory"], re.I) for d in flagged)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = W.login(browser, "officer", "officer-1")
        W.go(page, "/decisions")
        card = page.get_by_text("Window closing").first
        card.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        W.shot(page, "43-window-closing-real.png")
        W.go(page, "/corridor")
        page.get_by_text(seg["id"]).first.click()
        page.wait_for_timeout(800)
        W.shot(page, "44-window-closing-segment.png")
        browser.close()
    print(f"console/page errors {len(W.errors)}: {W.errors}; failed API calls {W.api_calls['failed']}")
    return 1 if W.errors or W.api_calls["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
