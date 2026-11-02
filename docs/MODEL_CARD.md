# Model card — landslide susceptibility (initial corridor, NH-27 within Dima Hasao)

*Generated from `backend/models/model_meta.json` by `backend/scripts/model_card.py`. Version `susc-lgbm-20261102`, trained 2026-11-02T23:29:16. Every number below comes from that run.*

## Purpose

Relative landslide susceptibility of NH-27 segments in Dima Hasao; replaces the categorical susceptibility input of the rule-based Risk Index.
The score is **one input** of the rule-based Risk Index (weight 35 of 100 by default). Business rules BR-01..BR-12 alone decide GO / GO caution / HOLD / DIVERT / CLOSE; the model never sets a decision and nothing it outputs is published without an officer (BR-07, BR-08).

## Must not be used for

- setting GO/HOLD/DIVERT/CLOSE directly
- predicting when a landslide will happen
- use outside Dima Hasao without retraining
- Reading the score as a probability of a landslide (it is a relative rank, see below).
- Quoting accuracy other than the spatial cross-validation and back-test figures below.

## Data

| Role | Source |
|---|---|
| Labels (landslides) | `D:\assam_landslide_road_events.csv` (RESILION 1 final; GSI inventory with dates) |
| Roads (sampling only) | `D:\assam_road_dataset_final.csv` (RESILION 1 final) |
| Terrain | Copernicus DEM GLO-30: Copernicus_DSM_COG_10_N24_00_E092_00_DEM.tif, Copernicus_DSM_COG_10_N24_00_E093_00_DEM.tif, Copernicus_DSM_COG_10_N25_00_E092_00_DEM.tif, Copernicus_DSM_COG_10_N25_00_E093_00_DEM.tif |
| Land cover | ESA WorldCover 2021 v200 (`worldcover_2021_dh.tif`) |
| Drainage | OSM waterways (`D:\RESILION\data\raw\roads\north-eastern-zone.gpkg`) |
| District boundary | `D:\RESILION\data\processed\roads\resilion_districts.gpkg` |

Rainfall is **not** a model input: it is a separate Risk Index component (IMD gridded daily rainfall).

## Method

- **Positives:** 317 distinct 30 m cells holding the 379 landslide points inside the Dima Hasao polygon.
- **Negatives:** 3010 random 30 m cells inside the district, at least 500 m from any landslide, drawn per distance-to-road bin at 10× the positives in that bin (road band ≤ 976.2 m, 2,076,168 candidate cells, seed 42). The inventory was mapped along roads and settlements; matching the distance-to-road distribution stops the model from learning survey bias.
- **Features (17):** elevation, slope, slope_max_150m, aspect_sin, aspect_cos, plan_curv, profile_curv, relief_450m, roughness_90m, dist_drainage_m, lc_tree, lc_shrub, lc_grass, lc_crop, lc_built, lc_bare, lc_water. Distance to road is used only for sampling, not as a feature. Terrain wetness index was not computed (no flow-routing library available on the build machine).
- **Models compared:** Slope-only baseline (no fitting), Logistic regression, LightGBM (gradient-boosted trees). Selected: **LightGBM (gradient-boosted trees)** (higher spatial-CV PR-AUC).
- **Validation:** spatial block CV, 10 km blocks, StratifiedGroupKFold 5 folds; threshold chosen inside each training fold for recall >= 0.8. Spatial blocks: 57.
- **Score:** percentile of model output among road-side cells (<= 100 m from any road) in the district; segment = mean within 100 m of the segment. Categories: Very Low < 0.2, Low < 0.4, Moderate < 0.6, High < 0.8, Very High ≥ 0.8.

## Results — spatial block cross-validation (mean ± std over 5 folds)

| Model | ROC-AUC | PR-AUC | Precision | Recall |
|---|---|---|---|---|
| Slope-only baseline (no fitting) | 0.748 ± 0.018 | 0.193 ± 0.062 | 0.170 ± 0.056 | 0.800 ± 0.045 |
| Logistic regression | 0.783 ± 0.032 | 0.267 ± 0.109 | 0.175 ± 0.068 | 0.813 ± 0.039 |
| LightGBM (gradient-boosted trees) | 0.791 ± 0.044 | 0.305 ± 0.081 | 0.152 ± 0.061 | 0.891 ± 0.055 |

PR-AUC of a no-skill model = positive share = 0.0953. Precision and recall use a threshold chosen inside each training fold (inner grouped CV, recall ≥ 0.80) and applied unchanged to the held-out fold.

Per fold (selected model):

| Fold | Test cells | Landslide cells | ROC-AUC | PR-AUC | Threshold | Precision | Recall |
|---|---|---|---|---|---|---|---|
| 0 | 737 | 121 | 0.771 | 0.398 | 0.042 | 0.260 | 0.851 |
| 1 | 654 | 50 | 0.861 | 0.375 | 0.041 | 0.125 | 0.940 |
| 2 | 637 | 46 | 0.785 | 0.276 | 0.027 | 0.111 | 0.913 |
| 3 | 666 | 54 | 0.744 | 0.279 | 0.059 | 0.138 | 0.815 |
| 4 | 633 | 46 | 0.795 | 0.198 | 0.040 | 0.128 | 0.935 |

## Calibration (out-of-fold predictions)

Brier score 0.0972, expected calibration error 0.0823 (10 quantile bins). Raw outputs reflect the 1:10 sampled prevalence, not the true landslide rate; the product therefore uses the percentile score, not the raw output.

| Mean predicted | Observed rate |
|---|---|
| 0.002 | 0.006 |
| 0.007 | 0.021 |
| 0.013 | 0.036 |
| 0.023 | 0.03 |
| 0.04 | 0.06 |
| 0.07 | 0.075 |
| 0.119 | 0.084 |
| 0.214 | 0.096 |
| 0.398 | 0.192 |
| 0.742 | 0.351 |

## Back-test on held-out years

The model is refit **without** any event of the year, then the year's landslide cells are ranked against 200,000 road-band background cells of the district.

| Year | Events | Median percentile | In top 10 % | In top 20 % | In top 40 % | ROC-AUC vs background |
|---|---|---|---|---|---|---|
| 2022 | 46 | 0.917 | 56.5% | 76.1% | 93.5% | 0.8607 |
| 2024 | 15 | 0.928 | 66.7% | 93.3% | 100.0% | 0.9076 |

2022 = the May 2022 Haflong landslides (exact dates 14–16 May 2022 in the inventory). 2024 events carry a year only.

## Feature importance (normalised gain)

| Feature | Share |
|---|---|
| roughness_90m | 0.161 |
| elevation | 0.152 |
| dist_drainage_m | 0.137 |
| slope_max_150m | 0.116 |
| relief_450m | 0.105 |
| profile_curv | 0.075 |
| plan_curv | 0.064 |
| aspect_sin | 0.063 |
| slope | 0.061 |
| aspect_cos | 0.048 |
| lc_crop | 0.010 |
| lc_tree | 0.005 |
| lc_grass | 0.002 |
| lc_built | 0.001 |
| lc_shrub | 0.000 |
| lc_bare | 0.000 |
| lc_water | 0.000 |

## Segment scores (137 NH-27 segments)

min 0.032, median 0.589, max 0.958; classes: High 37, Low 31, Very High 27, Moderate 25, Very Low 17.

## Limitations

- Labels come from one inventory that is denser around Haflong and along roads/railways; distance-to-road matching reduces but cannot remove that bias.
- Static susceptibility only: it ranks *where*, not *when*. Timing comes from rainfall and IMD warnings in the Risk Index.
- Elevation ranks high in importance and may partly act as a proxy for the Haflong area.
- 30 m DEM cannot resolve road cut slopes; no geology, soil or lithology layer was available.
- Calibrated as a rank within Dima Hasao; scores are not comparable with other districts.
- Hyper-parameters were fixed, not tuned, to avoid overfitting the small sample.

## Artefact

`backend/models/susceptibility.joblib` (298,101 bytes, sha256 `36bcb88818f4fa96077693480fdab6081ed558d627df1de725d2c9225d95fcc5`). Reproduce: `download_data.py` → `segment_nh27.py` → `build_features.py` → `train_model.py` → `model_card.py`.
