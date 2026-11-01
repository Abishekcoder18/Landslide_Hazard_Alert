"""Alerts (FR-27..FR-31, BR-09). Port of src/domain/alerts.ts — templates, validator and CAP must match it exactly.
Place names and segment IDs stay in Roman script in every language (assumption, to confirm with district).
Dimasa (FR-29) is never generated."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from .timeutil import to_iso

ALERT_LANGUAGES = [
    {"code": "en", "label": "English", "capCode": "en-IN"},
    {"code": "hi", "label": "Hindi", "capCode": "hi-IN"},
    {"code": "as", "label": "Assamese", "capCode": "as-IN"},
    {"code": "bn", "label": "Bengali", "capCode": "bn-IN"},
    {"code": "dis", "label": "Dimasa", "capCode": "dis"},
]
LLM_LANGS = ("en", "hi", "as", "bn")

GLOSSARY = {
    "en": {
        "head": {"CLOSE": "NH-27 {seg} ({place}) CLOSED.", "RISK": "NH-27 {seg} ({place}) high landslide risk.", "CAUTION": "NH-27 {seg} ({place}) open with caution.", "REOPEN": "NH-27 {seg} ({place}) REOPENED."},
        "dir": {"Northbound": "Northbound", "Southbound": "Southbound"},
        "zone": {"HOLD": "{d}: HOLD at {p}.", "DIVERT": "{d}: DIVERT via {p}.", "GO_CAUTION": "{d}: GO with caution.", "GO": "{d}: GO."},
        "noDiversion": "No safe diversion.",
        "estimate": "Reopening est. {t}.",
        "forbidden": ["go now", "hurry", "quickly", "rush"],
    },
    "hi": {
        "head": {"CLOSE": "NH-27 {seg} ({place}) बंद (CLOSED)।", "RISK": "NH-27 {seg} ({place}) भूस्खलन का उच्च खतरा।", "CAUTION": "NH-27 {seg} ({place}) सावधानी के साथ खुला।", "REOPEN": "NH-27 {seg} ({place}) फिर से खुला (REOPENED)।"},
        "dir": {"Northbound": "उत्तर दिशा", "Southbound": "दक्षिण दिशा"},
        "zone": {"HOLD": "{d}: {p} पर रुकें (HOLD)।", "DIVERT": "{d}: {p} से वैकल्पिक मार्ग लें (DIVERT)।", "GO_CAUTION": "{d}: सावधानी से चलें (GO)।", "GO": "{d}: चलें (GO)।"},
        "noDiversion": "कोई सुरक्षित वैकल्पिक मार्ग नहीं।",
        "estimate": "खुलने का अनुमानित समय {t} (अनुमान)।",
        "forbidden": ["जल्दी", "तुरंत निकल", "go now"],
    },
    "as": {
        "head": {"CLOSE": "NH-27 {seg} ({place}) বন্ধ (CLOSED)।", "RISK": "NH-27 {seg} ({place}) ভূমিস্খলনৰ উচ্চ বিপদ।", "CAUTION": "NH-27 {seg} ({place}) সাৱধানে মুকলি।", "REOPEN": "NH-27 {seg} ({place}) পুনৰ মুকলি (REOPENED)।"},
        "dir": {"Northbound": "উত্তৰমুখী", "Southbound": "দক্ষিণমুখী"},
        "zone": {"HOLD": "{d}: {p} ত ৰওক (HOLD)।", "DIVERT": "{d}: {p} পথেৰে যাওক (DIVERT)।", "GO_CAUTION": "{d}: সাৱধানে যাওক (GO)।", "GO": "{d}: যাওক (GO)।"},
        "noDiversion": "কোনো সুৰক্ষিত বিকল্প পথ নাই।",
        "estimate": "মুকলি হোৱাৰ আনুমানিক সময় {t} (আনুমানিক)।",
        "forbidden": ["সোনকালে", "খৰকৈ", "go now"],
    },
    "bn": {
        "head": {"CLOSE": "NH-27 {seg} ({place}) বন্ধ (CLOSED)।", "RISK": "NH-27 {seg} ({place}) ভূমিধসের উচ্চ ঝুঁকি।", "CAUTION": "NH-27 {seg} ({place}) সতর্কতার সঙ্গে খোলা।", "REOPEN": "NH-27 {seg} ({place}) আবার খোলা (REOPENED)।"},
        "dir": {"Northbound": "উত্তরমুখী", "Southbound": "দক্ষিণমুখী"},
        "zone": {"HOLD": "{d}: {p}-এ থামুন (HOLD)।", "DIVERT": "{d}: {p} দিয়ে বিকল্প পথে যান (DIVERT)।", "GO_CAUTION": "{d}: সাবধানে চলুন (GO)।", "GO": "{d}: চলুন (GO)।"},
        "noDiversion": "কোনো নিরাপদ বিকল্প পথ নেই।",
        "estimate": "খোলার আনুমানিক সময় {t} (আনুমানিক)।",
        "forbidden": ["তাড়াতাড়ি", "দ্রুত", "go now"],
    },
}

KEYWORD = {"HOLD": "HOLD", "DIVERT": "DIVERT", "GO_CAUTION": "GO", "GO": "GO"}
HEAD_KEYWORD = {"CLOSE": "CLOSED", "DIVERT": "CLOSED", "REOPEN": "REOPENED"}
# re.ASCII: JavaScript \b treats non-Latin letters as non-word characters; Python must too.
TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\s?(AM|PM)?", re.IGNORECASE | re.ASCII)
HOLD_RE = re.compile(r"\bHOLD\b", re.ASCII)
DIVERT_RE = re.compile(r"\bDIVERT\b", re.ASCII)


def _fill(tpl: str, v: dict) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: v.get(m.group(1)) or "", tpl)


def _head_for(template: str) -> str:
    return {"REOPEN": "REOPEN", "CAUTION": "CAUTION", "HOLD": "RISK"}.get(template, "CLOSE")


def render_template(fields: dict, lang: str) -> str:
    g = GLOSSARY[lang]
    parts = [_fill(g["head"][_head_for(fields["template"])], {"seg": fields["segmentId"], "place": fields["place"]})]
    for z in fields["zones"]:
        parts.append(_fill(g["zone"][z["decision"]], {"d": g["dir"][z["direction"]], "p": z.get("place") or ""}))
    if fields.get("noSafeDiversion"):
        parts.append(g["noDiversion"])
    if fields.get("reopeningEstimate"):
        parts.append(_fill(g["estimate"], {"t": fields["reopeningEstimate"]}))
    return " ".join(parts)


def validate_alert(text: str, fields: dict, lang: str, known_places: list[str]) -> dict:
    g = GLOSSARY[lang]
    errors: list[str] = []
    lower = text.lower()
    if fields["segmentId"] not in text:
        errors.append(f"Segment {fields['segmentId']} missing")
    head_kw = HEAD_KEYWORD.get(fields["template"])
    if head_kw and head_kw not in text:
        errors.append(f"{head_kw} missing")
    for z in fields["zones"]:
        if g["dir"][z["direction"]] not in text:
            errors.append(f"{z['direction']} missing")
        if KEYWORD[z["decision"]] not in text:
            errors.append(f"{KEYWORD[z['decision']]} missing ({z['direction']})")
        if z.get("place") and z["place"] not in text:
            errors.append(f'Place "{z["place"]}" missing')
    if all(z["decision"] != "HOLD" for z in fields["zones"]) and HOLD_RE.search(text):
        errors.append("HOLD not in decision")
    if all(z["decision"] != "DIVERT" for z in fields["zones"]) and DIVERT_RE.search(text):
        errors.append("DIVERT not in decision")
    if fields.get("noSafeDiversion") and g["noDiversion"] not in text:
        errors.append('"No safe diversion" missing')

    times = [m.group(0) for m in TIME_RE.finditer(text)]
    est = fields.get("reopeningEstimate")
    if est:
        if est not in text:
            errors.append(f"Time {est} missing")
        for t in times:
            if t.strip() != est:
                errors.append(f"Unexpected time {t.strip()}")
    elif times:
        errors.append(f"Unexpected time {times[0].strip()}")

    allowed = {fields["place"], *[z["place"] for z in fields["zones"] if z.get("place")]}
    for p in known_places:
        if p not in allowed and not any(p in a for a in allowed) and p in text:
            errors.append(f'Place "{p}" not in decision')
    for f in g["forbidden"]:
        if f.lower() in lower:
            errors.append(f'Forbidden wording "{f}"')
    return {"ok": not errors, "errors": errors}


def build_alert_texts(fields: dict, known_places: list[str], generated: Optional[dict] = None) -> list[dict]:
    """`generated` holds language-model output; any text failing validation is blocked and the template is used (BR-09)."""
    generated = generated or {}
    out = []
    for lang in LLM_LANGS:
        cand = generated.get(lang)
        tpl = render_template(fields, lang)
        if cand is not None:
            v = validate_alert(cand, fields, lang, known_places)
            if v["ok"]:
                out.append({"lang": lang, "text": cand, "source": "llm", "validation": v, "blocked": False})
            else:
                out.append({"lang": lang, "text": tpl, "source": "template", "validation": v, "blocked": True})
            continue
        out.append({"lang": lang, "text": tpl, "source": "template", "validation": validate_alert(tpl, fields, lang, known_places), "blocked": False})
    out.append({"lang": "dis", "text": "", "source": "pending_translation", "validation": {"ok": False, "errors": ["Native-speaker template pending"]}, "blocked": True})
    return out


def apply_officer_edit(current: dict, text: str, fields: dict, known_places: list[str]) -> dict:
    if current["lang"] == "dis":
        return current
    lang = current["lang"]
    v = validate_alert(text, fields, lang, known_places)
    if v["ok"]:
        return {"lang": lang, "text": text, "source": "officer_edit", "validation": v, "blocked": False}
    return {"lang": lang, "text": render_template(fields, lang), "source": "template", "validation": v, "blocked": True}


def _xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def build_cap(identifier: str, sent: datetime, fields: dict, texts: list[dict], zones: list[dict], sender: Optional[str] = None) -> str:
    """FR-31 / AC-22 CAP 1.2. CLOSE/HOLD/DIVERT -> Severe, Immediate; certainty Observed (confirmed report) or Likely.
    Caution -> Moderate, Expected. Reopening -> Minor, Expected (assumption). Area = approach-zone geofence circles."""
    t = fields["template"]
    severe = t in ("CLOSE", "HOLD", "DIVERT")
    severity = "Severe" if severe else "Moderate" if t == "CAUTION" else "Minor"
    urgency = "Immediate" if severe else "Expected"
    certainty = "Observed" if t == "REOPEN" else fields["certainty"]
    sent_s = re.sub(r"\.\d{3}Z$", "+00:00", to_iso(sent))
    areas = "\n".join(
        f"      <area>\n        <areaDesc>{_xml(z['id'] + ' ' + z['name'])}</areaDesc>\n"
        f"        <circle>{z['center'][0]:.4f},{z['center'][1]:.4f} {z['extentKm']:.1f}</circle>\n      </area>"
        for z in zones
    )
    cap_code = {l["code"]: l["capCode"] for l in ALERT_LANGUAGES}
    infos = "\n".join(
        f"""  <info>
    <language>{cap_code[x['lang']]}</language>
    <category>Geo</category>
    <event>Hill road landslide hazard</event>
    <urgency>{urgency}</urgency>
    <severity>{severity}</severity>
    <certainty>{certainty}</certainty>
    <headline>{_xml(f"NH-27 {fields['segmentId']} {t}")}</headline>
    <description>{_xml(x['text'])}</description>
{areas}
  </info>"""
        for x in texts
        if x["lang"] != "dis" and x["text"]
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>{_xml(identifier)}</identifier>
  <sender>{_xml(sender or 'resilion-2.0@control-room.local')}</sender>
  <sent>{sent_s}</sent>
  <status>Actual</status>
  <msgType>{'Update' if t == 'REOPEN' else 'Alert'}</msgType>
  <scope>Public</scope>
{infos}
</alert>"""
