"""The Python rules must return exactly what the TypeScript rules return (frontend sample mode == backend).
The fixture is regenerated from src/domain/*.ts on every run (requires Node.js + npm install at repo root)."""
import json
import shutil
import subprocess
from datetime import timedelta
from pathlib import Path

import pytest

from app.domain.alerts import build_alert_texts, build_cap, render_template, validate_alert
from app.domain.decision_engine import evaluate_approach_zone, evaluate_zone_ahead, segments_ahead
from app.domain.risk_index import compute_risk
from app.domain.timeutil import parse_iso

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures" / "parity.json"


@pytest.fixture(scope="module")
def fx():
    npx = shutil.which("npx")
    if npx is None or not (ROOT / "node_modules").exists():
        pytest.skip("Node.js / node_modules not available to regenerate the parity fixture")
    subprocess.run([npx, "tsx", "scripts/parity-fixture.ts"], cwd=ROOT, check=True, capture_output=True)
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _seg(id_, state, risk, imd="NONE", now="2026-11-01T04:00:00.000Z"):
    return {"id": id_, "name": f"{id_} name", "roadState": state, "riskLevel": risk, "inputs": {"imdWarning": imd}}


def test_decision_engine_matches_typescript(fx):
    now = parse_iso(fx["now"])
    hps = {k: {"id": k, "name": f"{k} name", "shortName": k, "locationName": f"{k} loc", "facilities": [], "segmentId": s, "capacityVehicles": 1, "provisional": True}
           for k, s in (("HP-A", "H1"), ("HP-B", "H2"))}
    div = {"none": None, "safe": ("OPEN", "GREEN"), "nodata": ("OPEN", "NO_DATA"), "blocked": ("BLOCKED", "YELLOW")}
    host = {"ok": ("OPEN", "GREEN"), "orange": ("OPEN", "ORANGE"), "blocked": ("BLOCKED", "RED")}
    fb = {"ok": ("OPEN", "YELLOW"), "nodata": ("OPEN", "NO_DATA")}
    mismatches = 0
    for case in fx["engine"]:
        i = case["input"]
        target = _seg("T", i["st"], i["rk"], i["imd"])
        segs = {"T": target, "H1": _seg("H1", *host[i["hk"]]), "H2": _seg("H2", *fb[i["fk"]])}
        if div[i["dk"]]:
            segs["D1"] = _seg("D1", *div[i["dk"]])
        zone = {"id": "AZ", "nearestHoldingPointId": "HP-A", "fallbackHoldingPointIds": ["HP-B"],
                "diversionRoutes": [{"name": "Route D", "segmentIds": ["D1"]}] if div[i["dk"]] else []}
        out = evaluate_approach_zone(zone, target, segs, hps, vehicle_type=i["vt"], officer_cleared_passage=i["cleared"], now=now,
                                     reopening_estimate=None if i["est"] is None else now + timedelta(minutes=i["est"]))
        if out != case["output"]:
            mismatches += 1
            if mismatches == 1:
                print("first mismatch", i, "\nTS:", case["output"], "\nPY:", out)
    assert mismatches == 0, f"{mismatches}/{len(fx['engine'])} engine cases differ"


def test_segments_ahead_matches_typescript(fx):
    """FR-09: 400 seeded random corridors; identical segments-ahead lists and zone decisions (light and heavy)."""
    now = parse_iso(fx["now"])
    mismatches, total = 0, 0
    for c in fx["corridors"]:
        segs, hps, zones = c["segments"], c["holdingPoints"], c["zones"]
        order = [s["id"] for s in sorted((s for s in segs.values() if not s.get("offCorridor")), key=lambda s: s["startKm"])]
        zone_of = {f"{z['segmentId']}|{z['direction']}": z for z in zones}
        cleared = set(c["cleared"])
        for z, want in zip(zones, c["results"]):
            ahead = segments_ahead(z, order, hps)

            def opts(vt, z=z):
                return lambda sid: dict(now=now, vehicle_type=vt, officer_cleared_passage=f"{sid}|{z['direction']}" in cleared,
                                        reopening_estimate=None if sid not in c["estimates"] else now + timedelta(minutes=c["estimates"][sid]))

            def divs(sid, z=z):
                return (zone_of.get(f"{sid}|{z['direction']}") or {}).get("diversionRoutes") or []

            got = {"zoneId": z["id"], "ahead": ahead,
                   "light": evaluate_zone_ahead(z, ahead, segs, hps, opts("light"), divs),
                   "heavy": evaluate_zone_ahead(z, ahead, segs, hps, opts("heavy"), divs)}
            total += 1
            if got != want:
                mismatches += 1
                if mismatches == 1:
                    print("first mismatch", z["id"], "TS:", want, "PY:", got)
    assert total > 2000 and mismatches == 0, f"{mismatches}/{total} zone cases differ"


def test_risk_index_matches_typescript(fx):
    now = parse_iso(fx["now"])
    bad = [c for c in fx["risk"] if compute_risk(c["input"], fx["config"], now) != c["output"]]
    if bad:
        print("first mismatch", bad[0]["input"], "\nTS:", bad[0]["output"], "\nPY:", compute_risk(bad[0]["input"], fx["config"], now))
    assert not bad, f"{len(bad)}/{len(fx['risk'])} risk cases differ"


def test_alerts_match_typescript(fx):
    places = fx["places"]
    now = parse_iso(fx["now"])
    for a in fx["alerts"]:
        f = a["fields"]
        for lang, txt in a["templates"].items():
            assert render_template(f, lang) == txt, (lang, f["template"])
        for v in a["validations"]:
            assert validate_alert(v["text"], f, v["lang"], places) == v["result"], (v["lang"], v["text"])
        assert build_alert_texts(f, places, {"hi": a["validations"][4]["text"]}) == a["texts"]
        cap = build_cap("RESILION-ALR-0001", now, f, build_alert_texts(f, places),
                        [{"id": "AZ-07N", "name": "Mahur side", "center": [25.17, 93.02], "extentKm": 2.5}])
        assert cap == a["cap"], f["template"]
