"""IMD warnings for the initial corridor from NDMA SACHET (public, no key).

Sources (checked 2026-11-03):
  RSS (CAP 1.2 items) : https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml
  Alert list (JSON)   : https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails
                        fields used: identifier, alert_source, disaster_type, area_description,
                        effective_start_time, effective_end_time, severity, severity_color (yellow/orange/red)
  CAP message (XML)   : https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=<id>

The IMD colour is taken only from SACHET's own `severity_color`; no mapping from CAP severity is invented.
An alert counts for the corridor when it is in effect now, comes from IMD or the Assam SDMA, is a rainfall /
thunderstorm / landslide type, and its area text names Dima Hasao (or N.C. Hills). The highest colour becomes the
EXISTING `imdWarning` input (BR-05 raise-only, BR-11 window closing) — the feed never lowers an officer-set warning.
GSI bulletins stay manual (no API; Dima Hasao not covered by GSI's 2025 bulletins, MRD EV-06).
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

FEED_URL = "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails"
RSS_URL = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"
CAP_NS = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}
AREA_RE = re.compile(r"dima\s*-?\s*hasao|north\s*cachar|n\.?\s*c\.?\s*hills", re.I)
SOURCE_RE = re.compile(r"^(imd\b|assam\s*sdma|asdma)", re.I)
TYPE_RE = re.compile(r"rain|thunder|cloudburst|landslide|cyclone", re.I)
COLOUR = {"yellow": "YELLOW", "orange": "ORANGE", "red": "RED"}
RANK = {"NONE": 0, "YELLOW": 1, "ORANGE": 2, "RED": 3}
IST = ZoneInfo("Asia/Kolkata")


def parse_sachet_time(s: str) -> Optional[datetime]:
    """'Tue Nov 03 01:00:00 IST 2026' -> aware datetime (IST)."""
    try:
        return datetime.strptime(s.replace(" IST ", " "), "%a %b %d %H:%M:%S %Y").replace(tzinfo=IST)
    except (ValueError, AttributeError):
        return None


def relevant(alert: dict, now: datetime) -> bool:
    start, end = parse_sachet_time(alert.get("effective_start_time", "")), parse_sachet_time(alert.get("effective_end_time", ""))
    return bool(
        start and end and start <= now <= end
        and AREA_RE.search(alert.get("area_description") or "")
        and SOURCE_RE.search(alert.get("alert_source") or "")
        and TYPE_RE.search(alert.get("disaster_type") or "")
        and (alert.get("severity_color") or "").lower() in COLOUR
    )


def corridor_warning(alerts: list[dict], now: datetime) -> dict:
    """Highest IMD colour among alerts in effect for Dima Hasao -> {imdWarning, label, alerts}."""
    hits = [a for a in alerts if relevant(a, now)]
    if not hits:
        return {"imdWarning": "NONE", "label": f"SACHET · no active IMD alert for Dima Hasao · {now.astimezone(IST):%d %b %H:%M}", "alerts": []}
    top = max(hits, key=lambda a: RANK[COLOUR[a["severity_color"].lower()]])
    end = parse_sachet_time(top["effective_end_time"])
    return {
        "imdWarning": COLOUR[top["severity_color"].lower()],
        "label": f"SACHET {top['identifier']} · {top['alert_source']} · until {end:%d %b %H:%M}",
        "alerts": [a["identifier"] for a in hits],
    }


def parse_cap(xml_text: str) -> dict:
    """CAP 1.2 message from SACHET -> the fields we use (for logging / tests). Colour is not part of CAP here."""
    root = ET.fromstring(xml_text)
    g = lambda path: (root.findtext(path, default="", namespaces=CAP_NS) or "").strip()  # noqa: E731
    areas = [{"areaDesc": (a.findtext("cap:areaDesc", default="", namespaces=CAP_NS) or "").strip(),
              "geocodes": {(gc.findtext("cap:valueName", default="", namespaces=CAP_NS) or "").strip():
                           (gc.findtext("cap:value", default="", namespaces=CAP_NS) or "").strip()
                           for gc in a.findall("cap:geocode", CAP_NS)}}
             for a in root.findall("cap:info/cap:area", CAP_NS)]
    return {
        "identifier": g("cap:identifier"), "sender": g("cap:sender"), "sent": g("cap:sent"), "msgType": g("cap:msgType"),
        "event": g("cap:info/cap:event"), "severity": g("cap:info/cap:severity"), "urgency": g("cap:info/cap:urgency"),
        "certainty": g("cap:info/cap:certainty"), "effective": g("cap:info/cap:effective"), "expires": g("cap:info/cap:expires"),
        "headline": g("cap:info/cap:headline"), "areas": areas,
        "coversDimaHasao": any(AREA_RE.search(a["areaDesc"]) for a in areas),
    }


def fetch_alerts(timeout: float = 20.0) -> list[dict]:
    import httpx
    r = httpx.get(FEED_URL, timeout=timeout, headers={"User-Agent": "RESILION-2.0 control room (initial corridor NH-27)"})
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise ValueError("unexpected SACHET response")
    return data
