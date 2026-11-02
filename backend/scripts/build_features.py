"""Phase 3 - per-segment features from real data, plus the 30 m raster stack the susceptibility model uses.

Inputs (read only):
  RESILION 1 final datasets: assam_road_dataset_final.csv (roads, bridges), Assam_DEM_Terrain_Road_Features.csv
  (road terrain, cross-check), assam_landslide_road_events.csv (past landslides), Assam_Flood_ML_Ready_FINAL.csv
  (flood events naming the district), assam_disruption_road_events.csv (2022 disruptions).
  Downloaded: Copernicus DEM GLO-30, ESA WorldCover 2021, IMD gridded daily rainfall 0.25 deg (2010-2025).
  OSM waterways (drainage) from north-eastern-zone.gpkg.

Outputs:
  backend/data/derived/features_30m.tif   multi-band stack on a 30 m UTM 46N grid over Dima Hasao (+3 km)
  backend/data/derived/segment_features.json, imd_rain_dh.parquet, landslides_dh.geojson
  PostGIS (schema resilion2 only): segment_features, imd_rain_cells, imd_rain_daily, landslide_events

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\build_features.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402  (must come before rasterio: fixes PROJ env)

import geopandas as gpd  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import rasterio  # noqa: E402
from rasterio import features as rfeat  # noqa: E402
from rasterio.enums import Resampling  # noqa: E402
from rasterio.merge import merge  # noqa: E402
from rasterio.transform import from_origin  # noqa: E402
from rasterio.warp import reproject  # noqa: E402
from scipy import ndimage  # noqa: E402
from shapely.geometry import mapping  # noqa: E402

TODAY = dt.date.today().isoformat()
STACK = C.DERIVED / "features_30m.tif"
BANDS = ["elevation", "slope", "slope_max_150m", "aspect_sin", "aspect_cos", "plan_curv", "profile_curv",
         "relief_450m", "roughness_90m", "dist_drainage_m", "dist_road_m", "landcover", "in_district"]
SEG_BUFFER_M = 100.0     # hillslope zone either side of the road used for segment terrain stats
LANDSLIDE_BUFFER_M = 500.0

PROV = {
    "terrain": {"source": "Copernicus DEM GLO-30 (ESA, via AWS Open Data)", "resolution": "30 m", "retrieved": TODAY},
    "landcover": {"source": "ESA WorldCover 2021 v200", "resolution": "10 m read at ~20 m (mode)", "retrieved": TODAY},
    "drainage": {"source": "OpenStreetMap waterways (north-eastern-zone.gpkg, Geofabrik extract)", "file": str(C.OSM)},
    "roads": {"source": "RESILION 1 final road dataset", "file": str(C.ROADS_CSV)},
    "road_terrain": {"source": "RESILION 1 DEM terrain road features", "file": str(C.TERRAIN_CSV)},
    "landslides": {"source": "RESILION 1 landslide road events (GSI inventory + dates)", "file": str(C.LANDSLIDES_CSV)},
    "flood": {"source": "RESILION 1 flood events (IMD, district-level)", "file": str(C.FLOOD_CSV)},
    "rainfall": {"source": "IMD gridded daily rainfall 0.25 deg (Pai et al. 2014), via imdlib", "retrieved": TODAY},
}


# ---------------------------------------------------------------- grid + rasters
def grid():
    poly = C.dh_polygon()
    x0, y0, x1, y1 = poly.buffer(3000).bounds
    x0, y0 = np.floor(x0 / C.RES) * C.RES, np.floor(y0 / C.RES) * C.RES
    x1, y1 = np.ceil(x1 / C.RES) * C.RES, np.ceil(y1 / C.RES) * C.RES
    W, H = int((x1 - x0) / C.RES), int((y1 - y0) / C.RES)
    return poly, from_origin(x0, y1, C.RES, C.RES), (H, W)


def dem_utm(T, shape) -> np.ndarray:
    srcs = [rasterio.open(p) for p in C.DEM_TILES]
    mosaic, tr = merge(srcs, bounds=C.READ_BBOX)
    crs = srcs[0].crs
    for s in srcs:
        s.close()
    out = np.full(shape, np.nan, dtype="float32")
    reproject(mosaic[0].astype("float32"), out, src_transform=tr, src_crs=crs, dst_transform=T,
              dst_crs=f"EPSG:{C.UTM}", resampling=Resampling.bilinear, dst_nodata=np.nan)
    return out


def terrain(z: np.ndarray) -> dict[str, np.ndarray]:
    """Horn (1981) slope/aspect and Zevenbergen & Thorne (1987) curvatures on a 3x3 window."""
    L = C.RES
    p = np.pad(z, 1, mode="edge")
    z1, z2, z3 = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    z4, z5, z6 = p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:]
    z7, z8, z9 = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * L)
    dzdy = ((z7 + 2 * z8 + z9) - (z1 + 2 * z2 + z3)) / (8 * L)  # rows increase southwards
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    aspect = (np.degrees(np.arctan2(dzdx, dzdy)) + 360) % 360  # 0 = north, clockwise (downslope direction)
    D = ((z4 + z6) / 2 - z5) / L ** 2
    E = ((z2 + z8) / 2 - z5) / L ** 2
    F = (-z1 + z3 + z7 - z9) / (4 * L ** 2)
    G = (-z4 + z6) / (2 * L)
    Hh = (z2 - z8) / (2 * L)
    g2 = G ** 2 + Hh ** 2
    with np.errstate(invalid="ignore", divide="ignore"):
        prof = np.where(g2 > 1e-10, -2 * (D * G ** 2 + E * Hh ** 2 + F * G * Hh) / g2, 0) * 100
        plan = np.where(g2 > 1e-10, 2 * (D * Hh ** 2 + E * G ** 2 - F * G * Hh) / g2, 0) * 100
    flat = slope < 1
    return {
        "slope": slope.astype("float32"),
        "slope_max_150m": ndimage.maximum_filter(slope, size=5).astype("float32"),
        "aspect_sin": np.where(flat, 0, np.sin(np.radians(aspect))).astype("float32"),
        "aspect_cos": np.where(flat, 0, np.cos(np.radians(aspect))).astype("float32"),
        "plan_curv": np.clip(plan, -50, 50).astype("float32"),
        "profile_curv": np.clip(prof, -50, 50).astype("float32"),
        "relief_450m": (ndimage.maximum_filter(z, 15) - ndimage.minimum_filter(z, 15)).astype("float32"),
        "roughness_90m": ndimage.generic_filter(z, np.std, size=3).astype("float32") if z.size < 2e6 else
        np.sqrt(np.maximum(ndimage.uniform_filter(z ** 2, 3) - ndimage.uniform_filter(z, 3) ** 2, 0)).astype("float32"),
    }


def distance_to(gdf: gpd.GeoDataFrame, T, shape) -> np.ndarray:
    mask = rfeat.rasterize(((g, 1) for g in gdf.geometry), out_shape=shape, transform=T, all_touched=True, dtype="uint8")
    return (ndimage.distance_transform_edt(mask == 0) * C.RES).astype("float32")


def waterways(poly) -> gpd.GeoDataFrame:
    w = gpd.read_file(C.OSM, layer="gis_osm_waterways_free", bbox=C.READ_BBOX).to_crs(C.UTM)
    return w[w.intersects(poly.buffer(5000))].reset_index(drop=True)


def roads_all(poly) -> gpd.GeoDataFrame:
    r = gpd.read_file(C.ROADS_GEOJSON, bbox=C.READ_BBOX).to_crs(C.UTM)
    return r[r.intersects(poly.buffer(5000))].reset_index(drop=True)


def landcover(T, shape) -> np.ndarray:
    out = np.zeros(shape, dtype="uint8")
    with rasterio.open(C.WORLDCOVER) as src:
        reproject(rasterio.band(src, 1), out, dst_transform=T, dst_crs=f"EPSG:{C.UTM}", resampling=Resampling.mode)
    return out


def build_stack() -> tuple[dict[str, np.ndarray], object, object, gpd.GeoDataFrame, gpd.GeoDataFrame]:
    poly, T, shape = grid()
    print(f"grid {shape[1]}x{shape[0]} cells at 30 m", flush=True)
    z = dem_utm(T, shape)
    print(f"DEM: elevation {np.nanmin(z):.0f}-{np.nanmax(z):.0f} m, nan share {np.isnan(z).mean():.4f}", flush=True)
    z = np.where(np.isnan(z), np.nanmean(z), z)
    layers = {"elevation": z.astype("float32"), **terrain(z)}
    ww, rd = waterways(poly), roads_all(poly)
    layers["dist_drainage_m"] = distance_to(ww, T, shape)
    layers["dist_road_m"] = distance_to(rd, T, shape)
    layers["landcover"] = landcover(T, shape).astype("float32")
    layers["in_district"] = rfeat.rasterize([(poly, 1)], out_shape=shape, transform=T, dtype="uint8").astype("float32")
    C.DERIVED.mkdir(parents=True, exist_ok=True)
    prof = {"driver": "GTiff", "height": shape[0], "width": shape[1], "count": len(BANDS), "dtype": "float32",
            "crs": f"EPSG:{C.UTM}", "transform": T, "compress": "deflate", "predictor": 3, "tiled": True,
            "blockxsize": 512, "blockysize": 512, "BIGTIFF": "IF_SAFER"}
    tmp = STACK.with_name(STACK.stem + ".part.tif")
    with rasterio.open(tmp, "w", **prof) as d:
        for i, b in enumerate(BANDS, 1):
            d.write(layers[b], i)
            d.set_band_description(i, b)
    tmp.replace(STACK)
    print(f"stack written {STACK} ({STACK.stat().st_size / 1e6:.0f} MB)", flush=True)
    return layers, T, poly, ww, rd


# ---------------------------------------------------------------- labels
def landslides_dh(poly) -> gpd.GeoDataFrame:
    ls = pd.read_csv(C.LANDSLIDES_CSV, low_memory=False).dropna(subset=["latitude", "longitude"])
    g = gpd.GeoDataFrame(ls, geometry=gpd.points_from_xy(ls.longitude, ls.latitude), crs=4326).to_crs(C.UTM)
    g = g[g.within(poly)].copy()
    g["event_date"] = pd.to_datetime(g["event_date"], errors="coerce")
    g["inventory_year"] = pd.to_numeric(g["Slide_No"].astype(str).str.extract(r"/(\d{4})/")[0], errors="coerce")
    g["year"] = g["event_year"].fillna(g["event_date"].dt.year)
    return g.reset_index(drop=True)


# ---------------------------------------------------------------- rainfall
def imd_rain(poly4326) -> pd.DataFrame:
    import imdlib
    years = sorted(int(p.stem) for p in (C.IMD_DIR / "rain").glob("*.grd"))
    data = imdlib.open_data("rain", years[0], years[-1], "yearwise", str(C.IMD_DIR))
    ds = data.get_xarray()
    x0, y0, x1, y1 = poly4326.bounds
    sub = ds["rain"].sel(lat=slice(y0 - 0.25, y1 + 0.25), lon=slice(x0 - 0.25, x1 + 0.25))
    df = sub.to_dataframe().reset_index().rename(columns={"rain": "rain_mm"})
    df = df[df["rain_mm"] > -998]  # -999 = outside India / no data
    df["cell_id"] = df.apply(lambda r: f"IMD-{r.lat:.2f}N-{r.lon:.2f}E", axis=1)
    df["day"] = pd.to_datetime(df["time"]).dt.date
    print(f"IMD rainfall: {df.cell_id.nunique()} cells, {df.day.min()}..{df.day.max()}, {len(df):,} cell-days", flush=True)
    return df[["cell_id", "lat", "lon", "day", "rain_mm"]]


def rain_windows(daily: pd.DataFrame, cell: str, day: dt.date) -> dict:
    s = daily[daily.cell_id == cell].set_index("day")["rain_mm"]
    def tot(n):
        days = [day - dt.timedelta(days=i) for i in range(n)]
        v = s.reindex(days)
        return None if v.isna().any() else round(float(v.sum()), 1)
    return {"rainfall24h": tot(1), "rainfall3d": tot(3), "rainfall7d": tot(7)}


# ---------------------------------------------------------------- per segment
def segment_features(layers, T, poly, ww, rd, ls, daily) -> list[dict]:
    fc = json.loads((C.DATA / "segments.geojson").read_text(encoding="utf-8"))
    segs = gpd.GeoDataFrame.from_features(fc["features"], crs=4326)
    segs["id"] = [f["id"] for f in fc["features"]]
    segs = segs.to_crs(C.UTM)
    # RESILION 1 road data for NH-27 ways
    rd_attr = pd.read_csv(C.ROADS_CSV, low_memory=False, usecols=["osm_way_id", "primary_nh_ref", "bridge", "length_km"])
    terr = pd.read_csv(C.TERRAIN_CSV, low_memory=False)
    terr["osm_way_id"] = terr["osm_way_id"].round().astype("int64")
    nh = rd[rd["osm_way_id"].astype("int64").isin(
        rd_attr.loc[rd_attr.primary_nh_ref.astype("string").str.upper().str.replace(r"[\s-]", "", regex=True).eq("NH27").fillna(False), "osm_way_id"])].copy()
    nh["osm_way_id"] = nh["osm_way_id"].astype("int64")
    nh = nh.merge(terr[["osm_way_id", "slope_mean", "terrain_gradient", "elevation_change", "z_mean"]], on="osm_way_id", how="left")
    nh = nh.merge(rd_attr[["osm_way_id", "bridge"]].rename(columns={"bridge": "bridge_final"}), on="osm_way_id", how="left")
    cells = daily.drop_duplicates("cell_id")[["cell_id", "lat", "lon"]]
    cells_g = gpd.GeoDataFrame(cells, geometry=gpd.points_from_xy(cells.lon, cells.lat), crs=4326).to_crs(C.UTM)
    inv = ~T
    out = []
    for r in segs.itertuples():
        line = r.geometry
        buf = line.buffer(SEG_BUFFER_M)
        x0, y0, x1, y1 = buf.bounds
        c0, r0 = (int(v) for v in inv * (x0, y1))
        c1, r1 = (int(np.ceil(v)) for v in inv * (x1, y0))
        win_T = T * rasterio.Affine.translation(c0, r0)
        m = rfeat.geometry_mask([mapping(buf)], out_shape=(r1 - r0, c1 - c0), transform=win_T, invert=True)
        cut = lambda k: layers[k][r0:r1, c0:c1][m]  # noqa: E731
        sl, asp_s, asp_c = cut("slope"), cut("aspect_sin"), cut("aspect_cos")
        steep = sl > 5
        asp = (np.degrees(np.arctan2(asp_s[steep].mean(), asp_c[steep].mean())) + 360) % 360 if steep.any() else None
        lc = cut("landcover").astype(int)
        shares = {f"lc_{C.WORLDCOVER_CLASSES.get(k, k)}": round(float((lc == k).mean()), 3) for k in np.unique(lc) if k}
        near_ls = ls[ls.distance(line) <= LANDSLIDE_BUFFER_M]
        dated = sorted(d.date().isoformat() for d in near_ls["event_date"].dropna())
        # RESILION 1 per-way terrain on the NH-27 ways that overlap this segment (length weighted)
        ways = nh[nh.intersects(line.buffer(20))].copy()
        ways["w"] = ways.geometry.intersection(line.buffer(20)).length
        wsum = ways["w"].sum()
        r1_slope = float((ways["slope_mean"] * ways["w"]).sum() / wsum) if wsum and ways["slope_mean"].notna().any() else None
        r1_grad = float((ways["terrain_gradient"] * ways["w"]).sum() / wsum) if wsum and ways["terrain_gradient"].notna().any() else None
        bridges = int(ways["bridge_final"].astype("string").str.lower().isin(["yes", "true", "t", "1", "viaduct"]).sum())
        mid = line.interpolate(0.5, normalized=True)
        ci = cells_g.distance(mid).idxmin()
        cell = cells_g.loc[ci]
        out.append({
            "segmentId": r.id,
            "elevationMean": round(float(cut("elevation").mean()), 1),
            "elevationMin": round(float(cut("elevation").min()), 1),
            "elevationMax": round(float(cut("elevation").max()), 1),
            "slopeMeanDeg": round(float(sl.mean()), 2),
            "slopeP90Deg": round(float(np.percentile(sl, 90)), 2),
            "slopeMaxDeg": round(float(sl.max()), 2),
            "aspectDeg": None if asp is None else round(float(asp), 1),
            "planCurvMean": round(float(cut("plan_curv").mean()), 3),
            "profileCurvMean": round(float(cut("profile_curv").mean()), 3),
            "relief450mMax": round(float(cut("relief_450m").max()), 1),
            "distDrainageM": round(float(ww.distance(line).min()), 1),
            "drainageCrossings": int(ww.intersects(line).sum()),
            "pastLandslides500m": int(len(near_ls)),
            "pastLandslideDates": dated,
            "pastLandslideYears": sorted({int(y) for y in near_ls["year"].dropna()}),
            "resilion1RoadSlopeMean": None if r1_slope is None else round(r1_slope, 2),
            "resilion1TerrainGradient": None if r1_grad is None else round(r1_grad, 3),
            "bridges": bridges,
            "rainCellId": cell.cell_id,
            "rainCellKm": round(float(cell.geometry.distance(mid) / 1000), 1),
            **shares,
        })
    return out


# ---------------------------------------------------------------- district-level context
def district_context() -> dict:
    fl = pd.read_csv(C.FLOOD_CSV, low_memory=False)
    f = fl[fl["district"].astype(str).str.contains("Dima Hasao", case=False)]
    dis = pd.read_csv(C.DISRUPTION_CSV, low_memory=False)
    d = dis[dis["district"].astype(str).str.contains("Dima", case=False)]
    return {
        "floodEventsNamingDistrict": int(len(f)),
        "floodEventDates": sorted(pd.to_datetime(f["start_date"], errors="coerce").dropna().dt.date.astype(str).unique().tolist()),
        "floodNote": "district-level IMD records (coordinates are district HQs); same value for every segment, so not a model feature",
        "disruptions2022": int(len(d)),
        "disruptions2022WithCoordinates": int(d["valid_coordinate"].astype("string").str.lower().eq("true").sum()) if "valid_coordinate" in d else 0,
        "disruptionTypes": d["damage_type"].value_counts().to_dict() if "damage_type" in d else {},
    }


# ---------------------------------------------------------------- PostGIS
def load_db(feats, daily, ls, ctx) -> str:
    from psycopg.types.json import Jsonb
    conn = C.connect()
    if conn is None:
        return "skipped: DATABASE_URL not set"
    s = C.schema()
    cells = daily.drop_duplicates("cell_id")[["cell_id", "lat", "lon"]]
    with conn:
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {s}.segment_features (segment_id text PRIMARY KEY, data jsonb NOT NULL,
              provenance jsonb NOT NULL, computed_at timestamptz NOT NULL DEFAULT now());
            CREATE TABLE IF NOT EXISTS {s}.imd_rain_cells (cell_id text PRIMARY KEY, lat float8, lon float8,
              geom public.geometry(Point, 4326));
            CREATE TABLE IF NOT EXISTS {s}.imd_rain_daily (cell_id text NOT NULL, day date NOT NULL, rain_mm real NOT NULL,
              PRIMARY KEY (cell_id, day));
            CREATE TABLE IF NOT EXISTS {s}.landslide_events (event_id text PRIMARY KEY, event_date date, year int,
              date_precision text, name text, material text, geom public.geometry(Point, 4326), source text);
            CREATE TABLE IF NOT EXISTS {s}.kv_meta (key text PRIMARY KEY, data jsonb NOT NULL);
            TRUNCATE {s}.segment_features, {s}.imd_rain_cells, {s}.imd_rain_daily, {s}.landslide_events;""")
        with conn.cursor() as cur:
            cur.executemany(f"INSERT INTO {s}.segment_features (segment_id, data, provenance) VALUES (%s, %s, %s)",
                            [(f["segmentId"], Jsonb(f), Jsonb(PROV)) for f in feats])
            cur.executemany(f"INSERT INTO {s}.imd_rain_cells VALUES (%s, %s, %s, public.ST_SetSRID(public.ST_MakePoint(%s, %s), 4326))",
                            [(r.cell_id, r.lat, r.lon, r.lon, r.lat) for r in cells.itertuples()])
            with cur.copy(f"COPY {s}.imd_rain_daily (cell_id, day, rain_mm) FROM STDIN") as cp:
                for r in daily.itertuples():
                    cp.write_row((r.cell_id, r.day, float(r.rain_mm)))
            l4 = ls.to_crs(4326)
            cur.executemany(f"INSERT INTO {s}.landslide_events VALUES (%s, %s, %s, %s, %s, %s, public.ST_SetSRID(public.ST_MakePoint(%s, %s), 4326), %s)",
                            [(str(r.event_id), None if pd.isna(r.event_date) else r.event_date.date(), None if pd.isna(r.year) else int(r.year),
                              r.date_precision, r.Slide_Name, r.Material_Involved, r.geometry.x, r.geometry.y, str(C.LANDSLIDES_CSV.name))
                             for r in l4.itertuples()])
        conn.execute(f"INSERT INTO {s}.kv_meta VALUES ('district_context', %s) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data", (Jsonb(ctx),))
        n = conn.execute(f"SELECT (SELECT count(*) FROM {s}.segment_features), (SELECT count(*) FROM {s}.imd_rain_daily), "
                         f"(SELECT count(*) FROM {s}.landslide_events)").fetchone()
    return f"segment_features={n[0]} imd_rain_daily={n[1]} landslide_events={n[2]} (schema {s})"


def main() -> int:
    layers, T, poly, ww, rd = build_stack()
    ls = landslides_dh(poly)
    poly4326 = C.dh_polygon(4326)
    daily = imd_rain(poly4326)
    daily.to_parquet(C.DERIVED / "imd_rain_dh.parquet", index=False)
    feats = segment_features(layers, T, poly, ww, rd, ls, daily)
    ctx = district_context()
    (C.DERIVED / "segment_features.json").write_text(json.dumps({"provenance": PROV, "district": ctx, "segments": feats}, indent=1), encoding="utf-8")
    ls.to_crs(4326).drop(columns=["event_date"]).assign(event_date=ls["event_date"].dt.date.astype(str)).to_file(C.DERIVED / "landslides_dh.geojson", driver="GeoJSON")

    df = pd.DataFrame(feats)
    print(f"segments: {len(df)}; slope mean (100 m buffer) {df.slopeMeanDeg.min():.1f}-{df.slopeMeanDeg.max():.1f} deg, "
          f"P90 max {df.slopeP90Deg.max():.1f}; elevation {df.elevationMin.min():.0f}-{df.elevationMax.max():.0f} m")
    print(f"distance to drainage: median {df.distDrainageM.median():.0f} m; segments crossing a waterway: {(df.drainageCrossings > 0).sum()}")
    print(f"past landslides within 500 m: {df.pastLandslides500m.sum()} hits on {(df.pastLandslides500m > 0).sum()} segments")
    both = df.dropna(subset=["resilion1RoadSlopeMean"])
    print(f"RESILION 1 road slope available on {len(both)} segments; Pearson r with DEM slope mean = "
          f"{both.resilion1RoadSlopeMean.corr(both.slopeMeanDeg):.2f}")
    print(f"bridges on NH-27 ways: {df.bridges.sum()}; rain cells used: {df.rainCellId.nunique()} (max {df.rainCellKm.max()} km away)")
    lc = [c for c in df.columns if c.startswith("lc_")]
    print("mean land cover share in road buffers:", {c[3:]: round(df[c].fillna(0).mean(), 3) for c in lc})
    print("district context:", {k: v for k, v in ctx.items() if k != "floodEventDates"})
    for day in (dt.date(2022, 5, 15), dt.date(2024, 6, 1)):
        rw = [rain_windows(daily, f["rainCellId"], day) for f in feats]
        r7 = [x["rainfall7d"] for x in rw if x["rainfall7d"] is not None]
        print(f"IMD rainfall ending {day}: 24h max {max(x['rainfall24h'] or 0 for x in rw):.1f} mm, 7-day range {min(r7):.1f}-{max(r7):.1f} mm")
    print("postgis:", load_db(feats, daily, ls, ctx))
    return 0


if __name__ == "__main__":
    sys.exit(main())
