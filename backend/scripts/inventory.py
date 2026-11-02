"""Phase 1 data inventory (read only).

Lists the data files on D:\\ that the RESILION 2.0 model and segment work may use,
and writes docs/DATA_INVENTORY.md. Nothing is copied or modified.

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\inventory.py
"""
from __future__ import annotations

import datetime as dt
import re
import sys
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

warnings.filterwarnings("ignore")

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "DATA_INVENTORY.md"

# Dima Hasao district bbox (master prompt): lon 92.55-93.45 E, lat 24.95-25.95 N
DH = (92.55, 24.95, 93.45, 25.95)
DISTRICTS = r"D:\RESILION\data\processed\roads\resilion_districts.gpkg"
UTM = 32646  # metres, for lengths and distances

# Files whose name contains "final" (data formats only) + the two road GeoPackages.
FINAL_FILES = [
    r"D:\Assam_Flood_ML_Ready_FINAL.csv",
    r"D:\assam_road_dataset_final.csv",
    r"D:\road_network_final_1468.csv",
    r"D:\RESILION\data\processed\roads\assam_road_terrain.gpkg",
    r"D:\RESILION\data\processed\roads\resilion_roads.gpkg",
]
# No "final" file exists for landslide, rainfall or DEM, so these candidates are also inventoried.
CANDIDATES = [
    r"D:\Assam_Landslide_Data.csv",
    r"D:\Assam_Landslide_Data_Temporal_Standardized.csv",
    r"D:\assam_landslide_road_events.csv",
    r"D:\Assam_Rainfall.csv",
    r"D:\RESILION\data\processed\rainfall\assam_rainfall_cleaned.csv",
    r"D:\Assam_DEM_Terrain_Road_Features.csv",
    r"D:\assam_flood_road_events.csv",
    r"D:\assam_disruption_road_events.csv",
    r"D:\disruption_road_reference_2022.csv",
    r"D:\historical_road_disruption_dataset.csv",
    r"D:\road_network_with_historical_risk.csv",
    r"D:\assam_nh_roads.csv",
    DISTRICTS,
    r"D:\RESILION\data\processed\roads\assam_road_rainfall.gpkg",
    r"D:\RESILION\data\processed\roads\assam_road_master.gpkg",
    r"D:\RESILION\data\raw\roads\north-eastern-zone.gpkg",
    r"D:\assam_roads_classified.geojson",
]
# Non-data files with "final" in the name (listed, not parsed).
FINAL_NON_DATA = [
    r"D:\ER-diagram-final.drawio",
    r"D:\final_prediction.jpeg",
    r"D:\RESILION_Stage1_Problem_Framing_FINAL.pptx",
]

LAT_NAMES = re.compile(r"^(lat|latitude|y)$", re.I)
LON_NAMES = re.compile(r"^(lon|long|lng|longitude|x)$", re.I)
DATE_HINT = re.compile(r"(date|time|year|month|day|period|timestamp)", re.I)
DIST_HINT = re.compile(r"district", re.I)
DH_NAMES = re.compile(r"dima|hasao|north\s*cachar|n\.?\s*c\.?\s*hills", re.I)
REF_COLS = re.compile(r"^(ref|road_ref)$", re.I)
NH27 = r"^\s*NH[\s-]*27\s*$"  # exact NH 27 / NH-27 / NH27 (not SH27, not NH 127)


def _is_text(s: pd.Series) -> bool:
    return pd.api.types.is_string_dtype(s) or s.dtype == object


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def short(vals, k=4, w=40) -> str:
    return ", ".join(str(v)[:w] for v in sorted(set(map(str, vals)))[:k])


def date_ranges(df: pd.DataFrame) -> list[str]:
    out = []
    for c in df.columns:
        if not DATE_HINT.search(str(c)):
            continue
        s = df[c].dropna()
        if s.empty:
            out.append(f"`{c}`: all missing")
            continue
        if pd.api.types.is_numeric_dtype(s):
            if s.between(1900, 2100).all():
                out.append(f"`{c}`: {int(s.min())}–{int(s.max())}")
            continue  # numeric non-year columns (e.g. travel_time_min) are not dates
        p = pd.to_datetime(s.astype(str), errors="coerce", dayfirst=True, format="mixed")
        ok = p.notna().mean()
        if ok >= 0.5:
            out.append(f"`{c}`: {p.min().date()} – {p.max().date()} ({ok:.0%} of non-null parsed)")
    return out


def district_hits(df: pd.DataFrame) -> list[str]:
    out = []
    for c in df.columns:
        if DIST_HINT.search(str(c)) and _is_text(df[c]):
            vals = df[c].dropna().astype(str)
            hit = vals[vals.str.contains(DH_NAMES)]
            out.append(f"`{c}`: {len(hit)} rows mention Dima Hasao/N.C. Hills"
                       + (f" (e.g. {short(hit.unique(), 3)})" if len(hit) else ""))
    return out


def nh27(df: pd.DataFrame) -> list[str]:
    out = []
    for c in df.columns:
        if REF_COLS.match(str(c)) and _is_text(df[c]):
            vals = df[c].dropna().astype(str)
            # refs can be "NH27;AH1" etc. -> split on ; and test each part exactly
            hit = vals[vals.str.split(";").apply(lambda xs: any(re.match(NH27, x, re.I) for x in xs))]
            out.append(f"`{c}` = NH-27 in {len(hit)} rows" + (f" (e.g. {short(hit.unique(), 4)})" if len(hit) else ""))
    return out


def table_columns(df: pd.DataFrame) -> list[tuple[str, str, float]]:
    return [(str(c), str(df[c].dtype), float(df[c].isna().mean())) for c in df.columns]


def inspect_csv(path: Path) -> dict:
    df = pd.read_csv(path, low_memory=False)
    info = {"format": "CSV", "crs": "none (tabular)", "rows": len(df), "columns": table_columns(df),
            "dates": date_ranges(df), "districts": district_hits(df), "nh27": nh27(df)}
    lat = next((c for c in df.columns if LAT_NAMES.match(str(c))), None)
    lon = next((c for c in df.columns if LON_NAMES.match(str(c))), None)
    if lat and lon:
        la = pd.to_numeric(df[lat], errors="coerce")
        lo = pd.to_numeric(df[lon], errors="coerce")
        m = la.notna() & lo.notna()
        bad = m & ~(lo.between(85, 100) & la.between(20, 32))
        info["crs"] = f"assumed WGS84 from `{lon}`/`{lat}`"
        ok = m & ~bad
        info["bbox"] = (lo[ok].min(), la[ok].min(), lo[ok].max(), la[ok].max())
        if bad.any():
            info["bad_coords"] = int(bad.sum())
        inside = ok & lo.between(DH[0], DH[2]) & la.between(DH[1], DH[3])
        info["dh_rows"] = int(inside.sum())
    return info


def inspect_vector(path: Path) -> list[dict]:
    out = []
    for name, gtype in pyogrio.list_layers(path):
        meta = pyogrio.read_info(path, layer=name, force_feature_count=True, force_total_bounds=True)
        attrs = pyogrio.read_dataframe(path, layer=name, read_geometry=False)
        info = {"layer": name, "geom": gtype, "format": "GeoPackage" if path.suffix == ".gpkg" else "GeoJSON",
                "crs": "EPSG:4326 / OGC:CRS84 (lon, lat)" if "84" in str(meta.get("crs")) or "4326" in str(meta.get("crs")) else meta.get("crs"),
                "rows": int(meta.get("features") or 0),
                "bbox": tuple(meta["total_bounds"]) if meta.get("total_bounds") is not None else None,
                "columns": table_columns(attrs), "dates": date_ranges(attrs),
                "districts": district_hits(attrs), "nh27": nh27(attrs)}
        if gtype is not None and info["rows"]:
            info["dh_rows"] = len(pyogrio.read_dataframe(path, layer=name, bbox=DH, read_geometry=False))
        out.append(info)
    return out


def covers_dh(bbox) -> str:
    if bbox is None or any(pd.isna(v) for v in bbox):
        return "unknown"
    x0, y0, x1, y1 = bbox
    if x0 <= DH[0] and y0 <= DH[1] and x1 >= DH[2] and y1 >= DH[3]:
        return "full bbox"
    if x1 < DH[0] or x0 > DH[2] or y1 < DH[1] or y0 > DH[3]:
        return "NO overlap"
    return "partial"


def section(path: str) -> list[str]:
    p = Path(path)
    lines = [f"### `{p}`", ""]
    if not p.exists():
        return lines + ["**Missing on disk.**", ""]
    st = p.stat()
    lines.append(f"- Size: {human(st.st_size)} · modified {dt.date.fromtimestamp(st.st_mtime)}")
    try:
        infos = inspect_csv(p) if p.suffix.lower() == ".csv" else inspect_vector(p)
    except Exception as e:  # report, don't hide
        return lines + [f"- **Could not read:** `{type(e).__name__}: {e}`", ""]
    for info in infos if isinstance(infos, list) else [infos]:
        if "layer" in info:
            lines.append(f"- **Layer `{info['layer']}`** ({info['geom']})")
        lines.append(f"- Format: {info['format']} · CRS: {info['crs']}")
        lines.append(f"- Rows/features: {info['rows']:,}")
        bbox = info.get("bbox")
        if bbox is not None:
            lines.append(f"- Extent (lon/lat): {bbox[0]:.4f}, {bbox[1]:.4f} – {bbox[2]:.4f}, {bbox[3]:.4f} · "
                         f"covers Dima Hasao bbox: **{covers_dh(bbox)}**")
        else:
            lines.append("- Extent: no coordinates")
        if info.get("bad_coords"):
            lines.append(f"- **{info['bad_coords']:,} rows have coordinates outside Assam/NE India (invalid or projected)**")
        if "dh_rows" in info:
            lines.append(f"- Rows inside Dima Hasao bbox: **{info['dh_rows']:,}**")
        for d in info.get("dates", []):
            lines.append(f"- Date column {d}")
        for d in info.get("districts", []):
            lines.append(f"- District {d}")
        for d in info.get("nh27", []):
            lines.append(f"- NH-27: {d}")
        cols = info.get("columns", [])
        lines += ["", f"<details><summary>{len(cols)} columns (type, missing share)</summary>", "",
                  "| Column | Type | Missing |", "|---|---|---|"]
        lines += [f"| {c} | {t} | {m:.1%} |" for c, t, m in cols]
        lines += ["", "</details>", ""]
    return lines


def dh_focus() -> list[str]:
    """Checks against the real Dima Hasao polygon (not just the bbox)."""
    L = ["## Dima Hasao focus (district polygon from `resilion_districts.gpkg`)", ""]
    d = gpd.read_file(DISTRICTS)
    poly = d[d["name"] == "Dima Hasao"]
    if poly.empty:
        return L + ["**Dima Hasao polygon not found.**", ""]
    poly_u = poly.to_crs(UTM)
    L.append(f"- Polygon area: {poly_u.area.sum() / 1e6:,.0f} km²; bounds (lon/lat) "
             + ", ".join(f"{v:.3f}" for v in poly.total_bounds))

    # Roads: NH-27 inside the polygon
    roads = gpd.read_file(r"D:\RESILION\data\processed\roads\assam_road_terrain.gpkg", bbox=DH)
    is27 = roads["road_ref"].fillna("").astype(str).str.split(";").apply(
        lambda xs: any(re.match(NH27, x, re.I) for x in xs))
    nh = roads[is27].to_crs(UTM)
    clip = gpd.clip(nh, poly_u)
    L.append(f"- `assam_road_terrain.gpkg`: {is27.sum()} NH-27 ways in bbox; "
             f"{len(clip)} intersect the polygon, **{clip.length.sum() / 1000:.1f} km** of way length inside "
             f"(dual carriageways counted twice). `oneway` values: {clip['oneway'].value_counts().to_dict()}")
    L.append(f"  - terrain fields on those ways: slope_mean missing {clip['slope_mean'].isna().mean():.0%}, "
             f"z_mean missing {clip['z_mean'].isna().mean():.0%}; slope_mean range "
             f"{clip['slope_mean'].min():.1f}–{clip['slope_mean'].max():.1f}")
    merged = clip.union_all().simplify(0)
    L.append(f"  - merged geometry type: {merged.geom_type}"
             + (f" with {len(merged.geoms)} parts" if hasattr(merged, "geoms") else ""))

    # Landslides inside polygon
    ls = pd.read_csv(r"D:\Assam_Landslide_Data_Temporal_Standardized.csv")
    g = gpd.GeoDataFrame(ls, geometry=gpd.points_from_xy(ls.Longitude, ls.Latitude), crs=4326)
    inside = g[g.within(poly.geometry.iloc[0])]
    yrs = inside["event_year"].dropna().astype(int).value_counts().sort_index()
    L.append(f"- Landslides (`Assam_Landslide_Data_Temporal_Standardized.csv`) inside polygon: **{len(inside)}** "
             f"of {len(ls)}; with a year: {inside['event_year'].notna().sum()}; with an exact date: "
             f"{inside['event_date'].notna().sum()}; `date_precision`: {inside['date_precision'].value_counts().to_dict()}")
    L.append(f"  - by year: {yrs.to_dict()}")
    L.append(f"  - unique coordinates: {inside[['Latitude', 'Longitude']].drop_duplicates().shape[0]} "
             f"(coordinate decimals limit precision to ~1 km if rounded to 0.01°)")
    near = inside.to_crs(UTM)
    dist = near.geometry.apply(lambda p: nh.distance(p).min())
    L.append(f"  - distance to nearest NH-27 way: ≤500 m: {(dist <= 500).sum()}, ≤1 km: {(dist <= 1000).sum()}, "
             f"≤2 km: {(dist <= 2000).sum()}")
    L.append(f"  - `Material_Involved`: {inside['Material_Involved'].value_counts().to_dict()}")

    # Rainfall stations
    rf = pd.read_csv(r"D:\RESILION\data\processed\rainfall\assam_rainfall_cleaned.csv")
    st = rf.groupby("station_id").agg(lat=("latitude", "first"), lon=("longitude", "first"),
                                      n=("date", "size"), first=("date", "min"), last=("date", "max")).reset_index()
    sg = gpd.GeoDataFrame(st, geometry=gpd.points_from_xy(st.lon, st.lat), crs=4326).to_crs(UTM)
    sg["km_to_dh"] = sg.distance(poly_u.geometry.iloc[0]) / 1000
    rf["date_p"] = pd.to_datetime(rf["date"], dayfirst=True, errors="coerce")
    years = rf["date_p"].dt.year.value_counts().sort_index()
    L.append(f"- Rainfall (`assam_rainfall_cleaned.csv`): {len(st)} stations, none inside the polygon "
             f"(nearest {sg['km_to_dh'].min():.0f} km: {sg.loc[sg['km_to_dh'].idxmin(), 'station_id']}); "
             f"years {years.index.min()}–{years.index.max()}; rows per year median {int(years.median())}; "
             f"**no 2022 or 2024 data**")
    L.append("  - stations: " + "; ".join(f"{r.station_id} ({r.km_to_dh:.0f} km, {r.n} rows)"
                                          for r in sg.sort_values("km_to_dh").itertuples()))

    # Flood events
    fl = pd.read_csv(r"D:\Assam_Flood_ML_Ready_FINAL.csv")
    L.append(f"- Flood (`Assam_Flood_ML_Ready_FINAL.csv`): rows naming Dima Hasao: "
             f"{fl['district'].astype(str).str.contains('Dima Hasao').sum()}; `coordinate_status`: "
             f"{fl['coordinate_status'].value_counts().to_dict()} — points are district HQs, not flood extents")

    # Drainage: OSM waterways
    ww = gpd.read_file(r"D:\RESILION\data\raw\roads\north-eastern-zone.gpkg", layer="gis_osm_waterways_free", bbox=DH)
    ww_in = gpd.clip(ww.to_crs(UTM), poly_u)
    L.append(f"- Drainage (OSM `gis_osm_waterways_free`): {len(ww_in)} features inside polygon, "
             f"{ww_in.length.sum() / 1000:.0f} km; classes {ww_in['fclass'].value_counts().to_dict()}")
    return L + [""]


def main() -> int:
    md = ["# Data inventory", "",
          f"Generated by `backend/scripts/inventory.py` on {dt.date.today()} (read only; nothing copied).",
          f"Dima Hasao bbox used: lon {DH[0]}–{DH[2]} E, lat {DH[1]}–{DH[3]} N.", ""]
    print("dima hasao focus", flush=True)
    md += dh_focus()
    md += ["## Files with \"final\" in the name + road GeoPackages", ""]
    for f in FINAL_FILES:
        print("reading", f, flush=True)
        md += section(f)
    md += ["## Other candidate files (no \"final\" version exists for landslide, rainfall or DEM)", ""]
    for f in CANDIDATES:
        print("reading", f, flush=True)
        md += section(f)
    md += ["## Non-data files with \"final\" in the name (not parsed)", ""]
    md += [f"- `{f}`" for f in FINAL_NON_DATA]
    md += ["", "## Raster / DEM search", "",
           "Searched all of D:\\ (excluding QGIS, node_modules, venvs, games) for "
           ".tif/.tiff/.hgt/.asc/.img/.vrt/.nc/.dem/.bil: **none found**. Terrain exists only as per-OSM-way "
           "statistics (`z_mean`, `slope_mean`, `elevation_change`, `terrain_gradient`) in "
           "`Assam_DEM_Terrain_Road_Features.csv` / `assam_road_terrain.gpkg`; aspect and curvature are not available.", ""]
    OUT.write_text("\n".join(md), encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
