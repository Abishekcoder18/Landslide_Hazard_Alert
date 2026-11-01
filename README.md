# RESILION 2.0

PS13 — Landslide and Hazard Alert Management for Hill Roads. Initial corridor: NH-27 within Dima Hasao district, Assam.

Road-level decision layer: segment Risk Index (rules), approach-zone decisions (GO / HOLD at a named Safe Holding Point / DIVERT on a risk-checked route), officer-confirmed field reports, CLOSE recommendation with escalation, reopening estimate, validated multilingual alerts and CAP export. Requirements: `docs/RESILION_2.0_PRD_v1.0.docx`.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 — sample-data mode
npm test           # domain rules + workflow tests
npm run lint
npm run build
```

Sign in with any user ID and a role. Without `VITE_API_URL` the app runs on an in-browser sample-data server (`src/api/mock/server.ts`). To use the real backend (FastAPI + PostgreSQL/PostGIS + Claude), follow `backend/README.md` and put `VITE_API_URL=http://localhost:8000` in `.env.local`.

## Layout

| Path | Contents |
|---|---|
| `src/domain/` | Pure rules: decision engine, Risk Index, report checks, alerts + validator + CAP, permissions (with tests) |
| `src/api/` | `ResilionApi` contract, HTTP client, sample-data server |
| `backend/` | FastAPI + PostGIS backend, Claude photo check and alert writer |
| `scripts/parity-fixture.ts` | Generates the TS↔Python parity fixture used by `backend/tests/test_parity.py` |
| `src/pages/` | Corridor, Reports, Decisions, Approvals, Incidents, Records, Configuration, Login |
| `docs/IMPLEMENTATION_AUDIT.md` | Status against AC-01–AC-25 and ST-01–ST-25 |
| `docs/evidence/` | Test/build output and screenshots |

All corridor values are sample data; map geometry is approximate.
