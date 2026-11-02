"""Phase 2 - candidate Safe Holding Points from OpenStreetMap within 300 m of NH-27 in Dima Hasao.

Source: D:\\RESILION\\data\\raw\\roads\\north-eastern-zone.gpkg (Geofabrik OSM extract, read only).
Kinds kept: fuel stations, parking, rest areas / service areas, bus stations, tourist rest houses, and town
centres (OSM place=town/city). Facilities = OSM POIs within 300 m of the candidate. Capacity stays blank (OSM has no
capacity tag in this extract). Every row is verified=no: the owner / district must check each one.

Two corridor-end anchors are added (no OSM feature) because BR-04 chains need a point behind every zone; they are
marked source=corridor-end and stay Provisional.

Output: backend/inputs/holding_points.csv  (id,name,lat,lon,side,capacity_vehicles,facilities,source,verified)
Then run segment_nh27.py, which snaps them to segments, rebuilds the zones' BR-04 chains and loads ref_holding_points.
Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\holding_points_osm.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

import geopandas as gpd  # noqa: E402
import pandas as pd  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

OUT = C.REPO / "backend" / "inputs" / "holding_points.csv"
MAX_M = 300.0
KINDS = {  # (layer, fclass) -> label
    ("gis_osm_traffic_free", "fuel"): "Fuel", ("gis_osm_traffic_a_free", "fuel"): "Fuel",
    ("gis_osm_traffic_free", "parking"): "Parking", ("gis_osm_traffic_a_free", "parking"): "Parking",
    ("gis_osm_traffic_free", "service"): "Service area", ("gis_osm_traffic_a_free", "service"): "Service area",
    ("gis_osm_transport_free", "bus_station"): "Bus station", ("gis_osm_transport_a_free", "bus_station"): "Bus station",
    ("gis_osm_places_free", "town"): "Town centre", ("gis_osm_places_free", "city"): "Town centre",
}
REST_HOUSE = re.compile(r"rest house|lodge|dhaba|hotel", re.I)
FACILITY = {"clinic": "Clinic", "hospital": "Hospital", "doctors": "Clinic", "pharmacy": "Pharmacy", "police": "Police post",
            "fuel": "Fuel", "toilet": "Toilets", "restaurant": "Food", "fast_food": "Food", "cafe": "Food",
            "drinking_water": "Water", "hotel": "Lodging", "guesthouse": "Lodging", "market_place": "Market",
            "atm": "ATM", "bank": "Bank", "parking": "Parking", "bus_station": "Bus station"}
ANCHORS = ["Maibong", "Haflong", "Jatinga", "Harangajao"]  # side labels besides the two corridor ends


def ascii_name(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().strip()


def slug(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", ascii_name(s).upper()).strip("-")


def main() -> int:
    fc = json.loads((C.DATA / "segments.geojson").read_text(encoding="utf-8"))
    segs = gpd.GeoDataFrame.from_features(fc["features"], crs=4326).to_crs(C.UTM)
    ordered = [g for g in segs.geometry]
    from shapely.ops import linemerge
    line = linemerge(unary_union(ordered))
    total = line.length
    buf = line.buffer(MAX_M)
    layers = {lay for lay, _ in KINDS} | {"gis_osm_pois_free", "gis_osm_pois_a_free"}
    data = {lay: gpd.read_file(C.OSM, layer=lay, bbox=C.READ_BBOX).to_crs(C.UTM) for lay in layers}
    pois = pd.concat([data["gis_osm_pois_free"], data["gis_osm_pois_a_free"].assign(geometry=data["gis_osm_pois_a_free"].centroid),
                      data["gis_osm_traffic_free"], data["gis_osm_traffic_a_free"].assign(geometry=data["gis_osm_traffic_a_free"].centroid)],
                     ignore_index=True)
    pois = gpd.GeoDataFrame(pois, geometry="geometry", crs=C.UTM)
    places = gpd.read_file(C.OSM, layer="gis_osm_places_free", bbox=C.READ_BBOX).to_crs(C.UTM)
    places = places[places["name"].notna()]

    cands = []
    for (lay, fclass), label in KINDS.items():
        g = data[lay]
        g = g[(g["fclass"] == fclass) & g.intersects(buf)]
        for r in g.itertuples():
            cands.append((label, r))
    for lay in ("gis_osm_pois_free", "gis_osm_pois_a_free"):
        g = data[lay]
        g = g[g.intersects(buf) & g["name"].fillna("").str.contains(REST_HOUSE)]
        for r in g.itertuples():
            cands.append(("Rest house", r))

    anchor_km = {}
    for a in ANCHORS:
        p = places[places["name"].map(ascii_name).str.lower() == a.lower()]
        if len(p):
            anchor_km[a] = line.project(p.geometry.iloc[0]) / 1000

    def side(km: float) -> str:
        opts = {"Lumding side": 0.0, "District boundary (Silchar side)": total / 1000, **anchor_km}
        return min(opts, key=lambda k: abs(opts[k] - km))

    rows, seen = [], set()
    for label, r in cands:
        geom = r.geometry.centroid if r.geometry.geom_type != "Point" else r.geometry
        if r.osm_id in seen:
            continue
        seen.add(r.osm_id)
        near_places = places.assign(d=places.distance(geom)).sort_values("d")
        nearest = ascii_name(str(near_places.iloc[0]["name"]))
        name = ascii_name(str(r.name)) if isinstance(r.name, str) and r.name.strip() else f"{label} near {nearest}"
        fac = sorted({FACILITY[f] for f in pois[pois.distance(geom) <= MAX_M]["fclass"] if f in FACILITY})
        ll = gpd.GeoSeries([geom], crs=C.UTM).to_crs(4326).iloc[0]
        km = line.project(geom) / 1000
        rows.append({"id": f"HP-{slug(name)}", "name": name, "lat": round(ll.y, 6), "lon": round(ll.x, 6), "side": side(km),
                     "capacity_vehicles": "", "facilities": "; ".join(fac), "source": f"osm:{r.osm_id}", "verified": "no",
                     "_kind": label, "_km": round(km, 2), "_dist_m": round(line.distance(geom), 1)})
    # Corridor-end anchors (no OSM feature): needed so every zone has a point behind it (BR-04).
    for nm, frac, sd in (("Lumding side", 0.0, "Lumding side"), ("Silchar side (district boundary)", 1.0, "District boundary (Silchar side)")):
        p = line.interpolate(frac, normalized=True)
        ll = gpd.GeoSeries([p], crs=C.UTM).to_crs(4326).iloc[0]
        rows.append({"id": "HP-LUMDING" if frac == 0 else "HP-SILCHAR", "name": nm, "lat": round(ll.y, 6), "lon": round(ll.x, 6),
                     "side": sd, "capacity_vehicles": "", "facilities": "", "source": "corridor-end (no OSM feature)", "verified": "no",
                     "_kind": "Corridor end", "_km": round(frac * total / 1000, 2), "_dist_m": 0.0})
    rows.sort(key=lambda x: x["_km"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cols = ["id", "name", "lat", "lon", "side", "capacity_vehicles", "facilities", "source", "verified"]
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} candidates written to {OUT}")
    print("| id | name | kind | km | m from NH-27 | side | facilities | source |")
    print("|---|---|---|---|---|---|---|---|")
    for x in rows:
        print(f"| {x['id']} | {x['name']} | {x['_kind']} | {x['_km']} | {x['_dist_m']} | {x['side']} | {x['facilities'] or '—'} | {x['source']} |")
    hf = places[places["name"].map(ascii_name).str.lower() == "haflong"]
    if len(hf):
        print(f"Haflong town centre (osm:{hf.iloc[0]['osm_id']}) is {line.distance(hf.geometry.iloc[0]):.0f} m from NH-27 -> not within {MAX_M:.0f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
