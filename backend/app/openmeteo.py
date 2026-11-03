"""Open-Meteo rainfall for the real corridor (Phase 4). No key.

Two uses, both keyed to the same 0.25 deg rain cells the segments already use (`rainCellId`, centre lat/lon in
`imd_rain_cells`), so a segment's rainfall always comes from one cell whatever the source:

1. Historical (archive) - dates IMD gridded data does not cover (2026 onwards):
   https://archive-api.open-meteo.com/v1/archive  daily=precipitation_sum (ERA5 reanalysis family, mm/day),
   timezone Asia/Kolkata. Stored in `openmeteo_rain_daily(cell_id, day, rain_mm)` by scripts/fetch_openmeteo.py.
   IMD stays the source wherever the whole 7-day window is inside the IMD data (2010-2025).

2. Live - the configured rainfall date "live":
   https://api.open-meteo.com/v1/forecast  hourly=precipitation, past_days=7. Rolling 24 h / 3-day / 7-day totals
   ending at the last COMPLETED hour (forecast hours are never counted). Stored in `openmeteo_rain_live` with the
   fetch time; the segments' `updatedAt` is the fetch time, so if the feed stops, BR-06 turns the inputs stale.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import psycopg

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"
UA = "RESILION2/1.0 (https://github.com/Abishekcoder18/Landslide_Hazard_Alert)"
TZ = "Asia/Kolkata"
LIVE = "live"


def ensure_tables(conn: psycopg.Connection, schema: str) -> None:
    conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.openmeteo_rain_daily (
          cell_id text NOT NULL, day date NOT NULL, rain_mm real NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (cell_id, day));
        CREATE TABLE IF NOT EXISTS {schema}.openmeteo_rain_live (
          cell_id text PRIMARY KEY, rainfall24h real, rainfall3d real, rainfall7d real,
          last_hour timestamptz NOT NULL, fetched_at timestamptz NOT NULL);""")


def cells(conn: psycopg.Connection, schema: str) -> list[tuple[str, float, float]]:
    """Rain cells used by at least one NH-27 or diversion-road segment."""
    dv = ""
    if conn.execute("SELECT to_regclass(%s)", (f"{schema}.ref_diversion_segments",)).fetchone()[0] is not None:
        dv = f" UNION SELECT data->'features'->>'rainCellId' FROM {schema}.ref_diversion_segments"
    return conn.execute(
        f"SELECT c.cell_id, c.lat, c.lon FROM {schema}.imd_rain_cells c WHERE c.cell_id IN "
        f"(SELECT DISTINCT data->>'rainCellId' FROM {schema}.segment_features{dv}) ORDER BY c.cell_id").fetchall()


def _multi(cs: list[tuple[str, float, float]]) -> dict:
    return {"latitude": ",".join(f"{c[1]:.4f}" for c in cs), "longitude": ",".join(f"{c[2]:.4f}" for c in cs)}


def _as_list(js) -> list[dict]:
    return js if isinstance(js, list) else [js]  # one location -> object, several -> list (same order)


def fetch_archive(cs: list[tuple[str, float, float]], start: date, end: date, client: httpx.Client | None = None) -> list[tuple[str, date, float]]:
    """Daily precipitation per cell; days the archive has no value for yet are left out (never filled with 0)."""
    params = {**_multi(cs), "start_date": start.isoformat(), "end_date": end.isoformat(),
              "daily": "precipitation_sum", "timezone": TZ}
    c = client or httpx.Client(headers={"User-Agent": UA}, timeout=60)
    r = c.get(ARCHIVE, params=params)
    r.raise_for_status()
    out = []
    for (cell, _, _), loc in zip(cs, _as_list(r.json())):
        d = loc["daily"]
        for day, mm in zip(d["time"], d["precipitation_sum"]):
            if mm is not None:
                out.append((cell, date.fromisoformat(day), float(mm)))
    return out


def live_totals(hourly_time: list[str], hourly_mm: list, now: datetime) -> tuple[dict, datetime] | None:
    """Rolling totals ending at the last completed hour before `now` (local times from Open-Meteo, Asia/Kolkata).
    A window with any missing hour is None (not 0)."""
    tz = ZoneInfo(TZ)
    series = {datetime.fromisoformat(t).replace(tzinfo=tz): mm for t, mm in zip(hourly_time, hourly_mm)}
    # An hourly value at hh:00 is the precipitation of the PRECEDING hour, so it is complete once hh:00 has passed.
    done = [t for t in series if t <= now]
    if not done:
        return None
    last = max(done)

    def tot(hours: int):
        ts = [last - timedelta(hours=i) for i in range(hours)]
        vals = [series.get(t) for t in ts]
        return None if any(v is None for v in vals) else round(sum(vals), 1)

    return {"rainfall24h": tot(24), "rainfall3d": tot(72), "rainfall7d": tot(168)}, last


def fetch_live(cs: list[tuple[str, float, float]], now: datetime, client: httpx.Client | None = None) -> dict[str, dict]:
    params = {**_multi(cs), "hourly": "precipitation", "past_days": 7, "forecast_days": 1, "timezone": TZ}
    c = client or httpx.Client(headers={"User-Agent": UA}, timeout=60)
    r = c.get(FORECAST, params=params)
    r.raise_for_status()
    out = {}
    for (cell, _, _), loc in zip(cs, _as_list(r.json())):
        res = live_totals(loc["hourly"]["time"], loc["hourly"]["precipitation"], now)
        if res:
            out[cell] = {**res[0], "lastHour": res[1]}
    return out


def store_archive(conn: psycopg.Connection, schema: str, rows: list[tuple[str, date, float]]) -> int:
    ensure_tables(conn, schema)
    with conn.cursor() as cur:
        cur.executemany(f"INSERT INTO {schema}.openmeteo_rain_daily (cell_id, day, rain_mm) VALUES (%s, %s, %s) "
                        "ON CONFLICT (cell_id, day) DO UPDATE SET rain_mm = EXCLUDED.rain_mm, fetched_at = now()", rows)
    return len(rows)


def store_live(conn: psycopg.Connection, schema: str, totals: dict[str, dict], fetched_at: datetime) -> int:
    ensure_tables(conn, schema)
    with conn.cursor() as cur:
        cur.executemany(
            f"INSERT INTO {schema}.openmeteo_rain_live (cell_id, rainfall24h, rainfall3d, rainfall7d, last_hour, fetched_at) "
            "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (cell_id) DO UPDATE SET rainfall24h = EXCLUDED.rainfall24h, "
            "rainfall3d = EXCLUDED.rainfall3d, rainfall7d = EXCLUDED.rainfall7d, last_hour = EXCLUDED.last_hour, "
            "fetched_at = EXCLUDED.fetched_at",
            [(c, t["rainfall24h"], t["rainfall3d"], t["rainfall7d"], t["lastHour"], fetched_at) for c, t in totals.items()])
    return len(totals)


def read_live(conn: psycopg.Connection, schema: str) -> dict[str, dict]:
    if conn.execute("SELECT to_regclass(%s)", (f"{schema}.openmeteo_rain_live",)).fetchone()[0] is None:
        return {}
    rows = conn.execute(f"SELECT cell_id, rainfall24h, rainfall3d, rainfall7d, last_hour, fetched_at FROM {schema}.openmeteo_rain_live").fetchall()
    return {c: {"rainfall24h": a, "rainfall3d": b, "rainfall7d": d, "lastHour": lh.astimezone(timezone.utc), "fetchedAt": fa.astimezone(timezone.utc)}
            for c, a, b, d, lh, fa in rows}


def archive_totals(conn: psycopg.Connection, schema: str, day: date) -> dict[str, dict]:
    if conn.execute("SELECT to_regclass(%s)", (f"{schema}.openmeteo_rain_daily",)).fetchone()[0] is None:
        return {}
    rows = conn.execute(f"SELECT cell_id, day, rain_mm FROM {schema}.openmeteo_rain_daily WHERE day BETWEEN %s AND %s",
                        (day - timedelta(days=6), day)).fetchall()
    return window_totals(rows, day)


def window_totals(rows, day: date) -> dict[str, dict]:
    """24 h / 3-day / 7-day totals ending on `day`; None where any day of the window is missing."""
    by: dict[str, dict] = {}
    for cell, d, mm in rows:
        by.setdefault(cell, {})[d] = float(mm)

    def tot(s: dict, n: int):
        days = [day - timedelta(days=i) for i in range(n)]
        return round(sum(s[d] for d in days), 1) if all(d in s for d in days) else None

    return {c: {"rainfall24h": tot(s, 1), "rainfall3d": tot(s, 3), "rainfall7d": tot(s, 7)} for c, s in by.items()}
