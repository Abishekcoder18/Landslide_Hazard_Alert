"""Phase 4 - Open-Meteo rainfall into PostGIS (schema resilion2 only).

  archive (default): daily precipitation for the corridor's rain cells for dates the IMD gridded data does not cover
                     (default 2025-12-25 .. 5 days ago, so every 2026 date has a full 7-day window) ->
                     resilion2.openmeteo_rain_daily
  --live:            rolling 24 h / 3-day / 7-day totals to the last completed hour -> resilion2.openmeteo_rain_live
                     (the API server does this itself every RAIN_POLL_MINUTES when FEEDS_ENABLED=true and the
                     rainfall date is "live"; this flag is for a one-off check)
  --compare A B:     also fetch the archive for A..B (dates inside the IMD period) and print IMD vs Open-Meteo per day,
                     for the data inventory; stored in the same table (the app still uses IMD for those dates)

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\fetch_openmeteo.py [--start 2025-12-25] [--end YYYY-MM-DD] [--live]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import connect, schema  # noqa: E402

from app import openmeteo  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2025-12-25")
    ap.add_argument("--end", default=(date.today() - timedelta(days=5)).isoformat())
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--compare", nargs=2, metavar=("FROM", "TO"))
    a = ap.parse_args()
    s = schema()
    with connect() as conn:
        openmeteo.ensure_tables(conn, s)
        cs = openmeteo.cells(conn, s)
        print(f"{len(cs)} rain cells: {', '.join(c[0] for c in cs)}")
        if a.live:
            now = datetime.now(timezone.utc)
            t = openmeteo.fetch_live(cs, now)
            openmeteo.store_live(conn, s, t, now)
            for c, v in sorted(t.items()):
                print(f"  {c}: 24h {v['rainfall24h']} mm, 3d {v['rainfall3d']} mm, 7d {v['rainfall7d']} mm (to {v['lastHour']:%Y-%m-%d %H:%M %Z})")
        else:
            rows = openmeteo.fetch_archive(cs, date.fromisoformat(a.start), date.fromisoformat(a.end))
            n = openmeteo.store_archive(conn, s, rows)
            days = sorted({r[1] for r in rows})
            print(f"archive: {n} cell-days, {days[0] if days else '-'} .. {days[-1] if days else '-'}")
        if a.compare:
            f, t_ = date.fromisoformat(a.compare[0]), date.fromisoformat(a.compare[1])
            rows = openmeteo.fetch_archive(cs, f, t_)
            openmeteo.store_archive(conn, s, rows)
            imd = {(c, d): float(mm) for c, d, mm in conn.execute(
                f"SELECT cell_id, day, rain_mm FROM {s}.imd_rain_daily WHERE day BETWEEN %s AND %s", (f, t_)).fetchall()}
            print("cell, day, IMD mm, Open-Meteo mm")
            for c, d, mm in rows:
                print(f"{c}, {d}, {imd.get((c, d))}, {mm}")
        conn.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
