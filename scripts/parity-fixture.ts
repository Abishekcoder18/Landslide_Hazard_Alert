/**
 * Generates backend/tests/fixtures/parity.json: outputs of the TypeScript rules over a broad input matrix.
 * backend/tests/test_parity.py asserts the Python port returns identical results.
 * Run: npx tsx scripts/parity-fixture.ts
 */
import fs from 'node:fs';
import { evaluateApproachZoneDecision, evaluateZoneAhead, segmentsAhead } from '../src/domain/decisionEngine';
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

// FR-09 segments ahead: 400 seeded random corridors (mulberry32, seed 2026).
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const IMDS: ImdWarning[] = ['NONE', 'YELLOW', 'ORANGE', 'RED'];
const corridors: unknown[] = [];
for (let c = 0; c < 400; c++) {
  const n = 4 + Math.floor(rnd() * 10);
  const ids = Array.from({ length: n }, (_, k) => `C${String(k + 1).padStart(2, '0')}`);
  const segments: Record<string, Segment> = {};
  ids.forEach((id, k) => (segments[id] = { ...seg(id, pick(STATES), pick(RISKS), pick(IMDS)), startKm: k, endKm: k + 1 }));
  const hpPos = new Set([0, n - 1]);
  const extra = 1 + Math.floor(rnd() * 2);
  for (let e = 0; e < extra; e++) hpPos.add(Math.floor(rnd() * n));
  const hps: Record<string, SafeHoldingPoint> = {};
  [...hpPos].sort((a, b) => a - b).forEach(p => (hps[`HP-${p}`] = hp(`HP-${p}`, ids[p])));
  const zones: ApproachZone[] = [];
  ids.forEach((id, k) => {
    for (const direction of ['Southbound', 'Northbound'] as const) {
      const chain = [...hpPos].filter(p => (direction === 'Southbound' ? p <= k : p >= k))
        .sort((a, b) => (direction === 'Southbound' ? b - a : a - b)).map(p => `HP-${p}`);
      let diversionRoutes: ApproachZone['diversionRoutes'] = [];
      if (rnd() < 0.2) {
        const did = `D${id.slice(1)}${direction[0]}`;
        segments[did] = { ...seg(did, pick(STATES), pick(RISKS)), offCorridor: true, startKm: 100 + k, endKm: 101 + k };
        diversionRoutes = [{ name: `Route ${did}`, segmentIds: [did] }];
      }
      zones.push({ id: `Z${id.slice(1)}${direction[0]}`, name: 'zone', direction, segmentId: id, center: [25, 93], extentKm: 2.5,
        locationKm: k, nearestHoldingPointId: chain[0], fallbackHoldingPointIds: chain.slice(1), diversionRoutes });
    }
  });
  const estimates: Record<string, number> = {};
  ids.forEach(id => { if (rnd() < 0.3) estimates[id] = Math.round(10 + rnd() * 590); });
  const cleared = zones.filter(() => rnd() < 0.1).map(z => `${z.segmentId}|${z.direction}`);
  const order = Object.values(segments).filter(x => !x.offCorridor).sort((a, b) => a.startKm - b.startKm).map(x => x.id);
  const zoneOf = new Map(zones.map(z => [`${z.segmentId}|${z.direction}`, z] as const));
  const results = zones.map(zone => {
    const ahead = segmentsAhead(zone, order, hps);
    const optionsFor = (vehicleType: 'light' | 'heavy') => (sid: string) => ({
      now: NOW, vehicleType, officerClearedPassage: cleared.includes(`${sid}|${zone.direction}`),
      reopeningEstimate: estimates[sid] === undefined ? undefined : new Date(NOW.getTime() + estimates[sid] * 60000)
    });
    const diversionsFor = (sid: string) => zoneOf.get(`${sid}|${zone.direction}`)?.diversionRoutes ?? [];
    return {
      zoneId: zone.id, ahead,
      light: JSON.parse(JSON.stringify(evaluateZoneAhead(zone, ahead, segments, hps, optionsFor('light'), diversionsFor))),
      heavy: JSON.parse(JSON.stringify(evaluateZoneAhead(zone, ahead, segments, hps, optionsFor('heavy'), diversionsFor)))
    };
  });
  corridors.push(JSON.parse(JSON.stringify({ segments, holdingPoints: hps, zones, estimates, cleared, results })));
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
// Model susceptibility score (replaces the category when present), incl. rounding ties and out-of-range values.
const SCORES = [null, 0, 0.005, 0.015, 0.125, 0.135, 0.335, 0.5, 0.589, 0.825, 0.875, 0.995, 1, 1.2, -0.1];
for (const sc of SCORES) for (const s of ['High', null] as const) for (const r3 of [0, 142, 260]) for (const imd of ['NONE', 'ORANGE'] as ImdWarning[]) {
  const inp: SegmentInputs = {
    ...inputs(imd), susceptibility: s, susceptibilityScore: sc, slopeDeg: 28.4, rainfall24h: Math.round(r3 / 2), rainfall3d: r3,
    rainfall7d: r3 * 1.5, pastIncidents: 3, modelVersion: 'susc-test'
  };
  risk.push({ input: inp, output: computeRisk(inp, DEFAULT_CONFIG, NOW) });
}

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
fs.writeFileSync('backend/tests/fixtures/parity.json', JSON.stringify({ now: NOW.toISOString(), places: PLACES, config: DEFAULT_CONFIG, engine, corridors, risk, alerts }));
console.log(`engine ${engine.length} · corridors ${corridors.length} · risk ${risk.length} · alerts ${alerts.length}`);
