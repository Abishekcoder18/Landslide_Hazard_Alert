"""Real corridor data for the initial corridor (NH-27 within Dima Hasao), read from PostGIS.

Built by backend/scripts (segment_nh27 -> build_features -> train_model) into the RESILION 2.0 schema:
  ref_segments, ref_zones, ref_holding_points   137 NH-27 segments (~1 km), approach zones, holding points
  segment_features                              DEM terrain, past landslides, IMD rain cell per segment
  segment_scores, model_runs                    model susceptibility score per segment + model version
  imd_rain_daily                                IMD gridded daily rainfall 0.25 deg, 2010-2025

Inputs for the Risk Index:
  susceptibilityScore  model score (replaces the categorical susceptibility; category derived for display)
  slopeDeg             90th percentile of DEM slope within 100 m of the segment (hillslope above/below the road)
  pastIncidents        landslides within 500 m (RESILION 1 inventory)
  rainfall24h/3d/7d    rainfall of the segment's 0.25 deg cell for the configured rainfall date, labelled with its source:
                       IMD gridded (2010-2025), Open-Meteo archive (dates after the IMD data), or Open-Meteo live
                       ("live": rolling totals to the last completed hour; updatedAt = fetch time, so BR-06 applies)
  imdWarning/gsiBulletin  no historical feed available: NONE / false (officer can set them in Configuration)

If any table is missing or empty, `load_corridor` returns None and the sample seed is used instead.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional, Union

import psycopg

from . import openmeteo

from .domain.risk_index import susceptibility_category
from .domain.timeutil import to_iso

REQUIRED = ("ref_segments", "ref_zones", "ref_holding_points", "segment_features", "segment_scores", "model_runs", "imd_rain_daily")
SOURCES = {
    "terrain": "Copernicus DEM 30 m",
    "history": "GSI inventory (RESILION 1)",
}
IMD_FIRST, IMD_LAST = date(2010, 1, 7), date(2025, 12, 31)  # 7-day totals need 6 earlier days of IMD data
NO_RAIN = {"rainfall24h": None, "rainfall3d": None, "rainfall7d": None}


def available(conn: psycopg.Connection, schema: str) -> bool:
    for t in REQUIRED:
        if conn.execute("SELECT to_regclass(%s)", (f"{schema}.{t}",)).fetchone()[0] is None:
            return False
    return conn.execute(f"SELECT EXISTS (SELECT 1 FROM {schema}.segment_scores)").fetchone()[0]


def rainfall_totals(conn: psycopg.Connection, schema: str, day: date) -> dict[str, dict]:
    """24 h / 3-day / 7-day totals ending on `day` for every IMD cell; None where a day is missing."""
    rows = conn.execute(
        f"SELECT cell_id, day, rain_mm FROM {schema}.imd_rain_daily WHERE day BETWEEN %s AND %s",
        (day - timedelta(days=6), day)).fetchall()
    by: dict[str, dict] = {}
    for cell, d, mm in rows:
        by.setdefault(cell, {})[d] = float(mm)

    def tot(s: dict, n: int):
        days = [day - timedelta(days=i) for i in range(n)]
        return round(sum(s[d] for d in days), 1) if all(d in s for d in days) else None

    return {c: {"rainfall24h": tot(s, 1), "rainfall3d": tot(s, 3), "rainfall7d": tot(s, 7)} for c, s in by.items()}


def rainfall_for(conn: psycopg.Connection, schema: str, scenario: Union[date, str], now: datetime) -> tuple[dict, str, str, dict]:
    """(totals per cell, source label, rainfallDate, updatedAt per cell or {}) for a date or "live"."""
    if scenario == openmeteo.LIVE:
        live = openmeteo.read_live(conn, schema)
        fetched = max((v["fetchedAt"] for v in live.values()), default=None)
        label = f"Open-Meteo live · fetched {to_iso(fetched)}" if fetched else "Open-Meteo live · not fetched yet"
        totals = {c: {k: v[k] for k in NO_RAIN} for c, v in live.items()}
        # No fetch yet -> inputs dated at the epoch so BR-06 shows No data instead of a fake fresh value.
        updated = {c: to_iso(v["fetchedAt"]) for c, v in live.items()}
        return totals, label, openmeteo.LIVE, updated
    day = scenario
    if IMD_FIRST <= day <= IMD_LAST:
        return rainfall_totals(conn, schema, day), f"IMD gridded 0.25° · {day.isoformat()}", day.isoformat(), {}
    return openmeteo.archive_totals(conn, schema, day), f"Open-Meteo archive · {day.isoformat()}", day.isoformat(), {}


def diversion_segments(conn: psycopg.Connection, schema: str) -> list[dict]:
    """Diversion-road segments from OSRM (backend/scripts/osrm_diversions.py); [] when not built."""
    if conn.execute("SELECT to_regclass(%s)", (f"{schema}.ref_diversion_segments",)).fetchone()[0] is None:
        return []
    return [d for (d,) in conn.execute(f"SELECT data FROM {schema}.ref_diversion_segments ORDER BY pos").fetchall()]


def segment_inputs(conn: psycopg.Connection, schema: str, scenario: Union[date, str], now: datetime) -> dict[str, dict]:
    """Fresh Risk Index inputs per segment from PostGIS (also used as the input feed on refresh). Diversion-road
    segments use the same inputs, computed by osrm_diversions.py; outside the data coverage they are missing (No data)."""
    feats = {sid: d for sid, d in conn.execute(f"SELECT segment_id, data FROM {schema}.segment_features").fetchall()}
    scores = {sid: (sc, ver) for sid, sc, ver in conn.execute(
        f"SELECT segment_id, susceptibility_score, model_version FROM {schema}.segment_scores").fetchall()}
    version = next(iter({v for _, v in scores.values()}), None)
    for d in diversion_segments(conn, schema):
        f = d.get("features") or {}
        feats[d["id"]] = f
        scores[d["id"]] = (f.get("susceptibilityScore"), version if f.get("susceptibilityScore") is not None else None)
    rain, label, rain_date, updated = rainfall_for(conn, schema, scenario, now)
    never = to_iso(datetime(1970, 1, 1, tzinfo=now.tzinfo))
    out = {}
    for sid, f in feats.items():
        sc, ver = scores.get(sid, (None, None))
        cell = f.get("rainCellId")
        out[sid] = {
            "susceptibility": susceptibility_category(sc) if sc is not None else None,
            "susceptibilityScore": None if sc is None else round(float(sc), 3),
            "modelVersion": ver,
            "slopeDeg": f.get("slopeP90Deg"),
            **rain.get(cell, NO_RAIN),
            "rainfallDate": rain_date,
            "pastIncidents": f.get("pastLandslides500m"),
            "updatedAt": (updated.get(cell, never) if scenario == openmeteo.LIVE else to_iso(now)),
            "sample": False,
            "sources": {**SOURCES, "rainfall": label},
        }
    return out


def load_corridor(conn: psycopg.Connection, schema: str, scenario_day: Union[date, str], now: datetime) -> Optional[dict]:
    if not available(conn, schema):
        return None
    inputs = segment_inputs(conn, schema, scenario_day, now)
    updated = to_iso(now)
    segments = []
    dvs = diversion_segments(conn, schema)
    for (data,) in conn.execute(f"SELECT data FROM {schema}.ref_segments ORDER BY pos").fetchall():
        sid = data["id"]
        segments.append({
            "id": sid, "name": data["name"], "startKm": data["startKm"], "endKm": data["endKm"],
            "coordinates": data["coordinates"], "center": data["center"],
            "roadState": "OPEN", "riskLevel": "NO_DATA", "riskIndex": None, "reasons": [],
            "computedAt": updated, "validUntil": updated,
            "inputs": {"imdWarning": "NONE", "gsiBulletin": False, **inputs[sid]},
        })
    # Diversion-road segments (OSRM, BR-03 only): offCorridor, outside the NH-27 chainage (FR-09); startKm kept after
    # the corridor so nothing that sorts by chainage can place them on NH-27.
    end_km = max((x["endKm"] for x in segments), default=0.0)
    for k, d in enumerate(dvs):
        segments.append({
            "id": d["id"], "name": d["name"], "startKm": round(end_km + 1000 + k, 3), "endKm": round(end_km + 1000 + k + d["lengthM"] / 1000, 3),
            "coordinates": d["coordinates"], "center": d["center"], "offCorridor": True,
            "roadState": "OPEN", "riskLevel": "NO_DATA", "riskIndex": None, "reasons": [],
            "computedAt": updated, "validUntil": updated,
            "inputs": {"imdWarning": "NONE", "gsiBulletin": False, **inputs[d["id"]]},
        })
    # Two approach zones per segment (owner decision 2026-11), built by backend/scripts/segment_nh27.py.
    zones = [z for (z,) in conn.execute(f"SELECT data FROM {schema}.ref_zones ORDER BY pos").fetchall()]
    hps = [h for (h,) in conn.execute(f"SELECT data FROM {schema}.ref_holding_points ORDER BY pos").fetchall()]
    model = conn.execute(f"SELECT version, trained_at, meta->'validation'->'results'->(meta->>'model') FROM {schema}.model_runs "
                         "ORDER BY trained_at DESC LIMIT 1").fetchone()
    meta = {
        "source": "postgis", "scenarioDate": scenario_day if isinstance(scenario_day, str) else scenario_day.isoformat(), "segments": len(segments) - len(dvs), "diversionSegments": len(dvs), "zones": len(zones),
        "modelVersion": model[0] if model else None,
        "modelCv": {k: model[2].get(k) for k in ("roc_auc_mean", "roc_auc_std", "pr_auc_mean", "pr_auc_std")} if model and model[2] else None,
    }
    return {"segments": segments, "zones": zones, "holdingPoints": hps, "meta": meta}
