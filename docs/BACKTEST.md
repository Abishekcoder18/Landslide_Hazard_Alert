# Incident back-test (Phase 5)

Run 2026-11-03 12:07 India Standard Time by `backend/scripts/backtest.py`: the app's own Risk Index and decision engine replayed in memory for every day 2022-01-07 … 2026-10-29 (1757 days, 137 NH-27 segments, 274 approach zones). Default configuration: weights 25/45/15/15 (susceptibility / rainfall / slope / history), thresholds 30/55/75. Rainfall: IMD gridded 0.25° to 2025-12-31, Open-Meteo archive from 2026-01-01 (the two differ strongly on heavy-rain days, `docs/DATA_INVENTORY.md`). No historical IMD warnings / GSI bulletins exist, so they are NONE in the replay; Yellow + IMD Orange window-closing (BR-11) is therefore not exercised here.

Incidents: `backend/inputs/incidents.csv` (owner-checked 2026-11-03). Rows marked EXCLUDED or without coordinates are left out. Locations are approximate (nearest named OSM place, see the notes column), so the result is also shown for ±1 segment (~1 km either side). Per-day results: `docs/evidence/backtest_days.csv`.

## 1. Incidents: day before and day of

| Incident | Date | Segment (dist.) | Day | Rain 24h / 3d / 7d mm (source) | Level (Index) | ±1 seg max | Own zones S / N | Zones toward it on HOLD | CLOSE rec. |
|---|---|---|---|---|---|---|---|---|---|
| INC-2022-04-17 | 2022-04-17 | NH27-DH-089 (0.26 km) | day before | 51.1 / 172.8 / 211.9 (IMD gridded 0.25°) | ORANGE (72) | RED | HOLD / HOLD | 38 of 38 | no |
| INC-2022-04-17 | 2022-04-17 | NH27-DH-089 (0.26 km) | day of | 108.0 / 278.3 / 315.7 (IMD gridded 0.25°) | RED (78) | RED | HOLD / HOLD | 38 of 38 | yes |
| INC-2022-05-14 | 2022-05-14 | NH27-DH-132 (0.31 km) | day before | 30.3 / 178.1 / 209.7 (IMD gridded 0.25°) | YELLOW (52) | ORANGE | HOLD / GO_CAUTION | 30 of 31 | no |
| INC-2022-05-14 | 2022-05-14 | NH27-DH-132 (0.31 km) | day of | 162.2 / 304.0 / 371.9 (IMD gridded 0.25°) | ORANGE (57) | ORANGE | HOLD / HOLD | 31 of 31 | no |
| EV-05 | 2022-05-16 | NH27-DH-068 (0.27 km) | day before | 21.7 / 42.0 / 122.3 (IMD gridded 0.25°) | YELLOW (48) | YELLOW | HOLD / HOLD | 53 of 56 | no |
| EV-05 | 2022-05-16 | NH27-DH-068 (0.27 km) | day of | 14.7 / 41.6 / 118.0 (IMD gridded 0.25°) | YELLOW (48) | YELLOW | HOLD / HOLD | 53 of 56 | no |
| EV-04 | 2024-05-02 | NH27-DH-118 (0.07 km) | day before | 12.5 / 24.2 / 65.9 (IMD gridded 0.25°) | YELLOW (39) | YELLOW | HOLD / GO_CAUTION | 23 of 31 | no |
| EV-04 | 2024-05-02 | NH27-DH-118 (0.07 km) | day of | 33.8 / 53.5 / 70.7 (IMD gridded 0.25°) | YELLOW (44) | YELLOW | HOLD / HOLD | 31 of 31 | no |
| EV-04b | 2024-05-02 | NH27-DH-068 (0.27 km) | day before | 4.8 / 9.8 / 27.9 (IMD gridded 0.25°) | YELLOW (34) | YELLOW | GO_CAUTION / GO_CAUTION | 0 of 56 | no |
| EV-04b | 2024-05-02 | NH27-DH-068 (0.27 km) | day of | 23.6 / 32.3 / 39.9 (IMD gridded 0.25°) | YELLOW (41) | YELLOW | GO_CAUTION / HOLD | 7 of 56 | no |
| INC-2024-07-01 | 2024-07-01 | NH27-DH-130 (0.17 km) | day before | 14.5 / 36.4 / 87.8 (IMD gridded 0.25°) | YELLOW (40) | YELLOW | HOLD / GO_CAUTION | 11 of 31 | no |
| INC-2024-07-01 | 2024-07-01 | NH27-DH-130 (0.17 km) | day of | 20.3 / 47.0 / 96.5 (IMD gridded 0.25°) | YELLOW (41) | YELLOW | HOLD / GO_CAUTION | 11 of 31 | no |
| INC-2024-09-04 | 2024-09-04 | NH27-DH-118 (0.07 km) | day before | 0.0 / 9.5 / 37.6 (IMD gridded 0.25°) | YELLOW (35) | YELLOW | HOLD / GO_CAUTION | 23 of 31 | no |
| INC-2024-09-04 | 2024-09-04 | NH27-DH-118 (0.07 km) | day of | 29.2 / 31.1 / 66.8 (IMD gridded 0.25°) | YELLOW (42) | YELLOW | HOLD / HOLD | 31 of 31 | no |
| INC-2025-06-23 | 2025-06-23 | NH27-DH-118 (0.07 km) | day before | 22.7 / 50.7 / 153.3 (IMD gridded 0.25°) | YELLOW (52) | YELLOW | HOLD / HOLD | 31 of 31 | no |
| INC-2025-06-23 | 2025-06-23 | NH27-DH-118 (0.07 km) | day of | 40.7 / 81.8 / 183.4 (IMD gridded 0.25°) | ORANGE (56) | ORANGE | HOLD / HOLD | 31 of 31 | no |
| EV-02 | 2025-10-29 | NH27-DH-130 (0.17 km) | day before | 0.0 / 0.0 / 0.0 (IMD gridded 0.25°) | GREEN (26) | YELLOW | GO_CAUTION / GO | 0 of 31 | no |
| EV-02 | 2025-10-29 | NH27-DH-130 (0.17 km) | day of | 0.0 / 0.0 / 0.0 (IMD gridded 0.25°) | GREEN (26) | YELLOW | GO_CAUTION / GO | 0 of 31 | no |
| EV-01 | 2026-06-21 | NH27-DH-103 (0.67 km) | day before | 1.1 / 3.2 / 54.9 (Open-Meteo archive) | YELLOW (47) | YELLOW | GO_CAUTION / GO_CAUTION | 0 of 17 | no |
| EV-01 | 2026-06-21 | NH27-DH-103 (0.67 km) | day of | 17.3 / 19.9 / 54.8 (Open-Meteo archive) | YELLOW (47) | ORANGE | GO_CAUTION / HOLD | 16 of 17 | no |

**Warned (Orange/Red on the day before or the day of): 3 of 10 incidents at the incident segment; 4 of 10 within ±1 segment.**

**Travellers heading toward the incident segment held (HOLD in at least one zone whose segments ahead include it, FR-09) on the day before or the day of: 9 of 10.** "Zones toward it" = every approach zone, in either direction, whose segments ahead (up to the next holding point) include the incident segment. A zone may hold because of any risky segment ahead, so this is compared with how often the same travellers are held on any day (baseline):

| Incident | Segment | Held day before / day of | Held on any day (all days) | Held on any day (May–Sep) |
|---|---|---|---|---|
| INC-2022-04-17 | NH27-DH-089 | yes | 25% | 47% |
| INC-2022-05-14 | NH27-DH-132 | yes | 53% | 87% |
| EV-05 | NH27-DH-068 | yes | 16% | 30% |
| EV-04 | NH27-DH-118 | yes | 53% | 87% |
| EV-04b | NH27-DH-068 | yes | 16% | 30% |
| INC-2024-07-01 | NH27-DH-130 | yes | 53% | 87% |
| INC-2024-09-04 | NH27-DH-118 | yes | 53% | 87% |
| INC-2025-06-23 | NH27-DH-118 | yes | 53% | 87% |
| EV-02 | NH27-DH-130 | no | 53% | 87% |
| EV-01 | NH27-DH-103 | yes | 25% | 46% |

Missed incidents with less than 100 mm of rain in the 7 days up to the incident day (segment's cell): EV-04 (71 mm), EV-04b (40 mm), INC-2024-07-01 (96 mm), INC-2024-09-04 (67 mm), EV-02 (0 mm), EV-01 (55 mm). A rainfall-weighted index cannot warn for these from rain alone; the incident notes name subsidence, construction and heavy vehicles as causes for some. In operation, patrol and public reports (FR-19..26) and IMD / GSI inputs are the path for them.

## 2. False alarms on dry days

Dry day = every corridor rain cell had < 10 mm in the previous 7 days. 572 dry days of 1757.

- Dry days with any Orange / Red segment or any HOLD zone (false alarm): **1 of 572**
- Orange / Red segment-days on dry days: 1 (of 78364 segment-days); HOLD zone-days: 35 (of 156728)
- CLOSE recommended on dry days: 0 segment-days

| Dry day | Max 7-day rain mm | Orange | Red | HOLD zones |
|---|---|---|---|---|
| 2024-02-21 | 7.8 | 1 | 0 | 35 |

## 3. Alert load (all days, for context)

Incidents are not a complete list, so wet days without a listed incident are not scored as false alarms. This is how often the corridor would show warnings:

| Year | Days | Days with any Orange/Red | Days with any HOLD | Days with CLOSE recommended | Median Orange+Red segments on those days |
|---|---|---|---|---|---|
| 2022 | 359 | 188 | 188 | 35 | 4 |
| 2023 | 365 | 166 | 166 | 36 | 5 |
| 2024 | 366 | 205 | 205 | 56 | 8 |
| 2025 | 365 | 169 | 169 | 32 | 7 |
| 2026 | 302 | 203 | 203 | 11 | 5 |

## Limits

- Few incidents, approximate locations, and publication dates used where the event date is not stated.
- FR-09 makes each zone look ahead to the next holding point; with few holding points (OSM candidates + corridor ends, all Provisional) a zone covers long stretches, so where the baseline above is high (e.g. 87% of May–Sep days) being held on an incident day is not evidence of skill. More verified holding points shorten the stretches and the alert load.
- Daily rainfall only: an incident in the morning is compared with that day's total, which includes rain after it.
- 2026 uses Open-Meteo, which under-reads heavy-rain days compared with IMD; thresholds were not re-tuned.
- IMD warnings / GSI bulletins were not available historically; in operation they can only raise levels (BR-05).
