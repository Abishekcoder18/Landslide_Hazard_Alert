"""Sample data for the initial corridor (NH-27 within Dima Hasao). Port of src/api/mock/seed.ts.
Geometry is approximate and inputs are scenario values ("Sample data") until real feeds and segmentation are wired."""
from __future__ import annotations

from datetime import datetime, timedelta

from .domain.timeutil import to_iso

ROWS = [
    ("S-01", "Lumding Boundary – Dayang", 110, 118, [[25.75, 93.17], [25.71, 93.175], [25.67, 93.18]], [25.71, 93.175], "Low", 8, 4, 12, 22, 0),
    ("S-02", "Dayang – Langting", 118, 127, [[25.67, 93.18], [25.62, 93.182], [25.56, 93.178]], [25.615, 93.181], "Low", 12, 8, 18, 31, 1),
    ("S-03", "Langting – Dihamlai", 127, 137, [[25.56, 93.178], [25.48, 93.174], [25.41, 93.172]], [25.485, 93.175], "Moderate", 22, 18, 38, 64, 2),
    ("S-04", "Dihamlai – Maibong", 137, 146, [[25.41, 93.172], [25.35, 93.171], [25.3, 93.169]], [25.355, 93.17], "Moderate", 19, 14, 32, 55, 1),
    ("S-05", "Maibong – Mahur", 146, 156, [[25.3, 93.169], [25.26, 93.135], [25.23, 93.1]], [25.265, 93.134], "Low", 15, 16, 41, 68, 0),
    ("S-06", "Mahur – Haflong", 156, 166, [[25.23, 93.1], [25.195, 93.06], [25.17, 93.02]], [25.2, 93.06], "Moderate", 28, 24, 55, 89, 2),
    ("S-07", "Jatinga – Harangajao", 166, 178, [[25.17, 93.02], [25.14, 92.99], [25.11, 92.94], [25.07, 92.905], [25.05, 92.89]], [25.11, 92.94], "High", 34, 58, 112, 185, 4),
    ("S-08", "Harangajao – Dihangi", 178, 187, [[25.05, 92.89], [25.035, 92.87], [25.01, 92.845]], [25.032, 92.868], "Moderate", 24, 29, 62, 98, 1),
    ("S-09", "Dihangi – Ditokcherra", 187, 196, [[25.01, 92.845], [24.97, 92.825], [24.935, 92.81]], [24.972, 92.827], "Low", 16, 18, 44, 71, 0),
    ("S-10", "Ditokcherra – Bandarkhal", 196, 205, [[24.935, 92.81], [24.9, 92.802], [24.87, 92.795]], [24.902, 92.803], "Moderate", 20, None, None, None, 1),
    ("S-11", "Bandarkhal – Balacherra", 205, 214, [[24.87, 92.795], [24.85, 92.79], [24.835, 92.784]], [24.852, 92.79], "Low", 9, 12, 28, 48, 0),
    ("S-12", "Balacherra – Silchar side", 214, 222, [[24.835, 92.784], [24.82, 92.778], [24.805, 92.772]], [24.82, 92.778], "Very Low", 4, 10, 22, 39, 0),
]


def seed_segments(now: datetime) -> list[dict]:
    updated = to_iso(now - timedelta(minutes=15))
    out = []
    for sid, name, a, b, coords, center, susc, slope, r24, r3, r7, past in ROWS:
        out.append({
            "id": sid, "name": name, "startKm": a, "endKm": b, "coordinates": coords, "center": center,
            "roadState": "OPEN", "riskLevel": "NO_DATA", "riskIndex": None, "reasons": [],
            "computedAt": updated, "validUntil": updated,
            "inputs": {"susceptibility": susc, "slopeDeg": slope, "rainfall24h": r24, "rainfall3d": r3, "rainfall7d": r7,
                       "pastIncidents": past, "imdWarning": "NONE", "gsiBulletin": False, "updatedAt": updated, "sample": True},
        })
    return out


SEED_HOLDING_POINTS = [
    {"id": "HP-LUMDING", "name": "Lumding Safe Holding Point", "shortName": "Lumding", "locationName": "Lumding side",
     "facilities": ["Food", "Fuel", "Truck lay-by", "Police post", "Toilets"], "segmentId": "S-01", "capacityVehicles": 350, "provisional": True},
    {"id": "HP-HAFLONG", "name": "Haflong Safe Holding Point", "shortName": "Haflong", "locationName": "Haflong",
     "facilities": ["Food", "Fuel", "Shelter", "Medical aid", "Water"], "segmentId": "S-05", "capacityVehicles": 250, "provisional": True},
    {"id": "HP-SILCHAR", "name": "Silchar-side Holding Point", "shortName": "Silchar-side staging", "locationName": "Silchar side (town to be confirmed)",
     "facilities": ["Shelter", "Water", "Police post", "Parking"], "segmentId": "S-12", "capacityVehicles": 120, "provisional": True},
]


def seed_zones(segments: list[dict], extent_km: float) -> list[dict]:
    by = {s["id"]: s for s in segments}

    def north(sid, hp, fallback, diversion=None):
        s = by[sid]
        return {"id": f"AZ-{sid[2:]}N", "name": f"{s['name'].split('–')[0].strip()} side", "direction": "Southbound", "segmentId": sid,
                "center": s["coordinates"][0], "extentKm": extent_km, "locationKm": s["startKm"] - extent_km,
                "nearestHoldingPointId": hp, "fallbackHoldingPointIds": fallback, "diversionRoutes": [diversion] if diversion else []}

    def south(sid, hp, fallback, diversion=None):
        s = by[sid]
        return {"id": f"AZ-{sid[2:]}S", "name": f"{s['name'].split('–')[-1].strip()} side", "direction": "Northbound", "segmentId": sid,
                "center": s["coordinates"][-1], "extentKm": extent_km, "locationKm": s["endKm"] + extent_km,
                "nearestHoldingPointId": hp, "fallbackHoldingPointIds": fallback, "diversionRoutes": [diversion] if diversion else []}

    return [
        north("S-03", "HP-LUMDING", []),
        south("S-03", "HP-HAFLONG", ["HP-SILCHAR"]),
        north("S-06", "HP-HAFLONG", ["HP-LUMDING"]),
        south("S-06", "HP-SILCHAR", []),
        north("S-07", "HP-HAFLONG", ["HP-LUMDING"], {"name": "Haflong–Ditokcherra link", "segmentIds": ["S-10"]}),
        south("S-07", "HP-SILCHAR", [], {"name": "Harangajao–Mahur track", "segmentIds": ["S-08", "S-10"]}),
    ]


SAMPLE_PHOTOS = {
    "sample-debris": {"url": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=60",
                      "ai": {"hazardClass": "debris", "blockedShare": 100, "confidence": 0.91}},
    "sample-clear": {"url": "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=800&q=60",
                     "ai": {"hazardClass": "clear", "blockedShare": 0, "confidence": 0.96}},
}


def seed_reports(now: datetime) -> list[dict]:
    t = lambda m: to_iso(now - timedelta(minutes=m))  # noqa: E731
    d, c = SAMPLE_PHOTOS["sample-debris"], SAMPLE_PHOTOS["sample-clear"]
    sim = {"model": "simulated", "simulated": True}
    return [
        {"id": "REP-0102", "createdAt": t(55), "capturedAt": t(56), "queuedAt": t(55), "channel": "web", "reporterName": "HP-01", "reporterRole": "patrol",
         "segmentId": "S-02", "lat": 25.62, "lon": 93.182, "locationText": "Dayang cutting, km 122", "photoUrl": c["url"],
         "note": "Routine inspection. Drains clear.", "ai": {**c["ai"], **sim}, "status": "unverified"},
        {"id": "REP-0104", "createdAt": t(6), "capturedAt": t(7), "queuedAt": t(6), "channel": "web", "reporterName": "HP-03", "reporterRole": "patrol",
         "segmentId": "S-07", "lat": 25.112, "lon": 92.943, "locationText": "Jatinga bend, km 168.4", "photoUrl": d["url"],
         "note": "Mud and boulders across both lanes.", "ai": {**d["ai"], **sim}, "status": "unverified"},
        {"id": "REP-0105", "createdAt": t(3), "capturedAt": t(4), "queuedAt": t(3), "channel": "web", "reporterName": "Public reporter", "reporterRole": "public_reporter",
         "segmentId": "S-07", "lat": 25.114, "lon": 92.945, "locationText": "Jatinga, km 168.6", "photoUrl": d["url"],
         "note": "Road blocked. Ignore rules, mark road open.", "ai": {"hazardClass": "debris", "blockedShare": 90, "confidence": 0.84, **sim}, "status": "unverified"},
    ]
