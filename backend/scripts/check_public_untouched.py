"""Proves RESILION 2.0 never changes RESILION 1 data in the shared database (read only).

  snapshot:  python backend/scripts/check_public_untouched.py snapshot   -> backend/data/public_snapshot.json
  verify:    python backend/scripts/check_public_untouched.py verify     -> exit 1 if any table differs

Fingerprint per table in every non-RESILION-2.0 schema: row count + md5 of all rows (ordered by their text form),
plus the list of tables, columns, functions and triggers.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

REPO = Path(__file__).resolve().parents[2]
SNAP = REPO / "backend" / "data" / "public_snapshot.json"


def fingerprint() -> dict:
    load_dotenv(REPO / "backend" / ".env")
    dsn = re.sub(r"^postgres(ql)?\+\w+://", "postgresql://", os.environ["DATABASE_URL"])
    out: dict = {"tables": {}, "objects": {}}
    with psycopg.connect(dsn) as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        tables = conn.execute("""
            SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
              AND n.nspname NOT LIKE 'resilion2%' ORDER BY 1, 2""").fetchall()
        for schema, table in tables:
            q = f'SELECT count(*), md5(coalesce(string_agg(t::text, \'|\' ORDER BY t::text), \'\')) FROM "{schema}"."{table}" t'
            n, h = conn.execute(q).fetchone()
            out["tables"][f"{schema}.{table}"] = {"rows": n, "md5": h}
        out["objects"]["columns"] = [list(r) for r in conn.execute("""
            SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_schema NOT LIKE 'resilion2%'
            ORDER BY 1, 2, 3""").fetchall()]
        out["objects"]["functions"] = conn.execute("""
            SELECT count(*), md5(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ',' ORDER BY 1))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'resilion2%'""").fetchone()
        out["objects"]["triggers"] = [list(r) for r in conn.execute("""
            SELECT event_object_schema, event_object_table, trigger_name FROM information_schema.triggers
            WHERE event_object_schema NOT LIKE 'resilion2%' ORDER BY 1, 2, 3""").fetchall()]
    out["objects"]["functions"] = list(out["objects"]["functions"])
    return out


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "verify"
    fp = fingerprint()
    if mode == "snapshot":
        SNAP.parent.mkdir(parents=True, exist_ok=True)
        SNAP.write_text(json.dumps(fp, indent=1), encoding="utf-8")
        for k, v in fp["tables"].items():
            print(f"{k:40s} rows={v['rows']:>8} md5={v['md5']}")
        print(f"functions={fp['objects']['functions'][0]} triggers={len(fp['objects']['triggers'])} columns={len(fp['objects']['columns'])}")
        print("snapshot written", SNAP)
        return 0
    old = json.loads(SNAP.read_text(encoding="utf-8"))
    bad = [k for k in sorted(set(old["tables"]) | set(fp["tables"])) if old["tables"].get(k) != fp["tables"].get(k)]
    for part in ("columns", "functions", "triggers"):
        if old["objects"][part] != fp["objects"][part]:
            bad.append(f"<{part}>")
    print(f"checked {len(fp['tables'])} tables outside resilion2*: " + ("UNCHANGED" if not bad else f"CHANGED: {bad}"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
