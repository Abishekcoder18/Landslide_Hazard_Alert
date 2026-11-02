"""Measures snapshot size/latency and page load (Corridor, Decisions) on the real corridor.
Backend :8000 and frontend :3000 must be running. Run: backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\measure_perf.py [--reload]"""
from __future__ import annotations

import gzip
import json
import statistics
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

# 127.0.0.1: on Windows "localhost" tries IPv6 ::1 first; uvicorn listens on IPv4 only, which adds ~2 s per urllib call.
API, FRONT = "http://127.0.0.1:8000", "http://localhost:3000"


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req) as r:
        return r.read()


def main() -> int:
    tok = json.loads(call("POST", "/api/auth/login", body={"userId": "admin1", "role": "admin"}))["token"]
    if "--reload" in sys.argv:
        call("POST", "/api/admin/reset-sample-data", tok)
    times, raw = [], b""
    for _ in range(10):
        t = time.perf_counter()
        raw = call("GET", "/api/snapshot", tok)
        times.append((time.perf_counter() - t) * 1000)
    s = json.loads(raw)
    req = urllib.request.Request(API + "/api/snapshot", headers={"Authorization": f"Bearer {tok}", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req) as r:
        wire, enc = r.read(), r.headers.get("Content-Encoding")
    print(f"on the wire with Accept-Encoding gzip: {len(wire) / 1024:.0f} KB (Content-Encoding: {enc})")
    print(f"snapshot: {len(s['segments'])} segments, {len(s['zones'])} zones, {len(s['decisions'])} decisions, "
          f"{len(s['decisionRecords'])} decision records")
    print(f"snapshot size {len(raw) / 1024:.0f} KB raw, {len(gzip.compress(raw)) / 1024:.0f} KB gzip; "
          f"latency median {statistics.median(times):.0f} ms (min {min(times):.0f}, max {max(times):.0f}) over 10 calls")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto(FRONT)
        pg.fill("#uid", "officer1")
        pg.select_option("#role", "officer")
        pg.get_by_role("button", name="Sign in").click()
        pg.wait_for_url("**/corridor")
        for path, ready in (("/corridor", "text=Segments · 137"), ("/decisions", "text=Approach zones")):
            t = time.perf_counter()
            pg.goto(f"{FRONT}/#{path}")
            pg.reload()
            pg.wait_for_selector(ready)
            pg.wait_for_load_state("networkidle")
            print(f"page {path}: ready in {(time.perf_counter() - t) * 1000:.0f} ms (reload, incl. sign-in restore + snapshot)")
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
