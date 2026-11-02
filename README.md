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
| `backend/scripts/` | Real-data pipeline: NH-27 segmentation, features, susceptibility model, model card; browser walkthrough |
| `docs/IMPLEMENTATION_AUDIT.md` | Status against AC-01–AC-25 and ST-01–ST-25 |
| `docs/DATA_INVENTORY.md` · `docs/MODEL_CARD.md` | Data used (RESILION 1 final datasets + public downloads) · model purpose, method, measured metrics, limits |
| `docs/PANEL_WALKTHROUGH.md` | Step-by-step presentation script for the three Must-Have features |
| `docs/evidence/` | Test/build output and screenshots |

**Data.** With the backend and the data pipeline loaded, the corridor is real: 137 NH-27 segments (~1 km) in Dima Hasao, Copernicus DEM terrain, landslide history from the RESILION 1 inventory, a LightGBM susceptibility score per segment (spatial block CV ROC-AUC 0.791 ± 0.044, see `docs/MODEL_CARD.md`) and IMD gridded rainfall for a chosen historical date (labelled with that date). The model is one input of the rule-based Risk Index; business rules BR-01..BR-12 decide GO / HOLD / DIVERT / CLOSE, and an officer approves every closure and alert. Without the backend, the app runs on 12 approximate sample segments ("Sample data").
