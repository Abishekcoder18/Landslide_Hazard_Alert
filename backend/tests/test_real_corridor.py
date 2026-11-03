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
        for t in ("ref_diversion_segments", "imd_rain_cells"):  # optional (Phase 8 OSRM / rain cell coordinates)
            if c.execute("SELECT to_regclass(%s)", (f"{SRC}.{t}",)).fetchone()[0]:
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


def nh(s):
    """NH-27 segments only: diversion-road segments (offCorridor, Phase 8) are scored for BR-03 only."""
    return [x for x in s["segments"] if not x.get("offCorridor")]


def seg(s, sid):
    return next(x for x in s["segments"] if x["id"] == sid)


def levels(s):
    out = {}
    for x in nh(s):
        out[x["riskLevel"]] = out.get(x["riskLevel"], 0) + 1
    return out


# ------------------------------------------------------------------ F1 Segment Risk Map
def test_f1_real_segments_model_score_and_dated_rainfall(env):
    client, _, _, store = env
    s = snap(client, login(client, "officer"))
    assert s["corridor"]["source"] == "postgis" and s["corridor"]["modelVersion"].startswith("susc-")
    assert [x["id"] for x in s["segments"] if not x.get("offCorridor")] == [f"NH27-DH-{i:03d}" for i in range(1, 138)]  # AC-01
    for x in nh(s):
        i = x["inputs"]
        assert i["sample"] is False and 0 <= i["susceptibilityScore"] <= 1 and i["modelVersion"]
        assert i["rainfallDate"] == "2022-05-10" and i["rainfall7d"] is not None
        assert x["riskLevel"] != "NO_DATA"  # all inputs present
    assert any("Model susceptibility" in r for x in nh(s) for r in x["reasons"])
    assert len(s["zones"]) == 274 and {z["direction"] for z in s["zones"]} == {"Northbound", "Southbound"}  # 2 per segment
    with store.connect() as conn:
        n, km = conn.execute("SELECT count(*), sum(ST_Length(geom::geography)) / 1000 FROM segments WHERE ST_IsValid(geom) "
                              "AND NOT COALESCE((data->>'offCorridor')::boolean, false)").fetchone()
    assert n == 137 and 130 < km < 145


def test_f1_rainfall_date_switch_raises_risk(env):
    client, *_ = env
    admin, off = login(client, "admin"), login(client, "officer")
    calm = levels(snap(client, off))
    assert client.patch("/api/config", json={"scenarioDate": "2022-05-15"}, headers=admin).status_code == 204
    s = snap(client, off)
    storm = levels(s)
    assert storm.get("RED", 0) > calm.get("RED", 0)
    assert all(x["inputs"]["rainfallDate"] == "2022-05-15" for x in nh(s))
    assert s["config"]["scenarioDate"] == "2022-05-15" and s["corridor"]["scenarioDate"] == "2022-05-15"
    storm_closures = [a["id"] for a in s["approvals"] if a["kind"] == "closure" and a["status"] == "pending"]
    assert storm_closures  # Red zone segments -> CLOSE recommended for officer approval (FR-12)
    # Back to the calm day: recommendations the rules no longer support are withdrawn, never approved by the system.
    assert client.patch("/api/config", json={"scenarioDate": "2022-05-10"}, headers=admin).status_code == 204
    s = snap(client, off)
    by_id = {a["id"]: a for a in s["approvals"]}
    assert all(by_id[i]["status"] == "withdrawn" and by_id[i]["decidedBy"] == "Decision engine" for i in storm_closures)
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
    assert all(x["riskLevel"] != "NO_DATA" for x in nh(s))
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

def test_every_red_or_orange_segment_has_zones(env):
    """Owner decision 2026-11: two zones for every segment, so no Red/Orange segment is left without a traveller decision."""
    client, *_ = env
    admin, off = login(client, "admin"), login(client, "officer")
    client.patch("/api/config", json={"scenarioDate": "2022-05-15"}, headers=admin)
    s = snap(client, off)
    zones_by_seg: dict[str, set] = {}
    for z in s["zones"]:
        zones_by_seg.setdefault(z["segmentId"], set()).add(z["direction"])
    risky = [x["id"] for x in nh(s) if x["riskLevel"] in ("ORANGE", "RED")]
    assert risky  # 15 May 2022 has Orange/Red segments
    assert all(zones_by_seg.get(sid) == {"Northbound", "Southbound"} for sid in risky)
    decided = {d["zoneId"] for d in s["decisions"]}
    assert decided == {z["id"] for z in s["zones"]}


def test_dry_date_no_zone_on_hold(env):
    """Default weights 25/45/15/15: on a dry day (IMD rainfall 20 Mar 2022) no zone is on HOLD."""
    client, *_ = env
    admin, off = login(client, "admin"), login(client, "officer")
    assert client.patch("/api/config", json={"scenarioDate": "2022-03-20"}, headers=admin).status_code == 204
    s = snap(client, off)
    assert max(x["inputs"]["rainfall7d"] for x in nh(s)) < 5  # dry week in the IMD data
    holds = [d["zoneId"] for d in s["decisions"] if d["result"]["decision"] == "HOLD" or (d.get("heavyResult") or {}).get("decision") == "HOLD"]
    assert holds == []

def test_sachet_warning_raises_never_lowers_officer(env):
    """Phase 6: an IMD colour from SACHET goes into the existing imdWarning input (BR-05 raise-only, BR-11)."""
    client, _, clock, store = env
    from app.service import Workflow
    off = login(client, "officer")
    before = {x["id"]: x["riskLevel"] for x in nh(snap(client, off))}
    with store.unit_of_work() as (conn, state):
        assert Workflow(state, lambda: clock["now"]).apply_imd_feed("ORANGE", "SACHET TEST-1 · IMD Guwahati · until 03 Nov 12:00")
    s = snap(client, off)
    order = ["GREEN", "YELLOW", "ORANGE", "RED"]
    assert all(order.index(x["riskLevel"]) >= order.index(before[x["id"]]) for x in nh(s))  # never lowered
    assert all(x["inputs"]["imdWarning"] == "ORANGE" and x["inputs"]["imdWarningSource"].startswith("SACHET TEST-1") for x in nh(s))
    assert any(d["result"]["windowClosing"] for d in s["decisions"])  # BR-11: Yellow + IMD Orange
    # Officer sets RED on one segment; the feed later reports no alert -> officer value stays, feed-owned ones clear.
    client.patch("/api/segments/NH27-DH-108/inputs", json={"imdWarning": "RED"}, headers=login(client, "admin"))
    with store.unit_of_work() as (conn, state):
        Workflow(state, lambda: clock["now"]).apply_imd_feed("NONE", "SACHET · no active IMD alert for Dima Hasao")
    s = snap(client, off)
    by = {x["id"]: x["inputs"] for x in s["segments"]}
    assert by["NH27-DH-108"]["imdWarning"] == "RED" and by["NH27-DH-108"]["imdWarningSource"] == "Officer"
    assert by["NH27-DH-001"]["imdWarning"] == "NONE"
    assert any(a["action"] == "IMD warning updated" for a in s["audit"])

def test_phase4_openmeteo_archive_and_live(env):
    """Phase 4: dates after the IMD data use the Open-Meteo archive; "live" uses Open-Meteo rolling totals with the
    fetch time as updatedAt, so a stopped feed turns into No data (BR-06). Synthetic rows, no network."""
    from datetime import date as d_

    from app import openmeteo
    from app.service import Workflow
    client, _, clock, store = env
    admin, off = login(client, "admin"), login(client, "officer")
    with store.connect() as conn:
        openmeteo.ensure_tables(conn, TEST)
        conn.execute(f"TRUNCATE {TEST}.openmeteo_rain_daily, {TEST}.openmeteo_rain_live")
        cells = [c for (c,) in conn.execute(f"SELECT DISTINCT data->>'rainCellId' FROM {TEST}.segment_features").fetchall()]
        openmeteo.store_archive(conn, TEST, [(c, d_(2026, 6, 21) - timedelta(days=i), 40.0) for c in cells for i in range(7)])
        conn.commit()
    assert client.patch("/api/config", json={"scenarioDate": "2026-06-21"}, headers=admin).status_code == 204
    s = snap(client, off)
    i = seg(s, SEG)["inputs"]
    assert i["rainfall24h"] == 40.0 and i["rainfall7d"] == 280.0 and i["sources"]["rainfall"] == "Open-Meteo archive · 2026-06-21"
    assert client.patch("/api/config", json={"scenarioDate": "2026-03-01"}, headers=admin).status_code == 400  # no archive rows

    # live: nothing fetched yet -> No data, never a made-up value
    assert client.patch("/api/config", json={"scenarioDate": "live"}, headers=admin).status_code == 204
    s = snap(client, off)
    assert all(x["riskLevel"] == "NO_DATA" for x in nh(s))
    fetched = clock["now"]
    with store.connect() as conn:
        openmeteo.store_live(conn, TEST, {c: {"rainfall24h": 120.0, "rainfall3d": 200.0, "rainfall7d": 260.0, "lastHour": fetched} for c in cells}, fetched)
        conn.commit()
    with store.unit_of_work() as (conn, state):
        from app.main import corridor_data  # same feed the app uses
        feed = lambda day: corridor_data.segment_inputs(conn, TEST, day if day == "live" else d_.fromisoformat(day), clock["now"])  # noqa: E731
        assert Workflow(state, lambda: clock["now"], feed=feed).apply_rain_feed()
    s = snap(client, off)
    i = seg(s, SEG)["inputs"]
    assert i["rainfall24h"] == 120.0 and i["rainfallDate"] == "live" and i["sources"]["rainfall"].startswith("Open-Meteo live · fetched")
    assert all(x["riskLevel"] != "NO_DATA" for x in nh(s))
    assert any(a["action"] == "Rainfall updated" for a in s["audit"])
    # feed stops: after staleInputHours the inputs are stale -> No data (BR-06), not silently refreshed
    clock["now"] += timedelta(hours=s["config"]["staleInputHours"] + 1)
    s = snap(client, off)
    assert all(x["riskLevel"] == "NO_DATA" for x in nh(s))


def _has_diversions() -> bool:
    try:
        with psycopg.connect(normalize_dsn(DSN), connect_timeout=2) as c:
            return bool(c.execute("SELECT to_regclass(%s)", (f"{SRC}.ref_diversion_segments",)).fetchone()[0])
    except Exception:  # noqa: BLE001
        return False


@pytest.mark.skipif(not _has_diversions(), reason="OSRM diversions not built (backend/scripts/osrm_diversions.py)")
def test_phase8_diversion_roads_are_off_corridor(env):
    """Phase 8: OSRM diversion-road segments are offCorridor, scored for BR-03 only, never part of the NH-27 chainage,
    the corridor count or the FR-22 corridor check; changing them changes no decision except a diversion's BR-03 result."""
    client, _, clock, store = env
    s = snap(client, login(client, "officer"))
    dv = [x for x in s["segments"] if x.get("offCorridor")]
    nh = [x for x in s["segments"] if not x.get("offCorridor")]
    assert dv and len(nh) == 137 and s["corridor"]["segments"] == 137 and s["corridor"]["diversionSegments"] == len(dv)
    assert all(x["id"].startswith("DV-") and x["startKm"] > max(n["endKm"] for n in nh) for x in dv)
    by = {x["id"]: x for x in s["segments"]}
    routes = [(z["id"], r) for z in s["zones"] for r in z.get("diversionRoutes") or []]
    assert routes and all(sid in by for _, r in routes for sid in r["segmentIds"])  # every candidate segment is mapped
    # a DV segment far from NH-27 is not "inside the corridor" for report checks (FR-22)
    far = max(dv, key=lambda x: min(abs(x["center"][0] - n["center"][0]) + abs(x["center"][1] - n["center"][1]) for n in nh))
    with store.connect() as conn:
        assert store.corridor_distance(conn)(far["center"][0], far["center"][1]) > 1.0
    # BR-03 is the only consumer: decisions with no candidate are unaffected by DV states
    from app.service import Workflow
    before = {d["zoneId"]: d["result"]["decision"] for d in s["decisions"]}
    with store.unit_of_work() as (conn, state):
        for x in dv:
            state["segments"][x["id"]]["roadState"] = "BLOCKED"
        Workflow(state, lambda: clock["now"]).recompute("test: all diversion roads blocked")
    after = snap(client, login(client, "officer"))
    for d in after["decisions"]:
        if before[d["zoneId"]] != "DIVERT":
            assert d["result"]["decision"] == before[d["zoneId"]], d["zoneId"]
        assert d["result"]["decision"] != "DIVERT"
