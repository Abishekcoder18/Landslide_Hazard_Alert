# RESILION 2.0 — Frontend ↔ Backend API contract

The UI talks only to the `ResilionApi` interface (`src/api/types.ts`). Two implementations exist:

| Mode | When | Source |
|---|---|---|
| `mock` | `VITE_API_URL` unset | `src/api/mock/server.ts` — in-browser workflow on sample data (reference behaviour) |
| `http` | `VITE_API_URL=http://host:port` | `src/api/httpApi.ts` — calls the FastAPI backend below |

Payload and response shapes are the TypeScript types in `src/types/index.ts` (PRD §11.1 entities). All times are ISO 8601. Errors return a non-2xx status with `{"detail": "<message>"}`; `403` for permission refusals (AC-23).

## Endpoints

| Method | Path | Body | Returns | PRD |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{userId, role}` | `Session` (`token` used as `Authorization: Bearer`) | FR-32 |
| GET | `/api/snapshot` | — | `Snapshot` | all |
| POST | `/api/reports` | `NewReportInput` | `Report` | FR-19, FR-21–23, FR-26 |
| POST | `/api/reports/{id}/confirm` | `{newState: "BLOCKED" \| "RESTRICTED_HEAVY" \| "RESTRICTED_ONE_WAY"}` | 204 | FR-24, FR-25 |
| POST | `/api/reports/{id}/reject` | — | 204 | FR-24 |
| POST | `/api/zones/{id}/clear-passage` | — | 204 | BR-01 (Orange) |
| POST | `/api/segments/{id}/alerts` | — | 204 (alert draft + approval) | FR-27 |
| POST | `/api/approvals/{id}/decision` | `{approve: bool, closureType?}` | 204 | FR-12, FR-17, BR-08 |
| PATCH | `/api/incidents/{id}` | `IncidentPatch` | 204 | FR-13–15, FR-37 |
| POST | `/api/incidents/{id}/reopening` | `{to: "one_way" \| "full"}` | 204 | FR-13, BR-08 |
| PUT | `/api/alerts/{id}/texts/{lang}` | `{text}` | 204 | FR-30, BR-09 |
| PATCH | `/api/config` | `Partial<Config>` | 204 | FR-06, NFR-09 |
| PATCH | `/api/zones/{id}` | `ZonePatch` | 204 | FR-08, BR-04 |
| PATCH | `/api/segments/{id}/inputs` | `Partial<SegmentInputs>` | 204 | FR-02, FR-05 (until live feeds) |
| POST | `/api/admin/reset-sample-data` | — | 204 | admin; clears the workflow and reloads the corridor (real data from PostGIS when loaded, else sample data) |

`GET /api/snapshot` may later be split into per-entity endpoints; the UI polls it every 5 s.

## Behaviour the backend must keep (from `server.ts`)

- **Permissions** (`src/domain/permissions.ts`, PRD §8) are enforced on every command; refusals are written to the audit log.
- **Second approver** can decide only `escalated` approvals; `pending` escalates after `config.escalationMinutes` (FR-17, AC-10).
- **Risk Index** (`src/domain/riskIndex.ts`): weighted rules, IMD/GSI only raise (BR-05), missing/stale → No data (BR-06), 6-hour validity then recompute (BR-12).
- **Decision engine** (`src/domain/decisionEngine.ts`) runs per approach zone for light and heavy vehicles after every state change; a decision record row is appended only when the decision changes (FR-18).
  - **Segments ahead (FR-09):** each zone is evaluated over every segment a traveller in that zone crosses before the
    next Safe Holding Point ahead (`segmentsAhead`: own segment first; southbound = increasing chainage; segments with
    `offCorridor: true` are not in the chainage). Each segment is evaluated with the zone's own holding-point chain
    (behind the zone, BR-04); the most restrictive decision wins (GO < GO_CAUTION < DIVERT < HOLD, BR-02), the nearest
    segment on ties (`evaluateZoneAhead`). When a segment further ahead decides, `DecisionResult.aheadSegmentId` names it.
  - **CLOSE only from the segment's own zones:** `closeRecommended` is true only when the zone's own segment decides.
  - **Officer-cleared passage (BR-01) is per segment and direction:** clearing passage through an Orange segment from one
    zone applies to every zone that looks at that segment in the same direction.
  - **CAP audience (FR-31):** an alert's `zoneIds` are the segment's own zones plus every zone whose current decision has
    `aheadSegmentId` equal to that segment.
- **CLOSE recommendation**: one open closure approval per segment while any zone has `closeRecommended`. When the rules no longer recommend CLOSE (e.g. rainfall fell), a pending/escalated closure approval is withdrawn: `status: "withdrawn"`, `decidedBy: "Decision engine"`, audit "CLOSE recommendation withdrawn". The engine never approves.
- **Reports**: checks and routing in `src/domain/reportChecks.ts`. The note is stored as data and never sent to a model as instructions (BR-10). AI output never changes segment state (BR-07).
- **Photo check**: Claude Sonnet 5.5 vision, fixed labels `debris | crack | fallen_tree | water | clear | not_relevant`, `blockedShare` 0–100, `confidence` 0–1. On error/timeout: `ai = null`, `aiError` set, route `manual_review` (FR-26). Sample photo IDs (`sample-debris`, `sample-clear`) return labelled sample results.
- **Alerts**: model output in en/hi/as/bn is validated with `validateAlert` (`src/domain/alerts.ts`); failures are blocked and the plain template is used (BR-09). Dimasa only from native-speaker templates (FR-29). CAP built with `buildCap` after approval (FR-31).
- **Audit log** is append-only (FR-34).
- `ANTHROPIC_API_KEY` lives only in the backend environment.

## Real corridor data (backend, schema `resilion2`)

When the data pipeline has loaded PostGIS (`backend/scripts`, see `backend/README.md`) and `CORRIDOR_SOURCE=auto`
(default), the backend seeds the real NH-27 corridor instead of the sample seed. Added fields (all optional, so sample
mode is unchanged):

| Where | Field | Meaning |
|---|---|---|
| `Snapshot` | `corridor: CorridorMeta` | `{source: "postgis" \| "sample", scenarioDate, segments, zones, modelVersion, modelCv}` |
| `SegmentInputs` | `susceptibilityScore` | 0–1 model score; **replaces** the categorical susceptibility in the Risk Index (reason "Model susceptibility 0.82"); `susceptibility` is then the derived category (display) |
| `SegmentInputs` | `modelVersion` | e.g. `susc-lgbm-20261102` |
| `SegmentInputs` | `rainfallDate` | date of the IMD gridded rainfall used (historical scenario) |
| `SegmentInputs` | `sources` | short labels: `{terrain, rainfall, history}` |
| `Config` | `scenarioDate` | `PATCH /api/config {scenarioDate: "YYYY-MM-DD"}` (admin, 2010-01-07 … 2025-12-31) re-reads rainfall for that date; 400 outside the range or in sample mode |

- **Input feed:** when a Risk Level's validity expires, the inputs are re-read from PostGIS (terrain, model score,
  history, IMD rainfall for `scenarioDate`) before recomputing, so real data does not turn into No data (audit "Inputs refreshed").
- **Manual edits** via `PATCH /api/segments/{id}/inputs`: only changed fields count. Changing data fields (susceptibility,
  slope, rainfall, history) marks the segment `sample: true` (and a manual category drops the model score); setting only
  `imdWarning` / `gsiBulletin` keeps the real data.
- Segment IDs `NH27-DH-001…137`; zones `AZ-<nnn>S` (southbound, before the segment) and `AZ-<nnn>N` (northbound).

## Changes 2026-11 (owner decisions)

| Where | Field / value | Meaning |
|---|---|---|
| `Approval.status` | `"withdrawn"` | a CLOSE recommendation the rules no longer support, withdrawn by the decision engine (`decidedBy: "Decision engine"`, audit "CLOSE recommendation withdrawn"). Cannot be approved. Replaces the earlier use of `"rejected"` for this case. |
| `DEFAULT_CONFIG.weights` | 25 / 45 / 15 / 15 | susceptibility / rainfall / slope / history (thresholds unchanged) |
| `Segment.offCorridor` | optional boolean | diversion-road segment (not NH-27): scored for BR-03 only; excluded from the corridor chainage, list, KPIs and NH-27 map colouring |
| `DecisionResult.aheadSegmentId` | optional string | FR-09: the segment ahead (not the zone's own) that decides |
| `Snapshot.zones` | 274 on the real corridor | two per segment: `AZ-<nnn>S` (southbound, before the segment) and `AZ-<nnn>N` (northbound, after it) |
| `SafeHoldingPoint.capacityVehicles` | `number \| null` | null = unknown (OSM has no capacity); never invented |
| `SafeHoldingPoint.source`, `.verified`, `.lat`, `.lon` | optional | e.g. `osm:245731951`; `verified` false until the district confirms; real location for the map |
| `SegmentInputs.imdWarningSource` | optional string | `"SACHET <alert id> · <source> · until <time>"` when set by the SACHET feed, `"Officer"` when set in Configuration |
| `AiClassification.model` | `"local:<model>"` | the optional Ollama provider; the UI shows "Local model" (Claude model ids show "Claude") |
| `Alert.writerModel` | optional string | model that wrote the alert texts (same labelling) |

- **SACHET feed** (`FEEDS_ENABLED=true`, real corridor only): every `SACHET_POLL_MINUTES` the backend reads NDMA SACHET's
  public alert list; the highest IMD colour in effect for Dima Hasao sets `imdWarning` on every segment. It can raise an
  officer-set warning but never lowers one, and clears only warnings it set itself. BR-05 / BR-11 apply unchanged.
- **API responses are gzip-compressed** when the client sends `Accept-Encoding: gzip` (snapshot ~570 KB → ~48 KB).