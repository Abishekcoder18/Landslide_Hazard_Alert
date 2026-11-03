"""Phase 5 - incident back-test on the real NH-27 corridor -> docs/BACKTEST.md (+ docs/evidence/backtest_days.csv).

For every day 2022-01-07 .. last Open-Meteo archive day, the app's own code is replayed in memory (no database
writes): corridor_data.load_corridor (inputs for that rainfall date: IMD 2010-2025, Open-Meteo archive after) ->
service.new_state -> Workflow.seed_initial (Risk Index, decision engine). Default configuration (weights 25/45/15/15,
thresholds 30/55/75); no historical IMD warnings or GSI bulletins exist, so those inputs are NONE / false.

1. Incidents (backend/inputs/incidents.csv, owner-checked; rows marked EXCLUDED or without coordinates are left out):
   the nearest NH-27 segment (PostGIS distance), and on the DAY BEFORE and the DAY OF the incident: its Risk Level,
   Risk Index, rainfall, its two approach-zone decisions, CLOSE recommended, and the highest level within +/- 1 segment.
   "Warned" = segment Orange or Red (its zones HOLD) on that day.
2. Dry days: days on which every corridor rain cell had < 10 mm in the previous 7 days. Any Orange / Red segment or
   HOLD / CLOSE zone on such a day is counted as a false alarm (incident list is not complete, so monsoon days without
   a listed incident are NOT counted as false alarms; they are reported separately as alert load).

Run:  backend\\.venv\\Scripts\\python.exe backend\\scripts\\backtest.py
"""
from __future__ import annotations

import csv
import statistics
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app import corridor_data  # noqa: E402
from app.domain.defaults import DEFAULT_CONFIG  # noqa: E402
from app.domain.decision_engine import segments_ahead  # noqa: E402
from app.service import Workflow, new_state  # noqa: E402
from app.settings import Settings  # noqa: E402
from app.store import normalize_dsn  # noqa: E402

INCIDENTS = ROOT / "backend" / "inputs" / "incidents.csv"
DOC = ROOT / "docs" / "BACKTEST.md"
RAW = ROOT / "docs" / "evidence" / "backtest_days.csv"
START = date(2022, 1, 7)
DRY_MM = 10.0
ORDER = ["NO_DATA", "GREEN", "YELLOW", "ORANGE", "RED"]
WARN = ("ORANGE", "RED")


def run_day(conn, schema: str, d: date) -> dict | None:
    now = datetime(d.year, d.month, d.day, 6, 0, tzinfo=timezone.utc)  # 11:30 IST
    cor = corridor_data.load_corridor(conn, schema, d, now)
    if cor is None:
        return None
    s = new_state(now, cor)
    Workflow(s, lambda: now).seed_initial()
    return s


def last_archive_day(conn, schema: str) -> date:
    r = conn.execute(f"SELECT max(day) FROM {schema}.openmeteo_rain_daily").fetchone()
    return r[0] or date(2025, 12, 31)


def main() -> int:
    cfg = Settings()
    schema = cfg.db_schema
    dsn = normalize_dsn(cfg.database_url)
    w, t = DEFAULT_CONFIG["weights"], DEFAULT_CONFIG["thresholds"]
    with psycopg.connect(dsn) as conn:
        end = last_archive_day(conn, schema)
        incidents = []
        for r in csv.DictReader(INCIDENTS.open(encoding="utf-8")):
            if "EXCLUDED" in r["notes"] or not r["lat"]:
                continue
            sid, km, pos = conn.execute(
                f"SELECT id, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) / 1000, pos "
                f"FROM {schema}.ref_segments ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326) LIMIT 1",
                (float(r["lon"]), float(r["lat"]), float(r["lon"]), float(r["lat"]))).fetchone()
            incidents.append({**r, "segment": sid, "km": km, "pos": pos})
        seg_ids = [x for (x,) in conn.execute(f"SELECT id FROM {schema}.ref_segments ORDER BY pos").fetchall()]

        days, per_day, ahead, hold_days = [], {}, {}, {}
        d = START
        while d <= end:
            s = run_day(conn, schema, d)
            if s:
                segs = s["segments"]
                if not ahead:  # FR-09 segments ahead per zone (static for the corridor)
                    order = [x["id"] for x in sorted((v for v in segs.values() if not v.get("offCorridor")), key=lambda v: v["startKm"])]
                    ahead = {z["id"]: segments_ahead(z, order, s["holdingPoints"]) for z in s["zones"]}
                lv = Counter(x["riskLevel"] for x in segs.values())
                dec = Counter(v["result"]["decision"] for v in s["decisions"].values())
                r7 = [x["inputs"].get("rainfall7d") for x in segs.values()]
                src = next(iter(segs.values()))["inputs"]["sources"]["rainfall"].split(" · ")[0]
                dry = all(v is not None and v < DRY_MM for v in r7)
                row = {"day": d.isoformat(), "source": src, "dry": dry,
                       "max_rain7d": max((v for v in r7 if v is not None), default=None),
                       **{k.lower(): lv.get(k, 0) for k in ORDER}, "hold": dec.get("HOLD", 0),
                       "close_rec_segments": len({v["segmentId"] for v in s["decisions"].values() if v["result"]["closeRecommended"]}),
                       "go_caution": dec.get("GO_CAUTION", 0) + dec.get("GO (caution)", 0)}
                days.append(row)
                hold_days[d] = {k for k, v in s["decisions"].items() if v["result"]["decision"] == "HOLD"}
                per_day[d] = {"segments": {k: (v["riskLevel"], v["riskIndex"], v["inputs"]) for k, v in segs.items()},
                              "zones": {k: (v["segmentId"], v["result"]) for k, v in s["decisions"].items()},
                              "src": src} if d in {date.fromisoformat(i["date"]) + timedelta(days=o) for i in incidents for o in (-1, 0)} else None
            d += timedelta(days=1)

    RAW.parent.mkdir(parents=True, exist_ok=True)
    with RAW.open("w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=list(days[0]))
        wr.writeheader()
        wr.writerows(days)

    L = ["# Incident back-test (Phase 5)", "",
         f"Run {datetime.now().astimezone():%Y-%m-%d %H:%M %Z} by `backend/scripts/backtest.py`: the app's own Risk Index and "
         f"decision engine replayed in memory for every day {START} … {end} ({len(days)} days, 137 NH-27 segments, 274 approach "
         f"zones). Default configuration: weights {w['susceptibility']}/{w['rainfall']}/{w['slope']}/{w['history']} "
         f"(susceptibility / rainfall / slope / history), thresholds {t['yellow']}/{t['orange']}/{t['red']}. Rainfall: IMD gridded "
         "0.25° to 2025-12-31, Open-Meteo archive from 2026-01-01 (the two differ strongly on heavy-rain days, "
         "`docs/DATA_INVENTORY.md`). No historical IMD warnings / GSI bulletins exist, so they are NONE in the replay; "
         "Yellow + IMD Orange window-closing (BR-11) is therefore not exercised here.", "",
         "Incidents: `backend/inputs/incidents.csv` (owner-checked 2026-11-03). Rows marked EXCLUDED or without coordinates are "
         "left out. Locations are approximate (nearest named OSM place, see the notes column), so the result is also shown "
         "for ±1 segment (~1 km either side). Per-day results: `docs/evidence/backtest_days.csv`.", "",
         "## 1. Incidents: day before and day of", "",
         "| Incident | Date | Segment (dist.) | Day | Rain 24h / 3d / 7d mm (source) | Level (Index) | ±1 seg max | Own zones S / N | Zones toward it on HOLD | CLOSE rec. |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    warned_any, warned_seg, n_inc, low_rain, held, baselines = 0, 0, 0, [], 0, []
    for inc in incidents:
        dd = date.fromisoformat(inc["date"])
        n_inc += 1
        hit_seg = hit_nb = hit_hold = False
        for off, lab in ((-1, "day before"), (0, "day of")):
            pd = per_day.get(dd + timedelta(days=off))
            if not pd:
                L.append(f"| {inc['event_id']} | {inc['date']} | {inc['segment']} | {lab} | no data | – | – | – | – | – |")
                continue
            lvl, idx, i = pd["segments"][inc["segment"]]
            p = seg_ids.index(inc["segment"])
            nb = [pd["segments"][seg_ids[j]][0] for j in range(max(0, p - 1), min(len(seg_ids), p + 2))]
            nbmax = max(nb, key=ORDER.index)
            zs = [res for _, (sid, res) in sorted(pd["zones"].items()) if sid == inc["segment"]]
            zd = " / ".join(v["decision"] for v in zs) or "–"
            close = "yes" if any(v["closeRecommended"] for v in zs) else "no"
            toward = [zid for zid, a in ahead.items() if inc["segment"] in a]
            toward_hold = [zid for zid in toward if pd["zones"][zid][1]["decision"] == "HOLD"]
            hit_hold |= bool(toward_hold)
            hit_seg |= lvl in WARN
            hit_nb |= nbmax in WARN
            L.append(f"| {inc['event_id']} | {inc['date']} | {inc['segment']} ({inc['km']:.2f} km) | {lab} | "
                     f"{_f(i.get('rainfall24h'))} / {_f(i.get('rainfall3d'))} / {_f(i.get('rainfall7d'))} ({pd['src']}) | "
                     f"{lvl} ({_f(idx)}) | {nbmax} | {zd} | {len(toward_hold)} of {len(toward)} | {close} |")
        pd0 = per_day.get(dd)
        if pd0 and not hit_seg:
            r7 = pd0["segments"][inc["segment"]][2].get("rainfall7d")
            if r7 is not None and r7 < 100:
                low_rain.append(f"{inc['event_id']} ({r7:.0f} mm)")
        held += hit_hold
        toward_all = {zid for zid, a in ahead.items() if inc["segment"] in a}
        mon = [d_ for d_ in hold_days if 5 <= d_.month <= 9]
        base_all = sum(bool(hold_days[d_] & toward_all) for d_ in hold_days) / len(hold_days)
        base_mon = sum(bool(hold_days[d_] & toward_all) for d_ in mon) / len(mon)
        baselines.append(f"| {inc['event_id']} | {inc['segment']} | {'yes' if hit_hold else 'no'} | {100 * base_all:.0f}% | {100 * base_mon:.0f}% |")
        warned_seg += hit_seg
        warned_any += hit_nb
    dry = [r for r in days if r["dry"]]
    fa_days = [r for r in dry if r["orange"] + r["red"] > 0 or r["hold"] > 0]
    wet = [r for r in days if not r["dry"]]
    L += ["", f"**Warned (Orange/Red on the day before or the day of): {warned_seg} of {n_inc} incidents at the incident "
          f"segment; {warned_any} of {n_inc} within ±1 segment.**", "",
          f"**Travellers heading toward the incident segment held (HOLD in at least one zone whose segments ahead include it, "
          f"FR-09) on the day before or the day of: {held} of {n_inc}.** \"Zones toward it\" = every approach zone, in either "
          "direction, whose segments ahead (up to the next holding point) include the incident segment. A zone may hold "
          "because of any risky segment ahead, so this is compared with how often the same travellers are held on any "
          "day (baseline):", "",
          "| Incident | Segment | Held day before / day of | Held on any day (all days) | Held on any day (May–Sep) |",
          "|---|---|---|---|---|", *baselines, "",
          f"Missed incidents with less than 100 mm of rain in the 7 days up to the incident day (segment's cell): "
          f"{', '.join(low_rain) or 'none'}. A rainfall-weighted index cannot warn for these from rain alone; the "
          "incident notes name subsidence, construction and heavy vehicles as causes for some. In operation, patrol "
          "and public reports (FR-19..26) and IMD / GSI inputs are the path for them.", "",
          "## 2. False alarms on dry days", "",
          f"Dry day = every corridor rain cell had < {DRY_MM:.0f} mm in the previous 7 days. {len(dry)} dry days of {len(days)}.", "",
          f"- Dry days with any Orange / Red segment or any HOLD zone (false alarm): **{len(fa_days)} of {len(dry)}**",
          f"- Orange / Red segment-days on dry days: {sum(r['orange'] + r['red'] for r in dry)} "
          f"(of {len(dry) * 137} segment-days); HOLD zone-days: {sum(r['hold'] for r in dry)} (of {len(dry) * 274})",
          f"- CLOSE recommended on dry days: {sum(r['close_rec_segments'] for r in dry)} segment-days", ""]
    if fa_days:
        L += ["| Dry day | Max 7-day rain mm | Orange | Red | HOLD zones |", "|---|---|---|---|---|"]
        L += [f"| {r['day']} | {_f(r['max_rain7d'])} | {r['orange']} | {r['red']} | {r['hold']} |" for r in fa_days[:20]]
        L.append("")
    by_year = {}
    for r in days:
        y = r["day"][:4]
        by_year.setdefault(y, []).append(r)
    L += ["## 3. Alert load (all days, for context)", "",
          "Incidents are not a complete list, so wet days without a listed incident are not scored as false alarms. "
          "This is how often the corridor would show warnings:", "",
          "| Year | Days | Days with any Orange/Red | Days with any HOLD | Days with CLOSE recommended | Median Orange+Red segments on those days |",
          "|---|---|---|---|---|---|"]
    for y, rs in sorted(by_year.items()):
        warn = [r for r in rs if r["orange"] + r["red"] > 0]
        L.append(f"| {y} | {len(rs)} | {len(warn)} | {sum(r['hold'] > 0 for r in rs)} | {sum(r['close_rec_segments'] > 0 for r in rs)} | "
                 f"{statistics.median([r['orange'] + r['red'] for r in warn]) if warn else 0:g} |")
    L += ["", "## Limits", "",
          "- Few incidents, approximate locations, and publication dates used where the event date is not stated.",
          "- FR-09 makes each zone look ahead to the next holding point; with few holding points (OSM candidates + corridor "
          "ends, all Provisional) a zone covers long stretches, so where the baseline above is high (e.g. 87% of May–Sep "
          "days) being held on an incident day is not evidence of skill. More verified holding points shorten the stretches "
          "and the alert load.",
          "- Daily rainfall only: an incident in the morning is compared with that day's total, which includes rain after it.",
          "- 2026 uses Open-Meteo, which under-reads heavy-rain days compared with IMD; thresholds were not re-tuned.",
          "- IMD warnings / GSI bulletins were not available historically; in operation they can only raise levels (BR-05).", ""]
    DOC.write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L[:60]))
    print("wrote", DOC, RAW)
    return 0


def _f(v) -> str:
    return "–" if v is None else (f"{v:.1f}" if isinstance(v, float) else str(v))


if __name__ == "__main__":
    sys.exit(main())
