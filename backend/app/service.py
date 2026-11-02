"""Workflow service — the backend implementation of docs/API_CONTRACT.md.
Port of src/api/mock/server.ts; operates on a plain state dict that app/store.py loads from and saves to PostGIS."""
from __future__ import annotations

import copy
import json
import re
import time
from datetime import date, datetime, timedelta
from typing import Callable, Optional
from zoneinfo import ZoneInfo

from .domain.alerts import apply_officer_edit, build_alert_texts, build_cap
from .domain.decision_engine import evaluate_approach_zone
from .domain.defaults import DEFAULT_CONFIG
from .domain.permissions import ROLE_LABEL, PermissionError_, assert_can, can_decide_approval
from .domain.report_checks import route_report, run_report_checks
from .domain.risk_index import apply_risk, effective_risk_level
from .domain.timeutil import ms, parse_iso, to_iso
from .seed import SEED_HOLDING_POINTS, seed_reports, seed_segments, seed_zones


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def clock_text(iso: str, tz: str) -> str:
    """Clock text for alerts, e.g. "4:00 PM", in the control room's time zone."""
    d = parse_iso(iso).astimezone(ZoneInfo(tz))
    h = d.hour % 12 or 12
    return f"{h}:{d.minute:02d} {'AM' if d.hour < 12 else 'PM'}"


def _open(i: dict) -> bool:
    return i["state"] != "reopened_full"


def new_state(now: datetime, corridor: Optional[dict] = None) -> dict:
    """`corridor` = real NH-27 data from PostGIS (app/corridor_data.load_corridor); None -> 12-segment sample seed."""
    config = copy.deepcopy(DEFAULT_CONFIG)
    if corridor:
        config["scenarioDate"] = corridor["meta"]["scenarioDate"]
        segs = {s["id"]: apply_risk(s, config, now) for s in corridor["segments"]}
        zones = copy.deepcopy(corridor["zones"])
        hps = {h["id"]: copy.deepcopy(h) for h in corridor["holdingPoints"]}
        meta = copy.deepcopy(corridor["meta"])
    else:
        segs = {s["id"]: apply_risk(s, config, now) for s in seed_segments(now)}
        zones = seed_zones(list(segs.values()), config["approachZoneExtentKm"])
        hps = {h["id"]: copy.deepcopy(h) for h in SEED_HOLDING_POINTS}
        meta = {"source": "sample"}
    return {
        "config": config,
        "segments": segs,
        "zones": zones,
        "holdingPoints": hps,
        "corridor": meta,
        "reports": [], "incidents": [], "approvals": [], "alerts": [],
        "decisions": {}, "decisionRecords": [], "audit": [], "overrides": {}, "seq": 0,
    }


FEED_FIELDS = ("susceptibility", "susceptibilityScore", "modelVersion", "slopeDeg", "rainfall24h", "rainfall3d", "rainfall7d",
               "rainfallDate", "pastIncidents", "sources")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
IMD_FIRST, IMD_LAST = date(2010, 1, 7), date(2025, 12, 31)  # 7-day totals need 6 earlier days of IMD data


class Workflow:
    """All commands mutate `self.s`. `new_alert_ids` lists alerts drafted in this unit of work (for the LLM pass)."""

    def __init__(self, state: dict, clock: Callable[[], datetime], tz: str = "Asia/Kolkata",
                 corridor_distance: Optional[Callable[[float, float], float]] = None,
                 feed: Optional[Callable[[str], dict]] = None):
        self.s = state
        self.clock = clock
        self.tz = tz
        self.corridor_distance = corridor_distance
        # Input feed for the real corridor: rainfall date (YYYY-MM-DD) -> {segment id: Risk Index inputs} from PostGIS.
        self.feed = feed
        self.s.setdefault("corridor", {"source": "sample"})
        self.new_alert_ids: list[str] = []

    # ---------- helpers ----------
    def now(self) -> datetime:
        return self.clock()

    def iso(self) -> str:
        return to_iso(self.now())

    def next_id(self, prefix: str) -> str:
        self.s["seq"] += 1
        return f"{prefix}-{self.s['seq']:04d}"

    @staticmethod
    def actor(session: dict) -> str:
        return f"{session['name']} ({ROLE_LABEL[session['role']]})"

    def audit(self, actor: str, role: str, action: str, details: str, **extra) -> None:
        # FR-34 append-only: entries are only ever added (also enforced by a database trigger).
        entry = {"id": self.next_id("AUD"), "at": self.iso(), "actor": actor, "role": role, "action": action, "details": details}
        entry.update({k: v for k, v in extra.items() if v is not None})
        self.s["audit"].insert(0, entry)

    def guard(self, session: dict, action: str) -> None:
        try:
            assert_can(session["role"], action)
        except PermissionError_ as e:
            self.audit(self.actor(session), session["role"], "Action refused", str(e))
            raise ApiError(str(e), 403) from e

    def segment(self, sid: str) -> dict:
        seg = self.s["segments"].get(sid)
        if not seg:
            raise ApiError(f"Unknown segment {sid}", 404)
        return seg

    def open_incident(self, sid: str) -> Optional[dict]:
        return next((i for i in self.s["incidents"] if i["segmentId"] == sid and _open(i)), None)

    def known_places(self) -> list[str]:
        names = [h["shortName"] for h in self.s["holdingPoints"].values()]
        for z in self.s["zones"]:
            for r in z.get("diversionRoutes") or []:
                if r["name"] not in names:
                    names.append(r["name"])
        return names

    # ---------- engine ----------
    @property
    def real(self) -> bool:
        return self.s.get("corridor", {}).get("source") == "postgis"

    def refresh_inputs(self, sids: list[str]) -> bool:
        """Re-read inputs from PostGIS for the configured rainfall date (keeps officer-set IMD warning / GSI bulletin)."""
        if not (self.real and self.feed and sids):
            return False
        fresh = self.feed(self.s["config"]["scenarioDate"])
        for sid in sids:
            if sid in fresh:
                seg = self.s["segments"][sid]
                seg["inputs"] = {**seg["inputs"], **{k: fresh[sid].get(k) for k in FEED_FIELDS}, "updatedAt": self.iso(), "sample": False}
        return True

    def apply_imd_feed(self, level: str, label: str) -> bool:
        """IMD warning from NDMA SACHET (app/sachet.py) -> the existing `imdWarning` input of every segment.
        The feed may raise an officer-set warning but never lowers it; it only clears warnings it set itself."""
        from .sachet import RANK
        if not self.real:
            return False
        changed = []
        for sid, seg in self.s["segments"].items():
            inp = seg["inputs"]
            cur, src = inp.get("imdWarning", "NONE"), inp.get("imdWarningSource") or ""
            feed_owned = src == "" or src.startswith("SACHET")
            if (feed_owned and (cur != level or src != label)) or RANK[level] > RANK.get(cur, 0):
                if cur != level:
                    changed.append(sid)
                inp["imdWarning"], inp["imdWarningSource"] = level, label
        if changed:
            now = self.now()
            for sid in changed:
                self.s["segments"][sid] = apply_risk(self.s["segments"][sid], self.s["config"], now)
            self.audit("Input feed", "system", "IMD warning updated", f"{level} · {label} · {len(changed)} segments")
            self.recompute("IMD warning (SACHET)")
        return bool(changed)

    def seed_initial(self) -> None:
        now = self.now()
        if self.real:
            m = self.s["corridor"]
            self.audit("System", "system", "Corridor data loaded",
                       f"NH-27 Dima Hasao · {m['segments']} segments · {m['zones']} approach zones · model {m.get('modelVersion')} · "
                       f"IMD rainfall {m['scenarioDate']}")
            self.recompute("Initial evaluation")
            return
        for r in seed_reports(now):
            checks = run_report_checks(r, self.s["reports"], list(self.s["segments"].values()), self.s["config"], now, self.corridor_distance)
            self.s["reports"].insert(0, {**r, "checks": checks, "route": route_report(checks, r["ai"]),
                                         "status": "corroborated" if checks.get("duplicateOf") else "unverified"})
        self.audit("System", "system", "Sample data loaded", "Initial corridor NH-27 Dima Hasao · sample inputs")
        self.recompute("Initial evaluation")

    def recompute(self, trigger: str, report_id: Optional[str] = None, report_ms: Optional[int] = None) -> None:
        """FR-09 / FR-18: evaluate every approach zone; append to the decision record when a decision changes."""
        now = self.now()
        effective = {k: {**v, "riskLevel": effective_risk_level(v, now)} for k, v in self.s["segments"].items()}
        for zone in self.s["zones"]:
            target = effective[zone["segmentId"]]
            inc = self.open_incident(zone["segmentId"])
            est = parse_iso(inc["reopeningEstimate"]) if inc and inc.get("reopeningEstimate") else None
            if zone["id"] in self.s["overrides"] and target["riskLevel"] != "ORANGE":
                del self.s["overrides"][zone["id"]]
            override = self.s["overrides"].get(zone["id"])
            kw = dict(now=now, reopening_estimate=est, officer_cleared_passage=bool(override))
            light = evaluate_approach_zone(zone, target, effective, self.s["holdingPoints"], vehicle_type="light", **kw)
            heavy = evaluate_approach_zone(zone, target, effective, self.s["holdingPoints"], vehicle_type="heavy", **kw)
            heavy_result = heavy if heavy["decision"] != light["decision"] else None

            prev = self.s["decisions"].get(zone["id"])
            changed = (
                prev is None
                or prev["result"]["decision"] != light["decision"]
                or prev["result"]["ruleId"] != light["ruleId"]
                or (prev["result"].get("holdingPoint") or {}).get("id") != (light.get("holdingPoint") or {}).get("id")
                or prev["result"]["windowClosing"] != light["windowClosing"]
                or (prev.get("heavyResult") or {}).get("decision") != (heavy_result or {}).get("decision")
            )
            at = self.iso() if changed else prev["at"]
            dec = {"zoneId": zone["id"], "segmentId": zone["segmentId"], "result": light, "at": at}
            if heavy_result:
                dec["heavyResult"] = heavy_result
            if override:
                dec["officerClearedPassage"] = override
            if changed:
                rec = {
                    "id": self.next_id("DEC"), "at": at, "zoneId": zone["id"], "segmentId": zone["segmentId"],
                    "decision": light["decision"], "ruleId": light["ruleId"],
                    "inputs": {"roadState": target["roadState"], "riskLevel": target["riskLevel"], "riskIndex": target["riskIndex"],
                               "imdWarning": target["inputs"]["imdWarning"]},
                    "windowClosing": light["windowClosing"], "closeRecommended": light["closeRecommended"], "trigger": trigger,
                    "heavyDecision": (heavy_result or {}).get("decision"),
                    "holdingPointId": (light.get("holdingPoint") or {}).get("id"),
                    "diversion": light["diversionCheck"].get("routeCandidateName") if light["diversionCheck"]["isOffered"] else None,
                    "expectedWaitMinutes": light.get("expectedWaitMinutes"),
                    "reportId": report_id, "reportToDecisionMs": report_ms,
                }
                self.s["decisionRecords"].insert(0, {k: v for k, v in rec.items() if v is not None})
            self.s["decisions"][zone["id"]] = dec

        # FR-12: CLOSE recommendation for officer approval.
        recommended = []
        for d in self.s["decisions"].values():
            if d["result"]["closeRecommended"] and d["segmentId"] not in recommended:
                recommended.append(d["segmentId"])
        for sid in recommended:
            pending = any(a["segmentId"] == sid and a["kind"] == "closure" and a["status"] in ("pending", "escalated") for a in self.s["approvals"])
            inc = self.open_incident(sid)
            already_closed = inc is not None and inc["state"] in ("closed", "clearance_in_progress")
            if not pending and not already_closed:
                seg = self.s["segments"][sid]
                ctype = "HEAVY_ONLY" if seg["roadState"] == "RESTRICTED_HEAVY" else "ONE_WAY" if seg["roadState"] == "RESTRICTED_ONE_WAY" else "FULL"
                self.create_approval(kind="closure", segmentId=sid, incidentId=inc["id"] if inc else None, closureType=ctype,
                                     reason=f"{seg['roadState']} · {effective[sid]['riskLevel']}")
        # A pending CLOSE recommendation is withdrawn once the rules no longer recommend it (e.g. rainfall fell).
        # Withdrawal is not an approval: only an officer can approve a closure (BR-08).
        for a in self.s["approvals"]:
            if a["kind"] == "closure" and a["status"] in ("pending", "escalated") and a["segmentId"] not in recommended:
                before = a["status"]
                a.update(status="withdrawn", decidedBy="Decision engine", decidedAt=self.iso())
                level = effective.get(a["segmentId"], {}).get("riskLevel", "—")
                self.audit("Decision engine", "system", "CLOSE recommendation withdrawn", f"{a['segmentId']} · {level}",
                           entity=a["id"], before=before, after="withdrawn")

    def create_approval(self, **a) -> dict:
        now = self.now()
        approval = {k: v for k, v in a.items() if v is not None}
        approval.update({"id": self.next_id("APR"), "status": "pending", "createdAt": to_iso(now),
                         "escalateAt": to_iso(now + timedelta(minutes=self.s["config"]["escalationMinutes"]))})
        self.s["approvals"].insert(0, approval)
        action = {"closure": "CLOSE recommended", "reopening": "Reopening requested"}.get(a["kind"], "Alert drafted")
        self.audit("Decision engine", "system", action, f"{a['segmentId']} · {a['reason']}", entity=approval["id"])
        return approval

    def tick(self) -> None:
        """FR-17 escalation and BR-12 expiry, evaluated on every read."""
        now = self.now()
        for a in self.s["approvals"]:
            if a["status"] == "pending" and parse_iso(a["escalateAt"]) <= now:
                a["status"] = "escalated"
                a["escalatedAt"] = to_iso(now)
                self.audit("System", "system", "Escalated to second approver",
                           f"{a['id']} not acted on within {self.s['config']['escalationMinutes']} min", entity=a["id"], before="pending", after="escalated")
        expired = [sid for sid, seg in self.s["segments"].items() if parse_iso(seg["validUntil"]) < now]
        if self.refresh_inputs(expired):
            self.audit("Input feed", "system", "Inputs refreshed",
                       f"{len(expired)} segments · PostGIS · IMD rainfall {self.s['config']['scenarioDate']}")
        for sid in expired:
            self.s["segments"][sid] = apply_risk(self.s["segments"][sid], self.s["config"], now)
        if expired:
            self.recompute("Risk Level validity expired (6 h)")

    # ---------- alerts ----------
    def alert_fields(self, sid: str, template: Optional[str] = None) -> dict:
        seg = self.s["segments"][sid]
        zones = [z for z in self.s["zones"] if z["segmentId"] == sid]
        decs = [self.s["decisions"][z["id"]] for z in zones]
        inc = self.open_incident(sid)
        any_divert = any(d["result"]["decision"] == "DIVERT" for d in decs)
        any_hold = any(d["result"]["decision"] == "HOLD" for d in decs)
        closed = seg["roadState"] == "BLOCKED" or any(d["result"]["closeRecommended"] for d in decs)
        t = template or (("DIVERT" if any_divert else "CLOSE") if closed else "HOLD" if any_hold else "CAUTION")
        confirmed = bool(inc) and any(next((r for r in self.s["reports"] if r["id"] == rid), {}).get("status") == "confirmed" for rid in inc["reportIds"])
        zf = []
        for z, d in zip(zones, decs):
            r = d["result"]
            entry = {"zoneId": z["id"], "direction": z["direction"], "decision": r["decision"]}
            place = (r.get("holdingPoint") or {}).get("shortName") if r["decision"] == "HOLD" else r["diversionCheck"].get("routeCandidateName") if r["decision"] == "DIVERT" else None
            if place:
                entry["place"] = place
            zf.append(entry)
        fields = {"segmentId": sid, "place": seg["name"], "template": t, "zones": zf,
                  "noSafeDiversion": any(d["result"]["decision"] == "HOLD" and d["result"]["closeRecommended"] for d in decs),
                  "certainty": "Observed" if confirmed else "Likely"}
        if inc and inc.get("reopeningEstimate") and t not in ("REOPEN", "CAUTION"):
            fields["reopeningEstimate"] = clock_text(inc["reopeningEstimate"], self.tz)
        return fields

    def create_alert(self, sid: str, template: Optional[str] = None) -> None:
        fields = self.alert_fields(sid, template)
        alert = {"id": self.next_id("ALR"), "createdAt": self.iso(), "segmentId": sid, "zoneIds": [z["zoneId"] for z in fields["zones"]],
                 "fields": fields, "texts": build_alert_texts(fields, self.known_places()), "status": "draft"}
        self.s["alerts"].insert(0, alert)
        inc = self.open_incident(sid)
        self.create_approval(kind="alert", segmentId=sid, alertId=alert["id"], incidentId=inc["id"] if inc else None, reason=f"{fields['template']} alert")
        self.new_alert_ids.append(alert["id"])

    def apply_generated_texts(self, alert_id: str, generated: dict, model: str) -> None:
        """FR-28 + BR-09: model output is validated; failures are blocked and the template is kept."""
        alert = next((a for a in self.s["alerts"] if a["id"] == alert_id), None)
        if not alert or alert["status"] != "draft":
            return
        alert["texts"] = build_alert_texts(alert["fields"], self.known_places(), generated)
        alert["writerModel"] = model  # "local:<model>" for the Ollama provider, the Claude model id otherwise
        blocked = [t["lang"] for t in alert["texts"] if t["lang"] != "dis" and t["blocked"]]
        self.audit("Alert writer", "system", "Alert texts generated",
                   f"{alert_id} · {model}" + (f" · blocked: {', '.join(blocked)}" if blocked else " · all validated"), entity=alert_id)

    # ---------- public API ----------
    def snapshot(self) -> dict:
        self.tick()
        s = self.s
        return copy.deepcopy({
            "serverTime": self.iso(),
            "segments": list(s["segments"].values()),
            "zones": s["zones"],
            "holdingPoints": list(s["holdingPoints"].values()),
            "decisions": [s["decisions"][z["id"]] for z in s["zones"]],
            "decisionRecords": s["decisionRecords"],
            "reports": s["reports"],
            "incidents": s["incidents"],
            "approvals": s["approvals"],
            "alerts": s["alerts"],
            "audit": s["audit"],
            "config": s["config"],
            "corridor": s.get("corridor", {"source": "sample"}),
        })

    def submit_report(self, session: dict, inp: dict, photo_url: str, ai: Optional[dict], ai_error: Optional[str],
                      created_at: Optional[datetime] = None, queued_at: Optional[datetime] = None) -> dict:
        """`ai` comes from the photo check run before this transaction (never decides state, BR-07)."""
        self.guard(session, "submit_report")
        self.segment(inp["segmentId"])
        created = to_iso(created_at or self.now())
        base = {
            "id": self.next_id("REP"), "createdAt": created, "capturedAt": inp.get("capturedAt") or created, "channel": "web",
            "reporterName": inp.get("reporterName") or session["name"], "reporterRole": session["role"],
            "segmentId": inp["segmentId"], "lat": inp.get("lat"), "lon": inp.get("lon"), "locationText": inp["locationText"],
            "photoUrl": photo_url,
            "note": inp.get("note", ""),  # BR-10: stored as data only.
        }
        checks = run_report_checks(base, self.s["reports"], list(self.s["segments"].values()), self.s["config"], self.now(), self.corridor_distance)
        route = route_report(checks, ai)
        report = {**base, "ai": ai, "checks": checks, "route": route,
                  "status": "corroborated" if checks.get("duplicateOf") else "unverified", "queuedAt": to_iso(queued_at or self.now())}
        if ai_error:
            report["aiError"] = ai_error
        self.s["reports"].insert(0, report)
        self.audit(self.actor(session), session["role"], "Report submitted", f"{report['id']} · {report['segmentId']} · {route}", entity=report["id"])
        if ai and route == "officer_queue":
            self.audit("Photo check", "system", "AI flag",
                       f"{report['segmentId']} flagged for officer review ({ai['hazardClass']}, {ai['blockedShare']}% blocked) · no state change", entity=report["id"])
        return copy.deepcopy(report)

    def confirm_report(self, session: dict, report_id: str, new_state: str) -> None:
        self.guard(session, "review_report")
        if new_state not in ("BLOCKED", "RESTRICTED_HEAVY", "RESTRICTED_ONE_WAY"):
            raise ApiError("Invalid road state")
        report = next((r for r in self.s["reports"] if r["id"] == report_id), None)
        if not report:
            raise ApiError("Report not found", 404)
        if report["status"] in ("confirmed", "rejected"):
            raise ApiError("Report already decided")
        if report["route"] in ("flagged", "log_only"):
            raise ApiError("Report is not in a review queue")
        confirmed_at = self.now()
        group = [r for r in self.s["reports"] if r["checks"]["groupId"] == report["checks"]["groupId"] and r["status"] in ("unverified", "corroborated")]
        seg = self.segment(report["segmentId"])
        before = f"{seg['roadState']} · {seg['riskLevel']}"
        seg["roadState"] = new_state
        inc = self.open_incident(seg["id"])
        if not inc:
            inc = {"id": self.next_id("INC"), "segmentId": seg["id"], "state": "verified", "openedAt": self.iso(), "reportIds": [], "equipment": [], "log": []}
            self.s["incidents"].insert(0, inc)
        elif inc["state"] == "reported":
            inc["state"] = "verified"
        for r in group:
            r.update(status="confirmed", decidedBy=self.actor(session), decidedAt=self.iso(), incidentId=inc["id"])
            if r["id"] not in inc["reportIds"]:
                inc["reportIds"].append(r["id"])
        inc["log"].append({"at": self.iso(), "by": self.actor(session), "text": f"{report['id']} confirmed · {new_state}"})
        self.audit(self.actor(session), session["role"], "Report confirmed", f"{', '.join(r['id'] for r in group)} → {seg['id']} {new_state}",
                   entity=report["id"], before=before, after=new_state)
        # SM3: upload -> decision ready, excluding officer think time (queue wait).
        t0 = time.perf_counter()
        self.recompute(f"Report {report['id']} confirmed", report_id=report["id"])
        engine_ms = (time.perf_counter() - t0) * 1000
        intake_ms = ms(parse_iso(report.get("queuedAt") or report["createdAt"])) - ms(parse_iso(report["createdAt"]))
        total = int(intake_ms + engine_ms + (ms(self.now()) - ms(confirmed_at)) + 0.5)
        for d in self.s["decisionRecords"]:
            if d.get("reportId") == report["id"]:
                d["reportToDecisionMs"] = total

    def reject_report(self, session: dict, report_id: str) -> None:
        self.guard(session, "review_report")
        report = next((r for r in self.s["reports"] if r["id"] == report_id), None)
        if not report:
            raise ApiError("Report not found", 404)
        if report["status"] in ("confirmed", "rejected"):
            raise ApiError("Report already decided")
        report.update(status="rejected", decidedBy=self.actor(session), decidedAt=self.iso())
        self.audit(self.actor(session), session["role"], "Report rejected", f"{report['id']} · no state change", entity=report["id"])

    def clear_passage(self, session: dict, zone_id: str) -> None:
        self.guard(session, "clear_passage")
        zone = next((z for z in self.s["zones"] if z["id"] == zone_id), None)
        if not zone:
            raise ApiError("Zone not found", 404)
        seg = self.segment(zone["segmentId"])
        if effective_risk_level(seg, self.now()) != "ORANGE" or seg["roadState"] != "OPEN":
            raise ApiError("Passage can be cleared only for an open Orange segment")
        self.s["overrides"][zone_id] = {"by": self.actor(session), "at": self.iso()}
        self.audit(self.actor(session), session["role"], "Passage cleared", f"{zone_id} · {seg['id']} Orange", entity=zone_id, before="HOLD", after="GO_CAUTION")
        self.recompute(f"Officer cleared passage {zone_id}")

    def draft_alert(self, session: dict, sid: str) -> None:
        self.guard(session, "approve_alert")
        self.segment(sid)
        if any(a["kind"] == "alert" and a["segmentId"] == sid and a["status"] in ("pending", "escalated") for a in self.s["approvals"]):
            raise ApiError("An alert for this segment is already awaiting approval")
        self.create_alert(sid)

    def decide_approval(self, session: dict, approval_id: str, approve: bool, closure_type: Optional[str] = None) -> None:
        a = next((x for x in self.s["approvals"] if x["id"] == approval_id), None)
        if not a:
            raise ApiError("Approval not found", 404)
        self.guard(session, "approve_alert" if a["kind"] == "alert" else "approve_closure")
        if not can_decide_approval(session["role"], a["status"]):
            what = "approve before escalation" if session["role"] == "second_approver" else "decide this approval"
            err = PermissionError_(session["role"], what)
            self.audit(self.actor(session), session["role"], "Action refused", str(err))
            raise ApiError(str(err), 403)
        a["decidedBy"] = self.actor(session)
        a["decidedAt"] = self.iso()
        if not approve:
            a["status"] = "rejected"
            alert = next((x for x in self.s["alerts"] if x["id"] == a.get("alertId")), None)
            if alert:
                alert["status"] = "rejected"
            self.audit(self.actor(session), session["role"], f"{a['kind']} rejected", f"{a['id']} · {a['segmentId']}", entity=a["id"])
            return
        a["status"] = "approved"
        seg = self.segment(a["segmentId"])
        if a["kind"] == "closure":
            ctype = closure_type or a.get("closureType") or "FULL"
            if ctype not in ("FULL", "HEAVY_ONLY", "ONE_WAY"):
                raise ApiError("Invalid closure type")
            a["closureType"] = ctype
            before = seg["roadState"]
            seg["roadState"] = {"FULL": "BLOCKED", "HEAVY_ONLY": "RESTRICTED_HEAVY", "ONE_WAY": "RESTRICTED_ONE_WAY"}[ctype]
            inc = self.open_incident(seg["id"])
            if not inc:
                inc = {"id": self.next_id("INC"), "segmentId": seg["id"], "state": "closed", "openedAt": self.iso(), "reportIds": [], "equipment": [], "log": []}
                self.s["incidents"].insert(0, inc)
            inc["state"] = "closed"
            inc["closureType"] = ctype
            inc["log"].append({"at": self.iso(), "by": self.actor(session), "text": f"Closure approved · {ctype}"})
            self.audit(self.actor(session), session["role"], "Closure approved", f"{seg['id']} · {ctype}", entity=a["id"], before=before, after=seg["roadState"])
            self.recompute(f"Closure {ctype} approved")
            self.create_alert(seg["id"])
        elif a["kind"] == "reopening":
            inc = next((i for i in self.s["incidents"] if i["id"] == a.get("incidentId")), None)
            before = seg["roadState"]
            full = a.get("reopenTo") == "full"
            seg["roadState"] = "OPEN" if full else "RESTRICTED_ONE_WAY"
            if inc:
                inc["state"] = "reopened_full" if full else "reopened_one_way"
                inc["log"].append({"at": self.iso(), "by": self.actor(session), "text": f"Reopening approved · {'full' if full else 'one-way'}"})
                if full:
                    inc.pop("reopeningEstimate", None)
            self.audit(self.actor(session), session["role"], "Reopening approved", f"{seg['id']} · {a.get('reopenTo')}", entity=a["id"], before=before, after=seg["roadState"])
            self.recompute(f"Reopening {a.get('reopenTo')} approved")
            self.create_alert(seg["id"], "REOPEN" if full else "CAUTION")
        else:
            alert = next((x for x in self.s["alerts"] if x["id"] == a.get("alertId")), None)
            if not alert:
                raise ApiError("Alert not found", 404)
            alert.update(status="approved", approvedBy=self.actor(session), approvedAt=self.iso())
            alert["capXml"] = build_cap(f"RESILION-{alert['id']}", self.now(), alert["fields"], alert["texts"],
                                        [z for z in self.s["zones"] if z["id"] in alert["zoneIds"]])
            self.audit(self.actor(session), session["role"], "Alert approved", f"{alert['id']} · {alert['fields']['template']} · CAP ready", entity=alert["id"])

    def update_incident(self, session: dict, incident_id: str, patch: dict) -> None:
        self.guard(session, "update_clearance")
        inc = next((i for i in self.s["incidents"] if i["id"] == incident_id), None)
        if not inc:
            raise ApiError("Incident not found", 404)
        by = self.actor(session)
        if patch.get("state") is not None:
            if patch["state"] != "clearance_in_progress":
                raise ApiError("Only clearance_in_progress can be set directly")
            if inc["state"] != "closed":
                raise ApiError("Clearance starts after closure")
            inc["state"] = "clearance_in_progress"
            inc["log"].append({"at": self.iso(), "by": by, "text": "Clearance in progress"})
        if patch.get("crew"):
            inc["crew"] = patch["crew"]
            inc["log"].append({"at": self.iso(), "by": by, "text": f"Crew dispatched · {patch['crew']['unitName']}"})
        if patch.get("equipment") is not None:
            inc["equipment"] = patch["equipment"]
            inc["log"].append({"at": self.iso(), "by": by, "text": f"Equipment · {len(patch['equipment'])} items"})
        if "reopeningEstimate" in patch:
            est = patch["reopeningEstimate"]
            if est:
                inc["reopeningEstimate"] = to_iso(parse_iso(est))
                inc["log"].append({"at": self.iso(), "by": by, "text": f"Reopening est. {clock_text(est, self.tz)}"})
            else:
                inc.pop("reopeningEstimate", None)
                inc["log"].append({"at": self.iso(), "by": by, "text": "Reopening estimate cleared"})
        self.audit(by, session["role"], "Incident updated", f"{inc['id']} · {', '.join(patch.keys())}", entity=inc["id"])
        self.recompute(f"Incident {inc['id']} updated")

    def request_reopening(self, session: dict, incident_id: str, to: str) -> None:
        self.guard(session, "update_clearance")
        if to not in ("one_way", "full"):
            raise ApiError("Invalid reopening target")
        inc = next((i for i in self.s["incidents"] if i["id"] == incident_id), None)
        if not inc:
            raise ApiError("Incident not found", 404)
        if inc["state"] not in ("closed", "clearance_in_progress", "reopened_one_way"):
            raise ApiError("Incident is not closed")
        if any(a["kind"] == "reopening" and a.get("incidentId") == inc["id"] and a["status"] in ("pending", "escalated") for a in self.s["approvals"]):
            raise ApiError("Reopening already awaiting approval")
        self.create_approval(kind="reopening", segmentId=inc["segmentId"], incidentId=inc["id"], reopenTo=to,
                             reason="Full reopening" if to == "full" else "One-way reopening")

    def edit_alert_text(self, session: dict, alert_id: str, lang: str, text: str) -> None:
        self.guard(session, "approve_alert")
        alert = next((a for a in self.s["alerts"] if a["id"] == alert_id), None)
        if not alert or alert["status"] != "draft":
            raise ApiError("Alert is not editable")
        idx = next((i for i, t in enumerate(alert["texts"]) if t["lang"] == lang), None)
        if idx is None:
            raise ApiError("Unknown language")
        updated = apply_officer_edit(alert["texts"][idx], text, alert["fields"], self.known_places())
        alert["texts"][idx] = updated
        detail = f"{alert['id']} · {lang}" + (f" · {'; '.join(updated['validation']['errors'])}" if updated["blocked"] else "")
        self.audit(self.actor(session), session["role"], "Alert edit blocked" if updated["blocked"] else "Alert edited", detail, entity=alert["id"])

    def update_config(self, session: dict, patch: dict) -> None:
        self.guard(session, "configure")
        before = json.dumps(self.s["config"])
        cfg = {**self.s["config"], **{k: v for k, v in patch.items() if k in DEFAULT_CONFIG}}
        new_day = patch.get("scenarioDate")
        if new_day is not None and new_day == self.s["config"].get("scenarioDate"):
            new_day = None  # unchanged (the form sends the whole configuration)
        if new_day is not None:
            if not self.real:
                raise ApiError("Rainfall date applies to the real corridor data only")
            try:
                if not (isinstance(new_day, str) and DATE_RE.fullmatch(new_day)):
                    raise ValueError
                d = date.fromisoformat(new_day)
            except ValueError as e:
                raise ApiError("Rainfall date must be YYYY-MM-DD") from e
            if not (IMD_FIRST <= d <= IMD_LAST):
                raise ApiError(f"Rainfall date must be between {IMD_FIRST} and {IMD_LAST} (IMD data loaded)")
            cfg["scenarioDate"] = new_day
        cfg["weights"] = {**self.s["config"]["weights"], **(patch.get("weights") or {})}
        cfg["thresholds"] = {**self.s["config"]["thresholds"], **(patch.get("thresholds") or {})}
        t = cfg["thresholds"]
        if not (t["yellow"] < t["orange"] < t["red"]):
            raise ApiError("Thresholds must increase: Yellow < Orange < Red")
        self.s["config"] = cfg
        self.audit(self.actor(session), session["role"], "Configuration changed", ", ".join(patch.keys()), before=before, after=json.dumps(cfg))
        if new_day is not None:
            self.s["corridor"]["scenarioDate"] = new_day
            self.refresh_inputs(list(self.s["segments"]))
        now = self.now()
        for sid in list(self.s["segments"]):
            self.s["segments"][sid] = apply_risk(self.s["segments"][sid], cfg, now)
        self.recompute("Configuration changed")

    def update_zone(self, session: dict, zone_id: str, patch: dict) -> None:
        self.guard(session, "configure")
        z = next((x for x in self.s["zones"] if x["id"] == zone_id), None)
        if not z:
            raise ApiError("Zone not found", 404)
        before = json.dumps({"extentKm": z["extentKm"], "fallback": z.get("fallbackHoldingPointIds")})
        if patch.get("extentKm") is not None:
            z["extentKm"] = patch["extentKm"]
        if patch.get("fallbackHoldingPointIds") is not None:
            z["fallbackHoldingPointIds"] = [i for i in patch["fallbackHoldingPointIds"] if i != z["nearestHoldingPointId"] and i in self.s["holdingPoints"]]
        self.audit(self.actor(session), session["role"], "Approach zone changed", zone_id, entity=zone_id, before=before,
                   after=json.dumps({"extentKm": z["extentKm"], "fallback": z.get("fallbackHoldingPointIds")}))
        self.recompute(f"Zone {zone_id} changed")

    def update_segment_inputs(self, session: dict, sid: str, patch: dict) -> None:
        self.guard(session, "configure")
        seg = self.segment(sid)
        before = f"{seg['riskLevel']} ({seg['riskIndex'] if seg['riskIndex'] is not None else '—'})"
        allowed = {"susceptibility", "slopeDeg", "rainfall24h", "rainfall3d", "rainfall7d", "pastIncidents", "imdWarning", "gsiBulletin"}
        # Only fields whose value actually changes count as an edit (clients may send the whole input set).
        clean = {k: v for k, v in patch.items() if k in allowed and seg["inputs"].get(k) != v}
        data_edit = bool(set(clean) - {"imdWarning", "gsiBulletin"})
        inputs = {**seg["inputs"], **clean, "updatedAt": self.iso()}
        if "imdWarning" in clean:
            inputs["imdWarningSource"] = "Officer"  # the SACHET feed never lowers an officer-set warning
        if "susceptibility" in clean:
            inputs["susceptibilityScore"] = None  # a manually set category replaces the model score
        if data_edit or not self.real:
            inputs["sample"] = True  # manual values are no longer the data source; shown as Sample data
            if self.real and any(k.startswith("rainfall") for k in clean):
                inputs.pop("rainfallDate", None)
        seg["inputs"] = inputs
        self.s["segments"][sid] = apply_risk(seg, self.s["config"], self.now())
        after = self.s["segments"][sid]
        self.audit(self.actor(session), session["role"], "Inputs updated", f"{sid} · {', '.join(patch.keys())}", entity=sid, before=before,
                   after=f"{after['riskLevel']} ({after['riskIndex'] if after['riskIndex'] is not None else '—'})")
        self.recompute(f"Inputs updated {sid}")
