"""Phase 4 - landslide susceptibility model for the initial corridor (Dima Hasao), trained on real data.

Role (approved): the per-segment model score REPLACES the categorical "GSI susceptibility" input of the
rule-based Risk Index. It never sets GO/HOLD/DIVERT/CLOSE; BR-01..BR-12 do.

Data
  positives : landslide points inside the Dima Hasao polygon (assam_landslide_road_events.csv, RESILION 1 final),
              one sample per 30 m cell.
  negatives : random 30 m cells inside the district, >= 500 m from any landslide, restricted to the same
              distance-to-road band as the positives (<= 95th percentile of positive distance to road).
              The landslide inventory was mapped along roads and settlements, so unrestricted negatives would
              teach the model "near a road = landslide"; matching the road band makes it learn terrain.
              Ratio 10 negatives per positive, fixed seed.
  features  : 30 m stack from build_features.py (Copernicus DEM derivatives, OSM drainage, RESILION 1 roads,
              ESA WorldCover). No rainfall - rainfall is a separate Risk Index component.

Validation: spatial block cross-validation (10 km x 10 km blocks, StratifiedGroupKFold, 5 folds). Thresholds are
chosen inside each training fold (inner group CV, recall >= 0.80) and applied unchanged to the held-out fold.
Back-test: refit without any 2022 event, score the 2022 slide cells against the road-band background.

Outputs: backend/models/susceptibility.joblib, backend/models/model_meta.json,
         backend/data/derived/susceptibility_30m.tif, backend/data/derived/segment_scores.json,
         PostGIS resilion2.segment_scores + resilion2.model_runs.
Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\train_model.py
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

import geopandas as gpd  # noqa: E402
import joblib  # noqa: E402
import lightgbm as lgb  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import rasterio  # noqa: E402
from rasterio import features as rfeat  # noqa: E402
from scipy import ndimage  # noqa: E402
from shapely.geometry import mapping  # noqa: E402
from sklearn.calibration import calibration_curve  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import average_precision_score, brier_score_loss, precision_score, recall_score, roc_auc_score  # noqa: E402
from sklearn.model_selection import StratifiedGroupKFold  # noqa: E402
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

SEED = 42
NEG_RATIO = 10
EXCLUDE_M = 500.0
BLOCK_M = 10_000.0
FOLDS = 5
TARGET_RECALL = 0.80
SEG_BUFFER_M = 100.0
MODEL_VERSION = "susc-lgbm-" + dt.date.today().strftime("%Y%m%d")

NUMERIC = ["elevation", "slope", "slope_max_150m", "aspect_sin", "aspect_cos", "plan_curv", "profile_curv",
           "relief_450m", "roughness_90m", "dist_drainage_m", "dist_road_m"]
LC = {10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built", 60: "bare", 80: "water"}
# dist_road_m is used only to match the sampling (see build_dataset), never as a model input: the inventory was
# mapped along roads, so as a feature it would only encode survey bias and every NH-27 cell would score "very high".
FEATURES = [n for n in NUMERIC if n != "dist_road_m"] + [f"lc_{v}" for v in LC.values()]
ROAD_BINS = [0, 25, 50, 100, 200, 400, 700, 1000]
ROADSIDE_M = 100.0  # segment scores are ranked against road-side terrain (cells within 100 m of any road)
# Susceptibility category cut-offs on the 0-1 score (equal-share classes over the district's road corridor).
CUTS = [(0.2, "Very Low"), (0.4, "Low"), (0.6, "Moderate"), (0.8, "High"), (1.01, "Very High")]


def category(score: float) -> str:
    return next(lbl for cut, lbl in CUTS if score < cut)


# ------------------------------------------------------------------ data
def load_stack():
    with rasterio.open(C.DERIVED / "features_30m.tif") as src:
        names = list(src.descriptions)
        arr = {n: src.read(i + 1) for i, n in enumerate(names)}
        T, crs, shape = src.transform, src.crs, (src.height, src.width)
    return arr, T, crs, shape


def frame(arr: dict, rows: np.ndarray, cols: np.ndarray) -> pd.DataFrame:
    d = {n: arr[n][rows, cols] for n in NUMERIC}
    lc = arr["landcover"][rows, cols].astype(int)
    for code, name in LC.items():
        d[f"lc_{name}"] = (lc == code).astype("float32")
    return pd.DataFrame(d)


def build_dataset(arr, T, shape, ls: gpd.GeoDataFrame, rng) -> tuple[pd.DataFrame, dict]:
    inv = ~T
    rc = np.array([[int(v) for v in inv * (p.x, p.y)][::-1] for p in ls.geometry])  # (row, col)
    ok = (rc[:, 0] >= 0) & (rc[:, 0] < shape[0]) & (rc[:, 1] >= 0) & (rc[:, 1] < shape[1])
    pos = pd.DataFrame({"row": rc[ok, 0], "col": rc[ok, 1], "event_id": ls.loc[ok, "event_id"].astype(str).values,
                        "year": ls.loc[ok, "year"].values, "event_date": ls.loc[ok, "event_date"].values})
    pos = pos.drop_duplicates(["row", "col"]).reset_index(drop=True)
    ls_mask = np.zeros(shape, bool)
    ls_mask[pos.row, pos.col] = True
    dist_ls = ndimage.distance_transform_edt(~ls_mask) * C.RES
    road_band = float(np.percentile(arr["dist_road_m"][pos.row, pos.col], 95))
    cand = (arr["in_district"] == 1) & (dist_ls >= EXCLUDE_M) & (arr["dist_road_m"] <= road_band)
    cr, cc = np.nonzero(cand)
    # Distance-to-road matched negatives: per distance bin, NEG_RATIO x the positives in that bin.
    pos_d = arr["dist_road_m"][pos.row, pos.col]
    cand_d = arr["dist_road_m"][cr, cc]
    picks = []
    for lo, hi in zip(ROAD_BINS[:-1], ROAD_BINS[1:]):
        n_pos = int(((pos_d >= lo) & (pos_d < hi)).sum())
        idx = np.nonzero((cand_d >= lo) & (cand_d < hi))[0]
        if n_pos and len(idx):
            picks.append(rng.choice(idx, size=min(len(idx), NEG_RATIO * n_pos), replace=False))
    pick = np.concatenate(picks)
    neg = pd.DataFrame({"row": cr[pick], "col": cc[pick]})
    X = pd.concat([frame(arr, pos.row.values, pos.col.values), frame(arr, neg.row.values, neg.col.values)], ignore_index=True)
    X["label"] = np.r_[np.ones(len(pos)), np.zeros(len(neg))].astype(int)
    X["row"] = np.r_[pos.row.values, neg.row.values]
    X["col"] = np.r_[pos.col.values, neg.col.values]
    xs, ys = T * (X["col"].values + 0.5, X["row"].values + 0.5)
    X["block"] = (np.floor(np.asarray(xs) / BLOCK_M).astype(int) * 1000 + np.floor(np.asarray(ys) / BLOCK_M).astype(int))
    X["year"] = np.r_[pos.year.values, np.full(len(neg), np.nan)]
    X["event_date"] = np.r_[pos.event_date.values, np.full(len(neg), None)]
    info = {"positives_points_in_district": int(len(ls)), "positive_cells": int(len(pos)), "negative_cells": int(len(neg)),
            "road_band_m": round(road_band, 1), "candidate_negative_cells": int(cand.sum()), "blocks": int(X["block"].nunique()),
            "background_mask": cand, "dist_ls": dist_ls}
    return X, info


# ------------------------------------------------------------------ models
def make(kind: str):
    if kind == "logistic":
        return make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced"))
    if kind == "lightgbm":
        return lgb.LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=20,
                                  subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
                                  class_weight="balanced", random_state=SEED, verbose=-1)
    raise ValueError(kind)


def fit_predict(kind: str, Xtr, ytr, Xte):
    if kind == "slope_only":  # baseline: steeper = more susceptible, no fitting
        return Xte["slope"].to_numpy() / 90.0
    m = make(kind)
    m.fit(Xtr[FEATURES], ytr)
    return m.predict_proba(Xte[FEATURES])[:, 1]


def threshold_for_recall(kind, Xtr, ytr, gtr) -> float:
    """Inner grouped CV on the training fold only; lowest score that keeps recall >= TARGET_RECALL."""
    oof = np.zeros(len(ytr))
    inner = StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=SEED)
    for a, b in inner.split(Xtr, ytr, gtr):
        oof[b] = fit_predict(kind, Xtr.iloc[a], ytr[a], Xtr.iloc[b])
    pos = np.sort(oof[ytr == 1])
    return float(pos[int(np.floor((1 - TARGET_RECALL) * len(pos)))])


def spatial_cv(X: pd.DataFrame) -> tuple[dict, dict]:
    y, g = X["label"].to_numpy(), X["block"].to_numpy()
    outer = StratifiedGroupKFold(n_splits=FOLDS, shuffle=True, random_state=SEED)
    results, oof = {}, {}
    for kind in ("slope_only", "logistic", "lightgbm"):
        rows, pred = [], np.zeros(len(y))
        for k, (tr, te) in enumerate(outer.split(X, y, g)):
            p = fit_predict(kind, X.iloc[tr], y[tr], X.iloc[te])
            pred[te] = p
            thr = threshold_for_recall(kind, X.iloc[tr], y[tr], g[tr])
            yhat = (p >= thr).astype(int)
            rows.append({"fold": k, "n_test": int(len(te)), "pos_test": int(y[te].sum()),
                         "roc_auc": roc_auc_score(y[te], p), "pr_auc": average_precision_score(y[te], p),
                         "threshold": thr, "precision": precision_score(y[te], yhat, zero_division=0),
                         "recall": recall_score(y[te], yhat, zero_division=0)})
        df = pd.DataFrame(rows)
        results[kind] = {"folds": df.round(4).to_dict("records"),
                         **{f"{m}_mean": round(float(df[m].mean()), 4) for m in ("roc_auc", "pr_auc", "precision", "recall")},
                         **{f"{m}_std": round(float(df[m].std(ddof=1)), 4) for m in ("roc_auc", "pr_auc", "precision", "recall")},
                         "pr_auc_no_skill": round(float(y.mean()), 4)}
        oof[kind] = pred
        print(f"  {kind:10s} ROC-AUC {df.roc_auc.mean():.3f} ± {df.roc_auc.std(ddof=1):.3f} | PR-AUC {df.pr_auc.mean():.3f} ± "
              f"{df.pr_auc.std(ddof=1):.3f} | precision {df.precision.mean():.3f} ± {df.precision.std(ddof=1):.3f} | "
              f"recall {df.recall.mean():.3f} ± {df.recall.std(ddof=1):.3f}", flush=True)
    return results, oof


def calibration(y, p) -> dict:
    frac, mean = calibration_curve(y, p, n_bins=10, strategy="quantile")
    ece = float(np.mean(np.abs(frac - mean)))
    return {"brier": round(float(brier_score_loss(y, p)), 4), "ece_quantile_bins": round(ece, 4),
            "bins": [{"mean_predicted": round(float(a), 3), "observed_rate": round(float(b), 3)} for a, b in zip(mean, frac)]}


# ------------------------------------------------------------------ scoring
def predict_raster(model, arr, mask) -> np.ndarray:
    rr, cc = np.nonzero(mask)
    out = np.full(mask.shape, np.nan, dtype="float32")
    for s in range(0, len(rr), 500_000):
        f = frame(arr, rr[s:s + 500_000], cc[s:s + 500_000])
        out[rr[s:s + 500_000], cc[s:s + 500_000]] = model.predict_proba(f[FEATURES])[:, 1]
    return out


def to_percentile(raw: np.ndarray, reference: np.ndarray) -> np.ndarray:
    ref = np.sort(reference[np.isfinite(reference)])
    return (np.searchsorted(ref, raw, side="right") / len(ref)).astype("float32")


def back_test(X: pd.DataFrame, kind: str, arr, background_mask, year: int) -> dict:
    is_year = X["year"].eq(year)
    if X.loc[X.label == 1, "year"].eq(year).sum() == 0:
        return {"year": year, "events": 0}
    train = X[~is_year]
    m = make(kind)
    m.fit(train[FEATURES], train["label"])
    rr, cc = np.nonzero(background_mask)
    rng = np.random.default_rng(SEED)
    pick = rng.choice(len(rr), size=min(len(rr), 200_000), replace=False)
    bg = m.predict_proba(frame(arr, rr[pick], cc[pick])[FEATURES])[:, 1]
    test = X[is_year & (X.label == 1)]
    p = m.predict_proba(test[FEATURES])[:, 1]
    pct = to_percentile(p, bg)
    return {"year": year, "events": int(len(test)), "trained_without_year": True,
            "median_percentile_vs_background": round(float(np.median(pct)), 3),
            "share_in_top_10pct": round(float((pct >= 0.9).mean()), 3),
            "share_in_top_20pct": round(float((pct >= 0.8).mean()), 3),
            "share_in_top_40pct": round(float((pct >= 0.6).mean()), 3),
            "roc_auc_vs_background": round(float(roc_auc_score(np.r_[np.ones(len(p)), np.zeros(len(bg))], np.r_[p, bg])), 4)}


def segment_scores(pct_raster: np.ndarray, T) -> list[dict]:
    fc = json.loads((C.DATA / "segments.geojson").read_text(encoding="utf-8"))
    segs = gpd.GeoDataFrame.from_features(fc["features"], crs=4326).to_crs(C.UTM)
    inv = ~T
    out = []
    for f, geom in zip(fc["features"], segs.geometry):
        buf = geom.buffer(SEG_BUFFER_M)
        x0, y0, x1, y1 = buf.bounds
        c0, r0 = (int(v) for v in inv * (x0, y1))
        c1, r1 = (int(np.ceil(v)) for v in inv * (x1, y0))
        m = rfeat.geometry_mask([mapping(buf)], out_shape=(r1 - r0, c1 - c0), transform=T * rasterio.Affine.translation(c0, r0), invert=True)
        v = pct_raster[r0:r1, c0:c1][m]
        v = v[np.isfinite(v)]
        score = float(v.mean()) if len(v) else None  # mean: balanced classes; P90 kept for reference
        out.append({"segmentId": f["id"], "susceptibilityScore": None if score is None else round(score, 3),
                    "susceptibilityP90": None if not len(v) else round(float(np.percentile(v, 90)), 3),
                    "susceptibility": None if score is None else category(score), "cells": int(len(v)), "modelVersion": MODEL_VERSION})
    return out


# ------------------------------------------------------------------ main
def main() -> int:
    rng = np.random.default_rng(SEED)
    arr, T, crs, shape = load_stack()
    poly = C.dh_polygon()
    ls = gpd.read_file(C.DERIVED / "landslides_dh.geojson").to_crs(C.UTM)
    ls["event_date"] = pd.to_datetime(ls["event_date"], errors="coerce")
    X, info = build_dataset(arr, T, shape, ls, rng)
    print(f"dataset: {info['positive_cells']} landslide cells ({info['positives_points_in_district']} points), "
          f"{info['negative_cells']} negatives from {info['candidate_negative_cells']:,} candidate cells "
          f"(road band <= {info['road_band_m']} m), {info['blocks']} spatial blocks of 10 km", flush=True)

    print("spatial block CV (5 folds, mean ± std):", flush=True)
    cv, oof = spatial_cv(X)
    best = max(("logistic", "lightgbm"), key=lambda k: cv[k]["pr_auc_mean"])
    print(f"selected model: {best} (higher spatial-CV PR-AUC)", flush=True)
    calib = {k: calibration(X["label"].to_numpy(), oof[k]) for k in ("logistic", "lightgbm")}
    print(f"calibration (OOF): " + ", ".join(f"{k} Brier {v['brier']} ECE {v['ece_quantile_bins']}" for k, v in calib.items()))

    bt = [back_test(X, best, arr, info["background_mask"], y) for y in (2022, 2024)]
    for b in bt:
        print(f"back-test {b['year']}: {b}", flush=True)

    model = make(best)
    model.fit(X[FEATURES], X["label"])
    if best == "lightgbm":
        imp = pd.Series(model.booster_.feature_importance("gain"), index=FEATURES)
    else:
        imp = pd.Series(np.abs(model[-1].coef_[0]), index=FEATURES)
    imp = (imp / imp.sum()).sort_values(ascending=False).round(4)
    print("feature importance:", imp.head(8).to_dict())

    # Score the district; the 0-1 score is the percentile of the model output among road-side cells of the district
    # (within 100 m of any road), so 0.82 = more susceptible than 82 % of road-side terrain in Dima Hasao.
    district = arr["in_district"] == 1
    raw = predict_raster(model, arr, district)
    bg = raw[district & (arr["dist_road_m"] <= ROADSIDE_M)]
    pct = np.where(district, to_percentile(raw, bg), np.nan).astype("float32")
    prof = {"driver": "GTiff", "height": shape[0], "width": shape[1], "count": 1, "dtype": "float32", "crs": crs,
            "transform": T, "compress": "deflate", "predictor": 3, "tiled": True, "nodata": np.nan}
    with rasterio.open(C.DERIVED / "susceptibility_30m.tif", "w", **prof) as d:
        d.write(pct, 1)
    scores = segment_scores(pct, T)
    sdf = pd.DataFrame(scores)
    print(f"segment scores: min {sdf.susceptibilityScore.min()} median {sdf.susceptibilityScore.median()} max {sdf.susceptibilityScore.max()}; "
          f"classes {sdf.susceptibility.value_counts().to_dict()}")

    # Agreement with history (not used in training of the score per segment; same events, so descriptive only)
    feats = pd.DataFrame(json.loads((C.DERIVED / "segment_features.json").read_text(encoding="utf-8"))["segments"])
    j = sdf.merge(feats[["segmentId", "pastLandslides500m"]], on="segmentId")
    print(f"segments with past landslides: mean score {j[j.pastLandslides500m > 0].susceptibilityScore.mean():.3f}; "
          f"without: {j[j.pastLandslides500m == 0].susceptibilityScore.mean():.3f}")

    C.MODELS.mkdir(parents=True, exist_ok=True)
    path = C.MODELS / "susceptibility.joblib"
    joblib.dump({"model": model, "features": FEATURES, "landcover_codes": LC, "version": MODEL_VERSION}, path, compress=3)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    meta = {
        "version": MODEL_VERSION, "trained_at": dt.datetime.now().isoformat(timespec="seconds"), "model": best,
        "purpose": "Relative landslide susceptibility of NH-27 segments in Dima Hasao; replaces the categorical susceptibility input of the rule-based Risk Index.",
        "not_for": ["setting GO/HOLD/DIVERT/CLOSE directly", "predicting when a landslide will happen", "use outside Dima Hasao without retraining"],
        "features": FEATURES, "score": "percentile of model output among road-side cells (<= 100 m from any road) in the district; segment = mean within 100 m of the segment",
        "category_cutoffs": {lbl: cut for cut, lbl in CUTS},
        "sampling": {k: v for k, v in info.items() if k not in ("background_mask", "dist_ls")} | {"neg_ratio": NEG_RATIO, "exclude_m": EXCLUDE_M, "seed": SEED},
        "validation": {"method": f"spatial block CV, {int(BLOCK_M / 1000)} km blocks, StratifiedGroupKFold {FOLDS} folds; threshold chosen inside each training fold for recall >= {TARGET_RECALL}",
                       "results": cv, "calibration_oof": calib},
        "back_test": bt, "feature_importance": imp.to_dict(),
        "segment_scores": {"min": float(sdf.susceptibilityScore.min()), "median": float(sdf.susceptibilityScore.median()),
                           "max": float(sdf.susceptibilityScore.max()), "classes": sdf.susceptibility.value_counts().to_dict()},
        "data": {"labels": str(C.LANDSLIDES_CSV), "roads": str(C.ROADS_CSV), "dem": [p.name for p in C.DEM_TILES],
                 "landcover": str(C.WORLDCOVER.name), "drainage": str(C.OSM), "boundary": str(C.DISTRICTS)},
        "artifact": {"file": path.name, "bytes": path.stat().st_size, "sha256": sha},
    }
    (C.MODELS / "model_meta.json").write_text(json.dumps(meta, indent=1, default=str), encoding="utf-8")
    (C.DERIVED / "segment_scores.json").write_text(json.dumps(scores, indent=1), encoding="utf-8")
    print(f"model saved {path} ({path.stat().st_size / 1e6:.2f} MB) sha256 {sha[:12]}")

    conn = C.connect()
    if conn is not None:
        from psycopg.types.json import Jsonb
        s = C.schema()
        with conn:
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {s}.segment_scores (segment_id text PRIMARY KEY, susceptibility_score real,
                  susceptibility text, model_version text NOT NULL, data jsonb NOT NULL);
                CREATE TABLE IF NOT EXISTS {s}.model_runs (version text PRIMARY KEY, trained_at timestamptz, meta jsonb NOT NULL);
                TRUNCATE {s}.segment_scores;""")
            with conn.cursor() as cur:
                cur.executemany(f"INSERT INTO {s}.segment_scores VALUES (%s, %s, %s, %s, %s)",
                                [(x["segmentId"], x["susceptibilityScore"], x["susceptibility"], x["modelVersion"], Jsonb(x)) for x in scores])
            conn.execute(f"INSERT INTO {s}.model_runs VALUES (%s, %s, %s) ON CONFLICT (version) DO UPDATE SET trained_at = EXCLUDED.trained_at, meta = EXCLUDED.meta",
                         (MODEL_VERSION, meta["trained_at"], Jsonb(json.loads(json.dumps(meta, default=str)))))
        print(f"postgis: {len(scores)} segment scores + model run {MODEL_VERSION} in schema {s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
