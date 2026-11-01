"""Decision engine (BR-01..BR-04, BR-06, BR-11). Port of src/domain/decisionEngine.ts."""
from __future__ import annotations

import math
from datetime import datetime
from typing import Optional


def js_round(x: float) -> int:
    """JavaScript Math.round (halves round up), for parity with the frontend."""
    return int(math.floor(x + 0.5))


def check_diversion_safety(segment_ids: list[str], segments: dict) -> dict:
    """BR-03: offered only if every segment is OPEN and Green/Yellow; No data makes it ineligible."""
    if not segment_ids:
        return {"isSafe": False, "details": "No candidate diversion route mapped for this sector."}
    for sid in segment_ids:
        seg = segments.get(sid)
        if not seg:
            return {"isSafe": False, "details": f"Diversion candidate links to unmapped segment {sid} -> rejected for safety.", "failingSegmentId": sid}
        name = f"{seg['name']} ({seg['id']})"
        if seg["riskLevel"] == "NO_DATA":
            return {"isSafe": False, "details": f"Route via {name} contains No-data segments -> not offered.", "failingSegmentId": sid}
        if seg["roadState"] == "BLOCKED":
            return {"isSafe": False, "details": f"Route via {name} is BLOCKED -> not offered.", "failingSegmentId": sid}
        if seg["roadState"] == "UNKNOWN":
            return {"isSafe": False, "details": f"Route via {name} has UNKNOWN road state -> not offered.", "failingSegmentId": sid}
        if seg["riskLevel"] in ("RED", "ORANGE"):
            return {"isSafe": False, "details": f"Route via {name} is evaluated as {seg['riskLevel']} risk -> not offered.", "failingSegmentId": sid}
        if seg["roadState"] != "OPEN":
            return {"isSafe": False, "details": f"Route via {name} has active restriction ({seg['roadState']}) -> not offered.", "failingSegmentId": sid}
    return {"isSafe": True, "details": f"All segments on diversion route ({', '.join(segment_ids)}) verified OPEN with Green/Yellow risk."}


def check_holding_point_eligibility(hp: Optional[dict], segments: dict) -> dict:
    """BR-04: eligible only while its own segment is OPEN and Green/Yellow."""
    if not hp:
        return {"isEligible": False, "reason": "No designated safe holding point linked to this approach zone."}
    host = segments.get(hp["segmentId"])
    if not host:
        return {"isEligible": False, "reason": f"Holding point host segment {hp['segmentId']} is unknown."}
    if host["roadState"] != "OPEN":
        return {"isEligible": False, "reason": f"Holding point {hp['name']} disabled: host segment {host['id']} state is {host['roadState']}."}
    if host["riskLevel"] not in ("GREEN", "YELLOW"):
        return {"isEligible": False, "reason": f"Holding point {hp['name']} disabled: host segment {host['id']} risk is elevated ({host['riskLevel']})."}
    return {"isEligible": True, "reason": f"Holding point verified safe: {hp['name']} on {host['id']} is OPEN and {host['riskLevel']} risk."}


def select_holding_point(zone: dict, segments: dict, holding_points: dict) -> tuple[Optional[dict], dict]:
    """BR-04: nearest point, else walk back through the zone's fallback chain."""
    chain = [zone["nearestHoldingPointId"], *(zone.get("fallbackHoldingPointIds") or [])]
    reasons: list[str] = []
    for hp_id in chain:
        hp = holding_points.get(hp_id)
        check = check_holding_point_eligibility(hp, segments)
        if check["isEligible"]:
            reason = f"{' '.join(reasons)} Fallback: {check['reason']}" if reasons else check["reason"]
            return hp, {"isEligible": True, "reason": reason}
        reasons.append(check["reason"])
    return None, {"isEligible": False, "reason": f"No eligible holding point. {' '.join(reasons)}"}


def evaluate_approach_zone(
    zone: dict,
    target: dict,
    segments: dict,
    holding_points: dict,
    *,
    vehicle_type: str = "all",
    officer_cleared_passage: bool = False,
    reopening_estimate: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> dict:
    """Most restrictive rule first (BR-02). Returns a DecisionResult dict (camelCase, as the frontend expects)."""
    hp, eligibility = select_holding_point(zone, segments, holding_points)
    hold_at = hp["locationName"] if hp else "No eligible holding point"

    diversion = {"isOffered": False, "details": "No candidate diversion available for this segment."}
    routes = zone.get("diversionRoutes") or []
    if routes:
        safety = check_diversion_safety(routes[0]["segmentIds"], segments)
        diversion = {"isOffered": safety["isSafe"], "routeCandidateName": routes[0]["name"], "details": safety["details"]}

    hold_wait = None
    if reopening_estimate is not None and now is not None:
        hold_wait = max(0, js_round((reopening_estimate.timestamp() - now.timestamp()) / 60))

    imd = (target.get("inputs") or {}).get("imdWarning")
    window_closing = target["riskLevel"] == "YELLOW" and imd in ("ORANGE", "RED")

    base = {
        "holdingEligibility": eligibility,
        "diversionCheck": diversion,
        "windowClosing": False,
        "closeRecommended": False,
    }
    if hp:
        base["holdingPoint"] = hp

    def out(**kw):
        r = {**base, **kw}
        return {k: v for k, v in r.items() if v is not None}

    sid, state, risk, name = target["id"], target["roadState"], target["riskLevel"], target["name"]

    if state == "BLOCKED" or risk == "RED":
        if diversion["isOffered"]:
            route = diversion["routeCandidateName"]
            return out(closeRecommended=True, decision="DIVERT", ruleId="R-BLOCKED-RED-DIVERT",
                       ruleExplanation=f"{sid} {state} / {risk}. Diversion {route} checked safe.",
                       actionText=f"Divert via {route}",
                       travellerAdvisory=f"Road ahead at {name} closed. Use diversion {route}.")
        return out(closeRecommended=True, decision="HOLD", ruleId="R-BLOCKED-RED-HOLD",
                   ruleExplanation=f"{sid} {state} / {risk}. {diversion['details']} HOLD: {eligibility['reason']}",
                   actionText=f"Hold at {hold_at}", expectedWaitMinutes=hold_wait,
                   travellerAdvisory=f"Hold at {hold_at}. Road ahead closed at {name}. No safe diversion.")

    if risk == "ORANGE" and officer_cleared_passage:
        return out(decision="GO_CAUTION", ruleId="R-ORANGE-OFFICER-CLEARED",
                   ruleExplanation=f"{sid} ORANGE risk. Passage cleared by officer (logged).",
                   actionText="GO with caution (officer-cleared passage)",
                   travellerAdvisory="Passage cleared by officer. Follow police directions.")
    if risk == "ORANGE":
        return out(decision="HOLD", ruleId="R-ORANGE-HOLD",
                   ruleExplanation=f"{sid} ORANGE risk. HOLD before entry. Officer may clear passage (logged).",
                   actionText=f"HOLD before entry at {hold_at}", expectedWaitMinutes=hold_wait,
                   travellerAdvisory=f"Hold at {hold_at} until the road ahead at {name} is cleared.")

    if state == "RESTRICTED_HEAVY":
        if vehicle_type == "heavy":
            return out(decision="HOLD", ruleId="R-RESTRICT-HEAVY-HOLD",
                       ruleExplanation=f"{sid} closed to heavy vehicles. Heavy vehicles HOLD.",
                       actionText=f"Heavy vehicles HOLD at {hold_at}", expectedWaitMinutes=hold_wait,
                       travellerAdvisory=f"Heavy vehicles hold at {hold_at}. Light vehicles proceed with caution.")
        return out(decision="GO_CAUTION", ruleId="R-RESTRICT-HEAVY-LIGHT-GO",
                   ruleExplanation=f"{sid} closed to heavy vehicles. Light vehicles GO with caution.",
                   actionText="GO with caution (light vehicles)",
                   travellerAdvisory=f"Light vehicles proceed with caution. Heavy vehicles hold at {hold_at}.")

    if state == "RESTRICTED_ONE_WAY":
        return out(decision="GO_CAUTION", ruleId="R-RESTRICT-ONEWAY",
                   ruleExplanation=f"{sid} one-way under police control.",
                   actionText="GO with caution (one-way, police control)",
                   travellerAdvisory="One-way passage under police control. Follow police directions.")

    if state == "UNKNOWN" or risk == "NO_DATA":
        return out(decision="GO_CAUTION", ruleId="R-NODATA-UNKNOWN",
                   ruleExplanation=f"{sid} UNKNOWN / No data. Treated as Yellow, never Green.",
                   actionText="GO with caution (No data)",
                   travellerAdvisory="Road status not confirmed. Drive with caution.")

    if risk == "YELLOW":
        return out(windowClosing=window_closing, decision="GO_CAUTION",
                   ruleId="R-YELLOW-WINDOW-CLOSING" if window_closing else "R-YELLOW-CAUTION",
                   ruleExplanation=(f"{sid} YELLOW with IMD heavy-rainfall warning. Window-closing flag (control room only)."
                                    if window_closing else f"{sid} YELLOW risk."),
                   actionText="GO with caution",
                   travellerAdvisory="Proceed with caution. Watch for falling stones on hill curves.")

    if risk == "GREEN" and state == "OPEN":
        return out(decision="GO", ruleId="R-GREEN-GO", ruleExplanation=f"{sid} GREEN and OPEN.",
                   actionText="GO", travellerAdvisory="Road open.")

    return out(decision="GO_CAUTION", ruleId="R-DEFAULT-SAFE", ruleExplanation=f"Default caution for {sid}.",
               actionText="GO with caution", travellerAdvisory="Drive with caution.")
