"""F1 / F2 / F3 on the REAL corridor: 137 NH-27 segments, model susceptibility, IMD rainfall, PostGIS checks.

The reference tables built by backend/scripts are copied from schema `resilion2` into the throw-away schema
`resilion2_rtest`, and the app runs on that copy (the real app schema is never wiped). Skipped when the data
pipeline has not been run on this machine."""
import os
from datetime import timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.corridor_data import REQUIRED
from app.main import create_app
from app.settings import Settings
from app.store import Store, normalize_dsn
from tests.test_api import DSN, PNG, FakeAI, login, snap

SRC = os.getenv("DB_SCHEMA", "resilion2")
TEST = "resilion2_rtest"
SEG = "NH27-DH-108"  # a zone segment on the Jatinga - Harangajao stretch (>= 5 past landslides, high model score)


def _source_ready() -> bool:
    try:
        with psycopg.connect(normalize_dsn(DSN), connect_timeout=2) as c:
            return all(c.execute("SELECT to_regclass(%s)", (f"{SRC}.{t}",)).fetchone()[0] for t in REQUIRED) and \
                c.execute(f"SELECT count(*) FROM {SRC}.segment_scores").fetchone()[0] > 0
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _source_ready(), reason="real corridor data not loaded (run backend/scripts pipeline)")


@pytest.fixture(scope="module")
def ref_copy():
    with psycopg.connect(normalize_dsn(DSN)) as c:
        c.execute(f"DROP SCHEMA IF EXISTS {TEST} CASCADE")
        c.execute(f"CREATE SCHEMA {TEST}")
        for t in REQUIRED:
            c.execute(f"CREATE TABLE {TEST}.{t} AS SELECT * FROM {SRC}.{t}")
        c.commit()
    yield
    with psycopg.connect(normalize_dsn(DSN)) as c:
        c.execute(f"DROP SCHEMA IF EXISTS {TEST} CASCADE")
        c.commit()


@pytest.fixture()
def env(ref_copy, tmp_path):
    from datetime import datetime, timezone
    store = Store(DSN, TEST)
    store.init_schema()
    with store.connect() as conn:
        store.wipe(conn)
        conn.commit()
    clock = {"now": datetime(2026, 11, 2, 4, 0, tzinfo=timezone.utc)}
    ai = FakeAI()
    cfg = Settings(database_url=DSN, secret_key="test-secret", upload_dir=tmp_path, corridor_source="auto", scenario_date="2022-05-10")
    with TestClient(create_app(cfg, store, ai, lambda: clock["now"])) as client:
        yield client, ai, clock, store


def seg(s, sid):
    return next(x for x in s["segments"] if x["id"] == sid)


def levels(s):
    out = {}
    for x in s["segments"]:
        out[x["riskLevel"]] = out.get(x["riskLevel"], 0) + 1
    return out


# ------------------------------------------------------------------ F1 Segment Risk Map
def test_f1_real_segments_model_score_and_dated_rainfall(env):
    client, _, _, store = env
    s = snap(client, login(client, "officer"))
    assert s["corridor"]["source"] == "postgis" and s["corridor"]["modelVersion"].startswith("susc-")
    assert [x["id"] for x in s["segments"]] == [f"NH27-DH-{i:03d}" for i in range(1, 138)]  # AC-01
    for x in s["segments"]:
        i = x["inputs"]
        assert i["sample"] is False and 0 <= i["susceptibilityScore"] <= 1 and i["modelVersion"]
        assert i["rainfallDate"] == "2022-05-10" and i["rainfall7d"] is not None
        assert x["riskLevel"] != "NO_DATA"  # all inputs present
    assert any("Model susceptibility" in r for x in s["segments"] for r in x["reasons"])
    assert len(s["zones"]) == 18 and {z["direction"] for z in s["zones"]} == {"Northbound", "Southbound"}
    with store.connect() as conn:
        n, km = conn.execute("SELECT count(*), sum(ST_Length(geom::geography)) / 1000 FROM segments WHERE ST_IsValid(geom)").fetchone()
    assert n == 137 and 130 < km < 145


def test_f1_rainfall_date_switch_raises_risk(env):
    client, *_ = env
    admin, off = login(client, "admin"), login(client, "officer")
    calm = levels(snap(client, off))
    assert client.patch("/api/config", json={"scenarioDate": "2022-05-15"}, headers=admin).status_code == 204
    s = snap(client, off)
    storm = levels(s)
    assert storm.get("RED", 0) > calm.get("RED", 0)
    assert all(x["inputs"]["rainfallDate"] == "2022-05-15" for x in s["segments"])
    assert s["config"]["scenarioDate"] == "2022-05-15" and s["corridor"]["scenarioDate"] == "2022-05-15"
    storm_closures = [a["id"] for a in s["approvals"] if a["kind"] == "closure" and a["status"] == "pending"]
    assert storm_closures  # Red zone segments -> CLOSE recommended for officer approval (FR-12)
    # Back to the calm day: recommendations the rules no longer support are withdrawn, never approved by the system.
    assert client.patch("/api/config", json={"scenarioDate": "2022-05-10"}, headers=admin).status_code == 204
    s = snap(client, off)
    by_id = {a["id"]: a for a in s["approvals"]}
    assert all(by_id[i]["status"] == "rejected" and by_id[i]["decidedBy"] == "Decision engine" for i in storm_closures)
    assert sum(a["action"] == "CLOSE recommendation withdrawn" for a in s["audit"]) == len(storm_closures)
    assert client.patch("/api/config", json={"scenarioDate": "2030-01-01"}, headers=admin).status_code == 400
    assert client.patch("/api/config", json={"scenarioDate": "15-05-2022"}, headers=admin).status_code == 400
    assert client.patch("/api/config", json={"scenarioDate": "2022-05-14"}, headers=off).status_code == 403


def test_f1_inputs_refreshed_from_postgis_not_stale(env):
    """BR-06/BR-12: after the 6 h validity the inputs are re-read from PostGIS instead of going to No data."""
    client, _, clock, _ = env
    off = login(client, "officer")
    snap(client, off)
    clock["now"] += timedelta(hours=7)
    s = snap(client, off)
    assert all(x["riskLevel"] != "NO_DATA" for x in s["segments"])
    assert any(a["action"] == "Inputs refreshed" for a in s["audit"])


def test_f1_manual_override_marked_sample(env):
    client, *_ = env
    admin = login(client, "admin")
    client.patch(f"/api/segments/{SEG}/inputs", json={"imdWarning": "RED"}, headers=admin)
    i = seg(snap(client, admin), SEG)["inputs"]
    assert i["sample"] is False and i["imdWarning"] == "RED"  # warning set by officer; data stays real
    client.patch(f"/api/segments/{SEG}/inputs", json={"rainfall24h": 150}, headers=admin)
    i = seg(snap(client, admin), SEG)["inputs"]
    assert i["sample"] is True and "rainfallDate" not in i  # manual rainfall is not IMD data


# ------------------------------------------------------------------ F3 Verified Ground Reports
def test_f3_postgis_corridor_check_on_real_geometry(env):
    client, ai, _, _ = env
    s = snap(client, login(client, "officer"))
    lat, lon = seg(s, SEG)["center"]
    h = login(client, "patrol")
    body = {"segmentId": SEG, "lat": lat + 0.001, "lon": lon, "locationText": "Jatinga", "note": "Debris on road",
            "photo": {"kind": "upload", "dataUrl": PNG, "fileName": "a.png"}}
    rep = client.post("/api/reports", json=body, headers=h).json()
    assert rep["checks"]["insideCorridor"] and rep["checks"]["distanceToCorridorKm"] < 0.2
    assert rep["route"] == "officer_queue" and rep["status"] == "unverified"  # AI only flags (BR-07)
    far = client.post("/api/reports", json={**body, "lat": 25.45, "lon": 92.75}, headers=h).json()  # inside district, off NH-27
    assert far["route"] == "flagged" and far["checks"]["distanceToCorridorKm"] > 2
    assert seg(snap(client, login(client, "officer")), SEG)["roadState"] == "OPEN"


# ------------------------------------------------------------------ F2 Safe Passage and Closure Engine
def test_f2_full_flow_on_real_segment(env):
    client, ai, clock, _ = env
    off, eng, h = login(client, "officer"), login(client, "road_engineer"), login(client, "patrol")
    s = snap(client, off)
    lat, lon = seg(s, SEG)["center"]
    rep = client.post("/api/reports", headers=h, json={"segmentId": SEG, "lat": lat, "lon": lon, "locationText": "Jatinga",
                                                        "photo": {"kind": "upload", "dataUrl": PNG, "fileName": "a.png"}}).json()
    assert client.post(f"/api/reports/{rep['id']}/confirm", json={"newState": "BLOCKED"}, headers=off).status_code == 204
    s = snap(client, off)
    assert seg(s, SEG)["roadState"] == "BLOCKED"
    decs = [d for d in s["decisions"] if d["segmentId"] == SEG]
    assert len(decs) == 2
    effective = {x["id"]: x for x in s["segments"]}
    hps = {x["id"]: x for x in s["holdingPoints"]}
    for d in decs:
        r = d["result"]
        assert r["decision"] == "HOLD" and r["closeRecommended"]  # BR-01: BLOCKED -> HOLD (no checked diversion), CLOSE recommended
        hp_seg = effective[hps[r["holdingPoint"]["id"]]["segmentId"]]
        assert hp_seg["roadState"] == "OPEN" and hp_seg["riskLevel"] in ("GREEN", "YELLOW")  # BR-04 eligibility on real data
    apr = next(a for a in s["approvals"] if a["kind"] == "closure" and a["segmentId"] == SEG)
    assert client.post(f"/api/approvals/{apr['id']}/decision", json={"approve": True, "closureType": "FULL"}, headers=off).status_code == 204
    s = snap(client, off)
    alert = next(a for a in s["alerts"] if a["segmentId"] == SEG)
    en = next(t for t in alert["texts"] if t["lang"] == "en")
    assert SEG in en["text"] and not en["blocked"]
    alert_apr = next(a for a in s["approvals"] if a["kind"] == "alert" and a["alertId"] == alert["id"])
    client.post(f"/api/approvals/{alert_apr['id']}/decision", json={"approve": True}, headers=off)
    cap = next(a for a in snap(client, off)["alerts"] if a["id"] == alert["id"])["capXml"]
    assert "<severity>Severe</severity>" in cap and SEG in cap
    inc = next(i for i in snap(client, off)["incidents"] if i["segmentId"] == SEG)
    client.patch(f"/api/incidents/{inc['id']}", json={"reopeningEstimate": (clock["now"] + timedelta(hours=2)).isoformat(),
                                                       "state": "clearance_in_progress"}, headers=eng)
    d = next(x for x in snap(client, off)["decisions"] if x["segmentId"] == SEG)
    assert d["result"]["expectedWaitMinutes"] == 120
    client.post(f"/api/incidents/{inc['id']}/reopening", json={"to": "full"}, headers=eng)
    rap = next(a for a in snap(client, off)["approvals"] if a["kind"] == "reopening" and a["segmentId"] == SEG)
    client.post(f"/api/approvals/{rap['id']}/decision", json={"approve": True}, headers=off)
    assert seg(snap(client, off), SEG)["roadState"] == "OPEN"
