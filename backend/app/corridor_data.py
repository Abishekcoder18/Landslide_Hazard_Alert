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
  rainfall24h/3d/7d    IMD rainfall of the nearest 0.25 deg cell for the scenario date - historical, labelled with its date
  imdWarning/gsiBulletin  no historical feed available: NONE / false (officer can set them in Configuration)

If any table is missing or empty, `load_corridor` returns None and the sample seed is used instead.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

import psycopg

from .domain.risk_index import susceptibility_category
from .domain.timeutil import to_iso

REQUIRED = ("ref_segments", "ref_zones", "ref_holding_points", "segment_features", "segment_scores", "model_runs", "imd_rain_daily")
# Approach zones are kept for segments with a landslide history AND a high model score (assumption, configurable here).
ZONE_MIN_PAST_LANDSLIDES = 5
ZONE_MIN_SCORE = 0.6
SOURCES = {
    "terrain": "Copernicus DEM 30 m",
    "history": "GSI inventory (RESILION 1)",
}


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


def segment_inputs(conn: psycopg.Connection, schema: str, scenario_day: date, now: datetime) -> dict[str, dict]:
    """Fresh Risk Index inputs per segment from PostGIS (also used as the input feed on refresh)."""
    feats = {sid: d for sid, d in conn.execute(f"SELECT segment_id, data FROM {schema}.segment_features").fetchall()}
    scores = {sid: (sc, ver) for sid, sc, ver in conn.execute(
        f"SELECT segment_id, susceptibility_score, model_version FROM {schema}.segment_scores").fetchall()}
    rain = rainfall_totals(conn, schema, scenario_day)
    out = {}
    for sid, f in feats.items():
        sc, ver = scores.get(sid, (None, None))
        r = rain.get(f.get("rainCellId"), {"rainfall24h": None, "rainfall3d": None, "rainfall7d": None})
        out[sid] = {
            "susceptibility": susceptibility_category(sc) if sc is not None else None,
            "susceptibilityScore": None if sc is None else round(float(sc), 3),
            "modelVersion": ver,
            "slopeDeg": f.get("slopeP90Deg"),
            **r,
            "rainfallDate": scenario_day.isoformat(),
            "pastIncidents": f.get("pastLandslides500m"),
            "updatedAt": to_iso(now),
            "sample": False,
            "sources": {**SOURCES, "rainfall": f"IMD gridded 0.25° · {scenario_day.isoformat()}"},
        }
    return out


def load_corridor(conn: psycopg.Connection, schema: str, scenario_day: date, now: datetime) -> Optional[dict]:
    if not available(conn, schema):
        return None
    inputs = segment_inputs(conn, schema, scenario_day, now)
    updated = to_iso(now)
    segments = []
    for (data,) in conn.execute(f"SELECT data FROM {schema}.ref_segments ORDER BY pos").fetchall():
        sid = data["id"]
        segments.append({
            "id": sid, "name": data["name"], "startKm": data["startKm"], "endKm": data["endKm"],
            "coordinates": data["coordinates"], "center": data["center"],
            "roadState": "OPEN", "riskLevel": "NO_DATA", "riskIndex": None, "reasons": [],
            "computedAt": updated, "validUntil": updated,
            "inputs": {"imdWarning": "NONE", "gsiBulletin": False, **inputs[sid]},
        })
    by = {s["id"]: s for s in segments}
    zones = []
    for (z,) in conn.execute(f"SELECT data FROM {schema}.ref_zones ORDER BY pos").fetchall():
        inp = by[z["segmentId"]]["inputs"]
        if (inp["pastIncidents"] or 0) >= ZONE_MIN_PAST_LANDSLIDES and (inp["susceptibilityScore"] or 0) >= ZONE_MIN_SCORE:
            zones.append(z)
    hps = [h for (h,) in conn.execute(f"SELECT data FROM {schema}.ref_holding_points ORDER BY pos").fetchall()]
    model = conn.execute(f"SELECT version, trained_at, meta->'validation'->'results'->(meta->>'model') FROM {schema}.model_runs "
                         "ORDER BY trained_at DESC LIMIT 1").fetchone()
    meta = {
        "source": "postgis", "scenarioDate": scenario_day.isoformat(), "segments": len(segments), "zones": len(zones),
        "modelVersion": model[0] if model else None,
        "modelCv": {k: model[2].get(k) for k in ("roc_auc_mean", "roc_auc_std", "pr_auc_mean", "pr_auc_std")} if model and model[2] else None,
    }
    return {"segments": segments, "zones": zones, "holdingPoints": hps, "meta": meta}
