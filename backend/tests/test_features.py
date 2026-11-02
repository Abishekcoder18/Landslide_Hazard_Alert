"""Phase 3: every NH-27 segment has real terrain / drainage / history / rainfall-cell features with provenance.
Reads backend/data/derived/segment_features.json (skipped until backend/scripts/build_features.py has run)."""
import json
import math
from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[1] / "data"
FEAT = DATA / "derived" / "segment_features.json"
SEGS = DATA / "segments.geojson"

pytestmark = pytest.mark.skipif(not FEAT.exists(), reason="run backend/scripts/build_features.py first")

CORE = ["elevationMean", "slopeMeanDeg", "slopeP90Deg", "slopeMaxDeg", "planCurvMean", "profileCurvMean",
        "relief450mMax", "distDrainageM", "pastLandslides500m", "rainCellId"]


@pytest.fixture(scope="module")
def feats():
    return json.loads(FEAT.read_text(encoding="utf-8"))


def test_one_feature_row_per_segment(feats):
    ids = [f["id"] for f in json.loads(SEGS.read_text(encoding="utf-8"))["features"]]
    assert [f["segmentId"] for f in feats["segments"]] == ids


def test_core_features_present_and_finite(feats):
    for f in feats["segments"]:
        for k in CORE:
            v = f[k]
            assert v is not None, (f["segmentId"], k)
            if isinstance(v, float):
                assert math.isfinite(v), (f["segmentId"], k)


def test_values_physically_plausible(feats):
    for f in feats["segments"]:
        assert 0 <= f["slopeMeanDeg"] <= f["slopeP90Deg"] <= f["slopeMaxDeg"] <= 90
        assert 0 < f["elevationMin"] <= f["elevationMean"] <= f["elevationMax"] < 3000
        assert f["distDrainageM"] >= 0 and f["pastLandslides500m"] >= 0
        assert f["rainCellKm"] < 30  # nearest IMD 0.25 deg cell


def test_provenance_for_every_source(feats):
    assert {"terrain", "landcover", "drainage", "roads", "landslides", "rainfall"} <= set(feats["provenance"])
    assert all("source" in v for v in feats["provenance"].values())
