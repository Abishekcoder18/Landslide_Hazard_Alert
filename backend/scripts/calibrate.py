"""Calibration of the Risk Index CONFIGURATION (weights, Orange/Red thresholds) on the back-test -> docs/CALIBRATION.md.

Nothing is applied: BR-01..BR-12 and the engine are unchanged; the app's own code is replayed in memory (corridor_data
-> new_state -> Workflow.seed_initial) with each candidate configuration. Days replayed: the day before / day of each
back-test incident, every May-Sep day 2022..2026 (IMD to 2025, Open-Meteo archive 2026), and 20 Mar / 10 May / 15 May 2022.

Grid: Orange 55..80 step 5, Red = Orange + 15 (max 95), Yellow 30 (unchanged); weights (susceptibility / rainfall /
slope / history) 25/45/15/15, 20/55/15/10, 15/60/15/10.

Measures per setting:
  incidents held   - a zone whose segments ahead (FR-09, up to the next holding point) include the incident segment is
                     on HOLD on the day before or the day of (out of the back-test incidents)
  stretch hold days - per stretch between consecutive holding points: share of May-Sep days with any zone of that
                     stretch on HOLD; median and worst stretch
  zones on HOLD on 20 Mar, 10 May, 15 May 2022
Also: the 3 longest stretches and OSM places / POIs within 500 m of NH-27 in them (holding-point candidates, verified=no).

Run (data venv):  backend\\.venv-data\\Scripts\\python.exe backend\\scripts\\calibrate.py
"""
from __future__ import annotations

import copy
import csv
import statistics
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C  # noqa: E402  (before geopandas: PROJ env fix)

import geopandas as gpd  # noqa: E402
from shapely.geometry import LineString  # noqa: E402

sys.path.insert(0, str(C.REPO / "backend"))
import app.service as service  # noqa: E402
from app import corridor_data  # noqa: E402
from app.domain.decision_engine import segments_ahead  # noqa: E402

DOC = C.REPO / "docs" / "CALIBRATION.md"
INCIDENTS = C.REPO / "backend" / "inputs" / "incidents.csv"
WEIGHTS = [(25, 45, 15, 15), (20, 55, 15, 10), (15, 60, 15, 10)]
ORANGES = [55, 60, 65, 70, 75, 80]
CHECK_DAYS = [date(2022, 3, 20), date(2022, 5, 10), date(2022, 5, 15)]
MIN_HELD = 8
NOTE_15_MAY = ('**Reading the 15 May column.** With the Phase 8 diversion candidates, BR-03 offers real detours (DIVERT) for some zones in front of Red segments when every diversion-road segment is OPEN and Green/Yellow (35 zones with the current default on 15 May 2022). An Orange segment always gives HOLD in the decision table (BR-01/BR-02), so raising the Orange threshold turns some Red segments Orange and their DIVERT zones become HOLD; that is why the 15 May HOLD count can rise with stricter thresholds. Before Phase 8 (no candidates) the current default gave 172 HOLD on 15 May.')


def settings():
    for w in WEIGHTS:
        for o in ORANGES:
            yield {"weights": dict(zip(("susceptibility", "rainfall", "slope", "history"), w)),
                   "thresholds": {"yellow": 30, "orange": o, "red": min(o + 15, 95)}}


def label(s) -> str:
    w, t = s["weights"], s["thresholds"]
    return f"{w['susceptibility']}/{w['rainfall']}/{w['slope']}/{w['history']} · O{t['orange']} R{t['red']}"


def run(cor: dict, now: datetime, setting: dict) -> dict:
    """Replay one day with one configuration. DEFAULT_CONFIG is patched only for this call."""
    orig = service.DEFAULT_CONFIG
    cfg = copy.deepcopy(orig)
    cfg["weights"] = {**cfg["weights"], **setting["weights"]}
    cfg["thresholds"] = {**cfg["thresholds"], **setting["thresholds"]}
    service.DEFAULT_CONFIG = cfg
    try:
        s = service.new_state(now, cor)
        service.Workflow(s, lambda: now).seed_initial()
    finally:
        service.DEFAULT_CONFIG = orig
    return {z: d["result"]["decision"] == "HOLD" for z, d in s["decisions"].items()}


def main() -> int:
    t0 = time.time()
    schema = C.schema()
    with C.connect() as conn:
        segs = [d for (d,) in conn.execute(f"SELECT data FROM {schema}.ref_segments ORDER BY pos").fetchall()]
        zones = [d for (d,) in conn.execute(f"SELECT data FROM {schema}.ref_zones ORDER BY pos").fetchall()]
        hps = {d["id"]: d for (d,) in conn.execute(f"SELECT data FROM {schema}.ref_holding_points ORDER BY pos").fetchall()}
        last = conn.execute(f"SELECT max(day) FROM {schema}.openmeteo_rain_daily").fetchone()[0] or date(2025, 12, 31)
        order = [s["id"] for s in segs]
        pos = {sid: i for i, sid in enumerate(order)}
        ahead = {z["id"]: segments_ahead(z, order, hps) for z in zones}
        incidents = []
        for r in csv.DictReader(INCIDENTS.open(encoding="utf-8")):
            if "EXCLUDED" in r["notes"] or not r["lat"]:
                continue
            sid = conn.execute(f"SELECT id FROM {schema}.ref_segments ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326) LIMIT 1",
                               (float(r["lon"]), float(r["lat"]))).fetchone()[0]
            incidents.append({"id": r["event_id"], "date": date.fromisoformat(r["date"]), "segment": sid})
        inc_days = {i["date"] + timedelta(days=o) for i in incidents for o in (-1, 0)}
        monsoon = [date(y, m, 1) + timedelta(days=k) for y in range(2022, 2027) for m in (5,) for k in range(153)]
        monsoon = [d for d in monsoon if d <= last]
        days = sorted(set(monsoon) | inc_days | set(CHECK_DAYS))
        grid = list(settings())
        holds: dict[int, dict[date, dict]] = {k: {} for k in range(len(grid))}
        for n, d in enumerate(days, 1):
            now = datetime(d.year, d.month, d.day, 6, 0, tzinfo=timezone.utc)
            cor = corridor_data.load_corridor(conn, schema, d, now)
            for k, st in enumerate(grid):
                holds[k][d] = run(cor, now, st)
            if n % 100 == 0:
                print(f"{n}/{len(days)} days, {time.time() - t0:.0f} s", flush=True)

    # stretches between consecutive holding points (by the holding point's own segment)
    hp_pos = sorted({pos[h["segmentId"]] for h in hps.values()})
    stretches = [(a, b) for a, b in zip(hp_pos, hp_pos[1:])]
    seg_by_pos = {i: s for i, s in enumerate(segs)}

    def stretch_of(zone):
        p = pos[zone["segmentId"]]
        for k, (a, b) in enumerate(stretches):
            if a <= p < b or (k == len(stretches) - 1 and p == b):
                return k
        return None
    zone_stretch = {z["id"]: stretch_of(z) for z in zones}
    hp_name = {}
    for h in hps.values():
        hp_name.setdefault(pos[h["segmentId"]], h["shortName"])

    rows = []
    mon = [d for d in days if 5 <= d.month <= 9 and d in set(monsoon)]
    for k, st in enumerate(grid):
        hd = holds[k]
        held = sum(any(hd[i["date"] + timedelta(days=o)][z] for o in (-1, 0) for z, a in ahead.items() if i["segment"] in a)
                   for i in incidents)
        shares = []
        for s_i in range(len(stretches)):
            zs = [z for z, v in zone_stretch.items() if v == s_i]
            shares.append(sum(any(hd[d][z] for z in zs) for d in mon) / len(mon))
        rows.append({"setting": st, "held": held, "median": statistics.median(shares), "worst": max(shares),
                     "worstStretch": shares.index(max(shares)), "shares": shares,
                     "check": [sum(hd[d].values()) for d in CHECK_DAYS]})
    ok = [r for r in rows if r["held"] >= MIN_HELD]
    best = min(ok, key=lambda r: (r["median"], r["worst"])) if ok else None
    current = rows[0]  # 25/45/15/15, Orange 55, Red 70 = today's default
    write_doc(rows, best, current, stretches, seg_by_pos, hp_name, incidents, mon, len(days), last)
    print(f"done in {time.time() - t0:.0f} s -> {DOC}")
    return 0


def candidates_in(stretches_sorted, seg_by_pos) -> dict[int, list[str]]:
    """OSM places and POIs within 500 m of NH-27 inside each stretch (holding-point candidates, verified = no)."""
    bbox = (92.70, 25.00, 93.30, 25.80)
    pl = gpd.read_file(C.OSM, layer="gis_osm_places_free", bbox=bbox)
    pl = pl[pl["fclass"].isin(["town", "village", "hamlet", "suburb", "locality"]) & pl["name"].notna()]
    po = gpd.read_file(C.OSM, layer="gis_osm_pois_free", bbox=bbox)
    po = po[po["fclass"].isin(["parking", "fuel", "bus_station", "police", "hospital", "clinic", "school", "college",
                               "community_centre", "marketplace", "restaurant", "hotel", "guesthouse", "rest_area"])]
    cand = gpd.GeoDataFrame(
        {"label": [f"{n} ({c}, osm:{i})" for n, c, i in zip(pl["name"], pl["fclass"], pl["osm_id"])]
         + [f"{n or 'unnamed'} ({c}, osm:{i})" for n, c, i in zip(po["name"], po["fclass"], po["osm_id"])]},
        geometry=list(pl.geometry) + list(po.geometry), crs=4326).to_crs(C.UTM)
    out = {}
    for k, (a, b) in stretches_sorted:
        line = LineString([(c[1], c[0]) for p in range(a, b + 1) for c in seg_by_pos[p]["coordinates"]])
        g = gpd.GeoSeries([line], crs=4326).to_crs(C.UTM).iloc[0]
        near = cand[cand.distance(g) <= 500].copy()
        near["d"] = near.distance(g)
        near["along"] = [g.project(p) / 1000 for p in near.geometry]
        out[k] = [f"{r.label} — {r.d:.0f} m off NH-27, km {seg_by_pos[a]['startKm'] + r.along:.1f}" for r in near.sort_values("along").itertuples()]
    return out


def write_doc(rows, best, current, stretches, seg_by_pos, hp_name, incidents, mon, ndays, last) -> None:
    def pct(x):
        return f"{100 * x:.0f}%"
    sname = lambda k: f"{hp_name[stretches[k][0]]} → {hp_name[stretches[k][1]]}"  # noqa: E731
    L = ["# Risk Index calibration (configuration only) — for owner decision", "",
         f"Run {datetime.now().astimezone():%Y-%m-%d %H:%M %Z} by `backend/scripts/calibrate.py`. The app's own Risk Index and "
         f"decision engine (incl. FR-09 segments ahead, BR-03 with OSRM candidates where built) replayed in memory for {ndays} days: "
         f"every May–Sep day 2022–2026 up to {last} ({len(mon)} days; IMD to 2025, Open-Meteo archive 2026), the day before / day "
         "of each back-test incident, and 20 Mar / 10 May / 15 May 2022. **Nothing is applied**; BR-01..BR-12 and the engine "
         "are unchanged; Yellow stays 30. IMD warnings / GSI bulletins have no history, so they are NONE in the replay.", "",
         f"- **Incidents held** = a zone whose segments ahead (to the next holding point) include the incident segment is on HOLD "
         f"on the day before or the day of; {len(incidents)} incidents (`backend/inputs/incidents.csv`).",
         f"- **Stretch hold days** = for each of the {len(stretches)} stretches between consecutive holding points, the share of "
         "May–Sep days on which any zone in that stretch is on HOLD; median and worst stretch.",
         "- **Zones on HOLD** of 274 on the three check dates.", "",
         "## All settings", "",
         "| Weights (susc/rain/slope/hist) · thresholds | Incidents held | Stretch hold days, median | worst (stretch) | HOLD 20 Mar | HOLD 10 May | HOLD 15 May |",
         "|---|---|---|---|---|---|---|"]
    for r in rows:
        mark = " **← recommended**" if r is best else (" (current default)" if r is current else "")
        L.append(f"| {label(r['setting'])}{mark} | {r['held']} / {len(incidents)} | {pct(r['median'])} | {pct(r['worst'])} "
                 f"({sname(r['worstStretch'])}) | {r['check'][0]} | {r['check'][1]} | {r['check'][2]} |")
    L += ["", NOTE_15_MAY, "", "## Recommendation", ""]
    if best:
        L += [f"Lowest median monsoon stretch hold-day share that still holds at least {MIN_HELD} of {len(incidents)} incidents: "
              f"**{label(best['setting'])}** — incidents held {best['held']}/{len(incidents)}, stretch hold days median "
              f"{pct(best['median'])} (worst {pct(best['worst'])}), vs the current default {label(current['setting'])}: "
              f"{current['held']}/{len(incidents)}, median {pct(current['median'])} (worst {pct(current['worst'])}). "
              "Not applied — owner decision.", ""]
    else:
        L += [f"No setting in the grid holds at least {MIN_HELD} of {len(incidents)} incidents.", ""]
    L += ["**Overfitting warning.** There are only "
          f"{len(incidents)} incidents (three of them on the same segment, NH27-DH-118, and several dated by publication date), "
          "so 'incidents held' moves in steps of 10 percentage points and one mis-dated or mis-located incident changes the "
          "ranking. The grid was chosen before looking at results, but picking the best of "
          f"{len(rows)} settings on 10 events will look better here than it will in the next monsoon. Treat the recommendation "
          "as a starting point to review with the district, re-check it as new incidents are recorded, and prefer a setting "
          "that is good on both measures over one that is best on one. Hold-day shares are not false-alarm rates: the incident "
          "list is incomplete.", ""]
    longest = sorted(range(len(stretches)), key=lambda k: -(seg_by_pos[stretches[k][1]]["startKm"] - seg_by_pos[stretches[k][0]]["startKm"]))[:3]
    cands = candidates_in([(k, stretches[k]) for k in longest], seg_by_pos)
    L += ["## Longest stretches between holding points", "",
          "Shorter stretches mean a single risky segment holds fewer travellers. Holding points are all Provisional "
          "(`backend/inputs/holding_points.csv`). Candidates below are OSM places and POIs within 500 m of NH-27 in each "
          "stretch; none is verified (verified = no) and none is added — the district must check each one.", ""]
    for k in longest:
        a, b = stretches[k]
        km = seg_by_pos[b]["startKm"] - seg_by_pos[a]["startKm"]
        L += [f"### {sname(k)}: {km:.1f} km ({seg_by_pos[a]['id']} … {seg_by_pos[b]['id']})", "",
              f"May–Sep hold-day share with the current default: {pct(current['shares'][k])}; with the recommended setting: "
              f"{pct(best['shares'][k]) if best else '–'}.", ""]
        L += [f"- {c}" for c in cands[k]] or ["- no OSM place or POI within 500 m"]
        L.append("")
    L += ["## Per stretch (current default vs recommended)", "", "| Stretch | km | Current | Recommended |", "|---|---|---|---|"]
    for k, (a, b) in enumerate(stretches):
        L.append(f"| {sname(k)} | {seg_by_pos[b]['startKm'] - seg_by_pos[a]['startKm']:.1f} | {pct(current['shares'][k])} | "
                 f"{pct(best['shares'][k]) if best else '–'} |")
    DOC.write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
