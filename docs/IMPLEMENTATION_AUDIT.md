# RESILION 2.0 — Implementation Audit vs PRD v1.0 (updated 2026-11-01)

Scope: UI framework + in-browser sample-data server on branch `claude/jolly-shannon-vm5au7`, checked against PRD v1.0 (AC-01–AC-25), MRD v1.0 and the Jira-ready backlog (EP-01–EP-06, ST-01–ST-25).

**Status key:** **T** tested (automated test passes) · **U** shown working in the browser run (screenshot) · **P** partial · **B** needs backend / external dependency · **—** not started.
Nothing here is a field result. All corridor values are **sample data**; map geometry is approximate.

## Verification run

| Check | Result | Evidence |
|---|---|---|
| `npm test` | 43 pass, 0 fail | `docs/evidence/verification-2026-11-01.txt` |
| `npm run lint` (`tsc --noEmit`) | pass | same |
| `npm run build` | pass (bundle > 500 kB warning) | same |
| Browser run, 6 roles, full workflow (Playwright, Chromium) | 0 page errors, 0 console errors; no visible "demo" text | `docs/evidence/01…22-*.png` |
| Map tiles / sample photos | blocked by this sandbox's network; render where internet is available | — |

## Acceptance criteria

| AC | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| AC-01 | FR-01 ~1 km segments, stable IDs | **—** | `src/api/mock/seed.ts` | 12 approximate segments (8–12 km). Needs the team GeoPackage segmentation script (ST-01). |
| AC-02 | FR-03/04/07 level + top reasons on map | **T U** | `domain/riskIndex.ts`, `CorridorPage`, `SegmentDrawer` | Risk Index is computed from inputs, not hard-coded. |
| AC-03 | FR-05/06 recompute on new data / 6 h, configured thresholds | **T** | `riskIndex.test.ts`, `server.test.ts` | Thresholds/weights editable in Configuration. |
| AC-04 | BR-05 warnings only raise | **T** | `riskIndex.test.ts`, `server.test.ts` | |
| AC-05 | BR-06 missing/stale → No data | **T U** | `riskIndex.test.ts` | S-10 has missing rainfall → No data. |
| AC-06 | BR-01 every row | **T U** | `decisionEngine.test.ts`, Decisions › Rule checks | 14 scripted scenarios (SM1 = 14/14). |
| AC-07 | BR-02 one-way + Orange → HOLD | **T** | SC-13 | |
| AC-08 | BR-03 diversion rule | **T U** | `checkDiversionSafety` | **P** for FR-10: diversion candidates are configured segment lists; OSRM not wired (**B**). |
| AC-09 | BR-04 next eligible point back | **T** | `selectHoldingPoint` | Fallback chains editable in Configuration. |
| AC-10 | FR-12/17 escalation, nothing auto-published | **T U** | `server.test.ts`, Approvals | Countdown shown; second approver locked until escalation. |
| AC-11 | FR-13–15 expected wait = estimate − now, labelled | **T U** | `15-incident-log.png`, `16-…` | |
| AC-12 | FR-16 window-closing, no hurry wording | **T** | engine + alert validator forbidden words | Flag shown to control-room roles only. |
| AC-13 | FR-18 decision, inputs, time stored | **T U** | Records › Decision record | CSV export. |
| AC-14 | FR-19/21 class, share blocked, confidence | **P U** | Reports › New report | Web upload works. Photo check is **simulated** for the two labelled sample photos; uploaded photos go to manual review until the Claude vision endpoint exists (**B**). |
| AC-15 | FR-22 outside corridor / old → flagged | **T** | `reportChecks.test.ts` | |
| AC-16 | FR-22 grouping into one incident | **T U** | `reportChecks.test.ts` | Confirming one report confirms its group and links all to one incident. |
| AC-17 | FR-23–25 confirm → BLOCKED + re-evaluate; reject → no change | **T U** | `server.test.ts`, `06-…` | |
| AC-18 | BR-07 AI alone never changes state | **T** | `server.test.ts` | AI writes an audit "flag" only. |
| AC-19 | BR-10 injected note has no effect | **T** | `server.test.ts` | Re-test once a real model reads reports (**B**). |
| AC-20 | FR-26 AI unavailable → manual review | **T U** | `server.test.ts`, Configuration toggle | |
| AC-21 | FR-27/28/30 alerts match or are blocked | **T U** | `alerts.test.ts`, `11-alert-blocked.png` | Validator + templates done. LLM fill/translation is backend (**B**); hi/as/bn templates need native review. |
| AC-22 | FR-31 CAP Severe/Immediate/certainty/area | **T U** | `alerts.test.ts`, `12-cap-export.png` | |
| AC-23 | FR-33 patrol refused | **T U** | `permissions.test.ts`, `server.test.ts` | Real authentication is backend (**B**). |
| AC-24 | FR-08 one zone per direction; decision inside geofence | **P T** | seed + `server.test.ts` | One zone per direction per risky segment; geofence used as map ring and CAP area. No vehicle location by design. |
| AC-25 | FR-20 field-app channel | **—** | — | Not Verified (field-app photo upload unconfirmed). |

**Summary:** 20 of 25 tested; 3 partial (AC-08 OSRM, AC-14 real photo AI, AC-24 geofence use); 2 not started (AC-01 needs data, AC-25 field app).

## Stories (backlog ST-01–ST-25)

| Story | Status | Story | Status |
|---|---|---|---|
| ST-01 segmentation | — (data) | ST-14 field app | — (Not Verified) |
| ST-02 inputs | P (sample inputs; feeds **B**) | ST-15 auto checks | T |
| ST-03 risk map + reasons | T U | ST-16 queue confirm/reject | T U |
| ST-04 validity + config | T U | ST-17 AI outage | T U |
| ST-05 approach zones | T U (P geofence) | ST-18 validated alerts | P (validator T; LLM **B**) |
| ST-06 decision table | T U | ST-19 Dimasa | — (translator pending; UI marks pending) |
| ST-07 diversion | T (OSRM **B**) | ST-20 CAP export | T U |
| ST-08 holding point | T U | ST-21 login | U (role sign-in; real auth **B**) |
| ST-09 CLOSE + escalation | T U | ST-22 permissions | T U |
| ST-10 incident log + estimate | T U | ST-23 audit log | U (append-only in UI/mock) |
| ST-11 window closing | T | ST-24 offline cache | — (Could, not in scope) |
| ST-12 equipment | U | ST-25 SMS | — (Could, not in scope) |
| ST-13 web upload + AI | P (simulated AI) | | |

## UI evidence sheet mapping

| Screen (backlog) | Screenshot |
|---|---|
| Corridor map | `02-corridor.png` |
| Segment detail panel | `03-segment-drawer.png` |
| Approach-zone overlay | `03-segment-drawer.png` (dashed rings), `20-config-zones.png` |
| Decision panel | `04-…`, `06-decisions-after-confirm.png`, `16-decisions-expected-wait.png` |
| Closure approval view | `09-closure-approval.png` |
| Incident and clearance log | `15-incident-log.png` |
| Window-closing flag | `23-window-closing.png` (S-06 Yellow + IMD Orange set by administrator) |
| Report upload page | `14-report-upload.png` |
| Officer report queue | `05-reports-queue.png` |
| Alert approval view | `10-alert-approval.png`, `11-alert-blocked.png`, `12-cap-export.png` |
| Login screen | `01-login.png` |

## Contradictions / decisions to note

- Place names stay in Roman script inside hi/as/bn alerts so the validator can match them exactly — **assumption**, confirm with district.
- IMD "heavy-rainfall warning" for BR-11 is taken as IMD **Orange or Red** — **assumption**.
- BR-05 floors: IMD Yellow/Orange → at least Yellow, IMD Red → at least Orange, GSI bulletin → at least Orange — **assumption**. Chosen so BR-11 (Yellow + IMD heavy-rainfall warning) can occur; with "warning colour = minimum level" the window-closing flag could never fire.
- Fallen tree / water reports go to the officer queue (PRD names only debris/crack for the queue and clear/not-relevant for log-only).
- SM3 in mock mode measures only engine time (~1 ms); with the backend it will include the AI photo-check time.
- Holding-point names and Silchar-side town remain **pending verification** (marked "Provisional").

## Next (backend)

1. FastAPI service implementing `docs/API_CONTRACT.md` over PostGIS.
2. Segmentation script from the team GeoPackage (AC-01).
3. Claude Sonnet 5.5 photo-check endpoint (AC-14, re-run AC-19).
4. LLM alert fill/translation feeding `validateAlert` (AC-21).
5. OSRM diversion candidates (AC-08 / FR-10).
