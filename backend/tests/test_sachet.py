"""Phase 6: NDMA SACHET IMD warnings -> existing imdWarning input (BR-05 raise-only, BR-11 window closing).
Real samples: backend/inputs/sachet_sample.xml (CAP 1.2 message) and sachet_sample.json (live alert list, 3 Nov 2026).
The Dima Hasao records below are synthetic TEST FIXTURES (no real Dima Hasao alert was active when the samples were saved)."""
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app import sachet

INPUTS = Path(__file__).resolve().parents[1] / "inputs"
IST = ZoneInfo("Asia/Kolkata")
NOW = datetime(2026, 11, 3, 2, 0, tzinfo=IST)


def fixture(colour="orange", source="IMD Guwahati", kind="Heavy Rainfall", area="Cachar, Dima Hasao, Karbi Anglong",
            start="Tue Nov 03 00:00:00 IST 2026", end="Tue Nov 03 12:00:00 IST 2026", ident="TEST-1"):
    return {"identifier": ident, "alert_source": source, "disaster_type": kind, "area_description": area,
            "effective_start_time": start, "effective_end_time": end, "severity_color": colour}


def test_parse_real_cap_sample():
    cap = sachet.parse_cap((INPUTS / "sachet_sample.xml").read_text(encoding="utf-8"))
    assert cap["identifier"] == "IN-1793647807844041_41"
    assert cap["event"] == "Thunderstorm with Lightning" and cap["severity"] == "Moderate"
    assert cap["areas"][0]["areaDesc"] == "Pondicherry district of Puducherry"
    assert cap["areas"][0]["geocodes"]["LGD District Code"] == "600"
    assert cap["coversDimaHasao"] is False


def test_real_alert_list_has_no_dima_hasao_alert():
    alerts = json.loads((INPUTS / "sachet_sample.json").read_text(encoding="utf-8"))
    assert len(alerts) == 21 and all(a["severity_color"] in ("yellow", "orange", "red") for a in alerts)
    w = sachet.corridor_warning(alerts, NOW)
    assert w["imdWarning"] == "NONE" and w["alerts"] == []
    assert w["label"].startswith("SACHET · no active IMD alert")


def test_colour_area_source_type_and_time_rules():
    assert sachet.corridor_warning([fixture()], NOW)["imdWarning"] == "ORANGE"
    w = sachet.corridor_warning([fixture("yellow", ident="A"), fixture("red", ident="B")], NOW)
    assert w["imdWarning"] == "RED" and w["label"].startswith("SACHET B · IMD Guwahati · until 03 Nov 12:00")
    assert sachet.corridor_warning([fixture(area="Cachar, Karimganj")], NOW)["imdWarning"] == "NONE"  # not Dima Hasao
    assert sachet.corridor_warning([fixture(source="Some District Admin")], NOW)["imdWarning"] == "NONE"
    assert sachet.corridor_warning([fixture(kind="Heat Wave")], NOW)["imdWarning"] == "NONE"
    expired = fixture(start="Mon Nov 02 00:00:00 IST 2026", end="Mon Nov 02 12:00:00 IST 2026")
    assert sachet.corridor_warning([expired], NOW)["imdWarning"] == "NONE"
    assert sachet.corridor_warning([fixture(area="N.C. Hills")], NOW)["imdWarning"] == "ORANGE"


def test_time_format():
    assert sachet.parse_sachet_time("Tue Nov 03 01:00:00 IST 2026") == datetime(2026, 11, 3, 1, 0, tzinfo=IST)
    assert sachet.parse_sachet_time("garbage") is None
