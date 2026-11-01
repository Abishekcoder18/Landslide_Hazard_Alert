"""PostgreSQL + PostGIS persistence.
- Segments, zones, holding points and reports carry PostGIS geometry; the corridor distance check (FR-22) uses
  ST_Distance on geography.
- audit_log and decision_records are append-only, enforced by a trigger (FR-34, FR-18).
- Each request runs in one transaction under an advisory lock, so commands are serialised."""
from __future__ import annotations

import contextlib
from datetime import datetime
from typing import Callable, Iterator

import psycopg
from psycopg.types.json import Jsonb

from .domain.timeutil import parse_iso

SCHEMA = """
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS segments (
  id text PRIMARY KEY, pos int NOT NULL, geom geometry(LineString, 4326) NOT NULL, data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS segments_geom_idx ON segments USING gist (geom);

CREATE TABLE IF NOT EXISTS zones (
  id text PRIMARY KEY, pos int NOT NULL, geofence geography(Polygon, 4326) NOT NULL, data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS holding_points (
  id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY, pos int NOT NULL, geom geometry(Point, 4326), data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS incidents (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS decision_records (id text PRIMARY KEY, pos int NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id text PRIMARY KEY, pos int NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL);

CREATE OR REPLACE FUNCTION resilion_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION resilion_append_only();
DROP TRIGGER IF EXISTS decision_records_append_only ON decision_records;
CREATE TRIGGER decision_records_append_only BEFORE UPDATE OR DELETE ON decision_records FOR EACH ROW EXECUTE FUNCTION resilion_append_only();
"""

LOCK_KEY = 2740027  # advisory lock id for the corridor
MUTABLE_TABLES = {"incidents": "incidents", "approvals": "approvals", "alerts": "alerts"}


def _line_wkt(coords: list) -> str:
    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lat, lon in coords) + ")"


class Store:
    def __init__(self, dsn: str):
        self.dsn = dsn

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(self.dsn, autocommit=False)

    def init_schema(self) -> None:
        with self.connect() as conn:
            conn.execute(SCHEMA)
            conn.commit()

    def is_seeded(self, conn: psycopg.Connection) -> bool:
        return conn.execute("SELECT 1 FROM kv WHERE key = 'config'").fetchone() is not None

    def wipe(self, conn: psycopg.Connection) -> None:
        """Sample-data reset only (TRUNCATE bypasses the row-level append-only trigger by design)."""
        conn.execute("TRUNCATE kv, segments, zones, holding_points, reports, incidents, approvals, alerts, decision_records, audit_log")

    # ---------- load / save ----------
    def load(self, conn: psycopg.Connection) -> dict:
        kv = {k: v for k, v in conn.execute("SELECT key, data FROM kv").fetchall()}
        rows = lambda t: [r[0] for r in conn.execute(f"SELECT data FROM {t} ORDER BY pos DESC").fetchall()]  # noqa: E731
        segs = [r[0] for r in conn.execute("SELECT data FROM segments ORDER BY pos").fetchall()]
        zones = [r[0] for r in conn.execute("SELECT data FROM zones ORDER BY pos").fetchall()]
        hps = [r[0] for r in conn.execute("SELECT data FROM holding_points ORDER BY pos").fetchall()]
        return {
            "config": kv["config"],
            "seq": kv["seq"],
            "decisions": kv.get("decisions", {}),
            "overrides": kv.get("overrides", {}),
            "segments": {s["id"]: s for s in segs},
            "zones": zones,
            "holdingPoints": {h["id"]: h for h in hps},
            "reports": rows("reports"),
            "incidents": rows("incidents"),
            "approvals": rows("approvals"),
            "alerts": rows("alerts"),
            "decisionRecords": rows("decision_records"),
            "audit": rows("audit_log"),
        }

    def save(self, conn: psycopg.Connection, s: dict) -> None:
        for key in ("config", "seq", "decisions", "overrides"):
            conn.execute("INSERT INTO kv (key, data) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", (key, Jsonb(s[key])))
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO segments (id, pos, geom, data) VALUES (%s, %s, ST_GeomFromText(%s, 4326), %s) "
                "ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, geom = EXCLUDED.geom, data = EXCLUDED.data",
                [(sid, i, _line_wkt(seg["coordinates"]), Jsonb(seg)) for i, (sid, seg) in enumerate(s["segments"].items())],
            )
            cur.executemany(
                "INSERT INTO zones (id, pos, geofence, data) VALUES (%s, %s, "
                "ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)::geography, %s) "
                "ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, geofence = EXCLUDED.geofence, data = EXCLUDED.data",
                [(z["id"], i, z["center"][1], z["center"][0], z["extentKm"] * 1000, Jsonb(z)) for i, z in enumerate(s["zones"])],
            )
            cur.executemany(
                "INSERT INTO holding_points (id, pos, data) VALUES (%s, %s, %s) ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data",
                [(h["id"], i, Jsonb(h)) for i, h in enumerate(s["holdingPoints"].values())],
            )
            n = len(s["reports"])
            cur.executemany(
                "INSERT INTO reports (id, pos, geom, data) VALUES (%s, %s, "
                "CASE WHEN %s::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326) END, %s) "
                "ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data",
                [(r["id"], n - 1 - i, r.get("lon"), r.get("lon"), r.get("lat"), Jsonb(r)) for i, r in enumerate(s["reports"])],
            )
            for key, table in MUTABLE_TABLES.items():
                items = s[key]
                cur.executemany(
                    f"INSERT INTO {table} (id, pos, data) VALUES (%s, %s, %s) ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data",
                    [(x["id"], len(items) - 1 - i, Jsonb(x)) for i, x in enumerate(items)],
                )
            # Append-only tables: insert new rows only.
            for key, table in (("decisionRecords", "decision_records"), ("audit", "audit_log")):
                items = s[key]
                cur.executemany(
                    f"INSERT INTO {table} (id, pos, at, data) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                    [(x["id"], len(items) - 1 - i, parse_iso(x["at"]), Jsonb(x)) for i, x in enumerate(items)],
                )

    @contextlib.contextmanager
    def unit_of_work(self) -> Iterator[tuple[psycopg.Connection, dict]]:
        with self.connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_KEY,))
            state = self.load(conn)
            yield conn, state
            self.save(conn, state)
            conn.commit()

    @staticmethod
    def corridor_distance(conn: psycopg.Connection) -> Callable[[float, float], float]:
        """FR-22 inside-corridor check in PostGIS: shortest geodesic distance (km) to any segment."""
        def fn(lat: float, lon: float) -> float:
            row = conn.execute(
                "SELECT MIN(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)) / 1000.0 FROM segments",
                (lon, lat),
            ).fetchone()
            return float(row[0]) if row and row[0] is not None else float("inf")
        return fn


def now_utc() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc)
