# RESILION 2.0 — Implementation Audit vs PRD v1.0 (updated 2026-11-03)

Scope: branch `claude/jolly-shannon-vm5au7` — React UI, FastAPI + PostgreSQL/PostGIS backend, real-data pipeline and
susceptibility model, checked against PRD v1.0 (AC-01–AC-25), MRD v1.0 and the Jira-ready backlog (EP-01–EP-06, ST-01–ST-25).
Every row below was re-checked against the code and tests on 2026-11-03 (clean-up 4a).

**Status key:** **T** tested (automated test passes) · **U** shown working in the browser run (screenshot) · **P** partial ·
**B** needs an external feed / dependency · **—** not started.

**Data status.** With the backend on the real corridor (default when the data pipeline has run): 137 real NH-27
segments, Copernicus DEM terrain, landslide history (RESILION 1 inventory), model susceptibility (`docs/MODEL_CARD.md`),
rainfall from IMD gridded data (2010–2025), the Open-Meteo archive (2026) or Open-Meteo live (rainfall date "live"),
always labelled with its source; IMD warnings from the live NDMA SACHET feed (raise-only) or an administrator; GSI
bulletins manual. 274 approach zones (two per segment), 7 holding points (all **Provisional**), and 520 OSRM
diversion-road segments (`offCorridor`, BR-03 only). Risk Index defaults 25/45/15/15, thresholds 30/**60**/75 (owner
decision 2026-11-03). The in-browser sample mode (no backend) still uses the 12-segment **sample data**. Nothing here is
a field result.

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
| AC-01 | FR-01 ~1 km segments, stable IDs | **T U** | `backend/scripts/segment_nh27.py`, `tests/test_segments.py`, `30-real-corridor-map.png` | 137 × 998.2 m segments `NH27-DH-001…137` (136.8 km). Every stretch in exactly one segment; IDs identical on re-run. Diversion-road segments are separate (`DV-nnnn`, `offCorridor`). |
| AC-02 | FR-03/04/07 level + top reasons on map | **T U** | `domain/riskIndex.ts` + Python port, `31-segment-drawer-model-score.png` | Real inputs; reasons e.g. "Model susceptibility 0.96 · Slope 36.23° · 6 past incidents"; rainfall source shown. |
| AC-03 | FR-05/06 recompute on new data / 6 h, configured thresholds | **T U** | `test_real_corridor.py` (F1 tests, Phase 4), `32/33-*.png` | New rainfall date → recomputed (thresholds 30/60/75: 10 May 2022 0 Orange / 0 Red; 15 May 2022 17 Orange / 32 Red). After 6 h inputs are re-read from PostGIS; in live mode a stopped feed → No data. |
| AC-04 | BR-05 warnings only raise | **T** | `riskIndex.test.ts`, parity, `test_real_corridor.py::test_sachet_warning_raises_never_lowers_officer` | SACHET feed raises, never lowers an officer-set warning. |
| AC-05 | BR-06 missing/stale → No data | **T U** | `riskIndex.test.ts`, `test_real_corridor.py` | Model score counts as the susceptibility input. Diversion roads outside the data coverage are No data. Live rainfall not fetched / stale → No data. |
| AC-06 | BR-01 every row | **T U** | `decisionEngine.test.ts`, Decisions › Rule checks | 14 scripted scenarios SC-01…SC-14 (SM1 = 14/14). |
| AC-07 | BR-02 one-way + Orange → HOLD | **T** | `decisionEngine.test.ts` (SC-13, "BR-02 / AC-07") | Most restrictive wins, also across the segments ahead (FR-09 core fix). |
| AC-08 | BR-03 diversion rule | **T** | `checkDiversionSafety`, `test_real_corridor.py::test_phase8_diversion_roads_are_off_corridor`, `docs/DIVERSIONS.md` | Real OSRM candidates (Phase 8): 73 of 274 zones have a detour; 26 have inputs on every diversion-road segment. BR-03 refuses candidates with No-data, Orange/Red or closed segments. DIVERT appears only when a Red segment has a fully Green/Yellow detour (none on the check dates with 30/60/75). |
| AC-09 | BR-04 next eligible point back | **T U** | `selectHoldingPoint`, `test_real_corridor.py` | Chains from the 7 Provisional holding points (OSM candidates + corridor ends). |
| AC-10 | FR-12/17 escalation, nothing auto-published | **T U** | `server.test.ts`, `test_api.py`, Approvals | Stale CLOSE recommendations withdrawn by the engine (status "withdrawn", audited); only officers approve. CLOSE only from a segment's own zones (FR-09 fix). |
| AC-11 | FR-13–15 expected wait = estimate − now, labelled | **T U** | `test_real_corridor.py::test_f2_full_flow_on_real_segment`, `41-decisions-expected-wait-real.png` | |
| AC-12 | FR-16 window-closing, no hurry wording | **T** | `server.test.ts` / `test_workflow.py` (AC-12, AZ-06S), `test_real_corridor.py` (SACHET), alert validator | Real-corridor screenshot: clean-up 4c. |
| AC-13 | FR-18 decision, inputs, time stored | **T U** | Records › Decision record, `42-records-real.png` | Append-only in PostGIS. |
| AC-14 | FR-19/21 class, share blocked, confidence | **T** (local model evaluated; Claude stand-in) | `ai.py`, `ai_local.py`, `test_ai.py`, `test_ai_local.py`, `docs/PHOTO_EVAL.md` | Local model `qwen2.5vl:7b` on 140 owner-labelled photos: 77% accuracy, 0 failures, 8 of 85 hazard photos missed, blocked-share MAE 20.4 pp, 13.4 s/photo. **Claude not run** (no key). Photo only is sent (owner decision B). |
| AC-15 | FR-22 outside corridor / old → flagged | **T U** | `test_real_corridor.py::test_f3_postgis_corridor_check_on_real_geometry`, `34-*.png` | PostGIS `ST_Distance` to NH-27 only (diversion roads excluded). |
| AC-16 | FR-22 grouping into one incident | **T U** | `reportChecks.test.ts` | |
| AC-17 | FR-23–25 confirm → BLOCKED + re-evaluate; reject → no change | **T U** | `test_real_corridor.py`, `36-decisions-real-hold.png` | A model "clear" / "not relevant" goes to the officer queue from patrol / officer / road engineer or below the confidence threshold (`reportChecks.test.ts`, `test_workflow.py`). |
| AC-18 | BR-07 AI alone never changes state | **T** | `server.test.ts`, `test_workflow.py`, `test_real_corridor.py` | |
| AC-19 | BR-10 injected note has no effect | **T** | `test_ai.py`, `test_ai_local.py`, `test_workflow.py`, `docs/PHOTO_EVAL.md` | The photo check receives the photo only (owner decision B). Local model: a hostile note flipped 15 of 20 photos when sent; 0 of 20 when not sent. Claude: request asserted to contain no note or location text. |
| AC-20 | FR-26 AI unavailable → manual review | **T U** | `test_api.py`, `35-officer-review-real.png` | |
| AC-21 | FR-27/28/30 alerts match or are blocked | **T U** (templates + validator) | `alerts.test.ts`, `test_api.py`, `38-*.png` | Alert text = templates + validator; LLM writer is Claude-only and **pending a Claude key** (local models failed hi/as/bn). |
| AC-22 | FR-31 CAP Severe/Immediate/certainty/area | **T U** | `test_real_corridor.py`, `39-cap-real.png` | CAP audience includes zones holding because the segment is ahead (FR-09). |
| AC-23 | FR-33 patrol refused | **T U** | `permissions.test.ts`, `test_api.py` | Signed token, no password yet. |
| AC-24 | FR-08 one zone per direction; decision inside geofence | **P T U** | `segment_nh27.py`, `test_real_corridor.py::test_every_red_or_orange_segment_has_zones` | **Two zones for every segment** (274; owner decision, Phase 1), each evaluated over the segments ahead to the next holding point (FR-09). Geofence used for the map ring and CAP area; no vehicle location by design (P). |
| AC-25 | FR-20 field-app channel | **—** | — | Not Verified (deferred by owner). |

**Summary:** 23 of 25 tested (92%); 1 partial (AC-24 geofence use); 1 not started (AC-25, deferred). AC-14 / AC-19 are
evaluated on the local model; one run with a real `ANTHROPIC_API_KEY` is still open (AC-14 on Claude, AC-21 writer).

## Stories (backlog ST-01–ST-25)

| Story | Status | Story | Status |
|---|---|---|---|
| ST-01 segmentation | **T U** (137 real segments, PostGIS) | ST-14 field app | — (deferred) |
| ST-02 inputs | **T** — terrain, model score, history, rainfall (IMD / Open-Meteo archive / live), SACHET live IMD warnings; GSI manual (**P**) | ST-15 auto checks | T U (PostGIS distance, NH-27 only) |
| ST-03 risk map + reasons | T U (real geometry; diversion roads grey) | ST-16 queue confirm/reject | T U |
| ST-04 validity + config | T U (input refresh; calibrated thresholds 30/60/75) | ST-17 AI outage | T U |
| ST-05 approach zones | T U (274 zones, segments ahead; P geofence) | ST-18 validated alerts | T U (templates; Claude writer pending key) |
| ST-06 decision table | T U | ST-19 Dimasa | — (deferred; UI marks pending) |
| ST-07 diversion | T (real OSRM candidates, BR-03) | ST-20 CAP export | T U |
| ST-08 holding point | T U (real segments; Provisional) | ST-21 login | T U (signed token; no password yet) |
| ST-09 CLOSE + escalation | T U (+ withdrawal) | ST-22 permissions | T U |
| ST-10 incident log + estimate | T U | ST-23 audit log | T (PostgreSQL trigger blocks UPDATE/DELETE) |
| ST-11 window closing | T (screenshot: 4c) | ST-24 offline cache | — (deferred) |
| ST-12 equipment | T U (`test_api.py::test_st12_equipment_add_remove_logged`, `server.test.ts`) | ST-25 SMS | — (deferred) |
| ST-13 web upload + AI | T U (local model evaluated; Claude pending key) | | |

**Totals:** 21 of 25 done (84%); partial parts counted inside done rows: GSI bulletins manual (ST-02), geofence use
(ST-05); 4 not started (ST-14, ST-19, ST-24, ST-25 — deferred by owner). All three Must-Have epics (EP-01, EP-02,
EP-03) are complete except ST-14 (deferred).

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

## Core fix, 2026-11-03 — FR-09 segments ahead

Found in the cloud review, re-implemented here (the cloud commits could not be transferred).

**Bug.** With two overlapping 2.5 km zones for every ~1 km segment, each zone looked only at its **own** segment. If
segment k+1 was blocked, the zone of segment k (which overlaps the zone of k+1) said GO while k+1's zone said HOLD, so a
traveller could get GO toward the blockage. This broke BR-02 and the core rule "stop before the danger zone"; PRD FR-09
says to apply the decision table to "the segments ahead".

**Fix.** `segmentsAhead` / `evaluateZoneAhead` (`src/domain/decisionEngine.ts`, Python port `segments_ahead` /
`evaluate_zone_ahead` in `backend/app/domain/decision_engine.py`), used identically by the in-browser server and the
backend `recompute`:
- each zone is evaluated over all segments up to the next Safe Holding Point ahead, with the zone's own holding-point
  chain; the most restrictive decision wins, nearest on ties; `aheadSegmentId` says which segment decided;
- CLOSE is recommended only from a segment's own zones; officer-cleared passage applies per segment and direction;
- diversion-road segments (`offCorridor: true`) are excluded from the chainage;
- CAP audience = the segment's own zones + zones holding because the segment is ahead;
- Decisions page: "Ahead" line on the zone card; the traveller preview shows the deciding segment.

**Evidence.** `server.test.ts` and `test_workflow.py` (same cases): AZ-06N HOLDs for Orange S-07 ahead
(`aheadSegmentId` S-07, HP-HAFLONG, no CLOSE); after REP-0104 is confirmed BLOCKED no zone says GO / GO_CAUTION toward a
blocked or Red/Orange segment ahead, ≥ 3 zones HOLD for S-07, exactly one closure approval (S-07, none for S-06);
cleared passage through S-07 applies to AZ-06N; the S-07 CAP lists AZ-06N; an off-corridor BLOCKED/RED segment changes
no decision. AC-12 test moved from AZ-06N to AZ-06S (AZ-06N now correctly HOLDs). Parity: 400 seeded random corridors
(`scripts/parity-fixture.ts`, `test_parity.py::test_segments_ahead_matches_typescript`), 0 mismatches.

**Real corridor (137 segments, 274 zones, default weights 25/45/15/15):**

| IMD rainfall date | Zones HOLD (before the fix) | of which a segment ahead decides | CLOSE recommended (segments) |
|---|---|---|---|
| 2022-03-20 | 0 (0) | 0 | 0 |
| 2022-05-10 | 37 (6) | 31 | 0 |
| 2022-05-15 | 172 (110) | 62 | 32 |

## Owner decisions, 2026-11

Delegated by the owner (Abishek) and implemented as stated; BR-01..BR-12 are unchanged.

1. **Risk Index default weights 25/45/15/15** (susceptibility / rainfall / slope / history); thresholds unchanged (30/55/75).
   Real corridor, replayed by `backend/scripts/scenario_report.py` (137 segments, 274 zones):

   | IMD rainfall date | Green | Yellow | Orange | Red | No data | Zones HOLD | Zones GO caution | Zones GO | CLOSE recommended |
   |---|---|---|---|---|---|---|---|---|---|
   | 2022-03-20 | 90 | 47 | 0 | 0 | 0 | 0 | 94 | 180 | 0 |
   | 2022-05-10 | 62 | 72 | 3 | 0 | 0 | 6 | 144 | 124 | 0 |
   | 2022-05-13 | 43 | 48 | 36 | 10 | 0 | 92 | 96 | 86 | 10 |
   | 2022-05-15 | 31 | 51 | 23 | 32 | 0 | 110 | 102 | 62 | 32 |

2. **Two approach zones for every NH-27 segment** (274 zones); the zone-selection thresholds were removed. Holding point
   = nearest point at or behind the segment for the zone's direction, fallbacks further back (BR-04). The Decisions page
   lists CLOSE / HOLD / DIVERT first and collapses all-GO segments into one "GO · n" row. Measured
   (`backend/scripts/measure_perf.py`): snapshot 570 KB JSON, **48 KB with gzip** (enabled), server latency median
   171 ms; Corridor page ready in 2.0 s, Decisions in 0.8 s (Chromium, page reload, dev server).
3. **Approval status "withdrawn"** for a CLOSE recommendation the rules no longer support (audit "CLOSE recommendation
   withdrawn", decided by "Decision engine"); the engine never approves.
4. **Optional free local model (Ollama)** may stand in for the **photo check only** when no `ANTHROPIC_API_KEY` is set,
   always labelled "Local model", never "Claude". This changes PRD §9 (model) for that case. Revised 2026-11-03: the
   alert writer is Claude-only; without a key the validated templates are used (local models failed the hi/as/bn tests,
   `docs/AI_PROMPT_LOG.md`).
5. **Calibrated Risk Index thresholds (2026-11-03): Orange 60, Red 75, weights 25/45/15/15** (Yellow 30 unchanged; was
   Orange 55). Chosen from the grid in `docs/CALIBRATION.md`: 8 of 10 back-test incidents held on the day before / day
   of; stretches between holding points on HOLD on a median 25% (worst 63%) of May–Sep days. **Overfitting warning:**
   only 10 incidents; re-check as new incidents are recorded. Set in `DEFAULT_CONFIG` (`src/domain/config.ts`,
   `backend/app/domain/defaults.py`); editable in Configuration.
6. **Photo check receives the photo only (2026-11-03), Claude and local model.** The reporter's note, location text and
   time are never sent to a model (BR-10); the officer still sees them. PRD change: FR-21 / §9 "photo plus report
   metadata" → photo only. Reason: on the local model a hostile note in a delimited metadata block flipped 13 of 20
   hazard photos to "clear"; without it, 0 of 20 (`docs/PHOTO_EVAL.md`). Tests: `test_ai.py`, `test_ai_local.py`.

## Real-data strengthening, phase status (2026-11-03)

| Phase | Status | Evidence |
|---|---|---|
| 1 Weights 25/45/15/15, two zones per segment, "withdrawn" status, tests | Done | `test_real_corridor.py` (every Red/Orange segment has zones; no HOLD on the dry date), `server.test.ts` (withdrawal) |
| 2 Holding points from OSM | Done — 5 OSM candidates + 2 corridor ends, all Provisional / verified = no | `backend/inputs/holding_points.csv`; more candidates per stretch in `docs/CALIBRATION.md` |
| 3 Real incidents | Done — 12 rows with source URLs (2 excluded); owner: "incidents OK" | `backend/inputs/incidents.csv` |
| 4 Open-Meteo rainfall (archive + live) | Done — 2026 dates from the archive, live rolling totals; stale live feed → No data; IMD vs Open-Meteo difference documented | `backend/app/openmeteo.py`, `scripts/fetch_openmeteo.py`, `test_openmeteo.py`, `test_real_corridor.py::test_phase4_openmeteo_archive_and_live`, `docs/DATA_INVENTORY.md` |
| 5 Back-test | Done — 3/10 incidents Orange/Red at the segment (4/10 within ±1); travellers held 9/10 with the old thresholds but on 16–87% of May–Sep days; 1 dry-day false alarm in 572 | `scripts/backtest.py`, `docs/BACKTEST.md` |
| 6 SACHET IMD warnings | Done — feed works; parser tested on real samples; **no live Dima Hasao alert seen yet**; alerts that name only "N districts of <state>" cannot be matched without each alert's CAP polygon | `backend/app/sachet.py`, `test_sachet.py` |
| 7 AI provider / photo evaluation | Done — local model photo check only; 140 owner-labelled photos: 77% accuracy, 0 failures; BR-10: 15/20 flipped with the note, 0/20 photo-only; photo only for both providers (owner decision B); Claude run pending a key | `docs/PHOTO_EVAL.md`, `docs/AI_PROMPT_LOG.md` |
| 8 OSRM diversions | Done — 73 of 274 zones with a real detour; 520 diversion-road segments (`offCorridor`, scored, BR-03 only, kept out of the NH-27 list / KPIs / colouring / corridor check) | `scripts/osrm_diversions.py`, `docs/DIVERSIONS.md`, `backend/inputs/diversions.json` |
| 9 Translation review sheet | Done — 45 rows (native-speaker review pending) | `backend/inputs/translations_review.csv` |
| Core fix FR-09 | Done — zones evaluated over the segments ahead | section above |
| Calibration | Done — Orange 60 / Red 75 applied (owner decision A) | `docs/CALIBRATION.md` |
| "Clear hides a hazard" | Done — clear / not relevant from field staff or below the confidence threshold → officer queue | `reportChecks.test.ts`, `test_workflow.py` |
| 10 Verify and document | Final run: see the verification section | `docs/evidence/verification-2026-11-03.txt` |

## Contradictions / decisions to note

- **Alert load on long stretches.** FR-09 makes each zone look ahead to the next holding point; with 7 Provisional
  holding points the Jatinga – Retzol – Silchar-side stretches are on HOLD on 63% of May–Sep days even after
  calibration. More verified holding points (candidates in `docs/CALIBRATION.md`) are the main lever.
- **2022 events and NH-27.** None of the dated 14–16 May 2022 Haflong landslides lies within 500 m of an NH-27 segment
  (they are in Haflong town / on the railway). The back-test uses the 10 NH-27 incidents in `incidents.csv`.
- **Rainfall sources differ.** Open-Meteo (2026, live) reads far lower than IMD on heavy-rain days; thresholds were
  calibrated mostly on IMD years. Re-check after a monsoon with Open-Meteo inputs.
- **Corridor end:** the Dima Hasao part of NH-27 ends at the district boundary on the Harangajao side, not at Silchar.
- Place names stay in Roman script inside hi/as/bn alerts (OSM names folded to ASCII, e.g. Jātinga → Jatinga) — **assumption**.
- IMD "heavy-rainfall warning" for BR-11 = IMD **Orange or Red**; BR-05 floors as before — **assumptions**.
- The database is shared with RESILION 1: RESILION 2.0 writes only to schema `resilion2` (`resilion2_test`,
  `resilion2_rtest` for tests).

## Next

1. One run with a real `ANTHROPIC_API_KEY`: photo check (AC-14 on Claude) and the alert writer (AC-21).
2. District check of holding points (all Provisional) and of the OSM candidates for the long stretches.
3. Native-speaker review of hi/as/bn templates (`translations_review.csv`); Dimasa templates (ST-19).
4. SACHET: fetch each alert's CAP polygon so alerts that do not name Dima Hasao can still be matched.
