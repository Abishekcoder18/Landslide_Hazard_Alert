"""Rule-based Risk Index (FR-03..06, BR-05, BR-06, BR-12). Port of src/domain/riskIndex.ts. Not machine learning."""
from __future__ import annotations

from datetime import datetime, timedelta

from .decision_engine import js_round
from .timeutil import parse_iso, to_iso

SUSCEPTIBILITY_SCORE = {"Very Low": 0.1, "Low": 0.25, "Moderate": 0.5, "High": 0.75, "Very High": 1.0}
RAIN_SATURATION = {"h24": 100, "d3": 200, "d7": 300}
SLOPE_SATURATION_DEG = 45
HISTORY_SATURATION = 5
LEVEL_ORDER = ["GREEN", "YELLOW", "ORANGE", "RED"]
# Assumption, to calibrate: IMD Yellow/Orange -> at least Yellow, IMD Red -> at least Orange, GSI bulletin -> at least Orange.
IMD_FLOOR = {"YELLOW": "YELLOW", "ORANGE": "YELLOW", "RED": "ORANGE"}


def _max_level(a: str, b: str) -> str:
    return a if LEVEL_ORDER.index(a) >= LEVEL_ORDER.index(b) else b


def missing_inputs(inputs: dict) -> list[str]:
    missing = []
    if inputs.get("susceptibility") is None:
        missing.append("susceptibility")
    if inputs.get("slopeDeg") is None:
        missing.append("slope")
    if any(inputs.get(k) is None for k in ("rainfall24h", "rainfall3d", "rainfall7d")):
        missing.append("rainfall")
    if inputs.get("pastIncidents") is None:
        missing.append("past incidents")
    return missing


def _num(x) -> str:
    """Format like JavaScript template literals (no trailing .0)."""
    return str(int(x)) if float(x).is_integer() else str(x)


def compute_risk(inputs: dict, config: dict, now: datetime) -> dict:
    computed_at = to_iso(now)
    valid_until = to_iso(now + timedelta(hours=config["validityHours"]))

    missing = missing_inputs(inputs)
    age_hours = (now - parse_iso(inputs["updatedAt"])).total_seconds() / 3600
    if missing:
        return {"riskIndex": None, "riskLevel": "NO_DATA", "reasons": [f"Missing input: {', '.join(missing)}"], "computedAt": computed_at, "validUntil": valid_until}
    if not age_hours <= config["staleInputHours"]:
        return {"riskIndex": None, "riskLevel": "NO_DATA", "reasons": [f"Inputs stale ({int(age_hours // 1)} h old)"], "computedAt": computed_at, "validUntil": valid_until}

    w = config["weights"]
    pi = inputs["pastIncidents"]
    components = [
        (w["susceptibility"], SUSCEPTIBILITY_SCORE[inputs["susceptibility"]], f"GSI susceptibility {inputs['susceptibility']}"),
        (w["rainfall"], min(1.0, max(inputs["rainfall24h"] / RAIN_SATURATION["h24"], inputs["rainfall3d"] / RAIN_SATURATION["d3"], inputs["rainfall7d"] / RAIN_SATURATION["d7"])),
         f"Rain 24h {_num(inputs['rainfall24h'])} mm · 3d {_num(inputs['rainfall3d'])} mm"),
        (w["slope"], min(1.0, inputs["slopeDeg"] / SLOPE_SATURATION_DEG), f"Slope {_num(inputs['slopeDeg'])}°"),
        (w["history"], min(1.0, pi / HISTORY_SATURATION), f"{_num(pi)} past incident{'' if pi == 1 else 's'}"),
    ]
    total = sum(c[0] for c in components) or 1
    risk_index = js_round(sum(c[0] * c[1] for c in components) / total * 100)

    t = config["thresholds"]
    level = "RED" if risk_index >= t["red"] else "ORANGE" if risk_index >= t["orange"] else "YELLOW" if risk_index >= t["yellow"] else "GREEN"

    # Stable sort by contribution, descending (matches Array.prototype.sort stability).
    reasons = [c[2] for c in sorted(components, key=lambda c: -(c[0] * c[1]))[:3]]

    before = level
    imd = inputs.get("imdWarning", "NONE")
    if imd != "NONE":
        level = _max_level(level, IMD_FLOOR[imd])
    if inputs.get("gsiBulletin"):
        level = _max_level(level, "ORANGE")
    if level != before:
        reasons.insert(0, f"IMD {imd.lower()} warning (raised)" if imd != "NONE" else "GSI bulletin (raised)")
    elif imd != "NONE":
        reasons.append(f"IMD {imd.lower()} warning")

    return {"riskIndex": risk_index, "riskLevel": level, "reasons": reasons[:3], "computedAt": computed_at, "validUntil": valid_until}


def effective_risk_level(segment: dict, now: datetime) -> str:
    """BR-12: an expired Risk Level is treated as No data."""
    return "NO_DATA" if parse_iso(segment["validUntil"]) < now else segment["riskLevel"]


def apply_risk(segment: dict, config: dict, now: datetime) -> dict:
    return {**segment, **compute_risk(segment["inputs"], config, now)}
