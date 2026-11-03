# RESILION 2.0 — presentation runbook

Laptop: Windows, PowerShell, repository at `E:\resilion-2.0_Landslide_Hazard_Alert`. Every number below was produced by
the app's own code on the real NH-27 corridor (137 segments, 274 approach zones) with the calibrated defaults
(weights 25/45/15/15, thresholds 30/60/75) and the rainfall date **15 May 2022** (IMD gridded, historical — say so).

## 1. Start everything (about 3 minutes)

| # | What | Command / check |
|---|---|---|
| 1 | PostgreSQL + PostGIS | Windows service `postgresql-x64-18` (automatic). Check: `Get-Service postgresql-x64-18` → Running. If stopped: `Start-Service postgresql-x64-18` (admin PowerShell). |
| 2 | Ollama (optional, photo check only) | Start the Ollama app; check `curl http://localhost:11434/api/tags` lists `qwen2.5vl:7b`. ~5 GB RAM: close other heavy apps. |
| 3 | Backend | see below |
| 4 | Frontend | see below |

**Backend** (PowerShell window 1):

```powershell
cd E:\resilion-2.0_Landslide_Hazard_Alert\backend
.venv\Scripts\Activate.ps1
# Photo check on the local model (no Claude key); omit both lines to run with manual review only.
$env:AI_PROVIDER = "ollama"; $env:OLLAMA_VISION_MODEL = "qwen2.5vl:7b"
# Feeds OFF for the demo (historical 15 May 2022 scenario, nothing changes behind your back):
$env:FEEDS_ENABLED = "false"
$env:SCENARIO_DATE = "2022-05-15"
uvicorn app.main:app --port 8000
```

- Feeds ON (live SACHET IMD warnings every 30 min, Open-Meteo live rainfall every 60 min while the rainfall date is
  `live`): `$env:FEEDS_ENABLED = "true"` — needs internet. Use only if you want to show live mode; set the rainfall
  date to "Live" in Configuration.
- With a Claude key instead: `$env:ANTHROPIC_API_KEY = "..."` (photo check and alert writer by Claude; never shown in
  the UI or logs).
- Check http://localhost:8000/api/health → `"postgis": "3.6…"`, `"ai": {"photoCheck": "local:qwen2.5vl:7b" or null,
  "alertWriter": "templates"}`.

**Frontend** (PowerShell window 2):

```powershell
cd E:\resilion-2.0_Landslide_Hazard_Alert
$env:VITE_API_URL = "http://localhost:8000"
npm run dev
```

Open http://localhost:3000. The header shows "NH-27 · Dima Hasao"; the Corridor page says "PostGIS · IMD gridded 0.25° ·
2022-05-15". If it shows "Sample data", the backend is not reachable (see section 4).

**Clean start before the audience arrives:** sign in as **Administrator** → Configuration → *Reload corridor data* (bottom
right). This reseeds the real corridor with `SCENARIO_DATE` (2022-05-15); nothing from rehearsals remains. Check the
rainfall date shows 15/05/2022; if not, set it and *Save configuration*.

## 2. The six sign-in roles

The sign-in screen takes a name and a role (no password yet — signed token only). Use a separate browser window /
profile per role if you switch often.

| Role | Use it for |
|---|---|
| Control-room officer | Decisions, confirm/reject reports, approve closure and alerts, clear passage through Orange |
| Second approver | Approvals that escalated (no officer action within 10 min) |
| Road engineer | Incidents: crew, equipment, reopening estimate, reopening request |
| Highway patrol | Submit a field report (photo, segment, location) |
| Public reporter | Same report form; a confident "clear" from the public is only logged |
| Administrator | Configuration: weights/thresholds, rainfall date, segment inputs (e.g. IMD warning), reset |

## 3. Five-minute demo route (15 May 2022)

**0:00 – Corridor (officer).** Map of 137 segments: 57 Yellow, 17 Orange, 32 Red on 15 May 2022. Say: the risk comes
from a landslide-susceptibility model (LightGBM, terrain + landslide history) plus IMD rainfall; diversion roads are
grey and never part of the NH-27 colouring.

**0:45 – Behaviour 1: HOLD because of a segment *ahead*, at a named point.** Decisions → open **NH27-DH-035** (Langting
side). Zone **AZ-035S** says **HOLD at Langting** and shows **"Ahead: NH27-DH-066 Maibong"** — its own segment is fine,
but Maibong (Orange, 74) lies between it and the next holding point. 55 zones hold for a segment ahead on this date.
Point: a traveller never gets GO toward danger (FR-09, BR-02).

**1:30 – Behaviours 2 + 3: one report updates every zone, and a real DIVERT.**
1. Second window, **Highway patrol** → Reports → *New report*: segment **NH27-DH-066 Maibong**, location "Maibong",
   any photo → *Submit*. With Ollama: the photo check returns a class (advisory, never changes the road). Without:
   "AI offline → manual review" — that is the designed fallback.
2. **Officer** → Reports → the report → *New road state* **BLOCKED** → *Confirm*.
3. Decisions: **35 zones change at once from HOLD to DIVERT** — "Detour via unnamed roads, 6 km", a real OSRM route
   whose every road segment is Open and Green/Yellow (BR-03). One closure approval appears for NH27-DH-066 only.

**3:00 – Behaviour 4: reopening estimate → expected wait.**
1. Approvals → approve the pending **CLOSE** for **NH27-DH-108 Retzol** (Red, 96) as FULL closure. An alert draft
   appears (template, validated en/hi/as/bn; CAP after approval — *View CAP*).
2. **Road engineer** → Incidents → NH27-DH-108 → *Reopening estimate* = now + 3 h → *Save*.
3. Decisions → NH27-DH-108: **AZ-108S HOLD at Maibong** and **AZ-108N HOLD at Silchar side**, both **expected wait
   180 min (est.)**. Holding is at Maibong, not the nearer points, because those sit on Red segments (BR-04).
4. Optional: *Request full reopening* → officer approves → zones recompute.

**4:30 – Close.** Records → decision record and append-only audit log (every action, who, when). Mention: officer
approves every closure and alert; the model is advisory only; nothing is a field result.

## 4. If something fails

| Problem | What to do |
|---|---|
| **No internet** | Nothing in the demo needs it: data, OSRM detours and the model are local; feeds are off. Map tiles may be blank → switch the map to *Schematic*. |
| **Ollama not running / too slow / out of memory** | Reports go to **manual review** ("AI offline") — show it as the designed fail-safe (FR-26) and confirm the report by hand. To drop the local model: restart the backend without `AI_PROVIDER`. |
| **Backend down** (UI shows "Sample data") | Window 1: check the uvicorn error; `Get-Service postgresql-x64-18`; restart uvicorn. The in-browser sample mode (12 sample segments) still demonstrates the rules if needed — say it is sample data. |
| **Wrong state after rehearsal** | Administrator → Configuration → *Reload corridor data*; check the rainfall date is 2022-05-15. |
| **Port in use** | `Get-NetTCPConnection -LocalPort 8000,3000` → stop the old process, or use `--port 8001` and `VITE_API_URL=http://localhost:8001`. |
| **Feeds ON changed the scenario** | Restart the backend with `FEEDS_ENABLED=false`, then *Reload corridor data*. |

## 5. What to say if asked

- Back-test (`docs/BACKTEST.md`, `docs/CALIBRATION.md`): 8 of 10 recorded NH-27 incidents had travellers held on the day
  before or the day of; only 10 incidents, so this is not proof of skill.
- Photo check on the local model (`docs/PHOTO_EVAL.md`): see the per-class table; the model only receives the photo.
- Holding points are **Provisional** (OSM candidates); the district must verify them.
