"""End-to-end browser walk of F1 -> F3 -> F2 on the REAL corridor (FastAPI + PostGIS backend, Vite frontend).

Prerequisites: backend on http://localhost:8000 (uvicorn app.main:app), frontend on http://localhost:3000 with
VITE_API_URL=http://localhost:8000, real corridor loaded (backend/scripts pipeline).
Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\e2e_walkthrough.py
Screenshots -> docs/evidence/30-*.png ...; summary printed (console errors, failed API calls)."""
from __future__ import annotations

import base64
import json
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO = Path(__file__).resolve().parents[2]
EVID = REPO / "docs" / "evidence"
FRONT, API = "http://localhost:3000", "http://127.0.0.1:8000"  # IPv4: "localhost" tries ::1 first on Windows (~2 s per call)
SEG = "NH27-DH-108"
PHOTO = "data:image/png;base64," + base64.b64encode(
    bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                  "1f15c4890000000d49444154789c6360f8cfc0f01f0005fe02fe5e1b7e0d0000000049454e44ae426082")).decode()

errors: list[str] = []
api_calls = {"n": 0, "failed": []}


def shot(page: Page, name: str) -> None:
    page.wait_for_timeout(600)
    page.screenshot(path=str(EVID / name), full_page=False)
    print("  screenshot", name)


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def watch(page: Page) -> None:
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    def on_resp(r):
        if "/api/" in r.url and ":8000" in r.url:
            api_calls["n"] += 1
            if r.status >= 400:
                api_calls["failed"].append(f"{r.request.method} {r.url} -> {r.status}")
    page.on("response", on_resp)


def login(browser, role: str, user: str) -> Page:
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    watch(page)
    page.goto(FRONT)
    page.fill("#uid", user)
    page.select_option("#role", role)
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url(lambda u: "/corridor" in u or "/reports" in u, timeout=15000)
    page.wait_for_timeout(800)
    return page


def go(page: Page, path: str) -> None:
    page.goto(f"{FRONT}/#{path}")  # the app uses hash routing
    page.reload()  # a hash change alone keeps the old snapshot and open drawers
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(700)


def main() -> int:
    EVID.mkdir(parents=True, exist_ok=True)
    # Fresh state: reload the corridor from PostGIS (admin action, audited).
    adm_tok = api("POST", "/api/auth/login", body={"userId": "admin1", "role": "admin"})["token"]
    api("POST", "/api/admin/reset-sample-data", adm_tok)
    snap = api("GET", "/api/snapshot", adm_tok)
    assert snap["corridor"]["source"] == "postgis", "backend is not on the real corridor"
    center = next(s for s in snap["segments"] if s["id"] == SEG)["center"]

    with sync_playwright() as p:
        b = p.chromium.launch()
        print("F1 Segment Risk Map")
        off = login(b, "officer", "officer1")
        go(off, "/corridor")
        shot(off, "30-real-corridor-map.png")
        off.get_by_role("button", name=SEG).first.click()
        off.wait_for_selector(f"aside[aria-label='Segment {SEG}']")
        shot(off, "31-segment-drawer-model-score.png")
        drawer = off.locator(f"aside[aria-label='Segment {SEG}']").inner_text()
        assert "Model susceptibility" in drawer and "susc-lgbm" in drawer and "IMD" in drawer, drawer

        adm = login(b, "admin", "admin1")
        go(adm, "/configuration")
        adm.fill("input[aria-label='Rainfall date']", "2022-05-15")
        adm.get_by_role("button", name="Save configuration").click()
        adm.wait_for_timeout(1200)
        shot(adm, "32-config-imd-rainfall-date.png")
        go(off, "/corridor")
        shot(off, "33-real-corridor-15-may-2022.png")
        storm = api("GET", "/api/snapshot", adm_tok)
        red_storm = sum(s["riskLevel"] == "RED" for s in storm["segments"])
        go(adm, "/configuration")
        adm.fill("input[aria-label='Rainfall date']", "2022-05-10")
        adm.get_by_role("button", name="Save configuration").click()
        adm.wait_for_timeout(1200)
        calm = api("GET", "/api/snapshot", adm_tok)
        red_calm = sum(s["riskLevel"] == "RED" for s in calm["segments"])
        print(f"  RED segments: 15 May 2022 = {red_storm}, 10 May 2022 = {red_calm}")

        print("F3 Verified Ground Reports")
        pat = login(b, "patrol", "patrol1")
        go(pat, "/reports")
        if not pat.locator("#seg").count():  # "New report" is the patrol's default tab
            pat.get_by_text("New report", exact=True).first.click()
        pat.set_input_files("input[type=file]", files=[{"name": "debris.png", "mimeType": "image/png",
                                                        "buffer": base64.b64decode(PHOTO.split(",")[1])}])
        pat.select_option("#seg", SEG)
        for sel, val in (("input#lat, input[name=lat]", f"{center[0]:.5f}"), ("input#lon, input[name=lon]", f"{center[1]:.5f}")):
            if pat.locator(sel).count():
                pat.fill(sel, val)
        loc = pat.locator("input#loc, input[name=locationText]")
        if loc.count():
            loc.first.fill("Retzol bend")
        pat.get_by_role("button", name="Submit").first.click()
        pat.wait_for_timeout(1500)
        shot(pat, "34-report-submitted-real-segment.png")
        rep = api("GET", "/api/snapshot", adm_tok)["reports"][0]
        print(f"  report {rep['id']} segment {rep['segmentId']} route {rep['route']} inside corridor "
              f"{rep['checks']['insideCorridor']} distance {rep['checks']['distanceToCorridorKm']} km (PostGIS)")

        go(off, "/reports")
        tab = "Manual review" if rep["route"] == "manual_review" else "Officer queue"
        off.get_by_role("tab", name=tab).first.click()
        off.wait_for_timeout(500)
        shot(off, "35-officer-review-real.png")
        off.get_by_role("button", name="Confirm").first.click()
        off.wait_for_timeout(1500)

        print("F2 Safe Passage and Closure Engine")
        go(off, "/decisions")
        shot(off, "36-decisions-real-hold.png")
        s = api("GET", "/api/snapshot", adm_tok)
        for d in (d for d in s["decisions"] if d["segmentId"] == SEG):
            r = d["result"]
            print(f"  {d['zoneId']}: {r['decision']} · {(r.get('holdingPoint') or {}).get('shortName')} · close recommended {r['closeRecommended']} · {r['ruleId']}")
        go(off, "/approvals")
        off.get_by_text(f"Closure · {SEG}", exact=True).first.click()
        shot(off, "37-closure-approval-real.png")
        off.get_by_role("button", name="Approve", exact=True).first.click()
        off.wait_for_timeout(1500)
        go(off, "/approvals")
        off.get_by_text(f"Alert · {SEG}", exact=True).first.click()
        shot(off, "38-alert-approval-real.png")
        off.get_by_role("button", name="Approve", exact=True).first.click()
        off.wait_for_timeout(1500)
        go(off, "/approvals")
        off.get_by_text(f"Alert · {SEG}", exact=True).first.click()
        if off.get_by_role("button", name="View CAP").count():
            off.get_by_role("button", name="View CAP").first.click()
        shot(off, "39-cap-real.png")

        eng = login(b, "road_engineer", "engineer1")
        go(eng, "/incidents")
        est = (datetime.now() + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M")
        eng.fill("input[aria-label='Reopening estimate']", est)
        eng.get_by_role("button", name="Save").first.click()
        eng.wait_for_timeout(1000)
        shot(eng, "40-incident-estimate-real.png")
        go(off, "/decisions")
        shot(off, "41-decisions-expected-wait-real.png")
        eng.get_by_role("button", name="Request full reopening").click()
        eng.wait_for_timeout(1000)
        go(off, "/approvals")
        off.get_by_text(f"Reopening · {SEG}", exact=True).first.click()
        off.get_by_role("button", name="Approve", exact=True).first.click()
        off.wait_for_timeout(1500)
        go(off, "/records")
        shot(off, "42-records-real.png")
        b.close()

    s = api("GET", "/api/snapshot", adm_tok)
    seg = next(x for x in s["segments"] if x["id"] == SEG)
    alerts = [f"{a['id']} {a['fields']['template']} {a['status']} CAP={'yes' if a.get('capXml') else 'no'}" for a in s["alerts"] if a["segmentId"] == SEG]
    print(f"final: {SEG} road state {seg['roadState']}; alerts {alerts}; decision records {len(s['decisionRecords'])}; audit entries {len(s['audit'])}")
    print(f"browser API calls {api_calls['n']}, failed {len(api_calls['failed'])}: {api_calls['failed'][:5]}")
    print(f"console/page errors {len(errors)}: {errors[:5]}")
    return 0 if not errors and not api_calls["failed"] else 1


if __name__ == "__main__":
    sys.exit(main())
