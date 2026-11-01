# RESILION 2.0 — Backend (FastAPI + PostgreSQL/PostGIS)

Implements `docs/API_CONTRACT.md`. The frontend uses it when `VITE_API_URL` is set.

| Module | Contents |
|---|---|
| `app/domain/` | Python port of `src/domain/*.ts` (decision engine, Risk Index, report checks, alerts + validator + CAP, permissions). `tests/test_parity.py` proves identical results. |
| `app/service.py` | Workflow (reports → decisions → CLOSE → escalation → alerts → CAP → reopening), audit, decision record |
| `app/store.py` | PostGIS storage; segment/zone geometry; corridor distance via `ST_Distance`; append-only trigger on `audit_log` and `decision_records` |
| `app/ai.py` | Claude Sonnet 5.5 photo check (FR-21) and alert writer (FR-28). Off without `ANTHROPIC_API_KEY`; every failure falls back to manual review / plain template |
| `app/main.py` | FastAPI endpoints, photo upload, sign-in tokens |

## Run on Windows (PowerShell)

Needs Python 3.11+ and PostgreSQL with the PostGIS extension (Stack Builder → Spatial Extensions → PostGIS).

1. Create the database (in `psql` or pgAdmin, as the `postgres` user):

```sql
CREATE USER resilion WITH PASSWORD 'resilion';
CREATE DATABASE resilion OWNER resilion;
\c resilion
CREATE EXTENSION postgis;
```

2. Set up and start the backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Check http://localhost:8000/api/health and http://localhost:8000/docs.

3. Point the frontend at it — create `.env.local` in the repo root containing:

```
VITE_API_URL=http://localhost:8000
```

then `npm run dev` and open http://localhost:3000.

## Tests

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m pytest -q
```

`test_api.py` needs the PostGIS database above (set `TEST_DATABASE_URL` to a disposable database — it is wiped). `test_parity.py` needs Node.js and `npm install` at the repo root.

## Turning on Claude

Put your key in `backend/.env` as `ANTHROPIC_API_KEY=...` and restart. `/api/health` then shows `"ai": {"enabled": true}`. The key is never sent to the browser.

Requests use server-side refusal fallbacks (`fallbacks: "default"`): if a safety classifier declines, the API retries on a fallback model in the same call; a final refusal sends the report to manual review.

## Notes

- Sign-in is prototype level: signed token with user ID and role, no password yet.
- Escalation (FR-17) is evaluated on every read; the UI polls every 5 s.
- `POST /api/admin/reset-sample-data` wipes everything, including the audit log; set `ALLOW_SAMPLE_RESET=false` outside the hackathon.
