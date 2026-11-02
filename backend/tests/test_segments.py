"""ST-01 / AC-01: NH-27 within Dima Hasao split into ~1 km segments with stable IDs.
Reads backend/data/segments.geojson + corridor.json written by backend/scripts/segment_nh27.py
(skipped when the derived data has not been generated on this machine)."""
import json
import re
import sys
from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[1] / "data"
SEG_FILE = DATA / "segments.geojson"
CORRIDOR_FILE = DATA / "corridor.json"

pytestmark = pytest.mark.skipif(not SEG_FILE.exists(), reason="run backend/scripts/segment_nh27.py first")


@pytest.fixture(scope="module")
def fc():
    return json.loads(SEG_FILE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def corridor():
    return json.loads(CORRIDOR_FILE.read_text(encoding="utf-8"))


def test_ids_are_sequential_in_chainage_order(fc):
    ids = [f["id"] for f in fc["features"]]
    assert ids == [f"NH27-DH-{i:03d}" for i in range(1, len(ids) + 1)]
    starts = [f["properties"]["startKm"] for f in fc["features"]]
    assert starts == sorted(starts) and starts[0] == 0


def test_segments_are_about_1km(fc):
    for f in fc["features"]:
        assert 900 <= f["properties"]["lengthM"] <= 1100, f["id"]


def test_every_stretch_in_exactly_one_segment_chainage(fc):
    feats = fc["features"]
    for a, b in zip(feats, feats[1:]):
        assert a["properties"]["endKm"] == pytest.approx(b["properties"]["startKm"], abs=1e-3)
        # consecutive segments share the boundary point exactly: no gap, no overlap along the line
        assert a["geometry"]["coordinates"][-1] == b["geometry"]["coordinates"][0], (a["id"], b["id"])


def test_every_stretch_in_exactly_one_segment_geometry(fc):
    shapely = pytest.importorskip("shapely")
    from shapely.geometry import LineString
    from shapely.ops import unary_union
    pyproj = pytest.importorskip("pyproj")
    t = pyproj.Transformer.from_crs(4326, 32646, always_xy=True)
    lines = [LineString([t.transform(x, y) for x, y in f["geometry"]["coordinates"]]) for f in fc["features"]]
    total = sum(line.length for line in lines)
    union = unary_union(lines)
    # any overlap between segments would make the union shorter than the sum
    assert union.length == pytest.approx(total, rel=1e-6)
    for i, a in enumerate(lines):
        for b in lines[i + 2:]:
            assert a.distance(b) > 0 or a.intersection(b).length == 0


def test_zones_and_holding_points_reference_real_segments(fc, corridor):
    ids = {f["id"] for f in fc["features"]}
    hps = {h["id"]: h for h in corridor["holdingPoints"]}
    assert set(hps) == {"HP-LUMDING", "HP-HAFLONG", "HP-SILCHAR"}
    assert all(h["provisional"] for h in hps.values())
    assert all(h["segmentId"] in ids for h in hps.values())
    assert hps["HP-LUMDING"]["segmentId"] == "NH27-DH-001"
    assert hps["HP-SILCHAR"]["segmentId"] == max(ids)
    by_seg: dict[str, list[str]] = {}
    for z in corridor["zones"]:
        assert z["segmentId"] in ids
        assert z["nearestHoldingPointId"] in hps
        assert all(x in hps for x in z["fallbackHoldingPointIds"])
        assert re.fullmatch(r"AZ-\d{3}[NS]", z["id"])
        by_seg.setdefault(z["segmentId"], []).append(z["direction"])
    # one zone per direction for each risky segment
    assert all(sorted(d) == ["Northbound", "Southbound"] for d in by_seg.values())


def test_ids_identical_on_rerun(fc, corridor):
    """Re-runs the segmentation from the source data and compares the fingerprint."""
    pytest.importorskip("geopandas")
    pytest.importorskip("networkx")
    if not Path(r"D:\assam_road_dataset_final.csv").exists():
        pytest.skip("source data on D:\\ not available")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    import segment_nh27 as seg
    r = seg.build(corridor["meta"]["minEventsForZones"])
    assert [s["id"] for s in r["segments"]] == [f["id"] for f in fc["features"]]
    assert seg.fingerprint(r["segments"]) == corridor["meta"]["fingerprint"]
