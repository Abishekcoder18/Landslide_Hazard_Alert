# RESILION 2.0 — Implementation Audit (2026-11-01)

Scope: code on branch `claude/jolly-shannon-vm5au7` vs PRD v1.0 features (F1–F7) and business rules (BR-01–BR-12).

> **Limitation:** the PRD `.docx` (with AC-01–AC-25 wording) is not in the repository, so this audit is keyed to F/BR IDs. Map each row to its AC-xx once the PRD text is available.

Status key: **T** = implemented & tested · **I** = implemented, not tested · **P** = partial · **—** = planned / not implemented.

## Verification run (evidence: `docs/evidence/verification-2026-11-01.txt`, page screenshots `docs/evidence/page-*.png`)

| Check | Result |
|---|---|
| `npm install` (clean checkout) | **Was failing** (ERESOLVE: `esbuild ^0.25` vs vite 8 peer `^0.27 \|\| ^0.28`). Fixed: `esbuild` → `^0.28.0`. |
| `npx tsx --test src/utils/decisionEngine.test.ts` | 11 pass, 0 fail (was 3) |
| `npm run lint` (`tsc --noEmit`) | pass |
| `npm run build` | pass (warning: JS chunk 522 kB > 500 kB) |
| Browser render, 5 pages (Playwright) | no page errors |
| Visible text containing "demo" | 0 hits |

## Business rules

| Rule | Status | Where | Notes |
|---|---|---|---|
| BR-01 decision table | **T** | `src/utils/decisionEngine.ts` `evaluateApproachZoneDecision` | `closeRecommended` flag added (BLOCKED/Red). Heavy-only: zone cards use `vehicleType: 'all'` → shows light-vehicle result; heavy HOLD only visible when evaluated with `heavy`. **Gap: card should show both classes.** |
| BR-02 most restrictive wins | **T** (fixed) | same | **Was violated**: ORANGE + one-way / heavy-only / UNKNOWN returned GO_CAUTION. ORANGE now checked before restrictions. |
| BR-03 diversion safety | **T** | `checkDiversionSafety` | Only the first diversion candidate per zone is evaluated. |
| BR-04 holding-point eligibility + fallback | **T** (fixed) | `selectHoldingPoint`, `ApproachZone.fallbackHoldingPointIds`, `src/data/mockData.ts` | **Was violated**: ineligible point still used. Now Haflong → Lumding. AZ-07S (Silchar side) has no fallback — open item (Silchar-side town). |
| BR-05 warnings only raise | **—** | `DemoContext.updateSegmentRainfall` | No Risk Index computation; rainfall setter can **lower** risk to Green ignoring susceptibility/warnings. |
| BR-06 missing/stale → No data | **P** | engine treats NO_DATA/UNKNOWN as caution (tested) | No staleness detection; `freshness` is a static string. |
| BR-07 only officer-confirmed report changes state | **I** | `DemoContext.confirmReport` | AI never changes state. But confirm forces `S-07` BLOCKED if `blockagePercent > 50` regardless of report segment logic (hard-coded). |
| BR-08 officer approval, escalation | **P** | `src/pages/ApprovalsPage.tsx` | Approve button not role-gated; second approver not used; escalation timer reaches 00:00 and **nothing happens**. |
| BR-09 alert validator blocks mismatches | **—** | `ApprovalsPage` | "Places ✓ Times ✓ Decision ✓" is **static markup**; drafts are fixed strings in `mockData.ts`. |
| BR-10 report text is data | **P** | reports rendered as text only | No LLM consumes report text yet, so nothing to inject into; needs test once AI endpoint exists. |
| BR-11 window-closing flag, no GO NOW | **T** (fixed) | engine + `DemoContext` step 2 | **Was violated**: step 2 set the flag on an Orange segment. Now Yellow-only. Test asserts no "go now/hurry" wording. |
| BR-12 6-hour validity | **P** | `Segment.validUntil` | Static string; no expiry → No data. |
| Expected wait = est. reopening − now | **T** (fixed) | engine `expectedWaitMinutes`, `DecisionsPage` | **Was** hard-coded 180/90/20 min and the UI showed a clock time on every card. Now HOLD-only duration, labelled est. |
| No vehicle tracking | **I** | — | No location tracking code present. |

## Features

| Feature | Status | Where | Gaps |
|---|---|---|---|
| F1 Segment Risk Map | **P** | `CorridorPage`, `CorridorMap`, `SegmentDrawer` | Risk levels are sample values; Settings weights (GSI/rainfall/slope/history) are **not used** by any computation; geometry approximate; OSM tiles fail offline (schematic fallback works). |
| F2 Safe Passage & Closure Engine | **P** | `decisionEngine.ts`, `DecisionsPage`, `IncidentsPage` | Engine tested. Traveller message & SMS reply are **hard-coded** "HOLD at Haflong… No safe diversion" — not driven by the engine. Officer "clear passage" for Orange not implemented. Decision record = audit log entries only. |
| F3 Verified Ground Reports | **P** | `ReportsPage`, `DemoContext` | AI result simulated (fixed `Debris / 100% / 0.91`); "AI outage" toggle does not affect submission; automatic checks hard-coded `true`; no file upload (URL only). |
| F4 Multilingual alerts + validator + CAP | **P** | `ApprovalsPage`, `mockData.INITIAL_APPROVAL` | Templates static; validator static (BR-09 —); CAP is a fixed XML string. CAP `<instruction>` says *Northbound hold at Silchar / Southbound at Haflong* — check against zones (AZ-07N Southbound→Haflong ✓, AZ-07S Northbound→Silchar ✓). CAP `<sender>` uses a `.gov.in` address — **change to a non-government placeholder** to avoid implying adoption. |
| F5 Access control & audit | **P** | `Sidebar` role menu, `IncidentsPage` History | Role switch has no effect on permissions; audit log in memory only. |
| F6 Offline cache / SMS fallback | **—** | SMS shown as static mock-up | — |
| F7 Equipment tracking | **I** | `IncidentsPage` crew assignment | Not tested. |

## Success metrics

| Metric | Status |
|---|---|
| SM1 decision correctness | 12/12 scripted scenarios + 8 rule tests pass. Rule-check panel previously showed **PASS unconditionally**; now shows real result. |
| SM2 alert safety | Not measurable — validator not implemented (BR-09). |
| SM3 report-to-decision time | Not measured yet. |

## Recommended next steps (priority)

1. BR-09 validator + CAP built from decision fields (step 4 of plan) — biggest claim risk today.
2. Drive traveller message / SMS from `evaluateApproachZoneDecision`.
3. Escalation on timer expiry + role-gated approve (BR-08).
4. Rule-based Risk Index using the Settings weights, warnings-only-raise (BR-05), staleness → No data (BR-06/12).
5. Real NH-27 segments (needs owner's GeoPackage — not in repo).
