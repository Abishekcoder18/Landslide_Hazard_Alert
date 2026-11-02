"""Phase 2 / ST-01 / AC-01 - real NH-27 segments for the initial corridor (NH-27 within Dima Hasao).

Sources (read only, never copied into the repo):
  - D:\\assam_road_dataset_final.csv      NH-27 ways (`primary_nh_ref` == NH27)        [RESILION 1 final dataset]
  - D:\\assam_roads_classified.geojson    geometry for the same osm_way_id set
  - resilion_districts.gpkg               Dima Hasao polygon (OSM admin_level 5)
  - north-eastern-zone.gpkg               OSM places, for segment names and holding points
  - D:\\assam_landslide_road_events.csv   past landslides (only to pick which segments get approach zones)

Method:
  1. Graph of NH-27 ways (nodes = way endpoints rounded to 1 m in UTM 46N).
  2. Shortest path between the northern end (Lumding side) and the southern end (Silchar side) of the
     main component. Where NH-27 is mapped as two one-way carriageways, the path follows one of them, so
     the output is one ordered line, not both carriageways.
  3. Trim the line to its first entry into and last exit from the Dima Hasao polygon.
  4. Split into N = round(L / 1 km) equal pieces. IDs NH27-DH-001.. in chainage order; chainage km 0 is
     the Lumding-side district boundary. Deterministic: identical inputs give identical IDs and geometry.

Outputs: backend/data/segments.geojson, backend/data/corridor.json (zones + holding points),
         and (if DATABASE_URL works) PostGIS tables ref_segments / ref_zones / ref_holding_points.

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\segment_nh27.py [--no-db]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import unicodedata
from pathlib import Path

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, mapping
from shapely.ops import linemerge, substring

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "backend" / "data"

ROADS_CSV = r"D:\assam_road_dataset_final.csv"
ROADS_GEOJSON = r"D:\assam_roads_classified.geojson"
DISTRICTS = r"D:\RESILION\data\processed\roads\resilion_districts.gpkg"
OSM = r"D:\RESILION\data\raw\roads\north-eastern-zone.gpkg"
LANDSLIDES = r"D:\assam_landslide_road_events.csv"

DH_BBOX = (92.40, 24.85, 93.60, 26.00)  # read window, a little wider than the district
UTM = 32646
TARGET_M = 1000.0
LANDSLIDE_BUFFER_M = 500.0
APPROACH_EXTENT_KM = 2.5  # DEFAULT_CONFIG.approachZoneExtentKm


def load_nh27() -> tuple[gpd.GeoDataFrame, object]:
    rd = pd.read_csv(ROADS_CSV, usecols=["osm_way_id", "primary_nh_ref"], low_memory=False)
    ref = rd["primary_nh_ref"].astype("string").str.replace(r"[\s-]", "", regex=True).str.upper()
    ids = set(rd.loc[ref.eq("NH27").fillna(False), "osm_way_id"].astype("int64"))
    g = gpd.read_file(ROADS_GEOJSON, bbox=DH_BBOX)
    g = g[g["osm_way_id"].astype("int64").isin(ids)].to_crs(UTM)
    d = gpd.read_file(DISTRICTS)
    poly = d[d["name"] == "Dima Hasao"].to_crs(UTM).geometry.iloc[0]
    g = g[g.intersects(poly.buffer(5000))].sort_values("osm_way_id").reset_index(drop=True)
    return g, poly


def corridor_line(ways: gpd.GeoDataFrame, poly) -> tuple[LineString, dict]:
    G = nx.Graph()
    key = lambda c: (round(c[0]), round(c[1]))  # noqa: E731  1 m snapping
    for r in ways.itertuples():
        cs = list(r.geometry.coords)
        a, b = key(cs[0]), key(cs[-1])
        if a == b:
            continue
        # keep the shorter geometry if two ways join the same pair of nodes (dual carriageway duplicates)
        if G.has_edge(a, b) and G.edges[a, b]["w"] <= r.geometry.length:
            continue
        G.add_edge(a, b, w=r.geometry.length, geom=r.geometry, way=int(r.osm_way_id))
    comps = sorted(nx.connected_components(G), key=lambda c: sum(G.edges[e]["w"] for e in G.subgraph(c).edges), reverse=True)
    main = G.subgraph(comps[0])
    north = max(main.nodes, key=lambda n: n[1])
    south = min(main.nodes, key=lambda n: n[1])
    path = nx.shortest_path(main, north, south, weight="w")
    coords: list = []
    ways_used = []
    for a, b in zip(path, path[1:]):
        e = main.edges[a, b]
        cs = list(e["geom"].coords)
        if key(cs[0]) != a:
            cs = cs[::-1]
        coords += cs if not coords else cs[1:]
        ways_used.append(e["way"])
    line = LineString(coords)
    # Trim to first entry into / last exit from the district polygon.
    inter = line.intersection(poly)
    parts = list(getattr(inter, "geoms", [inter]))
    dists = sorted(d for p in parts for d in (line.project(Point(p.coords[0])), line.project(Point(p.coords[-1]))))
    start, end = dists[0], dists[-1]
    trimmed = substring(line, start, end)
    outside = trimmed.length - trimmed.intersection(poly).length
    stats = {
        "nh27_ways_read": int(len(ways)),
        "graph_components": len(comps),
        "main_component_km": round(sum(G.edges[e]["w"] for e in main.edges) / 1000, 2),
        "other_components_km": round(sum(sum(G.edges[e]["w"] for e in G.subgraph(c).edges) for c in comps[1:]) / 1000, 2),
        "path_ways": len(ways_used),
        "path_km_before_trim": round(line.length / 1000, 3),
        "corridor_km": round(trimmed.length / 1000, 3),
        "km_outside_polygon_within_corridor": round(outside / 1000, 3),
        "polygon_crossings": len(parts),
        "osm_way_ids": sorted(set(ways_used)),
    }
    return trimmed, stats


def places() -> gpd.GeoDataFrame:
    p = gpd.read_file(OSM, layer="gis_osm_places_free", bbox=DH_BBOX)
    p = p[p["fclass"].isin(["city", "town", "village", "suburb"]) & p["name"].notna()].to_crs(UTM)
    return p.sort_values(["name", "osm_id"]).reset_index(drop=True)


def ascii_name(name: str) -> str:
    """Alerts validate place names exactly in Roman script, so fold diacritics (Jātinga -> Jatinga)."""
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().strip()


def nearest_place(pt: Point, pl: gpd.GeoDataFrame, max_m=8000.0) -> str | None:
    d = pl.distance(pt)
    i = d.idxmin()
    return ascii_name(str(pl.loc[i, "name"])) if d[i] <= max_m else None


def to_latlon(geom_utm) -> list[list[float]]:
    g = gpd.GeoSeries([geom_utm], crs=UTM).to_crs(4326).iloc[0]
    return [[round(y, 6), round(x, 6)] for x, y in g.coords]


def split(line: LineString, pl: gpd.GeoDataFrame) -> list[dict]:
    n = max(1, round(line.length / TARGET_M))
    step = line.length / n
    segs = []
    for i in range(n):
        a, b = i * step, (i + 1) * step if i < n - 1 else line.length
        piece = substring(line, a, b)
        mid = line.interpolate((a + b) / 2)
        s_name = nearest_place(line.interpolate(a), pl) or f"km {a / 1000:.1f}"
        e_name = nearest_place(line.interpolate(b), pl) or f"km {b / 1000:.1f}"
        name = s_name if s_name == e_name else f"{s_name} – {e_name}"
        segs.append({
            "id": f"NH27-DH-{i + 1:03d}",
            "name": name,
            "startKm": round(a / 1000, 3),
            "endKm": round(b / 1000, 3),
            "lengthM": round(piece.length, 1),
            "coordinates": to_latlon(piece),
            "center": to_latlon(LineString([mid, mid]))[0],
            "_geom": piece,
        })
    return segs


def landslide_counts(segs: list[dict]) -> dict[str, int]:
    ls = pd.read_csv(LANDSLIDES, low_memory=False)
    ls = ls.dropna(subset=["latitude", "longitude"])
    g = gpd.GeoDataFrame(ls, geometry=gpd.points_from_xy(ls.longitude, ls.latitude), crs=4326).to_crs(UTM)
    return {s["id"]: int((g.distance(s["_geom"]) <= LANDSLIDE_BUFFER_M).sum()) for s in segs}


HP_CSV = REPO / "backend" / "inputs" / "holding_points.csv"
SHORT = {"HP-LUMDING": "Lumding side", "HP-SILCHAR": "Silchar side"}


def holding_points_from_csv(segs: list[dict]) -> list[dict]:
    """Candidates from backend/inputs/holding_points.csv (holding_points_osm.py), snapped to the nearest segment.
    Capacity stays None unless the CSV has it; every point stays Provisional until verified."""
    import csv
    from shapely.geometry import Point as P
    seg_geoms = [(s["id"], s["_geom"]) for s in segs]
    out = []
    with HP_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            p = gpd.GeoSeries([P(float(row["lon"]), float(row["lat"]))], crs=4326).to_crs(UTM).iloc[0]
            sid = min(seg_geoms, key=lambda t: t[1].distance(p))[0]
            cap = row.get("capacity_vehicles", "").strip()
            out.append({"id": row["id"], "name": row["name"], "shortName": SHORT.get(row["id"], row["name"]),
                        "locationName": row["side"], "facilities": [x.strip() for x in row["facilities"].split(";") if x.strip()],
                        "segmentId": sid, "capacityVehicles": int(cap) if cap else None, "provisional": True,
                        "source": row["source"], "verified": row["verified"].strip().lower() == "yes",
                        "lat": float(row["lat"]), "lon": float(row["lon"])})
    return out


def holding_points(segs: list[dict], line: LineString, pl: gpd.GeoDataFrame) -> list[dict]:
    if HP_CSV.exists():
        return holding_points_from_csv(segs)
    haf = pl[pl["name"].map(ascii_name).str.lower() == "haflong"]
    if haf.empty:
        raise SystemExit("OSM place 'Haflong' not found - stop and report")
    d = line.project(haf.geometry.iloc[0])
    haf_seg = next(s for s in segs if s["startKm"] * 1000 <= d <= s["endKm"] * 1000 + 1e-6)
    haf_off = round(haf.geometry.iloc[0].distance(line) / 1000, 2)
    return [
        {"id": "HP-LUMDING", "name": "Lumding Safe Holding Point", "shortName": "Lumding", "locationName": "Lumding side",
         "facilities": ["Food", "Fuel", "Truck lay-by", "Police post", "Toilets"], "segmentId": segs[0]["id"],
         "capacityVehicles": 350, "provisional": True},
        {"id": "HP-HAFLONG", "name": "Haflong Safe Holding Point", "shortName": "Haflong", "locationName": "Haflong",
         "facilities": ["Food", "Fuel", "Shelter", "Medical aid", "Water"], "segmentId": haf_seg["id"],
         "capacityVehicles": 250, "provisional": True, "_offRoadKm": haf_off},
        {"id": "HP-SILCHAR", "name": "Silchar-side Holding Point", "shortName": "Silchar-side staging",
         "locationName": "Silchar side (town to be confirmed)", "facilities": ["Shelter", "Water", "Police post", "Parking"],
         "segmentId": segs[-1]["id"], "capacityVehicles": 120, "provisional": True},
    ]


def assign_holding_points(segs: list[dict], hps: list[dict], seg_index: int, direction: str) -> tuple[str, list[str]]:
    """BR-04 chain for a zone: holding points at or behind the target segment (towards where traffic comes from),
    nearest first; the rest are fallbacks further back. Southbound traffic comes from Lumding (km 0), northbound
    from the Silchar side. Points are ordered by their own segment's chainage (ties: by id, deterministic)."""
    pos = {s["id"]: i for i, s in enumerate(segs)}
    at = [(pos[h["segmentId"]], h["id"]) for h in hps]
    if direction == "Southbound":
        chain = [hid for p, hid in sorted(at, key=lambda t: (-t[0], t[1])) if p <= seg_index]
    else:
        chain = [hid for p, hid in sorted(at, key=lambda t: (t[0], t[1])) if p >= seg_index]
    if not chain:  # no point behind (cannot happen with end points on the first/last segment); nearest overall
        chain = [min(at, key=lambda t: (abs(t[0] - seg_index), t[1]))[1]]
    return chain[0], chain[1:]


def zones(segs: list[dict], hps: list[dict], line: LineString) -> list[dict]:
    """Two approach zones per segment (owner decision 2026-11): AZ-<nnn>S before the segment for southbound traffic,
    AZ-<nnn>N after it for northbound traffic. Holding point = nearest point behind the zone, fallbacks further back."""
    out = []
    for i, s in enumerate(segs):
        n = s["id"].split("-")[-1]
        sb_km = max(0.0, s["startKm"] - APPROACH_EXTENT_KM)
        sb_hp, sb_fb = assign_holding_points(segs, hps, i, "Southbound")
        out.append({"id": f"AZ-{n}S", "name": f"{s['name'].split('–')[0].strip()} side", "direction": "Southbound",
                    "segmentId": s["id"], "center": to_latlon(LineString([line.interpolate(sb_km * 1000)] * 2))[0],
                    "extentKm": APPROACH_EXTENT_KM, "locationKm": round(sb_km, 3),
                    "nearestHoldingPointId": sb_hp, "fallbackHoldingPointIds": sb_fb, "diversionRoutes": []})
        nb_km = min(line.length / 1000, s["endKm"] + APPROACH_EXTENT_KM)
        nb_hp, nb_fb = assign_holding_points(segs, hps, i, "Northbound")
        out.append({"id": f"AZ-{n}N", "name": f"{s['name'].split('–')[-1].strip()} side", "direction": "Northbound",
                    "segmentId": s["id"], "center": to_latlon(LineString([line.interpolate(nb_km * 1000)] * 2))[0],
                    "extentKm": APPROACH_EXTENT_KM, "locationKm": round(nb_km, 3),
                    "nearestHoldingPointId": nb_hp, "fallbackHoldingPointIds": nb_fb, "diversionRoutes": []})
    return out


def build() -> dict:
    ways, poly = load_nh27()
    line, stats = corridor_line(ways, poly)
    pl = places()
    segs = split(line, pl)
    counts = landslide_counts(segs)
    hps = holding_points(segs, line, pl)
    zs = zones(segs, hps, line)
    for s in segs:
        s["pastLandslides500m"] = counts[s["id"]]
    return {"line": line, "stats": stats, "segments": segs, "holdingPoints": hps, "zones": zs}


def geojson(segs: list[dict]) -> dict:
    feats = []
    for s in segs:
        props = {k: v for k, v in s.items() if k not in ("coordinates", "_geom")}
        feats.append({"type": "Feature", "id": s["id"], "properties": props,
                      "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in s["coordinates"]]}})
    return {"type": "FeatureCollection", "name": "nh27_dima_hasao_segments",
            "source": {"roads": ROADS_CSV, "geometry": ROADS_GEOJSON, "boundary": DISTRICTS, "names": OSM},
            "features": feats}


def fingerprint(segs: list[dict]) -> str:
    h = hashlib.sha256()
    for s in segs:
        h.update(json.dumps([s["id"], s["startKm"], s["endKm"], s["coordinates"]]).encode())
    return h.hexdigest()


def load_postgis(result: dict) -> str:
    try:
        from dotenv import load_dotenv
        load_dotenv(REPO / "backend" / ".env")
    except ImportError:
        pass
    import re
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return "skipped: DATABASE_URL not set (backend/.env missing)"
    dsn = re.sub(r"^postgres(ql)?\+\w+://", "postgresql://", dsn)
    s = os.environ.get("DB_SCHEMA", "resilion2")
    if not re.fullmatch(r"resilion2[a-z0-9_]*", s):
        raise SystemExit(f"DB_SCHEMA must start with resilion2 (got {s}); public is never written")
    import psycopg
    from psycopg.types.json import Jsonb
    try:
        conn = psycopg.connect(dsn)
    except Exception as e:  # noqa: BLE001
        return f"skipped: cannot connect ({type(e).__name__}: {str(e).strip().splitlines()[0]})"
    with conn:
        # Only the RESILION 2.0 schema is written; every name is schema-qualified.
        conn.execute(f"""
            CREATE SCHEMA IF NOT EXISTS {s};
            CREATE TABLE IF NOT EXISTS {s}.ref_segments (id text PRIMARY KEY, pos int NOT NULL, start_km float8, end_km float8,
              name text, geom public.geometry(LineString, 4326) NOT NULL, data jsonb NOT NULL);
            CREATE INDEX IF NOT EXISTS ref_segments_geom_idx ON {s}.ref_segments USING gist (geom);
            CREATE TABLE IF NOT EXISTS {s}.ref_zones (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
            CREATE TABLE IF NOT EXISTS {s}.ref_holding_points (id text PRIMARY KEY, pos int NOT NULL, data jsonb NOT NULL);
            TRUNCATE {s}.ref_segments, {s}.ref_zones, {s}.ref_holding_points;""")
        with conn.cursor() as cur:
            cur.executemany(
                f"INSERT INTO {s}.ref_segments VALUES (%s, %s, %s, %s, %s, public.ST_GeomFromText(%s, 4326), %s)",
                [(x["id"], i, x["startKm"], x["endKm"], x["name"],
                  "LINESTRING(" + ", ".join(f"{lon} {lat}" for lat, lon in x["coordinates"]) + ")",
                  Jsonb({k: v for k, v in x.items() if k != "_geom"})) for i, x in enumerate(result["segments"])])
            cur.executemany(f"INSERT INTO {s}.ref_zones VALUES (%s, %s, %s)", [(z["id"], i, Jsonb(z)) for i, z in enumerate(result["zones"])])
            cur.executemany(f"INSERT INTO {s}.ref_holding_points VALUES (%s, %s, %s)",
                            [(h["id"], i, Jsonb({k: v for k, v in h.items() if not k.startswith("_")})) for i, h in enumerate(result["holdingPoints"])])
        n, km = conn.execute(f"SELECT count(*), sum(public.ST_Length(geom::public.geography))/1000 FROM {s}.ref_segments").fetchone()
    return f"loaded {n} segments ({km:.3f} km geodesic) into {s}.ref_segments; {len(result['zones'])} zones; {len(result['holdingPoints'])} holding points"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-db", action="store_true")
    args = ap.parse_args()
    r = build()
    segs = r["segments"]
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "segments.geojson").write_text(json.dumps(geojson(segs), ensure_ascii=False, indent=1), encoding="utf-8")
    meta = {**r["stats"], "segments": len(segs), "fingerprint": fingerprint(segs)}
    (DATA / "corridor.json").write_text(json.dumps({
        "meta": meta, "holdingPoints": [{k: v for k, v in h.items() if not k.startswith("_")} for h in r["holdingPoints"]],
        "zones": r["zones"]}, ensure_ascii=False, indent=1), encoding="utf-8")

    lengths = np.array([s["lengthM"] for s in segs])
    s = r["stats"]
    print(f"NH-27 ways read: {s['nh27_ways_read']}; graph components: {s['graph_components']} "
          f"(main {s['main_component_km']} km, others {s['other_components_km']} km)")
    print(f"path: {s['path_ways']} ways, {s['path_km_before_trim']} km before trim -> corridor {s['corridor_km']} km "
          f"(polygon crossings {s['polygon_crossings']}, {s['km_outside_polygon_within_corridor']} km outside polygon inside corridor)")
    print(f"segments: {len(segs)}  {segs[0]['id']}..{segs[-1]['id']}  length m min/mean/max "
          f"{lengths.min():.1f}/{lengths.mean():.1f}/{lengths.max():.1f}")
    print(f"start {segs[0]['coordinates'][0]} ({segs[0]['name']})  end {segs[-1]['coordinates'][-1]} ({segs[-1]['name']})")
    cnt = pd.Series({x['id']: x['pastLandslides500m'] for x in segs})
    print(f"past landslides within 500 m: total hits {cnt.sum()}, segments with >=1: {(cnt >= 1).sum()}, >=3: {(cnt >= 3).sum()}, "
          f">=5: {(cnt >= 5).sum()}; max {cnt.max()} ({cnt.idxmax()})")
    for h in r["holdingPoints"]:
        print(f"holding point {h['id']} -> {h['segmentId']}" + (f" (town {h['_offRoadKm']} km from road)" if "_offRoadKm" in h else ""))
    print(f"zones: {len(r['zones'])} (two per segment)")
    print("fingerprint", meta["fingerprint"])
    print("postgis:", "skipped (--no-db)" if args.no_db else load_postgis(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
