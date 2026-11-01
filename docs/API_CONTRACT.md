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
| POST | `/api/admin/reset-sample-data` | — | 204 | sample data only |

`GET /api/snapshot` may later be split into per-entity endpoints; the UI polls it every 5 s.

## Behaviour the backend must keep (from `server.ts`)

- **Permissions** (`src/domain/permissions.ts`, PRD §8) are enforced on every command; refusals are written to the audit log.
- **Second approver** can decide only `escalated` approvals; `pending` escalates after `config.escalationMinutes` (FR-17, AC-10).
- **Risk Index** (`src/domain/riskIndex.ts`): weighted rules, IMD/GSI only raise (BR-05), missing/stale → No data (BR-06), 6-hour validity then recompute (BR-12).
- **Decision engine** (`src/domain/decisionEngine.ts`) runs per approach zone for light and heavy vehicles after every state change; a decision record row is appended only when the decision changes (FR-18).
- **CLOSE recommendation**: one open closure approval per segment while any zone has `closeRecommended`.
- **Reports**: checks and routing in `src/domain/reportChecks.ts`. The note is stored as data and never sent to a model as instructions (BR-10). AI output never changes segment state (BR-07).
- **Photo check**: Claude Sonnet 5.5 vision, fixed labels `debris | crack | fallen_tree | water | clear | not_relevant`, `blockedShare` 0–100, `confidence` 0–1. On error/timeout: `ai = null`, `aiError` set, route `manual_review` (FR-26). Sample photo IDs (`sample-debris`, `sample-clear`) return labelled sample results.
- **Alerts**: model output in en/hi/as/bn is validated with `validateAlert` (`src/domain/alerts.ts`); failures are blocked and the plain template is used (BR-09). Dimasa only from native-speaker templates (FR-29). CAP built with `buildCap` after approval (FR-31).
- **Audit log** is append-only (FR-34).
- `ANTHROPIC_API_KEY` lives only in the backend environment.
