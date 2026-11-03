# Risk Index calibration (configuration only) — for owner decision

Run 2026-11-03 16:05 India Standard Time by `backend/scripts/calibrate.py`. The app's own Risk Index and decision engine (incl. FR-09 segments ahead, BR-03 with OSRM candidates where built) replayed in memory for 770 days: every May–Sep day 2022–2026 up to 2026-10-29 (765 days; IMD to 2025, Open-Meteo archive 2026), the day before / day of each back-test incident, and 20 Mar / 10 May / 15 May 2022. **Nothing is applied**; BR-01..BR-12 and the engine are unchanged; Yellow stays 30. IMD warnings / GSI bulletins have no history, so they are NONE in the replay.

- **Incidents held** = a zone whose segments ahead (to the next holding point) include the incident segment is on HOLD on the day before or the day of; 10 incidents (`backend/inputs/incidents.csv`).
- **Stretch hold days** = for each of the 6 stretches between consecutive holding points, the share of May–Sep days on which any zone in that stretch is on HOLD; median and worst stretch.
- **Zones on HOLD** of 274 on the three check dates.

## All settings

| Weights (susc/rain/slope/hist) · thresholds | Incidents held | Stretch hold days, median | worst (stretch) | HOLD 20 Mar | HOLD 10 May | HOLD 15 May |
|---|---|---|---|---|---|---|
| 25/45/15/15 · O55 R75 (default before calibration) | 9 / 10 | 38% | 87% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 37 | 172 |
| 25/45/15/15 · O55 R70 | 9 / 10 | 38% | 87% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 37 | 137 |
| 25/45/15/15 · O60 R75 **← recommended** | 8 / 10 | 25% | 63% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 153 |
| 25/45/15/15 · O65 R80 | 6 / 10 | 16% | 42% (Parking near Retzol → Silchar side) | 0 | 0 | 153 |
| 25/45/15/15 · O70 R85 | 4 / 10 | 10% | 29% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 152 |
| 25/45/15/15 · O75 R90 | 4 / 10 | 6% | 20% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 116 |
| 25/45/15/15 · O80 R95 | 3 / 10 | 4% | 13% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 114 |
| 20/55/15/10 · O55 R70 | 7 / 10 | 26% | 53% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 124 |
| 20/55/15/10 · O60 R75 | 6 / 10 | 18% | 38% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 124 |
| 20/55/15/10 · O65 R80 | 4 / 10 | 12% | 28% (Parking near Retzol → Silchar side) | 0 | 0 | 159 |
| 20/55/15/10 · O70 R85 | 4 / 10 | 9% | 20% (Parking near Retzol → Silchar side) | 0 | 0 | 153 |
| 20/55/15/10 · O75 R90 | 4 / 10 | 6% | 14% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 152 |
| 20/55/15/10 · O80 R95 | 3 / 10 | 4% | 11% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 115 |
| 15/60/15/10 · O55 R70 | 6 / 10 | 23% | 42% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 124 |
| 15/60/15/10 · O60 R75 | 5 / 10 | 16% | 32% (Parking near Retzol → Silchar side) | 0 | 0 | 124 |
| 15/60/15/10 · O65 R80 | 4 / 10 | 11% | 24% (Jatinga Tourist Rest House → Parking near Retzol) | 0 | 0 | 124 |
| 15/60/15/10 · O70 R85 | 4 / 10 | 8% | 17% (Parking near Retzol → Silchar side) | 0 | 0 | 159 |
| 15/60/15/10 · O75 R90 | 3 / 10 | 6% | 13% (Parking near Retzol → Silchar side) | 0 | 0 | 153 |
| 15/60/15/10 · O80 R95 | 3 / 10 | 4% | 10% (Parking near Retzol → Silchar side) | 0 | 0 | 151 |

**Reading the 15 May column.** With the Phase 8 diversion candidates, BR-03 offers real detours (DIVERT) for some zones in front of Red segments when every diversion-road segment is OPEN and Green/Yellow (35 zones with 25/45/15/15 · Orange 55 / Red 70 on 15 May 2022). An Orange segment always gives HOLD in the decision table (BR-01/BR-02), so raising the Orange threshold turns some Red segments Orange and their DIVERT zones become HOLD; that is why the 15 May HOLD count can rise with stricter thresholds. Before Phase 8 (no candidates) the current default gave 172 HOLD on 15 May.

## Recommendation

Lowest median monsoon stretch hold-day share that still holds at least 8 of 10 incidents: **25/45/15/15 · O60 R75** — incidents held 8/10, stretch hold days median 25% (worst 63%), vs the current default 25/45/15/15 · O55 R75: 9/10, median 38% (worst 87%). **Applied as the default by owner decision A (2026-11-03)** — `DEFAULT_CONFIG` in `src/domain/config.ts` and `backend/app/domain/defaults.py`; editable in Configuration.

**Overfitting warning.** There are only 10 incidents (three of them on the same segment, NH27-DH-118, and several dated by publication date), so 'incidents held' moves in steps of 10 percentage points and one mis-dated or mis-located incident changes the ranking. The grid was chosen before looking at results, but picking the best of 19 settings on 10 events will look better here than it will in the next monsoon. Treat the recommendation as a starting point to review with the district, re-check it as new incidents are recorded, and prefer a setting that is good on both measures over one that is best on one. Hold-day shares are not false-alarm rates: the incident list is incomplete.

## Longest stretches between holding points

Shorter stretches mean a single risky segment holds fewer travellers. Holding points are all Provisional (`backend/inputs/holding_points.csv`). Candidates below are OSM places and POIs within 500 m of NH-27 in each stretch; none is verified (verified = no) and none is added — the district must check each one.

### Lumding side → Langting: 33.9 km (NH27-DH-001 … NH27-DH-035)

May–Sep hold-day share with the current default: 4%; with the recommended setting: 1%.

- Hatikhali (village, osm:245736203) — 37 m off NH-27, km 15.0
- Purānā Thangew Leikai (hamlet, osm:12677779570) — 47 m off NH-27, km 24.8
- Natun Dilokthai (hamlet, osm:12677779565) — 323 m off NH-27, km 33.8
- Langting (town, osm:245734459) — 116 m off NH-27, km 34.7
- Gāngdāngbra (hamlet, osm:12677779563) — 317 m off NH-27, km 34.9
- BPHC, Langting (clinic, osm:7150731903) — 155 m off NH-27, km 34.9

### Langting → Maibong: 32.9 km (NH27-DH-035 … NH27-DH-068)

May–Sep hold-day share with the current default: 13%; with the recommended setting: 7%.

- Natun Dilokthai (hamlet, osm:12677779565) — 465 m off NH-27, km 33.9
- Langting (town, osm:245734459) — 116 m off NH-27, km 34.7
- BPHC, Langting (clinic, osm:7150731903) — 68 m off NH-27, km 35.1
- Gāngdāngbra (hamlet, osm:12677779563) — 190 m off NH-27, km 35.2
- Didāokha (hamlet, osm:12527884857) — 264 m off NH-27, km 54.9
- Mupa Hojāi (hamlet, osm:12527884855) — 433 m off NH-27, km 58.4
- Kalachand (village, osm:6336198471) — 149 m off NH-27, km 60.9
- Khāuthāmdīsa (hamlet, osm:12763155668) — 67 m off NH-27, km 65.5
- Maibong (town, osm:245731951) — 274 m off NH-27, km 66.9

### Parking near Retzol → Silchar side: 28.9 km (NH27-DH-108 … NH27-DH-137)

May–Sep hold-day share with the current default: 87%; with the recommended setting: 63%.

- Retzol (village, osm:10226884217) — 27 m off NH-27, km 110.3
- Retzol (hamlet, osm:12772151796) — 112 m off NH-27, km 112.2
- Lāmpu (hamlet, osm:12772151795) — 249 m off NH-27, km 115.8
- Miyungkro (hamlet, osm:12772151794) — 96 m off NH-27, km 118.3
- Chhota Kāpurchhara (hamlet, osm:12772151792) — 404 m off NH-27, km 121.3
- Kāpurchhara (hamlet, osm:12772151793) — 192 m off NH-27, km 121.7
- Bara Mulkai (hamlet, osm:12772151787) — 227 m off NH-27, km 124.4
- Rekha (hamlet, osm:12772151788) — 52 m off NH-27, km 126.4
- Rekha (hamlet, osm:12772151789) — 43 m off NH-27, km 126.9
- Doloichunga (hamlet, osm:12772151790) — 165 m off NH-27, km 129.5
- Hārāngajao (hamlet, osm:12185046687) — 314 m off NH-27, km 131.0
- Kayāng Deshwālibasti (hamlet, osm:12216958369) — 259 m off NH-27, km 135.8

## Per stretch (current default vs recommended)

| Stretch | km | Current | Recommended |
|---|---|---|---|
| Lumding side → Langting | 33.9 | 4% | 1% |
| Langting → Maibong | 32.9 | 13% | 7% |
| Maibong → Mahur | 21.0 | 30% | 20% |
| Mahur → Jatinga Tourist Rest House | 15.0 | 47% | 30% |
| Jatinga Tourist Rest House → Parking near Retzol | 4.0 | 87% | 63% |
| Parking near Retzol → Silchar side | 28.9 | 87% | 63% |
