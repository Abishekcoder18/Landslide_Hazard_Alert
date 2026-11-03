"""Phase 8 - real diversion candidates from OSRM (Docker) as diversion-road segments, fed into the existing BR-03 check.

Data: Geofabrik north-eastern-zone-latest.osm.pbf (© OpenStreetMap contributors, ODbL) in backend/data/raw/osrm/
(git-ignored). Engine: ghcr.io/project-osrm/osrm-backend:v5.27.1, car profile, MLD. Prepare once (~1 min, ~2 GB RAM):
osrm-extract / osrm-partition / osrm-customize, then keep clean copies of the four files osrm-customize rewrites
(cell_metrics, datasource_names, geometry, mldgr) in data/raw/osrm/pristine/ - `--prepare` does all of this.

A. Detours (OSRM). For every NH-27 segment X: X's OSM node pairs come from a baseline route along X; the clean files
   are restored and osrm-customize applies a segment-speed file with speed 0 on X's node pairs (both directions); a
   route is requested from the approach zone 2 km before X to the one 2 km after it (southbound zone AZ-nnnS ->
   AZ-nnnN, northbound the reverse). A route that still uses X, or whose duration implies < 5 km/h (an edge OSRM
   could not drop), is not a detour. Raw results are cached in data/derived/osrm_detours.json.
B. Diversion-road segments. The off-NH-27 parts of all detours are cut into ~1 km segments `DV-nnnn`
   (`offCorridor: true`), shared between detours that use the same road (matched by OSM node pairs). Each zone's
   candidate = the ordered NH-27 and DV segment ids it uses.
C. Inputs for DV segments, same method as NH-27 (build_features / train_model rasters): slope P90 and model score
   within 100 m, landslides within 500 m, nearest IMD rain cell (<= 20 km). Outside the district rasters / rain grid
   the values are missing -> the segment is No data (BR-06) -> BR-03 does not offer that diversion.
D. Output: resilion2.ref_diversion_segments, ref_zones.diversionRoutes, backend/inputs/diversions.json (zone ->
   candidate, committed; segment_nh27.py keeps it when it rebuilds zones), docs/DIVERSIONS.md.

The app then runs the unchanged BR-03 check over the candidate's segments (OPEN, Green/Yellow, not No data).
Diversion-road segments are scored for BR-03 only: they are not in the NH-27 chainage (FR-09), list, KPIs or colouring.

Run (data venv):  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\osrm_diversions.py [--prepare] [--from-cache] [--only ID ...]
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402  (before rasterio: PROJ env fix)

import geopandas as gpd  # noqa: E402
import httpx  # noqa: E402
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402
from rasterio import features as rfeat  # noqa: E402
from pyproj import Transformer  # noqa: E402
from shapely import STRtree  # noqa: E402
from shapely.geometry import LineString, Point, mapping  # noqa: E402

DATA = C.RAW / "osrm"
PRISTINE = DATA / "pristine"
PBF = "north-eastern-zone-latest.osm.pbf"
BASE = "north-eastern-zone-latest.osrm"
CHANGED = ("cell_metrics", "datasource_names", "geometry", "mldgr")  # files osrm-customize rewrites
IMAGE = "ghcr.io/project-osrm/osrm-backend:v5.27.1"
PORT = 5055
NAME = "resilion2-osrm"
CACHE = C.DERIVED / "osrm_detours.json"
OUT = C.REPO / "backend" / "inputs" / "diversions.json"
DOC = C.REPO / "docs" / "DIVERSIONS.md"
PIECE_M = 1000.0
GAP_M = 300.0          # off-NH-27 bits shorter than this between two NH-27 parts are junction noise, not a road
MIN_KMH = 5.0
MATCH_M = 40.0         # an OSM edge belongs to an NH-27 segment when its midpoint is this close to the segment line
RAIN_CELL_MAX_KM = 20.0
SEG_BUFFER_M, LANDSLIDE_BUFFER_M = 100.0, 500.0


# ------------------------------------------------------------------ OSRM
def docker(*args: str) -> None:
    r = subprocess.run(["docker", "run", "--rm", "-v", f"{DATA}:/data", IMAGE, *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"{args[0]} failed:\n{r.stderr[-2000:]}")


def prepare() -> None:
    t = time.time()
    docker("osrm-extract", "-p", "/opt/car.lua", f"/data/{PBF}")
    docker("osrm-partition", f"/data/{BASE}")
    docker("osrm-customize", f"/data/{BASE}")
    PRISTINE.mkdir(exist_ok=True)
    for x in CHANGED:
        shutil.copy2(DATA / f"{BASE}.{x}", PRISTINE / f"{BASE}.{x}")
    print(f"OSRM prepared in {time.time() - t:.0f} s")


def restore() -> None:
    for x in CHANGED:
        shutil.copy2(PRISTINE / f"{BASE}.{x}", DATA / f"{BASE}.{x}")


def block(pairs: list[tuple[int, int]]) -> None:
    restore()
    (DATA / "block.csv").write_text("".join(f"{u},{v},0\n{v},{u},0\n" for u, v in pairs), encoding="ascii")
    docker("osrm-customize", f"/data/{BASE}", "--segment-speed-file", "/data/block.csv")


def start_router() -> None:
    stop_router()
    subprocess.run(["docker", "run", "-d", "--rm", "--name", NAME, "-p", f"{PORT}:5000", "-v", f"{DATA}:/data", IMAGE,
                    "osrm-routed", "--algorithm", "mld", f"/data/{BASE}"], capture_output=True, text=True, check=True)
    for _ in range(240):
        try:
            if httpx.get(f"http://localhost:{PORT}/nearest/v1/driving/93.0,25.1", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    raise SystemExit("osrm-routed did not start")


def stop_router() -> None:
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True, text=True)


def azimuth(p, q) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (p[0], p[1], q[0], q[1]))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


class Heading:
    """Local NH-27 heading at a point, for OSRM `bearings`: NH-27 is mapped as two one-way carriageways on long
    stretches, and without a heading OSRM may snap to the opposite carriageway (a U-turn loop of ~30 km)."""
    def __init__(self, segs: list[dict]):
        self.pts = [c for g in segs for c in g["coordinates"]]  # chainage order = southbound

    def at(self, p, southbound: bool) -> int:
        i = min(range(len(self.pts)), key=lambda k: (self.pts[k][0] - p[0]) ** 2 + (self.pts[k][1] - p[1]) ** 2)
        a, b = (self.pts[i], self.pts[i + 1]) if i + 1 < len(self.pts) else (self.pts[i - 1], self.pts[i])
        h = azimuth(a, b)
        return round(h if southbound else (h + 180) % 360) % 360


def route(a: list[float], b: list[float], bearings: tuple[int, int] | None = None) -> dict | None:
    """a, b = [lat, lon]; bearings = travel heading at a and at b (+/- 60 deg). Single leg; nodes / distances /
    coordinates aligned (overview=full)."""
    params = {"overview": "full", "geometries": "geojson", "annotations": "nodes,distance", "steps": "true"}
    if bearings:
        params["bearings"] = f"{bearings[0]},60;{bearings[1]},60"
    r = httpx.get(f"http://localhost:{PORT}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}", params=params, timeout=120)
    js = r.json()
    if js.get("code") != "Ok":
        return None
    rt = js["routes"][0]
    leg = rt["legs"][0]
    nodes, dist = leg["annotation"]["nodes"], leg["annotation"]["distance"]
    coords = rt["geometry"]["coordinates"]
    if len(coords) != len(nodes):
        return None
    steps = [{"d": st["distance"], "label": (st.get("ref") or st.get("name") or "").split(";")[0].strip()} for st in leg["steps"]]
    return {"distance": rt["distance"], "duration": rt["duration"], "nodes": nodes, "dist": dist,
            "coords": [[round(c[1], 6), round(c[0], 6)] for c in coords], "steps": steps}


def detours(segs: list[dict], zones: dict, only: list[str] | None) -> dict:
    restore()
    start_router()
    hd = Heading(segs)
    # Each segment's OSM edges, both carriageways: the direct NH-27 routes between every pair of approach zones
    # (southbound and northbound, with heading hints) are walked edge by edge and each edge is given to the NH-27
    # segment it lies on (midpoint within MATCH_M of the segment line, UTM). Routing 1 km from a segment's own end points
    # was unreliable: on dual carriageways and in hairpins the end points snap to side roads.
    seg_lines = gpd.GeoSeries([LineString([(c[1], c[0]) for c in g["coordinates"]]) for g in segs], crs=4326).to_crs(C.UTM)
    tree = STRtree(list(seg_lines))
    ids = [g["id"] for g in segs]
    to_utm = Transformer.from_crs(4326, C.UTM, always_xy=True)
    seg_pairs: dict[str, list] = {i: [] for i in ids}
    direct, warn = {}, []
    for g in segs:
        n = g["id"].split("-")[-1]
        for a_, b_, sb in ((f"AZ-{n}S", f"AZ-{n}N", True), (f"AZ-{n}N", f"AZ-{n}S", False)):
            o_, d_ = zones[a_]["center"], zones[b_]["center"]
            rt = route(o_, d_, (hd.at(o_, sb), hd.at(d_, sb)))
            if not rt:
                warn.append(f"{g['id']} {'southbound' if sb else 'northbound'}: no direct route")
                continue
            if sb:
                direct[g["id"]] = round(rt["distance"] / 1000, 1)
            for k in range(len(rt["nodes"]) - 1):
                (la1, lo1), (la2, lo2) = rt["coords"][k], rt["coords"][k + 1]
                x, y = to_utm.transform((lo1 + lo2) / 2, (la1 + la2) / 2)
                pt = Point(x, y)
                j = tree.nearest(pt)
                if seg_lines.iloc[j].distance(pt) <= MATCH_M:
                    seg_pairs[ids[j]].append((rt["nodes"][k], rt["nodes"][k + 1]))
    seg_pairs = {k: list(dict.fromkeys(v)) for k, v in seg_pairs.items()}
    for g in segs:
        if len(seg_pairs[g["id"]]) < 2:
            warn.append(f"{g['id']}: no OSM edges matched")
    stop_router()
    out = {"segPairs": seg_pairs, "direct": direct, "warn": warn, "routes": {}}
    targets = [g for g in segs if not only or g["id"] in only]
    t0 = time.time()
    for k, g in enumerate(targets, 1):
        sid, n = g["id"], g["id"].split("-")[-1]
        pairs = seg_pairs.get(sid) or []
        if not pairs:
            for z in (f"AZ-{n}S", f"AZ-{n}N"):
                out["routes"][z] = {"status": "no node pairs for the segment"}
            continue
        block(pairs)
        start_router()
        bad = set(pairs) | {(v, u) for u, v in pairs}
        for zid, a_, b_, sb in ((f"AZ-{n}S", f"AZ-{n}S", f"AZ-{n}N", True), (f"AZ-{n}N", f"AZ-{n}N", f"AZ-{n}S", False)):
            o_, d_ = zones[a_]["center"], zones[b_]["center"]
            rt = route(o_, d_, (hd.at(o_, sb), hd.at(d_, sb)))
            if not rt:
                out["routes"][zid] = {"status": "no route"}
            elif set(zip(rt["nodes"], rt["nodes"][1:])) & bad:
                out["routes"][zid] = {"status": "no detour (route still uses the segment)"}
            elif rt["duration"] > 3600 * (rt["distance"] / 1000) / MIN_KMH:
                out["routes"][zid] = {"status": "no detour (crosses an impassable edge)"}
            else:
                out["routes"][zid] = {"status": "ok", **rt}
        stop_router()
        print(f"{k:3d}/{len(targets)} {sid}: " + "; ".join(
            f"{z} {out['routes'][z].get('distance', 0) / 1000:.0f} km {out['routes'][z]['status']}" for z in (f"AZ-{n}S", f"AZ-{n}N"))
            + f"  [{(time.time() - t0) / k:.0f} s/segment]", flush=True)
    restore()
    return out


# ------------------------------------------------------------------ B. diversion-road segments
def build_segments(raw: dict) -> tuple[dict, dict]:
    """-> (DV segments {id: {...}}, candidates {zoneId: {...}})."""
    corridor = {}
    for sid, pairs in raw["segPairs"].items():
        for u, v in pairs:
            corridor[(u, v)] = corridor[(v, u)] = sid
    owner: dict[tuple[int, int], str] = {}
    dv: dict[str, dict] = {}
    cands: dict[str, dict] = {}

    def label_at(steps, dist_m):
        acc = 0.0
        for st in steps:
            acc += st["d"]
            if acc >= dist_m:
                return st["label"]
        return steps[-1]["label"] if steps else ""

    for zid in sorted(raw["routes"]):
        r = raw["routes"][zid]
        if r.get("status") != "ok":
            cands[zid] = {"status": r.get("status", "no route")}
            continue
        nodes, dist, coords = r["nodes"], r["dist"], r["coords"]
        cls = [corridor.get((u, v)) for u, v in zip(nodes, nodes[1:])]
        i = 0
        while i < len(cls):  # short off-NH-27 gaps between two NH-27 parts are junction noise
            if cls[i] is None:
                j = i
                while j < len(cls) and cls[j] is None:
                    j += 1
                if 0 < i and j < len(cls) and sum(dist[i:j]) < GAP_M:
                    for k in range(i, j):
                        cls[k] = cls[i - 1]
                i = j
            else:
                i += 1
        used: list[str] = []
        piece: list[int] = []
        cum = np.concatenate([[0.0], np.cumsum(dist)])

        def add(x):
            if not used or used[-1] != x:
                used.append(x)

        def flush():
            if not piece:
                return
            sid_ = f"DV-{len(dv) + 1:04d}"
            pts = [coords[piece[0]]] + [coords[k + 1] for k in piece]
            mid = (cum[piece[0]] + cum[piece[-1] + 1]) / 2
            road = label_at(r["steps"], mid) or "unnamed road"
            line = LineString([(p[1], p[0]) for p in pts]).simplify(0.0001)
            dv[sid_] = {"id": sid_, "name": f"{road} (diversion road)", "road": road,
                        "lengthM": round(float(sum(dist[k] for k in piece)), 1),
                        "coordinates": [[round(y, 6), round(x, 6)] for x, y in line.coords], "firstSeenIn": zid}
            for k in piece:
                owner[(nodes[k], nodes[k + 1])] = owner[(nodes[k + 1], nodes[k])] = sid_
            add(sid_)
            piece.clear()

        for k, c in enumerate(cls):
            pair = (nodes[k], nodes[k + 1])
            if c is not None:
                flush()
                add(c)
            elif pair in owner:
                flush()
                add(owner[pair])
            else:
                piece.append(k)
                if sum(dist[x] for x in piece) >= PIECE_M:
                    flush()
        flush()
        off_m = sum(d for d, c in zip(dist, cls) if c is None)
        labels: dict[str, float] = {}
        for st in r["steps"]:
            if st["label"] and st["d"] > 2000 and "NH27" not in st["label"].replace(" ", "").replace("-", "").upper():
                labels[st["label"]] = labels.get(st["label"], 0) + st["d"]
        via = ", ".join(k for k, _ in sorted(labels.items(), key=lambda kv: -kv[1])[:3]) or "unnamed roads"
        cands[zid] = {"status": "ok", "distanceKm": round(r["distance"] / 1000, 1), "durationMin": round(r["duration"] / 60),
                      "offCorridorKm": round(off_m / 1000, 1), "via": via, "segmentIds": used}
    for s in dv.values():
        s["center"] = s["coordinates"][len(s["coordinates"]) // 2]
    return dv, cands


# ------------------------------------------------------------------ C. inputs for DV segments
def dv_features(dv: dict, conn) -> None:
    feats = rasterio.open(C.DERIVED / "features_30m.tif")
    susc = rasterio.open(C.DERIVED / "susceptibility_30m.tif")
    slope = feats.read(list(feats.descriptions).index("slope") + 1)
    pct = susc.read(1)
    T, inv = feats.transform, ~feats.transform
    H, W = slope.shape
    ls = gpd.read_file(C.DERIVED / "landslides_dh.geojson").to_crs(C.UTM)
    cells = conn.execute(f"SELECT cell_id, lat, lon FROM {C.schema()}.imd_rain_cells").fetchall()
    cg = gpd.GeoDataFrame({"cell_id": [c[0] for c in cells]}, geometry=[Point(c[2], c[1]) for c in cells], crs=4326).to_crs(C.UTM)
    lines = gpd.GeoSeries([LineString([(p[1], p[0]) for p in s["coordinates"]]) for s in dv.values()], crs=4326).to_crs(C.UTM)
    for s, line in zip(dv.values(), lines):
        buf = line.buffer(SEG_BUFFER_M)
        x0, y0, x1, y1 = buf.bounds
        c0, r0 = (int(v) for v in inv * (x0, y1))
        c1, r1 = (int(math.ceil(v)) for v in inv * (x1, y0))
        sl = sc = None
        if c0 >= 0 and r0 >= 0 and c1 <= W and r1 <= H and c1 > c0 and r1 > r0:
            m = rfeat.geometry_mask([mapping(buf)], out_shape=(r1 - r0, c1 - c0), transform=T * rasterio.Affine.translation(c0, r0), invert=True)
            v = slope[r0:r1, c0:c1][m]
            v = v[np.isfinite(v)]
            p = pct[r0:r1, c0:c1][m]
            p = p[np.isfinite(p)]
            sl = round(float(np.percentile(v, 90)), 2) if len(v) else None
            sc = round(float(p.mean()), 3) if len(p) else None
        inside = sl is not None and sc is not None
        d = cg.distance(line.interpolate(0.5, normalized=True))
        s["features"] = {
            "slopeP90Deg": sl if inside else None,
            "susceptibilityScore": sc if inside else None,
            "pastLandslides500m": int((ls.distance(line) <= LANDSLIDE_BUFFER_M).sum()) if inside else None,
            "rainCellId": cg.loc[d.idxmin(), "cell_id"] if d.min() <= RAIN_CELL_MAX_KM * 1000 else None,
            "insideDataCoverage": inside,
        }


# ------------------------------------------------------------------ D. write
def segment_of(zid: str) -> str:
    return f"NH27-DH-{zid[3:6]}"


def candidate(c: dict, direct_km) -> dict:
    extra = f" (+{c['distanceKm'] - direct_km:.0f} km)" if direct_km else ""
    return {"name": f"Detour via {c['via']}, {c['distanceKm']:.0f} km{extra}", "segmentIds": c["segmentIds"], "source": "OSRM",
            "distanceKm": c["distanceKm"], "durationMin": c["durationMin"], "offCorridorKm": c["offCorridorKm"], "directKm": direct_km}


def has_inputs(dv: dict, x: str) -> bool:
    return not x.startswith("DV-") or (dv[x]["features"]["insideDataCoverage"] and dv[x]["features"]["rainCellId"] is not None)


def write(conn, dv: dict, cands: dict, raw: dict) -> None:
    s = C.schema()
    conn.execute(f"CREATE TABLE IF NOT EXISTS {s}.ref_diversion_segments (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL)")
    conn.execute(f"TRUNCATE {s}.ref_diversion_segments")
    with conn.cursor() as cur:
        cur.executemany(f"INSERT INTO {s}.ref_diversion_segments VALUES (%s, %s, %s)", [(k, i, Jsonb(v)) for i, (k, v) in enumerate(dv.items())])
    routes = {z: ([candidate(c, raw["direct"].get(segment_of(z)))] if c.get("status") == "ok" else []) for z, c in sorted(cands.items())}
    for (zid,) in conn.execute(f"SELECT id FROM {s}.ref_zones").fetchall():
        conn.execute(f"UPDATE {s}.ref_zones SET data = jsonb_set(data, '{{diversionRoutes}}', %s) WHERE id = %s", (Jsonb(routes.get(zid, [])), zid))
    conn.commit()
    OUT.write_text(json.dumps({"generated": datetime.now().astimezone().isoformat(timespec="seconds"), "image": IMAGE, "zones": routes,
                               "status": {z: c["status"] for z, c in sorted(cands.items())},
                               "diversionSegments": {k: {x: v[x] for x in ("name", "lengthM", "center", "features")} for k, v in dv.items()}},
                              indent=1, ensure_ascii=False), encoding="utf-8")
    write_doc(dv, cands, raw)


def write_doc(dv: dict, cands: dict, raw: dict) -> None:
    ok = {z: c for z, c in cands.items() if c.get("status") == "ok"}
    covered = sum(1 for k in dv if has_inputs(dv, k))
    full = [z for z, c in ok.items() if all(has_inputs(dv, x) for x in c["segmentIds"])]
    reasons: dict[str, int] = {}
    for c in cands.values():
        if c.get("status") != "ok":
            reasons[c["status"]] = reasons.get(c["status"], 0) + 1
    L = ["# Diversion candidates (Phase 8, OSRM)", "",
         f"Run {datetime.now().astimezone():%Y-%m-%d %H:%M %Z} by `backend/scripts/osrm_diversions.py`: OSRM {IMAGE.split(':')[-1]} (car "
         "profile, MLD) on the Geofabrik North-Eastern Zone extract (© OpenStreetMap contributors, ODbL). For every NH-27 segment, "
         "its own OSM edges are made impassable (`osrm-customize --segment-speed-file`, speed 0, from clean files each time) and "
         "a route is requested from the approach zone 2 km before the segment to the one 2 km after it, in both directions.", "",
         "The off-NH-27 parts are cut into ~1 km **diversion-road segments** (`DV-nnnn`, `offCorridor: true`), shared between "
         "detours on the same road, and scored like NH-27 segments (model score, slope, landslide history, IMD / Open-Meteo "
         "rainfall of the nearest rain cell). They are used only by the **existing BR-03 check** (every segment OPEN and "
         "Green/Yellow, none No data) and are kept out of the NH-27 chainage (FR-09), the corridor list, the KPIs and the risk "
         "colouring of the map (drawn grey).", "",
         "## Summary", "",
         f"- Approach zones with a detour: **{len(ok)} of {len(cands)}**; without: {len(cands) - len(ok)}"
         + (f" ({'; '.join(f'{k}: {v}' for k, v in sorted(reasons.items()))})" if reasons else "")]
    if ok:
        km = sorted(c["distanceKm"] for c in ok.values())
        L += [f"- Detour length: min {km[0]:.0f} km, median {km[len(km) // 2]:.0f} km, max {km[-1]:.0f} km (NH-27 between the same "
              "two points: about 5 km)",
              f"- Diversion-road segments: **{len(dv)}** ({sum(s['lengthM'] for s in dv.values()) / 1000:.0f} km of road); with inputs "
              f"(inside the terrain / model / rain data): {covered}; without: {len(dv) - covered} (No data, so BR-03 refuses any detour "
              "that uses them)",
              f"- Detours whose every diversion-road segment has inputs (BR-03 can offer them when all are OPEN and Green/Yellow): "
              f"**{len(full)} of {len(ok)}**"]
    if raw.get("warn"):
        L += ["", "Baseline matching warnings: " + "; ".join(raw["warn"])]
    L += ["", "## Per approach zone", "", "| Zone | Direct km | Detour km | Minutes | Off NH-27 km | Via | DV segments | All DV with inputs |",
          "|---|---|---|---|---|---|---|---|"]
    for z, c in sorted(cands.items()):
        d = raw["direct"].get(segment_of(z))
        if c.get("status") != "ok":
            L.append(f"| {z} | {d if d is not None else '–'} | – | – | – | – | – | {c['status']} |")
            continue
        L.append(f"| {z} | {d if d is not None else '–'} | {c['distanceKm']} | {c['durationMin']} | {c['offCorridorKm']} | {c['via']} | "
                 f"{sum(x.startswith('DV-') for x in c['segmentIds'])} | {'yes' if z in full else 'no'} |")
    DOC.write_text("\n".join(L) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prepare", action="store_true")
    ap.add_argument("--from-cache", action="store_true", help="reuse data/derived/osrm_detours.json (no OSRM)")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--dry", action="store_true", help="detours only, nothing written")
    a = ap.parse_args()
    with C.connect() as conn:
        s = C.schema()
        segs = [d for (d,) in conn.execute(f"SELECT data FROM {s}.ref_segments ORDER BY pos").fetchall()]
        zones = {d["id"]: d for (d,) in conn.execute(f"SELECT data FROM {s}.ref_zones ORDER BY pos").fetchall()}
        if a.from_cache:
            raw = json.loads(CACHE.read_text(encoding="utf-8"))
            raw["segPairs"] = {k: [tuple(p) for p in v] for k, v in raw["segPairs"].items()}
        else:
            if a.prepare or not all((PRISTINE / f"{BASE}.{x}").exists() for x in CHANGED):
                prepare()
            raw = detours(segs, zones, a.only)
            if not a.dry:
                CACHE.write_text(json.dumps(raw), encoding="utf-8")
        if a.dry:
            print(json.dumps({z: {k: v for k, v in r.items() if k not in ("nodes", "dist", "coords", "steps")}
                              for z, r in raw["routes"].items()}, indent=1))
            return 0
        dv, cands = build_segments(raw)
        dv_features(dv, conn)
        write(conn, dv, cands, raw)
    print(f"{len(dv)} diversion-road segments; {sum(c.get('status') == 'ok' for c in cands.values())} zones with a detour -> {OUT}, {DOC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
