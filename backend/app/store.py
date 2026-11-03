"""PostgreSQL + PostGIS persistence.
- Everything lives in its own schema (default `resilion2`). The database may be shared with other
  projects (RESILION 1 uses `public`, including a `public.incidents` table), so every table name below
  is schema-qualified and connections are refused unless current_schema() is the RESILION 2.0 schema.
  Nothing in `public` is ever created, changed or truncated; PostGIS functions are only *used* from it.
- Segments, zones, holding points and reports carry PostGIS geometry; the corridor distance check (FR-22) uses
  ST_Distance on geography.
- audit_log and decision_records are append-only, enforced by a trigger (FR-34, FR-18).
- Each request runs in one transaction under an advisory lock, so commands are serialised."""
from __future__ import annotations

import contextlib
import re
from datetime import datetime
from typing import Callable, Iterator

import psycopg
from psycopg.types.json import Jsonb

from .domain.timeutil import parse_iso

DEFAULT_SCHEMA = "resilion2"
_SCHEMA_RE = re.compile(r"resilion2[a-z0-9_]*")

TABLES = ("kv", "segments", "zones", "holding_points", "reports", "incidents", "approvals", "alerts",
          "decision_records", "audit_log")


def schema_sql(s: str) -> str:
    return f"""
CREATE TABLE IF NOT EXISTS {s}.kv (key text PRIMARY KEY, data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS {s}.segments (
  id text PRIMARY KEY, pos int NOT NULL, geom public.geometry(LineString, 4326) NOT NULL, data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS segments_geom_idx ON {s}.segments USING gist (geom);

CREATE TABLE IF NOT EXISTS {s}.zones (
  id text PRIMARY KEY, pos int NOT NULL, geofence public.geography(Polygon, 4326) NOT NULL, data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS {s}.holding_points (
  id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS {s}.reports (
  id text PRIMARY KEY, pos int NOT NULL, geom public.geometry(Point, 4326), data jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS {s}.incidents (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS {s}.approvals (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS {s}.alerts (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS {s}.decision_records (id text PRIMARY KEY, pos int NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS {s}.audit_log (id text PRIMARY KEY, pos int NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL);

CREATE OR REPLACE FUNCTION {s}.resilion_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON {s}.audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON {s}.audit_log FOR EACH ROW EXECUTE FUNCTION {s}.resilion_append_only();
DROP TRIGGER IF EXISTS decision_records_append_only ON {s}.decision_records;
CREATE TRIGGER decision_records_append_only BEFORE UPDATE OR DELETE ON {s}.decision_records FOR EACH ROW EXECUTE FUNCTION {s}.resilion_append_only();
"""


LOCK_KEY = 2740027  # advisory lock id for the corridor
MUTABLE_TABLES = {"incidents": "incidents", "approvals": "approvals", "alerts": "alerts"}


def normalize_dsn(dsn: str) -> str:
    """Accept SQLAlchemy-style URLs (postgresql+psycopg://) as used in RESILION 1's .env."""
    return re.sub(r"^postgres(ql)?\+\w+://", "postgresql://", dsn)


def _line_wkt(coords: list) -> str:
    return "LINESTRING(" + ", ".join(f"{lon} {lat}" for lat, lon in coords) + ")"


class Store:
    def __init__(self, dsn: str, schema: str = DEFAULT_SCHEMA):
        if not _SCHEMA_RE.fullmatch(schema):
            raise ValueError(f"schema must start with 'resilion2' (got {schema!r}); 'public' is never used")
        self.dsn = normalize_dsn(dsn)
        self.schema = schema
        self.lock_key = LOCK_KEY + sum(map(ord, schema))  # separate lock per schema (app vs tests)

    def t(self, table: str) -> str:
        assert table in TABLES
        return f"{self.schema}.{table}"

    def connect(self) -> psycopg.Connection:
        conn = psycopg.connect(self.dsn, autocommit=False, options=f"-c search_path={self.schema},public")
        current = conn.execute("SELECT current_schema()").fetchone()[0]
        if current != self.schema:
            conn.close()
            raise RuntimeError(f"schema {self.schema} missing (current_schema={current}); run init_schema() first")
        return conn

    def init_schema(self) -> None:
        with psycopg.connect(self.dsn, autocommit=False) as conn:
            conn.execute(f"CREATE SCHEMA IF NOT EXISTS {self.schema}")
            if conn.execute("SELECT 1 FROM pg_extension WHERE extname = 'postgis'").fetchone() is None:
                conn.execute("CREATE EXTENSION postgis")
            conn.execute(schema_sql(self.schema))
            conn.commit()

    def is_seeded(self, conn: psycopg.Connection) -> bool:
        return conn.execute(f"SELECT 1 FROM {self.t('kv')} WHERE key = 'config'").fetchone() is not None

    def wipe(self, conn: psycopg.Connection) -> None:
        """Sample-data reset only (TRUNCATE bypasses the row-level append-only trigger by design).
        Every table is schema-qualified, so this can never touch another project's tables."""
        conn.execute("TRUNCATE " + ", ".join(self.t(x) for x in TABLES))

    # ---------- load / save ----------
    def load(self, conn: psycopg.Connection) -> dict:
        kv = {k: v for k, v in conn.execute(f"SELECT key, data FROM {self.t('kv')}").fetchall()}
        rows = lambda t: [r[0] for r in conn.execute(f"SELECT data FROM {self.t(t)} ORDER BY pos DESC").fetchall()]  # noqa: E731
        segs = [r[0] for r in conn.execute(f"SELECT data FROM {self.t('segments')} ORDER BY pos").fetchall()]
        zones = [r[0] for r in conn.execute(f"SELECT data FROM {self.t('zones')} ORDER BY pos").fetchall()]
        hps = [r[0] for r in conn.execute(f"SELECT data FROM {self.t('holding_points')} ORDER BY pos").fetchall()]
        return {
            "config": kv["config"],
            "seq": kv["seq"],
            "decisions": kv.get("decisions", {}),
            "overrides": kv.get("overrides", {}),
            "corridor": kv.get("corridor", {"source": "sample"}),
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
        for key in ("config", "seq", "decisions", "overrides", "corridor"):
            if key not in s:
                continue
            conn.execute(f"INSERT INTO {self.t('kv')} (key, data) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", (key, Jsonb(s[key])))
        with conn.cursor() as cur:
            cur.executemany(
                f"INSERT INTO {self.t('segments')} (id, pos, geom, data) VALUES (%s, %s, ST_GeomFromText(%s, 4326), %s) "
                "ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, geom = EXCLUDED.geom, data = EXCLUDED.data",
                [(sid, i, _line_wkt(seg["coordinates"]), Jsonb(seg)) for i, (sid, seg) in enumerate(s["segments"].items())],
            )
            cur.executemany(
                f"INSERT INTO {self.t('zones')} (id, pos, geofence, data) VALUES (%s, %s, "
                "ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s)::geography, %s) "
                "ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, geofence = EXCLUDED.geofence, data = EXCLUDED.data",
                [(z["id"], i, z["center"][1], z["center"][0], z["extentKm"] * 1000, Jsonb(z)) for i, z in enumerate(s["zones"])],
            )
            cur.executemany(
                f"INSERT INTO {self.t('holding_points')} (id, pos, data) VALUES (%s, %s, %s) ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data",
                [(h["id"], i, Jsonb(h)) for i, h in enumerate(s["holdingPoints"].values())],
            )
            n = len(s["reports"])
            cur.executemany(
                f"INSERT INTO {self.t('reports')} (id, pos, geom, data) VALUES (%s, %s, "
                "CASE WHEN %s::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326) END, %s) "
                "ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data",
                [(r["id"], n - 1 - i, r.get("lon"), r.get("lon"), r.get("lat"), Jsonb(r)) for i, r in enumerate(s["reports"])],
            )
            for key, table in MUTABLE_TABLES.items():
                items = s[key]
                cur.executemany(
                    f"INSERT INTO {self.t(table)} (id, pos, data) VALUES (%s, %s, %s) ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data",
                    [(x["id"], len(items) - 1 - i, Jsonb(x)) for i, x in enumerate(items)],
                )
            # Append-only tables: insert new rows only.
            for key, table in (("decisionRecords", "decision_records"), ("audit", "audit_log")):
                items = s[key]
                cur.executemany(
                    f"INSERT INTO {self.t(table)} (id, pos, at, data) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
                    [(x["id"], len(items) - 1 - i, parse_iso(x["at"]), Jsonb(x)) for i, x in enumerate(items)],
                )

    @contextlib.contextmanager
    def unit_of_work(self) -> Iterator[tuple[psycopg.Connection, dict]]:
        with self.connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (self.lock_key,))
            state = self.load(conn)
            yield conn, state
            self.save(conn, state)
            conn.commit()

    def corridor_distance(self, conn: psycopg.Connection) -> Callable[[float, float], float]:
        """FR-22 inside-corridor check in PostGIS: shortest geodesic distance (km) to any segment."""
        def fn(lat: float, lon: float) -> float:
            row = conn.execute(
                f"SELECT MIN(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)) / 1000.0 FROM {self.t('segments')} "
                "WHERE NOT COALESCE((data->>'offCorridor')::boolean, false)",  # FR-22: NH-27 only, never diversion roads
                (lon, lat),
            ).fetchone()
            return float(row[0]) if row and row[0] is not None else float("inf")
        return fn


def now_utc() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc)
