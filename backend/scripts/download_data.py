"""Downloads the public datasets that fill the gaps in the team data (see docs/DATA_INVENTORY.md).
Files go to backend/data/raw/ (git-ignored). Existing files are kept (re-run is a no-op).

  - Copernicus DEM GLO-30 (30 m), 4 tiles covering Dima Hasao. Source: AWS Open Data registry
    s3://copernicus-dem-30m (ESA / Copernicus programme; free licence, attribution required).
  - ESA WorldCover 2021 v200 land cover (10 m; read at ~20 m for the district window only; CC BY 4.0).
  - IMD gridded daily rainfall 0.25 deg (Pai et al. 2014), yearly binary files from IMD Pune,
    fetched with imdlib.

Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\download_data.py [--years 2010 2025]
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402,F401  (clears the PostGIS PROJ_LIB/GDAL_DATA for this process)

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
DEM_DIR = RAW / "dem"
IMD_DIR = RAW / "imd"
TILES = [(24, 92), (24, 93), (25, 92), (25, 93)]
DEM_URL = "https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"


def dem() -> list[Path]:
    DEM_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for lat, lon in TILES:
        name = f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM"
        dst = DEM_DIR / f"{name}.tif"
        if not dst.exists() or dst.stat().st_size < 1_000_000:
            print("downloading", name, flush=True)
            tmp = dst.with_suffix(".part")
            urllib.request.urlretrieve(DEM_URL.format(n=name), tmp)
            tmp.replace(dst)
        print(f"  {dst.name}: {dst.stat().st_size / 1e6:.1f} MB")
        out.append(dst)
    return out


def imd(y0: int, y1: int) -> None:
    import imdlib
    IMD_DIR.mkdir(parents=True, exist_ok=True)
    for y in range(y0, y1 + 1):
        f = IMD_DIR / "rain" / f"{y}.grd"
        if f.exists() and f.stat().st_size > 1_000_000:
            print(f"  rain {y}: cached {f.stat().st_size / 1e6:.1f} MB")
            continue
        try:
            imdlib.get_data("rain", y, y, fn_format="yearwise", file_dir=str(IMD_DIR))
            print(f"  rain {y}: {f.stat().st_size / 1e6:.1f} MB" if f.exists() else f"  rain {y}: NOT AVAILABLE")
        except Exception as e:  # noqa: BLE001 - report and continue (latest year may not be published)
            print(f"  rain {y}: failed ({type(e).__name__}: {e})")


WC_DIR = RAW / "worldcover"
WC_URL = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif"
WC_BBOX = (92.40, 24.85, 93.60, 26.00)
WC_RES = 0.0002  # ~20 m; built from the 20 m overview with mode resampling


def worldcover() -> Path:
    """ESA WorldCover 2021 v200 (CC BY 4.0), only the Dima Hasao window is read from the cloud-optimised GeoTIFFs."""
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_origin
    from rasterio.windows import from_bounds
    WC_DIR.mkdir(parents=True, exist_ok=True)
    dst = WC_DIR / "worldcover_2021_dh.tif"
    if dst.exists():
        print(f"  {dst.name}: cached")
        return dst
    x0, y0, x1, y1 = WC_BBOX
    W, H = round((x1 - x0) / WC_RES), round((y1 - y0) / WC_RES)
    out = np.zeros((H, W), dtype="uint8")
    for t, (lx0, lx1) in (("N24E090", (90.0, 93.0)), ("N24E093", (93.0, 96.0))):
        a, b = max(x0, lx0), min(x1, lx1)
        if a >= b:
            continue
        with rasterio.open(WC_URL.format(t=t)) as r:
            win = from_bounds(a, y0, b, y1, r.transform)
            cols = round((b - a) / WC_RES)
            print(f"  reading WorldCover {t} window ({cols}x{H})", flush=True)
            arr = r.read(1, window=win, out_shape=(H, cols), resampling=Resampling.mode)
        c0 = round((a - x0) / WC_RES)
        out[:, c0:c0 + cols] = arr
    prof = {"driver": "GTiff", "height": H, "width": W, "count": 1, "dtype": "uint8", "crs": "EPSG:4326",
            "transform": from_origin(x0, y1, WC_RES, WC_RES), "compress": "deflate", "nodata": 0}
    tmp = dst.with_name(dst.stem + ".part.tif")  # atomic: a failed run never leaves a "cached" partial file
    with rasterio.open(tmp, "w", **prof) as d:
        d.write(out, 1)
    tmp.replace(dst)
    print(f"  {dst.name}: {dst.stat().st_size / 1e6:.1f} MB")
    return dst


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs=2, type=int, default=[2010, 2025])
    ap.add_argument("--skip-dem", action="store_true")
    ap.add_argument("--skip-imd", action="store_true")
    a = ap.parse_args()
    if not a.skip_dem:
        dem()
        worldcover()
    if not a.skip_imd:
        imd(*a.years)
    return 0


if __name__ == "__main__":
    sys.exit(main())
