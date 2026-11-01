"""FR-22 automatic checks and FR-23/FR-26 routing. Port of src/domain/reportChecks.ts.
The free-text note is never read here (BR-10)."""
from __future__ import annotations

import math
from datetime import datetime
from typing import Callable, Optional

from .timeutil import parse_iso


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371
    d_lat = math.radians(b[0] - a[0])
    d_lon = math.radians(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(d_lon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def distance_to_corridor_km(point: tuple[float, float], segments: list[dict]) -> float:
    """Pure-Python fallback; the backend uses PostGIS ST_Distance on geography when a database is attached."""
    best = math.inf
    for s in segments:
        c = s["coordinates"]
        for i in range(len(c)):
            if i == len(c) - 1:
                best = min(best, distance_km(point, tuple(c[i])))
                continue
            for t in range(11):
                p = (c[i][0] + (c[i + 1][0] - c[i][0]) * t / 10, c[i][1] + (c[i + 1][1] - c[i][1]) * t / 10)
                best = min(best, distance_km(point, p))
    return best


def run_report_checks(
    report: dict,
    existing: list[dict],
    segments: list[dict],
    config: dict,
    now: datetime,
    corridor_distance: Optional[Callable[[float, float], float]] = None,
) -> dict:
    seg_known = any(s["id"] == report["segmentId"] for s in segments)
    distance = None
    if report.get("lat") is not None and report.get("lon") is not None:
        d = corridor_distance(report["lat"], report["lon"]) if corridor_distance else distance_to_corridor_km((report["lat"], report["lon"]), segments)
        distance = math.floor(d * 100 + 0.5) / 100
    inside = seg_known and (distance is None or distance <= config["corridorBufferKm"])

    age_minutes = max(0, int(math.floor((now - parse_iso(report["capturedAt"])).total_seconds() / 60 + 0.5)))
    recent = age_minutes <= config["reportMaxAgeMinutes"]

    captured = parse_iso(report["capturedAt"])
    window_s = config["duplicateWindowMinutes"] * 60

    def near(r: dict) -> bool:
        if None not in (report.get("lat"), report.get("lon"), r.get("lat"), r.get("lon")):
            return distance_km((report["lat"], report["lon"]), (r["lat"], r["lon"])) <= config["duplicateDistanceKm"]
        return r["segmentId"] == report["segmentId"]

    candidates = sorted(
        (r for r in existing
         if r["id"] != report["id"] and r["status"] != "rejected" and r["route"] != "flagged"
         and abs((parse_iso(r["capturedAt"]) - captured).total_seconds()) <= window_s and near(r)),
        key=lambda r: parse_iso(r["capturedAt"]),
    )
    first = candidates[0] if candidates else None
    checks = {
        "insideCorridor": inside,
        "distanceToCorridorKm": distance,
        "recent": recent,
        "ageMinutes": age_minutes,
        "groupId": first["checks"]["groupId"] if first else f"GRP-{report['id']}",
        "reporterReportCount": sum(1 for r in existing if r["reporterName"] == report["reporterName"]),
    }
    if first:
        checks["duplicateOf"] = first["id"]
    return checks


def route_report(checks: dict, ai: Optional[dict]) -> str:
    if not checks["insideCorridor"] or not checks["recent"]:
        return "flagged"
    if not ai:
        return "manual_review"
    if ai["hazardClass"] in ("clear", "not_relevant"):
        return "log_only"
    return "officer_queue"
