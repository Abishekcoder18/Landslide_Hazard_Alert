# RESILION 2.0 — Implementation Audit vs PRD v1.0 (updated 2026-11-02)

Scope: branch `claude/jolly-shannon-vm5au7` — React UI, FastAPI + PostgreSQL/PostGIS backend, real-data pipeline and
susceptibility model, checked against PRD v1.0 (AC-01–AC-25), MRD v1.0 and the Jira-ready backlog (EP-01–EP-06, ST-01–ST-25).

**Status key:** **T** tested (automated test passes) · **U** shown working in the browser run (screenshot) · **P** partial ·
**B** needs an external feed / dependency · **—** not started.

**Data status.** With the backend on the real corridor (default when the data pipeline has run):
137 real NH-27 segments, Copernicus DEM terrain, landslide history (RESILION 1 inventory), model susceptibility
(`docs/MODEL_CARD.md`) and IMD gridded rainfall for a **historical date** (labelled with that date, never shown as live).
IMD warnings and GSI bulletins have no historical feed: they stay *None* unless an administrator sets them.
Holding points remain **Provisional**. The in-browser sample mode (no backend) still uses the 12-segment **sample data**.
Nothing here is a field result.

## Verification run (2026-11-02)

| Check | Result | Evidence |
|---|---|---|
| `npm test` | 46 pass, 0 fail | — |
| `npm run lint` (`tsc --noEmit`) | pass | — |
| `npm run build` | pass (bundle > 500 kB warning) | — |
| `backend: python -m pytest -q` | 49 pass, 2 skipped (geometry checks needing geopandas; they run in the data venv) | incl. TS↔Python parity (with model-score cases), real PostGIS, `test_real_corridor.py` (F1/F2/F3 on a copy of the real data) |
| `backend\.venv-data: pytest tests/test_segments.py tests/test_features.py` | 10 pass | segmentation coverage / no overlap / IDs identical on re-run; features complete with provenance |
| Browser run on the real corridor (`backend/scripts/e2e_walkthrough.py`, Chromium, FastAPI + PostGIS) | F1 → F3 → F2 complete; 63 API calls, 0 failed, 0 console/page errors | `docs/evidence/30…42-*.png` |
| RESILION 1 data in the shared database | 11 tables in `public` unchanged (row count + md5) after every step | `backend/scripts/check_public_untouched.py verify` |

## Acceptance criteria

| AC | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| AC-01 | FR-01 ~1 km segments, stable IDs | **T U** | `backend/scripts/segment_nh27.py`, `tests/test_segments.py`, `30-real-corridor-map.png` | 137 × 998.2 m segments `NH27-DH-001…137` (136.8 km, Lumding-side district boundary → Harangajao side), from the RESILION 1 final road dataset. Every stretch in exactly one segment; IDs identical on re-run. |
| AC-02 | FR-03/04/07 level + top reasons on map | **T U** | `domain/riskIndex.ts` + Python port, `31-segment-drawer-model-score.png` | Real inputs; reasons e.g. "Model susceptibility 0.96 · Slope 36.23° · 6 past incidents". |
| AC-03 | FR-05/06 recompute on new data / 6 h, configured thresholds | **T U** | `test_real_corridor.py`, `32/33-*.png` | New rainfall date → recomputed (10 May 2022: 0 Red; 15 May 2022: 24 Red). After 6 h inputs are re-read from PostGIS. |
| AC-04 | BR-05 warnings only raise | **T** | `riskIndex.test.ts`, parity | |
| AC-05 | BR-06 missing/stale → No data | **T U** | `riskIndex.test.ts`, `test_real_corridor.py` | Model score counts as the susceptibility input; no score and no category → No data. |
| AC-06 | BR-01 every row | **T U** | `decisionEngine.test.ts`, Decisions › Rule checks | 14 scripted scenarios (SM1 = 14/14). |
| AC-07 | BR-02 one-way + Orange → HOLD | **T** | SC-13 | |
| AC-08 | BR-03 diversion rule | **P T** | `checkDiversionSafety` | Rule tested. No real diversion candidates yet (OSRM not wired, **B**); on the real corridor BR-03 therefore gives HOLD with "No safe diversion". |
| AC-09 | BR-04 next eligible point back | **T U** | `selectHoldingPoint`, `test_real_corridor.py` | On real data Haflong's own segment (NH27-DH-100, 7 past landslides) is usually Orange/Red, so zones fall back to Lumding / Silchar-side. |
| AC-10 | FR-12/17 escalation, nothing auto-published | **T U** | `server.test.ts`, `test_api.py`, Approvals | Stale CLOSE recommendations are now withdrawn by the engine when risk falls (audited); only officers approve. |
| AC-11 | FR-13–15 expected wait = estimate − now, labelled | **T U** | `test_real_corridor.py`, `41-decisions-expected-wait-real.png` | |
| AC-12 | FR-16 window-closing, no hurry wording | **T** | engine + alert validator | |
| AC-13 | FR-18 decision, inputs, time stored | **T U** | Records › Decision record, `42-records-real.png` | Append-only in PostGIS. |
| AC-14 | FR-19/21 class, share blocked, confidence | **T** (stand-in model) | `backend/app/ai.py`, `test_api.py`, `test_ai.py` | **Not yet run with a real key** (none provided). Without a key, reports go to manual review (`34/35-*.png`). |
| AC-15 | FR-22 outside corridor / old → flagged | **T U** | `test_real_corridor.py`, `34-*.png` | PostGIS `ST_Distance` to the real NH-27 geometry (report on NH27-DH-108: 0.0 km; point 25.45 N 92.75 E → flagged). |
| AC-16 | FR-22 grouping into one incident | **T U** | `reportChecks.test.ts` | |
| AC-17 | FR-23–25 confirm → BLOCKED + re-evaluate; reject → no change | **T U** | `test_real_corridor.py`, `36-decisions-real-hold.png` | |
| AC-18 | BR-07 AI alone never changes state | **T** | `server.test.ts`, `test_real_corridor.py` | |
| AC-19 | BR-10 injected note has no effect | **T** (stand-in model) | `test_api.py`, `test_ai.py` | Re-check with a real key. |
| AC-20 | FR-26 AI unavailable → manual review | **T U** | `test_api.py`, `35-officer-review-real.png` | |
| AC-21 | FR-27/28/30 alerts match or are blocked | **T U** | `alerts.test.ts`, `test_api.py`, `38-*.png` | Real segment alert "NH-27 NH27-DH-108 (Retzol) CLOSED…", validated 4/4 (template). Claude writer tested with a stand-in model only. |
| AC-22 | FR-31 CAP Severe/Immediate/certainty/area | **T U** | `test_real_corridor.py`, `39-cap-real.png` | |
| AC-23 | FR-33 patrol refused | **T U** | `permissions.test.ts`, `test_api.py` | Signed token, no password yet. |
| AC-24 | FR-08 one zone per direction; decision inside geofence | **P T U** | `corridor_data.py`, `test_real_corridor.py` | 18 zones = one per direction for 9 risky segments (≥ 5 past landslides within 500 m and model score ≥ 0.6, **assumption**). Geofence used for map ring and CAP area; no vehicle location by design. |
| AC-25 | FR-20 field-app channel | **—** | — | Not Verified (deferred by owner). |

**Summary:** 22 of 25 tested (88%); 2 partial (AC-08 OSRM candidates, AC-24 geofence use); 1 not started (AC-25, deferred).
AC-14, AC-19 and AC-21 still need one run with a real `ANTHROPIC_API_KEY`.

## Stories (backlog ST-01–ST-25)

| Story | Status | Story | Status |
|---|---|---|---|
| ST-01 segmentation | **T U** (137 real segments, PostGIS) | ST-14 field app | — (deferred) |
| ST-02 inputs | **P** — real terrain, model score, landslide history, IMD rainfall by date; live IMD / GSI feeds **B** | ST-15 auto checks | T U (PostGIS distance on real geometry) |
| ST-03 risk map + reasons | T U (real geometry) | ST-16 queue confirm/reject | T U |
| ST-04 validity + config | T U (input refresh from PostGIS) | ST-17 AI outage | T U |
| ST-05 approach zones | T U (P geofence) | ST-18 validated alerts | T U (real-key run pending) |
| ST-06 decision table | T U | ST-19 Dimasa | — (deferred; UI marks pending) |
| ST-07 diversion | P (rule T; OSRM **B**) | ST-20 CAP export | T U |
| ST-08 holding point | T U (real segments) | ST-21 login | T U (signed token; no password yet) |
| ST-09 CLOSE + escalation | T U (+ stale recommendation withdrawal) | ST-22 permissions | T U |
| ST-10 incident log + estimate | T U | ST-23 audit log | T (PostgreSQL trigger blocks UPDATE/DELETE) |
| ST-11 window closing | T | ST-24 offline cache | — (deferred) |
| ST-12 equipment | U | ST-25 SMS | — (deferred) |
| ST-13 web upload + AI | T U (real-key run pending) | | |

**Totals:** 18 done, 3 partial (ST-02, ST-05, ST-07), 4 not started (ST-14, ST-19, ST-24, ST-25 — deferred by owner):
72% fully done, 78% counting partial as half. All three Must-Have epics (EP-01, EP-02, EP-03) are complete except ST-14
(deferred) and the external feeds/routing noted as **B**.

## Real-data pipeline (reproducible)

`download_data.py` → `segment_nh27.py` → `build_features.py` → `train_model.py` → `model_card.py`, all writing only to
git-ignored `backend/data/` and to schema `resilion2`. Data inventory: `docs/DATA_INVENTORY.md`. Model: `docs/MODEL_CARD.md`
(LightGBM, spatial block CV ROC-AUC 0.791 ± 0.044, PR-AUC 0.305 ± 0.081 vs no-skill 0.095).

## UI evidence (real corridor, 2026-11-02)

| Screen | Screenshot |
|---|---|
| Corridor map, 137 real segments, IMD 10 May 2022 | `30-real-corridor-map.png` |
| Segment detail: model score, model version, IMD date, sources | `31-segment-drawer-model-score.png` |
| Administrator: IMD rainfall date | `32-config-imd-rainfall-date.png` |
| Same corridor on 15 May 2022 (57 segments at risk, 9 CLOSE recommendations) | `33-real-corridor-15-may-2022.png` |
| Report on a real segment (PostGIS check, AI offline → manual review) | `34-*.png`, `35-*.png` |
| Decisions after confirmation (HOLD at Lumding / Silchar-side, CLOSE recommended) | `36-decisions-real-hold.png` |
| Closure → alert → CAP | `37-*.png`, `38-*.png`, `39-cap-real.png` |
| Incident estimate → expected wait; records | `40-*.png`, `41-*.png`, `42-records-real.png` |
| Earlier sample-mode screens | `01…23-*.png` |

## Contradictions / decisions to note

- **Risk Index calibration on real data (owner decision).** With the default weights 35/30/20/15 and thresholds 30/55/75,
  static inputs alone (model score, slope, history) put 4 of the 9 zone segments in Orange on a dry day (20 Mar 2022) and
  8 of 9 on 10 May 2022, so their zones show HOLD with little rain. Measured alternative: weights 25/45/15/15 → 0/9 on the
  dry day, 3/9 on 10 May, 9/9 on 13 and 15 May 2022. Defaults are unchanged; weights are editable in Configuration.
- **2022 events and NH-27.** None of the dated 14–16 May 2022 Haflong landslides lies within 500 m of an NH-27 segment
  (they are in Haflong town / on the railway, ~3–4 km off the highway). The 2022 back-test therefore validates the
  terrain model, not an NH-27 closure replay.
- **Haflong holding point** is mapped to the NH-27 segment nearest the town (NH27-DH-100, town 3.6 km off the road); that
  segment has the most past landslides, so BR-04 often skips Haflong. Provisional — confirm with the district.
- **Corridor end:** the Dima Hasao part of NH-27 ends at the district boundary on the Harangajao side, not at Silchar.
- Place names stay in Roman script inside hi/as/bn alerts (OSM names folded to ASCII, e.g. Jātinga → Jatinga) — **assumption**.
- IMD "heavy-rainfall warning" for BR-11 = IMD **Orange or Red**; BR-05 floors as before — **assumptions**.
- Fallen tree / water reports go to the officer queue.
- The database is shared with RESILION 1: RESILION 2.0 writes only to schema `resilion2` (`resilion2_test`, `resilion2_rtest` for tests).

## Next

1. Run once with a real `ANTHROPIC_API_KEY` (AC-14, AC-19, AC-21) and record the result.
2. Owner decision on Risk Index calibration for real inputs (see above).
3. OSRM diversion candidates (AC-08 / ST-07) and live IMD / GSI feeds (ST-02).
