/**
 * Generates backend/tests/fixtures/parity.json: outputs of the TypeScript rules over a broad input matrix.
 * backend/tests/test_parity.py asserts the Python port returns identical results.
 * Run: npx tsx scripts/parity-fixture.ts
 */
import fs from 'node:fs';
import { evaluateApproachZoneDecision } from '../src/domain/decisionEngine';
import { computeRisk } from '../src/domain/riskIndex';
import { buildAlertTexts, buildCap, validateAlert, renderTemplate } from '../src/domain/alerts';
import { DEFAULT_CONFIG } from '../src/domain/config';
import { AlertFields, ApproachZone, ImdWarning, RiskLevel, RoadState, SafeHoldingPoint, Segment, SegmentInputs } from '../src/types';

const NOW = new Date('2026-11-01T04:00:00.000Z');
const STATES: RoadState[] = ['OPEN', 'RESTRICTED_HEAVY', 'RESTRICTED_ONE_WAY', 'BLOCKED', 'UNKNOWN'];
const RISKS: RiskLevel[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED', 'NO_DATA'];

const inputs = (imd: ImdWarning): SegmentInputs => ({
  susceptibility: 'Low', slopeDeg: 10, rainfall24h: 1, rainfall3d: 2, rainfall7d: 3, pastIncidents: 0,
  imdWarning: imd, gsiBulletin: false, updatedAt: NOW.toISOString(), sample: true
});
const seg = (id: string, roadState: RoadState, riskLevel: RiskLevel, imd: ImdWarning = 'NONE'): Segment => ({
  id, name: `${id} name`, startKm: 0, endKm: 1, coordinates: [[25, 93]], center: [25, 93], roadState, riskLevel,
  riskIndex: null, reasons: [], computedAt: NOW.toISOString(), validUntil: NOW.toISOString(), inputs: inputs(imd)
});
const hp = (id: string, segmentId: string): SafeHoldingPoint => ({
  id, name: `${id} name`, shortName: id, locationName: `${id} loc`, facilities: [], segmentId, capacityVehicles: 1, provisional: true
});
const HPS = { 'HP-A': hp('HP-A', 'H1'), 'HP-B': hp('HP-B', 'H2') };

const engine: unknown[] = [];
const divOpts: [string, Segment | null][] = [
  ['none', null], ['safe', seg('D1', 'OPEN', 'GREEN')], ['nodata', seg('D1', 'OPEN', 'NO_DATA')], ['blocked', seg('D1', 'BLOCKED', 'YELLOW')]
];
const hostOpts: [string, Segment][] = [['ok', seg('H1', 'OPEN', 'GREEN')], ['orange', seg('H1', 'OPEN', 'ORANGE')], ['blocked', seg('H1', 'BLOCKED', 'RED')]];
const fbOpts: [string, Segment][] = [['ok', seg('H2', 'OPEN', 'YELLOW')], ['nodata', seg('H2', 'OPEN', 'NO_DATA')]];

for (const st of STATES) for (const rk of RISKS) for (const vt of ['light', 'heavy'] as const)
  for (const [dk, div] of divOpts) for (const [hk, host] of hostOpts) for (const [fk, fb] of fbOpts)
    for (const imd of ['NONE', 'ORANGE'] as ImdWarning[]) for (const cleared of [false, true]) for (const est of [null, 125.5]) {
      const target = seg('T', st, rk, imd);
      const zone: ApproachZone = {
        id: 'AZ', name: 'zone', direction: 'Southbound', segmentId: 'T', center: [25, 93], extentKm: 2.5, locationKm: 1,
        nearestHoldingPointId: 'HP-A', fallbackHoldingPointIds: ['HP-B'],
        diversionRoutes: div ? [{ name: 'Route D', segmentIds: ['D1'] }] : []
      };
      const all: Record<string, Segment> = { T: target, H1: host, H2: fb };
      if (div) all.D1 = div;
      const input = { st, rk, vt, dk, hk, fk, imd, cleared, est };
      const out = evaluateApproachZoneDecision(zone, target, all, HPS, {
        vehicleType: vt, officerClearedPassage: cleared, now: NOW,
        reopeningEstimate: est === null ? undefined : new Date(NOW.getTime() + est * 60000)
      });
      engine.push({ input, output: JSON.parse(JSON.stringify(out)) });
    }

const risk: unknown[] = [];
const susc = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'] as const;
let i = 0;
for (const s of susc) for (const slope of [5, 22, 34, 50]) for (const r3 of [0, 60, 142, 260]) for (const past of [0, 1, 4]) for (const imd of ['NONE', 'YELLOW', 'ORANGE', 'RED'] as ImdWarning[]) {
  i++;
  const inp: SegmentInputs = {
    susceptibility: s, slopeDeg: slope, rainfall24h: Math.round(r3 / 2), rainfall3d: r3, rainfall7d: r3 * 1.5, pastIncidents: past,
    imdWarning: imd, gsiBulletin: i % 7 === 0, updatedAt: new Date(NOW.getTime() - (i % 9) * 3600_000).toISOString(), sample: true
  };
  risk.push({ input: inp, output: computeRisk(inp, DEFAULT_CONFIG, NOW) });
}
risk.push({ input: { ...inputs('NONE'), rainfall3d: null }, output: computeRisk({ ...inputs('NONE'), rainfall3d: null }, DEFAULT_CONFIG, NOW) });

const PLACES = ['Haflong', 'Lumding', 'Silchar-side staging', 'Haflong–Ditokcherra link'];
const fieldsList: AlertFields[] = [];
for (const template of ['CLOSE', 'DIVERT', 'HOLD', 'CAUTION', 'REOPEN'] as const) for (const est of [undefined, '4:00 PM']) {
  fieldsList.push({
    segmentId: 'S-07', place: 'Jatinga – Harangajao', template,
    zones: [
      { zoneId: 'AZ-07N', direction: 'Southbound', decision: template === 'DIVERT' ? 'DIVERT' : template === 'CAUTION' || template === 'REOPEN' ? 'GO_CAUTION' : 'HOLD', place: template === 'DIVERT' ? 'Haflong–Ditokcherra link' : template === 'CAUTION' || template === 'REOPEN' ? undefined : 'Haflong' },
      { zoneId: 'AZ-07S', direction: 'Northbound', decision: template === 'REOPEN' ? 'GO' : template === 'CAUTION' ? 'GO_CAUTION' : 'HOLD', place: template === 'REOPEN' || template === 'CAUTION' ? undefined : 'Silchar-side staging' }
    ],
    noSafeDiversion: template === 'CLOSE', reopeningEstimate: est, certainty: est ? 'Observed' : 'Likely'
  });
}
const alerts = fieldsList.map(f => {
  const fields = JSON.parse(JSON.stringify(f));
  const en = renderTemplate(f, 'en');
  const candidates = [en, en.replace('Haflong', 'Lumding'), en + ' Hurry before 6:30 PM.', en.replace('HOLD', 'GO'), 'S-07 नमस्ते 4:00 PM बंद', renderTemplate(f, 'bn') + ' সময়5:00'];
  return {
    fields,
    templates: Object.fromEntries((['en', 'hi', 'as', 'bn'] as const).map(l => [l, renderTemplate(f, l)])),
    validations: candidates.flatMap(c => (['en', 'hi', 'as', 'bn'] as const).map(l => ({ text: c, lang: l, result: validateAlert(c, f, l, PLACES) }))),
    texts: buildAlertTexts(f, PLACES, { hi: candidates[1] }),
    cap: buildCap({
      identifier: 'RESILION-ALR-0001', sent: NOW, fields: f, texts: buildAlertTexts(f, PLACES),
      zones: [{ id: 'AZ-07N', name: 'Mahur side', direction: 'Southbound', segmentId: 'S-07', center: [25.17, 93.02], extentKm: 2.5, locationKm: 163.5, nearestHoldingPointId: 'HP-HAFLONG' }]
    })
  };
});

fs.mkdirSync('backend/tests/fixtures', { recursive: true });
fs.writeFileSync('backend/tests/fixtures/parity.json', JSON.stringify({ now: NOW.toISOString(), places: PLACES, config: DEFAULT_CONFIG, engine, risk, alerts }));
console.log(`engine ${engine.length} · risk ${risk.length} · alerts ${alerts.length}`);
