"""UI screenshots (docs/evidence/50-*.png ... 60-*.png) on the REAL corridor, rainfall date 15 May 2022, 1440x900.

Same prerequisites as e2e_walkthrough.py (backend on :8000 with the real corridor, frontend on :3000 with
VITE_API_URL). Resets the RESILION 2.0 workflow tables (schema resilion2 only), then walks one report through
review, closure and alert approval so every page has content. Leaves the scenario on 15 May 2022.
Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\ui_screenshots.py
Optional: --front http://localhost:3001 --sample  (sample-data frontend, no backend; screenshots to the scratch dir)."""
from __future__ import annotations

import argparse
import base64
import sys
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_walkthrough as w  # noqa: E402  (shared helpers: api, login, go, watch, PHOTO, SEG)

SEG = w.SEG


def shot(page: Page, out: Path, name: str) -> None:
    page.wait_for_timeout(700)
    page.screenshot(path=str(out / name), full_page=False)
    print("  screenshot", name)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--front", default=w.FRONT)
    ap.add_argument("--out", default=str(w.EVID))
    ap.add_argument("--sample", action="store_true", help="frontend in sample-data mode (no backend calls)")
    a = ap.parse_args()
    w.FRONT = a.front
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    p = "s-" if a.sample else ""

    center = None
    if not a.sample:
        tok = w.api("POST", "/api/auth/login", body={"userId": "admin1", "role": "admin"})["token"]
        w.api("POST", "/api/admin/reset-sample-data", tok)
        snap = w.api("GET", "/api/snapshot", tok)
        assert snap["corridor"]["source"] == "postgis", "backend is not on the real corridor"
        center = next(s for s in snap["segments"] if s["id"] == SEG)["center"]

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        w.watch(pg)
        pg.goto(w.FRONT)
        pg.wait_for_selector("#uid")
        shot(pg, out, f"{p}50-login.png")
        ctx.close()

        adm = w.login(b, "admin", "admin1")
        if not a.sample:
            w.go(adm, "/configuration")
            adm.fill("input[aria-label='Rainfall date']", "2022-05-15")
            if adm.get_by_role("button", name="Save configuration").is_enabled():
                adm.get_by_role("button", name="Save configuration").click()
                adm.wait_for_timeout(1500)

        off = w.login(b, "officer", "officer1")
        w.go(off, "/corridor")
        shot(off, out, f"{p}51-corridor.png")
        if a.sample:
            off.locator("button:has(span.font-mono)").first.click()
        else:
            off.get_by_role("button", name=SEG).first.click()
        off.wait_for_selector("aside[aria-label^='Segment ']")
        shot(off, out, f"{p}52-corridor-drawer.png")

        w.go(off, "/decisions")
        shot(off, out, f"{p}53-decisions.png")

        pat = w.login(b, "patrol", "patrol1")
        w.go(pat, "/reports")
        if not pat.locator("#seg").count():
            pat.get_by_text("New report", exact=True).first.click()
        pat.set_input_files("input[type=file]", files=[{"name": "debris.png", "mimeType": "image/png",
                                                        "buffer": base64.b64decode(w.PHOTO.split(",")[1])}])
        if not a.sample:
            pat.select_option("#seg", SEG)
            for sel, val in (("input#lat, input[name=lat]", f"{center[0]:.5f}"), ("input#lon, input[name=lon]", f"{center[1]:.5f}")):
                if pat.locator(sel).count():
                    pat.fill(sel, val)
        loc = pat.locator("input#loc, input[name=locationText]")
        if loc.count():
            loc.first.fill("Retzol bend")
        if a.sample:
            shot(pat, out, "s-55-reports-new.png")
        pat.get_by_role("button", name="Submit").first.click()
        pat.wait_for_timeout(1500)
        if not a.sample:  # the local photo-check model can take minutes; wait for the stored report
            for _ in range(120):
                reps = w.api("GET", "/api/snapshot", tok)["reports"]
                if reps:
                    break
                pat.wait_for_timeout(2000)
            pat.wait_for_timeout(1000)
            shot(pat, out, "55-reports-new.png")

        w.go(off, "/reports")
        if not a.sample:
            rep = reps[0]
            tab = "Manual review" if rep["route"] == "manual_review" else "Officer queue"
            off.get_by_role("tab", name=tab).first.click()
            off.wait_for_timeout(500)
        shot(off, out, f"{p}54-reports-queue.png")

        if not a.sample:
            off.get_by_role("button", name="Confirm").first.click()
            off.wait_for_timeout(1500)
            w.go(off, "/approvals")
            off.get_by_text(f"Closure · {SEG}", exact=True).first.click()
            shot(off, out, "56-approvals-closure.png")
            off.get_by_role("button", name="Approve", exact=True).first.click()
            off.wait_for_timeout(1500)
            w.go(off, "/approvals")
            off.get_by_text(f"Alert · {SEG}", exact=True).first.click()
            off.get_by_role("button", name="Approve", exact=True).first.click()
            off.wait_for_timeout(1500)
            w.go(off, "/approvals")
            off.get_by_text(f"Alert · {SEG}", exact=True).first.click()
            off.get_by_role("button", name="View CAP").first.click()
            shot(off, out, "57-approvals-alert-cap.png")

            eng = w.login(b, "road_engineer", "engineer1")
            w.go(eng, "/incidents")
            est = (datetime.now() + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M")
            eng.fill("input[aria-label='Reopening estimate']", est)
            eng.get_by_role("button", name="Save").first.click()
            eng.wait_for_timeout(1000)
            shot(eng, out, "58-incidents.png")

            w.go(off, "/records")
            shot(off, out, "59-records.png")
        else:
            w.go(off, "/approvals")
            shot(off, out, "s-56-approvals.png")

        w.go(adm, "/configuration")
        shot(adm, out, f"{p}60-configuration.png")
        b.close()

    print(f"browser API calls {w.api_calls['n']}, failed {len(w.api_calls['failed'])}: {w.api_calls['failed'][:5]}")
    print(f"console/page errors {len(w.errors)}: {w.errors[:5]}")
    return 0 if not w.errors and not w.api_calls["failed"] else 1


if __name__ == "__main__":
    sys.exit(main())
