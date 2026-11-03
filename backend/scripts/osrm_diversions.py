"""Phase 8 - real diversion candidates for every NH-27 segment from OSRM (Docker), fed into the existing BR-03 check.

Data: Geofabrik north-eastern-zone-latest.osm.pbf (ODbL) in backend/data/raw/osrm/ (git-ignored).
Engine: ghcr.io/project-osrm/osrm-backend:v5.27.1, car profile, MLD.

For each segment X:
  1. OSM node pairs of X: OSRM route along NH-27 from X's first to last coordinate with annotations=nodes
     (baseline network), checked against X's length.
  2. Block X: osrm-customize with a segment-speed file setting speed 0 (impassable) on X's node pairs, both directions.
  3. Detour: southbound zone AZ-nnnS centre -> AZ-nnnN centre (2 km before / after X), northbound the reverse.
     The result must not use X's nodes (checked).
  4. Candidate = {name, segmentIds, source, distanceKm, durationMin, directKm, offCorridorKm, via}. segmentIds lists the
     NH-27 segments the detour uses, in order, plus "OFF-NH27" for the part off the corridor. The existing BR-03 check
     (decision_engine.check_diversion_safety) then decides: NH-27 parts must be OPEN and Green/Yellow, and the
     off-corridor part is not a mapped segment, so the check rejects it for safety ("links to unmapped segment") until
     those roads are mapped and assessed. Detours longer than MAX_DETOUR_KM are not offered at all.

Output: backend/inputs/diversions.json (committed; read by segment_nh27.py when it rebuilds zones) and ref_zones
updated in place (schema resilion2 only). Summary: docs/DIVERSIONS.md.

Run (Docker Desktop running):  backend\\.venv\\Scripts\\python.exe backend\\scripts\\osrm_diversions.py [--prepare] [--only NH27-DH-108]
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.settings import Settings  # noqa: E402
from app.store import normalize_dsn  # noqa: E402

DATA = ROOT / "backend" / "data" / "raw" / "osrm"
PBF = "north-eastern-zone-latest.osm.pbf"
BASE = "north-eastern-zone-latest.osrm"
IMAGE = "ghcr.io/project-osrm/osrm-backend:v5.27.1"
PORT = 5055
NAME = "resilion2-osrm"
OUT = ROOT / "backend" / "inputs" / "diversions.json"
DOC = ROOT / "docs" / "DIVERSIONS.md"
MAX_DETOUR_KM = 400.0
OFF = "OFF-NH27"


def docker(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    cmd = ["docker", "run", "--rm", "-v", f"{DATA}:/data", IMAGE, *args]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"{' '.join(args[:2])} failed:\n{r.stderr[-2000:]}")
    return r


def prepare() -> None:
    if not (DATA / PBF).exists():
        raise SystemExit(f"missing {DATA / PBF} (download from https://download.geofabrik.de/asia/india/)")
    t = time.time()
    docker("osrm-extract", "-p", "/opt/car.lua", f"/data/{PBF}")
    docker("osrm-partition", f"/data/{BASE}")
    docker("osrm-customize", f"/data/{BASE}")
    print(f"OSRM prepared in {time.time() - t:.0f} s")


def customize(speed_file: str | None) -> None:
    args = ["osrm-customize", f"/data/{BASE}"]
    if speed_file:
        args += ["--segment-speed-file", f"/data/{speed_file}"]
    docker(*args)


def start_router() -> None:
    stop_router()
    subprocess.run(["docker", "run", "-d", "--rm", "--name", NAME, "-p", f"{PORT}:5000", "-v", f"{DATA}:/data", IMAGE,
                    "osrm-routed", "--algorithm", "mld", "--max-table-size", "100", f"/data/{BASE}"],
                   capture_output=True, text=True, check=True)
    for _ in range(120):
        try:
            if httpx.get(f"http://localhost:{PORT}/nearest/v1/driving/93.0,25.1", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise SystemExit("osrm-routed did not start")


def stop_router() -> None:
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True, text=True)


def route(a: list[float], b: list[float]) -> dict | None:
    """a, b = [lat, lon]."""
    url = f"http://localhost:{PORT}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}"
    r = httpx.get(url, params={"overview": "full", "geometries": "geojson", "annotations": "nodes,distance", "steps": "true"}, timeout=60)
    js = r.json()
    if js.get("code") != "Ok":
        return None
    return js["routes"][0]


def nodes_of(rt: dict) -> list[int]:
    out: list[int] = []
    for leg in rt["legs"]:
        for n in leg["annotation"]["nodes"]:
            if not out or out[-1] != n:
                out.append(n)
    return out


def hav_km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def via_names(rt: dict, corridor_nodes: set[int]) -> str:
    """Main roads of the off-corridor part, by distance (OSM ref or name)."""
    dist: dict[str, float] = {}
    for leg in rt["legs"]:
        for st in leg["steps"]:
            label = (st.get("ref") or st.get("name") or "").split(";")[0].strip()
            if label and st["distance"] > 2000 and "NH27" not in label.replace(" ", "").replace("-", "").upper():
                dist[label] = dist.get(label, 0) + st["distance"]
    top = sorted(dist.items(), key=lambda kv: -kv[1])[:3]
    return ", ".join(k for k, _ in top) or "unnamed roads"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prepare", action="store_true", help="run osrm-extract/partition/customize first")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    if a.prepare or not (DATA / f"{BASE}.mldgr").exists():
        prepare()
    cfg = Settings()
    s = cfg.db_schema
    with psycopg.connect(normalize_dsn(cfg.database_url)) as conn:
        segs = [d for (d,) in conn.execute(f"SELECT data FROM {s}.ref_segments ORDER BY pos").fetchall()]
        zones = {d["id"]: d for (d,) in conn.execute(f"SELECT data FROM {s}.ref_zones ORDER BY pos").fetchall()}

    # 1. node pairs per segment on the baseline network
    customize(None)
    start_router()
    seg_nodes: dict[str, list[int]] = {}
    warn = []
    for g in segs:
        rt = route(g["coordinates"][0], g["coordinates"][-1])
        if not rt:
            warn.append(f"{g['id']}: no baseline route")
            continue
        ratio = rt["distance"] / max(1.0, g["lengthM"])
        if not 0.7 <= ratio <= 1.5:
            warn.append(f"{g['id']}: baseline route {rt['distance']:.0f} m vs segment {g['lengthM']:.0f} m")
        seg_nodes[g["id"]] = nodes_of(rt)
    corridor_nodes = {n: sid for sid, ns in seg_nodes.items() for n in ns}
    direct = {}
    for g in segs:
        n = g["id"].split("-")[-1]
        rt = route(zones[f"AZ-{n}S"]["center"], zones[f"AZ-{n}N"]["center"])
        direct[g["id"]] = rt["distance"] / 1000 if rt else None
    stop_router()

    # 2-4. block each segment, route around it
    result: dict[str, dict] = {}
    targets = [g for g in segs if not a.only or g["id"] in a.only]
    t0 = time.time()
    for k, g in enumerate(targets, 1):
        sid, n = g["id"], g["id"].split("-")[-1]
        ns = seg_nodes.get(sid)
        if not ns or len(ns) < 2:
            result[sid] = {"status": "no node pairs"}
            continue
        speed = DATA / "block.csv"
        speed.write_text("".join(f"{u},{v},0\n{v},{u},0\n" for u, v in zip(ns, ns[1:])), encoding="ascii")
        customize("block.csv")
        start_router()
        per_dir = {}
        for zid, a_, b_ in ((f"AZ-{n}S", f"AZ-{n}S", f"AZ-{n}N"), (f"AZ-{n}N", f"AZ-{n}N", f"AZ-{n}S")):
            rt = route(zones[a_]["center"], zones[b_]["center"])
            if not rt:
                per_dir[zid] = {"status": "no route"}
                continue
            rn = nodes_of(rt)
            if set(zip(rn, rn[1:])) & set(zip(ns, ns[1:])):
                per_dir[zid] = {"status": "block failed (route still uses the segment)"}
                continue
            used = []
            off_m = 0.0
            dists = [d for leg in rt["legs"] for d in leg["annotation"]["distance"]]
            for i, (u, v) in enumerate(zip(rn, rn[1:])):
                su, sv = corridor_nodes.get(u), corridor_nodes.get(v)
                if su and su == sv:
                    if not used or used[-1] != su:
                        used.append(su)
                else:
                    off_m += dists[i] if i < len(dists) else 0
                    if not used or used[-1] != OFF:
                        used.append(OFF)
            km = rt["distance"] / 1000
            per_dir[zid] = {"status": "ok" if km <= MAX_DETOUR_KM else f"too long (> {MAX_DETOUR_KM:.0f} km)",
                            "distanceKm": round(km, 1), "durationMin": round(rt["duration"] / 60),
                            "offCorridorKm": round(off_m / 1000, 1), "via": via_names(rt, set(corridor_nodes)),
                            "segmentIds": used}
        stop_router()
        result[sid] = {"status": "ok", "directKm": None if direct.get(sid) is None else round(direct[sid], 1), "zones": per_dir}
        el = time.time() - t0
        print(f"{k:3d}/{len(targets)} {sid}: " + "; ".join(f"{z} {v.get('distanceKm', '-')} km {v['status']}" for z, v in per_dir.items())
              + f"  [{el / k:.0f} s/segment]", flush=True)
    customize(None)  # leave the data in its unblocked state

    # write candidates (existing BR-03 shape: name + segmentIds; extra fields are informational)
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() and a.only else {}
    prev.update(result)
    OUT.write_text(json.dumps(prev, indent=1, ensure_ascii=False), encoding="utf-8")
    with psycopg.connect(normalize_dsn(cfg.database_url)) as conn:
        for sid, r in prev.items():
            for zid, z in (r.get("zones") or {}).items():
                routes = [candidate(z, r.get("directKm"))] if z.get("status") == "ok" else []
                conn.execute(f"UPDATE {s}.ref_zones SET data = jsonb_set(data, '{{diversionRoutes}}', %s) WHERE id = %s",
                             (Jsonb(routes), zid))
        conn.commit()
    write_doc(prev, segs, warn)
    print("wrote", OUT, DOC)
    return 0


def candidate(z: dict, direct_km) -> dict:
    extra = f" (+{z['distanceKm'] - direct_km:.0f} km)" if direct_km else ""
    return {"name": f"Detour via {z['via']}, {z['distanceKm']:.0f} km{extra}", "segmentIds": z["segmentIds"], "source": "OSRM",
            "distanceKm": z["distanceKm"], "durationMin": z["durationMin"], "offCorridorKm": z["offCorridorKm"], "directKm": direct_km}


def write_doc(res: dict, segs: list[dict], warn: list[str]) -> None:
    L = ["# Diversion candidates (Phase 8, OSRM)", "",
         f"Run {datetime.now().astimezone():%Y-%m-%d %H:%M %Z} by `backend/scripts/osrm_diversions.py`: OSRM {IMAGE.split(':')[-1]} "
         "(car profile, MLD) on the Geofabrik North-Eastern Zone extract (© OpenStreetMap contributors, ODbL). For every NH-27 "
         "segment the segment's own OSM edges are made impassable (`osrm-customize --segment-speed-file`, speed 0) and a route "
         "is requested from the approach zone 2 km before the segment to the one 2 km after it, in both directions.", "",
         "Candidates go into each approach zone's `diversionRoutes` and through the **existing BR-03 check** unchanged: the "
         "NH-27 parts must be OPEN and Green/Yellow, and the off-corridor part (`OFF-NH27`) is not a mapped, risk-assessed "
         f"segment, so BR-03 rejects it for safety. Detours over {MAX_DETOUR_KM:.0f} km are not stored as candidates. Result: "
         "the Decisions page now names the real detour and explains why it is not offered, and HOLD stays the action.", ""]
    rows = []
    for g in segs:
        r = res.get(g["id"], {})
        for zid, z in sorted((r.get("zones") or {}).items()):
            rows.append((g["id"], zid, r.get("directKm"), z))
    ok = [x for x in rows if x[3].get("status") == "ok"]
    L += [f"- Zones with a candidate: **{len(ok)} of {len(rows)}**; without: {len(rows) - len(ok)} "
          f"(reasons: {', '.join(sorted({x[3]['status'] for x in rows if x[3].get('status') != 'ok'})) or 'none'})"]
    if ok:
        km = sorted(x[3]["distanceKm"] for x in ok)
        L += [f"- Detour length: min {km[0]:.0f} km, median {km[len(km) // 2]:.0f} km, max {km[-1]:.0f} km "
              f"(direct NH-27 distance between the same two points ≈ 5 km)",
              f"- Candidates fully on NH-27 (would pass BR-03 when those segments are OPEN and Green/Yellow): "
              f"{sum(OFF not in x[3]['segmentIds'] for x in ok)}"]
    if warn:
        L += ["", "Baseline node matching warnings: " + "; ".join(warn)]
    L += ["", "| Segment | Zone | Direct km | Detour km | Minutes | Off NH-27 km | Via | Status |", "|---|---|---|---|---|---|---|---|"]
    for sid, zid, dk, z in rows:
        L.append(f"| {sid} | {zid} | {dk if dk is not None else '–'} | {z.get('distanceKm', '–')} | {z.get('durationMin', '–')} | "
                 f"{z.get('offCorridorKm', '–')} | {z.get('via', '–')} | {z['status']} |")
    DOC.write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
