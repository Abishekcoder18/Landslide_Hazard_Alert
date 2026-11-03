# Diversion candidates (Phase 8, OSRM)

Run 2026-11-03 14:17 India Standard Time by `backend/scripts/osrm_diversions.py`: OSRM v5.27.1 (car profile, MLD) on the Geofabrik North-Eastern Zone extract (© OpenStreetMap contributors, ODbL). For every NH-27 segment, its own OSM edges are made impassable (`osrm-customize --segment-speed-file`, speed 0, from clean files each time) and a route is requested from the approach zone 2 km before the segment to the one 2 km after it, in both directions.

The off-NH-27 parts are cut into ~1 km **diversion-road segments** (`DV-nnnn`, `offCorridor: true`), shared between detours on the same road, and scored like NH-27 segments (model score, slope, landslide history, IMD / Open-Meteo rainfall of the nearest rain cell). They are used only by the **existing BR-03 check** (every segment OPEN and Green/Yellow, none No data) and are kept out of the NH-27 chainage (FR-09), the corridor list, the KPIs and the risk colouring of the map (drawn grey).

## Summary

- Approach zones with a detour: **73 of 274**; without: 201 (no route: 201)
- Detour length: min 6 km, median 119 km, max 284 km (NH-27 between the same two points: about 5 km)
- Diversion-road segments: **520** (512 km of road); with inputs (inside the terrain / model / rain data): 256; without: 264 (No data, so BR-03 refuses any detour that uses them)
- Detours whose every diversion-road segment has inputs (BR-03 can offer them when all are OPEN and Green/Yellow): **26 of 73**

## Per approach zone

| Zone | Direct km | Detour km | Minutes | Off NH-27 km | Via | DV segments | All DV with inputs |
|---|---|---|---|---|---|---|---|
| AZ-001N | 3.5 | – | – | – | – | – | no route |
| AZ-001S | 3.5 | – | – | – | – | – | no route |
| AZ-002N | 4.5 | – | – | – | – | – | no route |
| AZ-002S | 4.5 | – | – | – | – | – | no route |
| AZ-003N | 5.5 | – | – | – | – | – | no route |
| AZ-003S | 5.5 | – | – | – | – | – | no route |
| AZ-004N | 6.0 | – | – | – | – | – | no route |
| AZ-004S | 6.0 | – | – | – | – | – | no route |
| AZ-005N | 6.0 | – | – | – | – | – | no route |
| AZ-005S | 6.0 | – | – | – | – | – | no route |
| AZ-006N | 6.0 | – | – | – | – | – | no route |
| AZ-006S | 6.0 | – | – | – | – | – | no route |
| AZ-007N | 6.0 | – | – | – | – | – | no route |
| AZ-007S | 6.0 | – | – | – | – | – | no route |
| AZ-008N | 6.0 | – | – | – | – | – | no route |
| AZ-008S | 6.0 | – | – | – | – | – | no route |
| AZ-009N | 6.0 | – | – | – | – | – | no route |
| AZ-009S | 6.0 | – | – | – | – | – | no route |
| AZ-010N | 6.0 | – | – | – | – | – | no route |
| AZ-010S | 6.0 | – | – | – | – | – | no route |
| AZ-011N | 6.0 | – | – | – | – | – | no route |
| AZ-011S | 6.0 | – | – | – | – | – | no route |
| AZ-012N | 6.0 | – | – | – | – | – | no route |
| AZ-012S | 6.0 | – | – | – | – | – | no route |
| AZ-013N | 6.0 | – | – | – | – | – | no route |
| AZ-013S | 6.0 | – | – | – | – | – | no route |
| AZ-014N | 6.0 | – | – | – | – | – | no route |
| AZ-014S | 6.0 | – | – | – | – | – | no route |
| AZ-015N | 6.0 | – | – | – | – | – | no route |
| AZ-015S | 6.0 | – | – | – | – | – | no route |
| AZ-016N | 6.0 | – | – | – | – | – | no route |
| AZ-016S | 6.0 | – | – | – | – | – | no route |
| AZ-017N | 6.0 | – | – | – | – | – | no route |
| AZ-017S | 6.0 | – | – | – | – | – | no route |
| AZ-018N | 6.0 | – | – | – | – | – | no route |
| AZ-018S | 6.0 | – | – | – | – | – | no route |
| AZ-019N | 6.0 | 278.1 | 214 | 174.6 | NH627, SH16 | 170 | no |
| AZ-019S | 6.0 | 278.1 | 214 | 174.7 | NH627, SH16 | 182 | no |
| AZ-020N | 6.0 | – | – | – | – | – | no route |
| AZ-020S | 6.0 | – | – | – | – | – | no route |
| AZ-021N | 6.0 | – | – | – | – | – | no route |
| AZ-021S | 6.0 | – | – | – | – | – | no route |
| AZ-022N | 6.0 | – | – | – | – | – | no route |
| AZ-022S | 6.0 | – | – | – | – | – | no route |
| AZ-023N | 6.0 | – | – | – | – | – | no route |
| AZ-023S | 6.0 | – | – | – | – | – | no route |
| AZ-024N | 6.0 | – | – | – | – | – | no route |
| AZ-024S | 6.0 | – | – | – | – | – | no route |
| AZ-025N | 6.0 | – | – | – | – | – | no route |
| AZ-025S | 6.0 | – | – | – | – | – | no route |
| AZ-026N | 6.0 | – | – | – | – | – | no route |
| AZ-026S | 6.0 | – | – | – | – | – | no route |
| AZ-027N | 6.0 | – | – | – | – | – | no route |
| AZ-027S | 6.0 | – | – | – | – | – | no route |
| AZ-028N | 6.0 | – | – | – | – | – | no route |
| AZ-028S | 6.0 | – | – | – | – | – | no route |
| AZ-029N | 6.0 | – | – | – | – | – | no route |
| AZ-029S | 6.0 | – | – | – | – | – | no route |
| AZ-030N | 6.0 | – | – | – | – | – | no route |
| AZ-030S | 6.0 | – | – | – | – | – | no route |
| AZ-031N | 6.0 | – | – | – | – | – | no route |
| AZ-031S | 6.0 | – | – | – | – | – | no route |
| AZ-032N | 15.5 | – | – | – | – | – | no route |
| AZ-032S | 15.5 | – | – | – | – | – | no route |
| AZ-033N | 6.0 | – | – | – | – | – | no route |
| AZ-033S | 6.0 | – | – | – | – | – | no route |
| AZ-034N | 6.0 | – | – | – | – | – | no route |
| AZ-034S | 6.0 | – | – | – | – | – | no route |
| AZ-035N | 6.0 | – | – | – | – | – | no route |
| AZ-035S | 6.0 | – | – | – | – | – | no route |
| AZ-036N | 6.0 | – | – | – | – | – | no route |
| AZ-036S | 6.0 | – | – | – | – | – | no route |
| AZ-037N | 6.0 | 273.4 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-037S | 6.0 | 273.5 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-038N | 7.7 | – | – | – | – | – | no route |
| AZ-038S | 7.7 | 275.1 | 214 | 174.7 | NH627, SH16 | 182 | no |
| AZ-039N | 6.0 | – | – | – | – | – | no route |
| AZ-039S | 6.0 | – | – | – | – | – | no route |
| AZ-040N | 6.0 | – | – | – | – | – | no route |
| AZ-040S | 6.0 | – | – | – | – | – | no route |
| AZ-041N | 6.0 | – | – | – | – | – | no route |
| AZ-041S | 6.0 | – | – | – | – | – | no route |
| AZ-042N | 6.0 | – | – | – | – | – | no route |
| AZ-042S | 6.0 | – | – | – | – | – | no route |
| AZ-043N | 6.0 | – | – | – | – | – | no route |
| AZ-043S | 6.0 | – | – | – | – | – | no route |
| AZ-044N | 6.0 | – | – | – | – | – | no route |
| AZ-044S | 6.0 | – | – | – | – | – | no route |
| AZ-045N | 6.0 | – | – | – | – | – | no route |
| AZ-045S | 6.0 | – | – | – | – | – | no route |
| AZ-046N | 6.0 | – | – | – | – | – | no route |
| AZ-046S | 6.0 | – | – | – | – | – | no route |
| AZ-047N | 6.0 | – | – | – | – | – | no route |
| AZ-047S | 6.0 | – | – | – | – | – | no route |
| AZ-048N | 6.0 | – | – | – | – | – | no route |
| AZ-048S | 6.0 | – | – | – | – | – | no route |
| AZ-049N | 6.0 | – | – | – | – | – | no route |
| AZ-049S | 6.0 | – | – | – | – | – | no route |
| AZ-050N | 6.0 | – | – | – | – | – | no route |
| AZ-050S | 6.0 | – | – | – | – | – | no route |
| AZ-051N | 6.0 | – | – | – | – | – | no route |
| AZ-051S | 6.0 | – | – | – | – | – | no route |
| AZ-052N | 6.0 | – | – | – | – | – | no route |
| AZ-052S | 6.0 | – | – | – | – | – | no route |
| AZ-053N | 6.0 | – | – | – | – | – | no route |
| AZ-053S | 6.0 | – | – | – | – | – | no route |
| AZ-054N | 6.0 | – | – | – | – | – | no route |
| AZ-054S | 6.0 | – | – | – | – | – | no route |
| AZ-055N | 6.0 | – | – | – | – | – | no route |
| AZ-055S | 6.0 | – | – | – | – | – | no route |
| AZ-056N | 6.0 | 276.5 | 213 | 174.6 | NH627, SH16 | 170 | no |
| AZ-056S | 6.0 | 276.5 | 213 | 174.7 | NH627, SH16 | 182 | no |
| AZ-057N | 6.0 | 273.0 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-057S | 6.0 | 273.1 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-058N | 6.0 | 273.7 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-058S | 6.0 | 273.8 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-059N | 6.0 | 272.9 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-059S | 6.0 | 273.0 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-060N | 6.0 | 273.3 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-060S | 6.0 | 273.4 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-061N | 6.0 | 273.5 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-061S | 6.0 | 273.6 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-062N | 6.0 | 17.5 | 35 | 13.1 | unnamed roads | 13 | yes |
| AZ-062S | 6.0 | 17.5 | 35 | 13.1 | unnamed roads | 15 | yes |
| AZ-063N | 6.0 | 273.0 | 211 | 174.6 | NH627, SH16 | 170 | no |
| AZ-063S | 6.0 | 273.0 | 211 | 174.7 | NH627, SH16 | 182 | no |
| AZ-064N | 6.0 | 275.6 | 212 | 174.6 | NH627, SH16 | 170 | no |
| AZ-064S | 6.0 | 275.6 | 213 | 174.7 | NH627, SH16 | 182 | no |
| AZ-065N | 6.0 | – | – | – | – | – | no route |
| AZ-065S | 6.0 | – | – | – | – | – | no route |
| AZ-066N | 6.0 | 6.0 | 6 | 3.4 | unnamed roads | 4 | yes |
| AZ-066S | 6.0 | 6.0 | 6 | 3.3 | unnamed roads | 8 | yes |
| AZ-067N | 6.0 | 6.0 | 6 | 3.4 | unnamed roads | 4 | yes |
| AZ-067S | 6.0 | 6.0 | 6 | 3.3 | unnamed roads | 8 | yes |
| AZ-068N | 6.0 | 6.0 | 6 | 3.4 | unnamed roads | 4 | yes |
| AZ-068S | 6.0 | 6.0 | 6 | 3.3 | unnamed roads | 8 | yes |
| AZ-069N | 6.0 | – | – | – | – | – | no route |
| AZ-069S | 6.0 | – | – | – | – | – | no route |
| AZ-070N | 6.0 | – | – | – | – | – | no route |
| AZ-070S | 6.0 | – | – | – | – | – | no route |
| AZ-071N | 6.0 | – | – | – | – | – | no route |
| AZ-071S | 6.0 | – | – | – | – | – | no route |
| AZ-072N | 6.0 | – | – | – | – | – | no route |
| AZ-072S | 6.0 | – | – | – | – | – | no route |
| AZ-073N | 6.0 | – | – | – | – | – | no route |
| AZ-073S | 6.0 | – | – | – | – | – | no route |
| AZ-074N | 6.0 | – | – | – | – | – | no route |
| AZ-074S | 6.0 | – | – | – | – | – | no route |
| AZ-075N | 6.0 | – | – | – | – | – | no route |
| AZ-075S | 6.0 | – | – | – | – | – | no route |
| AZ-076N | 6.0 | – | – | – | – | – | no route |
| AZ-076S | 6.0 | – | – | – | – | – | no route |
| AZ-077N | 6.0 | – | – | – | – | – | no route |
| AZ-077S | 6.0 | – | – | – | – | – | no route |
| AZ-078N | 6.0 | – | – | – | – | – | no route |
| AZ-078S | 6.0 | – | – | – | – | – | no route |
| AZ-079N | 6.0 | – | – | – | – | – | no route |
| AZ-079S | 6.0 | – | – | – | – | – | no route |
| AZ-080N | 6.0 | – | – | – | – | – | no route |
| AZ-080S | 6.0 | – | – | – | – | – | no route |
| AZ-081N | 6.0 | – | – | – | – | – | no route |
| AZ-081S | 6.0 | – | – | – | – | – | no route |
| AZ-082N | 6.0 | – | – | – | – | – | no route |
| AZ-082S | 6.0 | – | – | – | – | – | no route |
| AZ-083N | 6.0 | – | – | – | – | – | no route |
| AZ-083S | 6.0 | – | – | – | – | – | no route |
| AZ-084N | 6.0 | – | – | – | – | – | no route |
| AZ-084S | 6.0 | – | – | – | – | – | no route |
| AZ-085N | 6.0 | 284.5 | 226 | 180.0 | NH627, SH16 | 176 | no |
| AZ-085S | 6.0 | 284.5 | 226 | 180.1 | NH627, SH16 | 188 | no |
| AZ-086N | 6.0 | 284.5 | 226 | 180.0 | NH627, SH16 | 176 | no |
| AZ-086S | 6.0 | 284.5 | 226 | 180.1 | NH627, SH16 | 188 | no |
| AZ-087N | 6.0 | 276.3 | 222 | 178.1 | NH627, SH16 | 174 | no |
| AZ-087S | 6.0 | 276.3 | 222 | 178.1 | NH627, SH16 | 186 | no |
| AZ-088N | 6.0 | 7.3 | 10 | 4.9 | SH37 | 5 | yes |
| AZ-088S | 6.0 | 7.3 | 10 | 4.9 | SH37 | 5 | yes |
| AZ-089N | 6.0 | 7.3 | 10 | 4.9 | SH37 | 5 | yes |
| AZ-089S | 6.0 | 7.3 | 10 | 4.9 | SH37 | 5 | yes |
| AZ-090N | 6.0 | – | – | – | – | – | no route |
| AZ-090S | 6.0 | – | – | – | – | – | no route |
| AZ-091N | 6.0 | 8.6 | 16 | 5.5 | unnamed roads | 6 | yes |
| AZ-091S | 6.0 | 8.5 | 16 | 5.5 | unnamed roads | 7 | yes |
| AZ-092N | 6.0 | 8.6 | 16 | 5.5 | unnamed roads | 6 | yes |
| AZ-092S | 6.0 | 8.5 | 16 | 5.5 | unnamed roads | 7 | yes |
| AZ-093N | 6.0 | 57.5 | 80 | 45.5 | NH627, SH37 | 46 | yes |
| AZ-093S | 6.0 | 57.6 | 79 | 45.5 | NH627, SH37 | 55 | yes |
| AZ-094N | 6.0 | – | – | – | – | – | no route |
| AZ-094S | 6.0 | – | – | – | – | – | no route |
| AZ-095N | 6.0 | – | – | – | – | – | no route |
| AZ-095S | 6.0 | – | – | – | – | – | no route |
| AZ-096N | 9.6 | – | – | – | – | – | no route |
| AZ-096S | 9.6 | 51.7 | 72 | 40.6 | NH627 | 50 | yes |
| AZ-097N | 6.0 | – | – | – | – | – | no route |
| AZ-097S | 6.0 | – | – | – | – | – | no route |
| AZ-098N | 6.0 | – | – | – | – | – | no route |
| AZ-098S | 6.0 | – | – | – | – | – | no route |
| AZ-099N | 6.0 | – | – | – | – | – | no route |
| AZ-099S | 6.0 | – | – | – | – | – | no route |
| AZ-100N | 6.0 | – | – | – | – | – | no route |
| AZ-100S | 6.0 | – | – | – | – | – | no route |
| AZ-101N | 6.0 | – | – | – | – | – | no route |
| AZ-101S | 6.0 | – | – | – | – | – | no route |
| AZ-102N | 16.1 | 57.5 | 75 | 40.6 | NH627 | 41 | yes |
| AZ-102S | 16.1 | 54.2 | 73 | 40.6 | NH627 | 50 | yes |
| AZ-103N | 6.0 | 57.5 | 75 | 40.6 | NH627 | 41 | yes |
| AZ-103S | 6.0 | – | – | – | – | – | no route |
| AZ-104N | 6.0 | 198.5 | 222 | 148.0 | SH37, NH37, NH137G | 144 | no |
| AZ-104S | 6.0 | 198.6 | 222 | 148.0 | SH37, NH37, NH137G | 147 | no |
| AZ-105N | 6.0 | 198.5 | 222 | 148.0 | SH37, NH37, NH137G | 144 | no |
| AZ-105S | 6.0 | 198.6 | 222 | 148.0 | SH37, NH37, NH137G | 147 | no |
| AZ-106N | 6.0 | – | – | – | – | – | no route |
| AZ-106S | 6.0 | – | – | – | – | – | no route |
| AZ-107N | 6.0 | – | – | – | – | – | no route |
| AZ-107S | 6.0 | – | – | – | – | – | no route |
| AZ-108N | 6.0 | 205.2 | 245 | 158.1 | SH37, NH37, NH137G | 155 | no |
| AZ-108S | 6.0 | 205.2 | 244 | 158.2 | SH37, NH37, NH137G | 158 | no |
| AZ-109N | 6.0 | 205.2 | 245 | 158.1 | SH37, NH37, NH137G | 155 | no |
| AZ-109S | 6.0 | 205.2 | 244 | 158.2 | SH37, NH37, NH137G | 158 | no |
| AZ-110N | 6.0 | – | – | – | – | – | no route |
| AZ-110S | 6.0 | – | – | – | – | – | no route |
| AZ-111N | 6.0 | – | – | – | – | – | no route |
| AZ-111S | 6.0 | – | – | – | – | – | no route |
| AZ-112N | 6.0 | 116.7 | 169 | 88.9 | SH-1022 | 88 | no |
| AZ-112S | 6.0 | 119.1 | 171 | 91.3 | SH-1022 | 95 | no |
| AZ-113N | 6.0 | – | – | – | – | – | no route |
| AZ-113S | 6.0 | – | – | – | – | – | no route |
| AZ-114N | 6.0 | – | – | – | – | – | no route |
| AZ-114S | 6.0 | – | – | – | – | – | no route |
| AZ-115N | 6.0 | – | – | – | – | – | no route |
| AZ-115S | 6.0 | – | – | – | – | – | no route |
| AZ-116N | 6.0 | – | – | – | – | – | no route |
| AZ-116S | 6.0 | – | – | – | – | – | no route |
| AZ-117N | 6.0 | – | – | – | – | – | no route |
| AZ-117S | 6.0 | – | – | – | – | – | no route |
| AZ-118N | 6.0 | – | – | – | – | – | no route |
| AZ-118S | 6.0 | – | – | – | – | – | no route |
| AZ-119N | 6.0 | – | – | – | – | – | no route |
| AZ-119S | 6.0 | – | – | – | – | – | no route |
| AZ-120N | 6.0 | – | – | – | – | – | no route |
| AZ-120S | 6.0 | – | – | – | – | – | no route |
| AZ-121N | 6.0 | – | – | – | – | – | no route |
| AZ-121S | 6.0 | – | – | – | – | – | no route |
| AZ-122N | 6.0 | – | – | – | – | – | no route |
| AZ-122S | 6.0 | – | – | – | – | – | no route |
| AZ-123N | 6.0 | – | – | – | – | – | no route |
| AZ-123S | 6.0 | – | – | – | – | – | no route |
| AZ-124N | 6.0 | – | – | – | – | – | no route |
| AZ-124S | 6.0 | – | – | – | – | – | no route |
| AZ-125N | 6.0 | – | – | – | – | – | no route |
| AZ-125S | 6.0 | – | – | – | – | – | no route |
| AZ-126N | 6.0 | – | – | – | – | – | no route |
| AZ-126S | 6.0 | – | – | – | – | – | no route |
| AZ-127N | 6.0 | – | – | – | – | – | no route |
| AZ-127S | 6.0 | – | – | – | – | – | no route |
| AZ-128N | 6.0 | 117.8 | 174 | 91.7 | SH-1022 | 90 | no |
| AZ-128S | 6.0 | 120.2 | 176 | 94.1 | SH-1022 | 97 | no |
| AZ-129N | 6.0 | 115.5 | 169 | 90.0 | SH-1022 | 90 | no |
| AZ-129S | 6.0 | 117.9 | 171 | 92.5 | SH-1022 | 97 | no |
| AZ-130N | 6.0 | 113.5 | 168 | 89.4 | SH-1022 | 89 | no |
| AZ-130S | 6.0 | 116.0 | 169 | 91.8 | SH-1022 | 96 | no |
| AZ-131N | 6.0 | 109.5 | 165 | 89.6 | SH-1022 | 89 | no |
| AZ-131S | 6.0 | 111.9 | 167 | 92.0 | SH-1022 | 96 | no |
| AZ-132N | 6.0 | 6.9 | 8 | 3.3 | unnamed roads | 4 | yes |
| AZ-132S | 6.0 | 6.9 | 8 | 3.3 | unnamed roads | 6 | yes |
| AZ-133N | 6.0 | 6.9 | 8 | 3.3 | unnamed roads | 4 | yes |
| AZ-133S | 6.0 | 6.9 | 8 | 3.3 | unnamed roads | 6 | yes |
| AZ-134N | 6.0 | 114.9 | 167 | 88.8 | SH-1022 | 88 | no |
| AZ-134S | 6.0 | 117.4 | 169 | 91.2 | SH-1022 | 95 | no |
| AZ-135N | 5.5 | – | – | – | – | – | no route |
| AZ-135S | 5.5 | – | – | – | – | – | no route |
| AZ-136N | 4.5 | – | – | – | – | – | no route |
| AZ-136S | 4.5 | – | – | – | – | – | no route |
| AZ-137N | 3.5 | – | – | – | – | – | no route |
| AZ-137S | 3.5 | – | – | – | – | – | no route |

## In the app (2026-11-03, rainfall date 10 May 2022)

- Diversion-road segments by level: No data 264, Green 110, Yellow 144, Orange 2. They are drawn grey on the map and are
  not in the corridor list, KPIs, Configuration inputs table, report segment list or the FR-22 corridor distance check.
- Zones on HOLD whose candidate uses a No-data diversion road show e.g. "Route via unnamed road (diversion road) (DV-0366)
  contains No-data segments -> not offered" (BR-03 unchanged).
- Snapshot size with 520 diversion-road segments: 1.46 MB JSON, **117 KB with gzip** (was 570 KB / 48 KB).
- Method note: NH-27 is mapped as two one-way carriageways on long stretches, so each segment's OSM edges are taken from
  the direct NH-27 routes in both directions (with heading hints) and both carriageways are blocked; an earlier run that
  blocked one carriageway produced false "detours" past the block on the other carriageway and was discarded.
