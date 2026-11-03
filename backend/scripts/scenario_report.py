"""Replays the real corridor through the backend rules for given IMD rainfall dates (read only; nothing is saved).
Reports segments per Risk Level and approach-zone decisions per date.

Run (backend venv):  backend\\.venv\\Scripts\\python.exe backend\\scripts\\scenario_report.py 2022-03-20 2022-05-10 ...
"""
from __future__ import annotations

import collections
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import corridor_data as cd  # noqa: E402
from app.service import Workflow, new_state  # noqa: E402
from app.settings import settings  # noqa: E402
from app.store import Store  # noqa: E402

LEVELS = ["GREEN", "YELLOW", "ORANGE", "RED", "NO_DATA"]


def replay(conn, schema: str, day: date, now: datetime) -> dict:
    corridor = cd.load_corridor(conn, schema, day, now)
    if corridor is None:
        raise SystemExit("real corridor not loaded in PostGIS")
    state = new_state(now, corridor)
    wf = Workflow(state, lambda: now, "Asia/Kolkata")
    wf.recompute("scenario replay")
    lv = collections.Counter(s["riskLevel"] for s in state["segments"].values() if not s.get("offCorridor"))  # NH-27 only
    dec = collections.Counter(d["result"]["decision"] for d in state["decisions"].values())
    close = sum(1 for a in state["approvals"] if a["kind"] == "closure")
    return {"state": state, "levels": {k: lv.get(k, 0) for k in LEVELS}, "decisions": dict(dec), "close": close}


def main(argv: list[str]) -> int:
    days = [date.fromisoformat(a) for a in argv] or [date(2022, 3, 20), date(2022, 5, 10), date(2022, 5, 13), date(2022, 5, 15)]
    store = Store(settings.database_url, settings.db_schema)
    now = datetime.now(timezone.utc)
    with store.connect() as conn:
        print("| IMD rainfall date | Green | Yellow | Orange | Red | No data | Zones HOLD | Zones GO caution | Zones GO | CLOSE recommended |")
        print("|---|---|---|---|---|---|---|---|---|---|")
        for d in days:
            r = replay(conn, store.schema, d, now)
            L, D = r["levels"], r["decisions"]
            print(f"| {d} | {L['GREEN']} | {L['YELLOW']} | {L['ORANGE']} | {L['RED']} | {L['NO_DATA']} | {D.get('HOLD', 0)} | "
                  f"{D.get('GO_CAUTION', 0)} | {D.get('GO', 0)} | {r['close']} |")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
