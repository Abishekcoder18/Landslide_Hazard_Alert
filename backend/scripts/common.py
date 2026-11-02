"""Shared paths, grid definition and the schema-safe DB connection for the data scripts.
RESILION 2.0 writes only to schema DB_SCHEMA (resilion2*); RESILION 1 tables in public are read only."""
from __future__ import annotations

import os
import re
from pathlib import Path

# The PostGIS installer sets PROJ_LIB / GDAL_DATA system-wide to its own older PROJ database, which breaks
# rasterio/pyproj wheels ("proj.db ... another PROJ installation"). Drop them for this process only.
for _k in ("PROJ_LIB", "PROJ_DATA", "GDAL_DATA"):
    os.environ.pop(_k, None)

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "backend" / "data"
RAW = DATA / "raw"
DERIVED = DATA / "derived"
MODELS = REPO / "backend" / "models"

# Team data (RESILION 1 final datasets first), read only
ROADS_CSV = Path(r"D:\assam_road_dataset_final.csv")
ROADS_GEOJSON = Path(r"D:\assam_roads_classified.geojson")
TERRAIN_CSV = Path(r"D:\Assam_DEM_Terrain_Road_Features.csv")
LANDSLIDES_CSV = Path(r"D:\assam_landslide_road_events.csv")
FLOOD_CSV = Path(r"D:\Assam_Flood_ML_Ready_FINAL.csv")
DISRUPTION_CSV = Path(r"D:\assam_disruption_road_events.csv")
DISTRICTS = Path(r"D:\RESILION\data\processed\roads\resilion_districts.gpkg")
OSM = Path(r"D:\RESILION\data\raw\roads\north-eastern-zone.gpkg")

# Downloaded public data (backend/scripts/download_data.py)
DEM_TILES = sorted((RAW / "dem").glob("Copernicus_DSM_COG_10_*_DEM.tif"))
WORLDCOVER = RAW / "worldcover" / "worldcover_2021_dh.tif"
IMD_DIR = RAW / "imd"

UTM = 32646
RES = 30.0
READ_BBOX = (92.40, 24.85, 93.60, 26.00)

WORLDCOVER_CLASSES = {10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built", 60: "bare", 70: "snow",
                      80: "water", 90: "wetland", 95: "mangrove", 100: "moss"}


def dh_polygon(crs=UTM):
    import geopandas as gpd
    d = gpd.read_file(DISTRICTS)
    return d[d["name"] == "Dima Hasao"].to_crs(crs).geometry.iloc[0]


def schema() -> str:
    from dotenv import load_dotenv
    load_dotenv(REPO / "backend" / ".env")
    s = os.environ.get("DB_SCHEMA", "resilion2")
    if not re.fullmatch(r"resilion2[a-z0-9_]*", s):
        raise SystemExit(f"DB_SCHEMA must start with resilion2 (got {s}); public is never written")
    return s


def connect():
    """psycopg connection with search_path = <resilion2 schema>, public. Callers still schema-qualify writes."""
    import psycopg
    from dotenv import load_dotenv
    load_dotenv(REPO / "backend" / ".env")
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return None
    dsn = re.sub(r"^postgres(ql)?\+\w+://", "postgresql://", dsn)
    s = schema()
    conn = psycopg.connect(dsn)
    conn.execute(f"CREATE SCHEMA IF NOT EXISTS {s}")
    conn.commit()
    conn.execute(f"SET search_path TO {s}, public")
    return conn
