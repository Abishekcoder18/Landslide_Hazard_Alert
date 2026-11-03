"""Renders docs/MODEL_CARD.md from backend/models/model_meta.json, so every number comes from the actual run.
Run:  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\model_card.py"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402

LABELS = {"slope_only": "Slope-only baseline (no fitting)", "logistic": "Logistic regression", "lightgbm": "LightGBM (gradient-boosted trees)"}


def pm(r: dict, m: str) -> str:
    return f"{r[m + '_mean']:.3f} ± {r[m + '_std']:.3f}"


def main() -> int:
    m = json.loads((C.MODELS / "model_meta.json").read_text(encoding="utf-8"))
    v, s = m["validation"], m["sampling"]
    L = [
        "# Model card — landslide susceptibility (initial corridor, NH-27 within Dima Hasao)", "",
        f"*Generated from `backend/models/model_meta.json` by `backend/scripts/model_card.py`. Version `{m['version']}`, "
        f"trained {m['trained_at']}. Every number below comes from that run.*", "",
        "## Purpose", "",
        m["purpose"],
        "The score is **one input** of the rule-based Risk Index (weight 35 of 100 by default). Business rules "
        "BR-01..BR-12 alone decide GO / GO caution / HOLD / DIVERT / CLOSE; the model never sets a decision and "
        "nothing it outputs is published without an officer (BR-07, BR-08).", "",
        "## Must not be used for", "",
        *[f"- {x}" for x in m["not_for"]],
        "- Reading the score as a probability of a landslide (it is a relative rank, see below).",
        "- Quoting accuracy other than the spatial cross-validation and back-test figures below.", "",
        "## Data", "",
        "| Role | Source |", "|---|---|",
        f"| Labels (landslides) | `{m['data']['labels']}` (RESILION 1 final; GSI inventory with dates) |",
        f"| Roads (sampling only) | `{m['data']['roads']}` (RESILION 1 final) |",
        f"| Terrain | Copernicus DEM GLO-30: {', '.join(m['data']['dem'])} |",
        f"| Land cover | ESA WorldCover 2021 v200 (`{m['data']['landcover']}`) |",
        f"| Drainage | OSM waterways (`{m['data']['drainage']}`) |",
        f"| District boundary | `{m['data']['boundary']}` |", "",
        "Rainfall is **not** a model input: it is a separate Risk Index component (IMD gridded daily rainfall).", "",
        "## Method", "",
        f"- **Positives:** {s['positive_cells']} distinct 30 m cells holding the {s['positives_points_in_district']} landslide points inside the Dima Hasao polygon.",
        f"- **Negatives:** {s['negative_cells']} random 30 m cells inside the district, at least {s['exclude_m']:.0f} m from any landslide, "
        f"drawn per distance-to-road bin at {s['neg_ratio']}× the positives in that bin (road band ≤ {s['road_band_m']} m, "
        f"{s['candidate_negative_cells']:,} candidate cells, seed {s['seed']}). The inventory was mapped along roads and settlements; "
        "matching the distance-to-road distribution stops the model from learning survey bias.",
        f"- **Features ({len(m['features'])}):** {', '.join(m['features'])}. Distance to road is used only for sampling, not as a feature. "
        "Terrain wetness index was not computed (no flow-routing library available on the build machine).",
        f"- **Models compared:** {', '.join(LABELS.values())}. Selected: **{LABELS[m['model']]}** (higher spatial-CV PR-AUC).",
        f"- **Validation:** {v['method']}. Spatial blocks: {s['blocks']}.",
        f"- **Score:** {m['score']}. Categories: " + ", ".join(f"{k} < {c}" if c <= 1 else f"{k} ≥ 0.8" for k, c in m["category_cutoffs"].items()) + ".", "",
        "## Results — spatial block cross-validation (mean ± std over 5 folds)", "",
        "| Model | ROC-AUC | PR-AUC | Precision | Recall |", "|---|---|---|---|---|",
    ]
    for k in ("slope_only", "logistic", "lightgbm"):
        r = v["results"][k]
        L.append(f"| {LABELS[k]} | {pm(r, 'roc_auc')} | {pm(r, 'pr_auc')} | {pm(r, 'precision')} | {pm(r, 'recall')} |")
    r = v["results"][m["model"]]
    L += ["", f"PR-AUC of a no-skill model = positive share = {r['pr_auc_no_skill']}. Precision and recall use a threshold "
          "chosen inside each training fold (inner grouped CV, recall ≥ 0.80) and applied unchanged to the held-out fold.", "",
          "Per fold (selected model):", "", "| Fold | Test cells | Landslide cells | ROC-AUC | PR-AUC | Threshold | Precision | Recall |",
          "|---|---|---|---|---|---|---|---|"]
    for f in r["folds"]:
        L.append(f"| {f['fold']} | {f['n_test']} | {f['pos_test']} | {f['roc_auc']:.3f} | {f['pr_auc']:.3f} | {f['threshold']:.3f} | {f['precision']:.3f} | {f['recall']:.3f} |")
    c = v["calibration_oof"][m["model"]]
    L += ["", "## Calibration (out-of-fold predictions)", "",
          f"Brier score {c['brier']}, expected calibration error {c['ece_quantile_bins']} (10 quantile bins). "
          "Raw outputs reflect the 1:10 sampled prevalence, not the true landslide rate; the product therefore uses the "
          "percentile score, not the raw output.", "", "| Mean predicted | Observed rate |", "|---|---|"]
    L += [f"| {b['mean_predicted']} | {b['observed_rate']} |" for b in c["bins"]]
    L += ["", "## Back-test on held-out years", "",
          "The model is refit **without** any event of the year, then the year's landslide cells are ranked against "
          "200,000 road-band background cells of the district.", "",
          "| Year | Events | Median percentile | In top 10 % | In top 20 % | In top 40 % | ROC-AUC vs background |", "|---|---|---|---|---|---|---|"]
    for b in m["back_test"]:
        if b.get("events"):
            L.append(f"| {b['year']} | {b['events']} | {b['median_percentile_vs_background']} | {b['share_in_top_10pct']:.1%} | "
                     f"{b['share_in_top_20pct']:.1%} | {b['share_in_top_40pct']:.1%} | {b['roc_auc_vs_background']} |")
    L += ["", "2022 = the May 2022 Haflong landslides (exact dates 14–16 May 2022 in the inventory). 2024 events carry a year only.", "",
          "## Feature importance (normalised gain)", "", "| Feature | Share |", "|---|---|"]
    L += [f"| {k} | {val:.3f} |" for k, val in m["feature_importance"].items()]
    ss = m["segment_scores"]
    L += ["", "## Segment scores (137 NH-27 segments)", "",
          f"min {ss['min']}, median {ss['median']}, max {ss['max']}; classes: " + ", ".join(f"{k} {n}" for k, n in ss["classes"].items()) + ".", "",
          "## Limitations", "",
          "- Labels come from one inventory that is denser around Haflong and along roads/railways; distance-to-road matching reduces but cannot remove that bias.",
          "- Static susceptibility only: it ranks *where*, not *when*. Timing comes from rainfall and IMD warnings in the Risk Index.",
          "- Elevation ranks high in importance and may partly act as a proxy for the Haflong area.",
          "- 30 m DEM cannot resolve road cut slopes; no geology, soil or lithology layer was available.",
          "- Calibrated as a rank within Dima Hasao; scores are not comparable with other districts.",
          "- Hyper-parameters were fixed, not tuned, to avoid overfitting the small sample.", "",
          "## Artefact", "",
          f"`backend/models/{m['artifact']['file']}` ({m['artifact']['bytes']:,} bytes, sha256 `{m['artifact']['sha256']}`). "
          "Reproduce: `download_data.py` → `segment_nh27.py` → `build_features.py` → `train_model.py` → `model_card.py`.", ""]
    L += ['', '## How the score is used: Risk Index thresholds (owner decision 2026-11-03)', '', 'The model score is one input (weight 25) of the Risk Index (weights 25/45/15/15: susceptibility / rainfall / slope / history). Thresholds Yellow 30, **Orange 60**, Red 75, chosen from `docs/CALIBRATION.md`: 8 of 10 back-test incidents held on the day before / day of; stretches between holding points on HOLD on a median 25% (worst 63%) of May–Sep days. **Overfitting warning:** only 10 incidents; the choice must be re-checked as new incidents are recorded.', '']  # owner decision, not from model_meta.json
    out = C.REPO / "docs" / "MODEL_CARD.md"
    out.write_text("\n".join(L), encoding="utf-8")
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
