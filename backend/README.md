# RESILION 2.0 — Backend (FastAPI + PostgreSQL/PostGIS)

Implements `docs/API_CONTRACT.md`. The frontend uses it when `VITE_API_URL` is set.

| Module | Contents |
|---|---|
| `app/domain/` | Python port of `src/domain/*.ts` (decision engine, Risk Index, report checks, alerts + validator + CAP, permissions). `tests/test_parity.py` proves identical results. |
| `app/service.py` | Workflow (reports → decisions → CLOSE → escalation → alerts → CAP → reopening), audit, decision record |
| `app/store.py` | PostGIS storage; segment/zone geometry; corridor distance via `ST_Distance`; append-only trigger on `audit_log` and `decision_records` |
| `app/ai.py` | Claude Sonnet 5.5 photo check (FR-21) and alert writer (FR-28). Off without `ANTHROPIC_API_KEY`; every failure falls back to manual review / plain template |
| `app/main.py` | FastAPI endpoints, photo upload, sign-in tokens |
| `app/corridor_data.py` | Real NH-27 corridor from PostGIS: 137 segments, zones, holding points, model score, IMD rainfall for a date; input feed |
| `scripts/` | Data pipeline (inventory → download → segmentation → features → model → model card), RESILION 1 safety check, browser walkthrough |
| `models/` | `susceptibility.joblib` (LightGBM, 0.3 MB) + `model_meta.json` (metrics, data, version) |

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
# Create .env only on first setup. NEVER copy over an existing .env: it holds the real DATABASE_URL and keys.
if (!(Test-Path .env)) { copy .env.example .env }
uvicorn app.main:app --reload --port 8000
```

> **Warning:** never overwrite an existing `backend/.env` with `.env.example`. The example's `DATABASE_URL` is a
> placeholder; copying it over loses the real database URL (and any `ANTHROPIC_API_KEY`), and the backend then falls back
> to sample data.

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

`test_api.py` uses (and wipes) only schema `resilion2_test`; `test_real_corridor.py` copies the reference tables from `resilion2` into `resilion2_rtest` and drops it afterwards (skipped until the data pipeline has run). The database URL comes from `TEST_DATABASE_URL` or `DATABASE_URL`. `test_parity.py` needs Node.js and `npm install` at the repo root. `test_segments.py` / `test_features.py` run fully in the data venv (`.venv-data`).

## Turning on Claude

Put your key in `backend/.env` as `ANTHROPIC_API_KEY=...` and restart. `/api/health` then shows `"ai": {"enabled": true}`. The key is never sent to the browser.

Requests use server-side refusal fallbacks (`fallbacks: "default"`): if a safety classifier declines, the API retries on a fallback model in the same call; a final refusal sends the report to manual review.

## Notes

- Sign-in is prototype level: signed token with user ID and role, no password yet.
- Escalation (FR-17) is evaluated on every read; the UI polls every 5 s.
- `POST /api/admin/reset-sample-data` wipes the RESILION 2.0 workflow tables (schema `resilion2` only), including the audit log, and reloads the corridor; set `ALLOW_SAMPLE_RESET=false` outside the hackathon.

## Shared database: schema isolation

The database can be shared with RESILION 1 (which owns `public.*`, including a `public.incidents` table). RESILION 2.0
creates and writes tables **only** in schema `DB_SCHEMA` (default `resilion2`; tests use `resilion2_test` /
`resilion2_rtest`). Every table name is schema-qualified and the backend refuses to connect unless `current_schema()` is
that schema. PostGIS functions are only used from `public`. `DATABASE_URL` may be SQLAlchemy style
(`postgresql+psycopg://…`).

Prove RESILION 1 is untouched (row count + md5 of every table outside `resilion2*`):

```powershell
.venv\Scripts\python.exe scripts\check_public_untouched.py snapshot   # once, before the first run
.venv\Scripts\python.exe scripts\check_public_untouched.py verify     # any time later
```

## Real corridor data and the susceptibility model

Separate venv for the geospatial/ML scripts (from the repo root):

```powershell
python -m venv backend\.venv-data
backend\.venv-data\Scripts\python.exe -m pip install geopandas pyogrio rasterio shapely pyproj networkx scipy pandas pyarrow scikit-learn lightgbm joblib imdlib psycopg[binary] python-dotenv pytest playwright
backend\.venv-data\Scripts\python.exe backend\scripts\inventory.py       # docs/DATA_INVENTORY.md (read only)
backend\.venv-data\Scripts\python.exe backend\scripts\download_data.py   # Copernicus DEM, ESA WorldCover window, IMD rain 2010-2025
backend\.venv-data\Scripts\python.exe backend\scripts\segment_nh27.py    # 137 x ~1 km NH-27 segments -> resilion2.ref_*
backend\.venv-data\Scripts\python.exe backend\scripts\build_features.py  # terrain/drainage/history/rain -> resilion2.segment_features, imd_rain_daily
backend\.venv-data\Scripts\python.exe backend\scripts\train_model.py     # LightGBM + spatial CV -> models/, resilion2.segment_scores
backend\.venv-data\Scripts\python.exe backend\scripts\model_card.py      # docs/MODEL_CARD.md from model_meta.json
```

Team data is read from `D:\` (RESILION 1 final datasets first) and never copied into the repo; derived files go to
git-ignored `backend/data/`. The scripts drop the `PROJ_LIB` / `GDAL_DATA` variables that the PostGIS installer sets,
for their own process only.

Then restart the backend; on first start (or after "Reload corridor data") it seeds the real corridor.

| Variable | Default | Meaning |
|---|---|---|
| `DB_SCHEMA` | `resilion2` | RESILION 2.0 schema (must start with `resilion2`) |
| `CORRIDOR_SOURCE` | `auto` | `auto` = real corridor when loaded, else sample; `sample` = always sample |
| `SCENARIO_DATE` | `2022-05-10` | IMD rainfall date for the initial load (administrator can change it in Configuration) |

Browser walkthrough of F1 → F3 → F2 on the real corridor (backend on :8000, frontend on :3000):

```powershell
backend\.venv-data\Scripts\python.exe -m playwright install chromium
backend\.venv-data\Scripts\python.exe backend\scripts\e2e_walkthrough.py   # screenshots docs/evidence/30-42
```

## Live IMD warnings (NDMA SACHET)

`FEEDS_ENABLED=true` in `backend/.env` starts a 30-minute poll (`SACHET_POLL_MINUTES`) of the public SACHET alert list
(`https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails`; RSS / CAP 1.2: `.../rss/rss_india.xml`). No key.
Only alerts in effect, from IMD or the Assam SDMA, of a rainfall/thunderstorm/landslide type and naming Dima Hasao count;
the colour is SACHET's own `severity_color`. Parser and rules: `app/sachet.py`, tests `tests/test_sachet.py` on real
samples in `inputs/sachet_sample.xml|json`. GSI bulletins stay manual (no API).

## Rainfall: IMD, Open-Meteo archive, Open-Meteo live

The rainfall date (Configuration, or `SCENARIO_DATE`) picks the source for every segment's 24 h / 3-day / 7-day
rainfall, always from the segment's own 0.25° rain cell, and the UI shows the source:

- 2010-01-07 … 2025-12-31: IMD gridded daily rainfall (`imd_rain_daily`).
- 2026 dates: Open-Meteo archive (`openmeteo_rain_daily`). Load / update with
  `backend\.venv-data\Scripts\python.exe backend\scripts\fetch_openmeteo.py` (no key; the archive lags ~5 days).
  A date with no archive rows is refused.
- `live`: Open-Meteo hourly precipitation, rolling totals to the last completed hour. With `FEEDS_ENABLED=true` the
  server fetches every `RAIN_POLL_MINUTES` (default 60) while the date is `live`. `updatedAt` is the fetch time, so if
  the feed stops, BR-06 turns the inputs stale (No data) after `staleInputHours`. Until the first fetch: No data.

Open-Meteo and IMD differ a lot on heavy-rain days (see `docs/DATA_INVENTORY.md`), so Open-Meteo is used only where IMD
has no data.

## Optional free local model (Ollama) - photo check only

Only when `ANTHROPIC_API_KEY` is empty: set `AI_PROVIDER=ollama` (optionally `OLLAMA_VISION_MODEL`, default
`qwen2.5vl:7b`; `OLLAMA_URL`; `OLLAMA_TIMEOUT_S`). Install Ollama from https://ollama.com, then `ollama pull qwen2.5vl:7b`
(about 6 GB). The local model does the **photo check only**, with the same prompt, labels and fail-safe as Claude
(`app/ai_local.py`); results are stored as `local:<model>` and shown as "Local model". The **alert writer is Claude-only**:
without a key, alerts use the validated templates (owner decision 2026-11-03, after local models failed the hi/as/bn
tests). `OLLAMA_TEXT_MODEL` is accepted only as `disabled`. Prompt log: `docs/AI_PROMPT_LOG.md`.

### Photo evaluation set

`scripts/fetch_eval_photos.py` downloads ~150 freely licensed Wikimedia Commons photos into `inputs/photo_eval/`
(`img001.jpg` ..., credits in `CREDITS.md`). Labels are made by a person, never by a model: open
`inputs/photo_eval/label.html` directly in a browser, load `labels.csv`, label, export, and save the export over
`inputs/photo_eval/labels.csv`. Then `scripts/eval_photo_check.py` writes `docs/PHOTO_EVAL.md`.

## Holding points and other inputs

- `scripts/holding_points_osm.py` → `inputs/holding_points.csv` (OSM candidates within 300 m of NH-27, verified=no),
  then `scripts/segment_nh27.py` snaps them and rebuilds the 274 zones' BR-04 chains.
- `inputs/incidents.csv`: NH-27 incidents with source URLs (for the back-test; owner check pending).
- `inputs/translations_review.csv` (`npx tsx scripts/translation-sheet.ts`): template lines for native-speaker review.
- `scripts/scenario_report.py <dates>`: segments per level and zone decisions for IMD rainfall dates (read only).
- `scripts/measure_perf.py`: snapshot size / latency and page load.

## Not set up yet

- **OSRM diversions:** Docker Desktop is installed but its engine was not running; building OSRM for the North-Eastern
  Zone needs several GB of RAM. Start Docker Desktop first.