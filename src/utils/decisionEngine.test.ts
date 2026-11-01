import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDiversionSafety,
  checkHoldingPointEligibility,
  evaluateApproachZoneDecision,
  SCRIPTED_SCENARIOS,
  runScriptedScenario,
  parseClockTime
} from './decisionEngine';
import { Segment, SafeHoldingPoint, ApproachZone } from '../types';

test('checkDiversionSafety rejects routes with NO_DATA, BLOCKED, or elevated risk', () => {
  const mockSegments: Record<string, Segment> = {
    'S-A': {
      id: 'S-A',
      name: 'Safe segment',
      kmRange: 'km 0-10',
      startKm: 0,
      endKm: 10,
      coordinates: [[25.1, 93.0]],
      center: [25.1, 93.0],
      roadState: 'OPEN',
      riskLevel: 'GREEN',
      reasons: [],
      freshness: '1m',
      validUntil: '6h',
      inputs: {
        susceptibility: 'Low',
        slope: '10°',
        rainfall24h: 0,
        rainfall3d: 0,
        rainfall7d: 0,
        pastIncidents: 0,
        warnings: '',
        freshness: '1m'
      },
      lengthKm: 10,
      elevationM: 300
    },
    'S-B': {
      id: 'S-B',
      name: 'No data segment',
      kmRange: 'km 10-20',
      startKm: 10,
      endKm: 20,
      coordinates: [[25.2, 93.1]],
      center: [25.2, 93.1],
      roadState: 'OPEN',
      riskLevel: 'NO_DATA',
      reasons: [],
      freshness: 'old',
      validUntil: 'expired',
      inputs: {
        susceptibility: 'Moderate',
        slope: '20°',
        rainfall24h: 0,
        rainfall3d: 0,
        rainfall7d: 0,
        pastIncidents: 0,
        warnings: '',
        freshness: 'old'
      },
      lengthKm: 10,
      elevationM: 400
    }
  };

  // Safe path: only S-A
  const resultSafe = checkDiversionSafety(['S-A'], mockSegments);
  assert.equal(resultSafe.isSafe, true);

  // Unsafe path: S-A + S-B (which has NO_DATA)
  const resultUnsafe = checkDiversionSafety(['S-A', 'S-B'], mockSegments);
  assert.equal(resultUnsafe.isSafe, false);
  assert.match(resultUnsafe.details, /contains No-data segments -> not offered/);
});

test('checkHoldingPointEligibility validates host segment OPEN and Green/Yellow', () => {
  const hostSegment: Segment = {
    id: 'S-05',
    name: 'S-05 Haflong area',
    kmRange: 'km 146-156',
    startKm: 146,
    endKm: 156,
    coordinates: [[25.2, 93.1]],
    center: [25.2, 93.1],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: [],
    freshness: '2m',
    validUntil: '6h',
    inputs: {
      susceptibility: 'Low',
      slope: '12°',
      rainfall24h: 5,
      rainfall3d: 10,
      rainfall7d: 15,
      pastIncidents: 0,
      warnings: '',
      freshness: '2m'
    },
    lengthKm: 10,
    elevationM: 500
  };

  const holdingPoint: SafeHoldingPoint = {
    id: 'HP-1',
    name: 'Haflong Point',
    locationName: 'Haflong Junction',
    facilities: ['Food', 'Fuel'],
    segmentId: 'S-05',
    capacityVehicles: 200,
    currentOccupancy: 20,
    statusNote: 'Open'
  };

  const eligibleRes = checkHoldingPointEligibility(holdingPoint, { 'S-05': hostSegment });
  assert.equal(eligibleRes.isEligible, true);

  // Now simulate host segment blocked
  const blockedHost: Segment = { ...hostSegment, roadState: 'BLOCKED' };
  const ineligibleRes = checkHoldingPointEligibility(holdingPoint, { 'S-05': blockedHost });
  assert.equal(ineligibleRes.isEligible, false);
});

test('run all 12 scripted test scenarios through decisionEngine', () => {
  assert.equal(SCRIPTED_SCENARIOS.length, 12);
  for (const scenario of SCRIPTED_SCENARIOS) {
    const outcome = runScriptedScenario(scenario);
    assert.equal(outcome.passed, true, `Scenario ${scenario.id} (${scenario.name}) failed: ${outcome.details}`);
  }
});

// ---------- BR-02 / BR-04 / expected-wait / CLOSE ----------

function seg(id: string, roadState: Segment['roadState'], riskLevel: Segment['riskLevel'], warnings = 'None'): Segment {
  return {
    id, name: `${id} test`, kmRange: 'km 0-1', startKm: 0, endKm: 1,
    coordinates: [[25, 93]], center: [25, 93], roadState, riskLevel, reasons: [],
    freshness: '1m', validUntil: '6h',
    inputs: { susceptibility: 'Low', slope: '10°', rainfall24h: 0, rainfall3d: 0, rainfall7d: 0, pastIncidents: 0, warnings, freshness: '1m' },
    lengthKm: 1, elevationM: 500
  };
}

const HP: Record<string, SafeHoldingPoint> = {
  'HP-HAFLONG': { id: 'HP-HAFLONG', name: 'Haflong', locationName: 'Haflong', facilities: [], segmentId: 'S-05', capacityVehicles: 1, currentOccupancy: 0, statusNote: '' },
  'HP-LUMDING': { id: 'HP-LUMDING', name: 'Lumding', locationName: 'Lumding', facilities: [], segmentId: 'S-01', capacityVehicles: 1, currentOccupancy: 0, statusNote: '' }
};

const ZONE: ApproachZone = {
  id: 'AZ-T', name: 'AZ-T', direction: 'Southbound', segmentId: 'S-07', targetSegmentName: 'S-07',
  nearestHoldingPointId: 'HP-HAFLONG', fallbackHoldingPointIds: ['HP-LUMDING'], locationKm: 'km 0'
};

function world(target: Segment, hostHaflong: Segment = seg('S-05', 'OPEN', 'GREEN')) {
  return { [target.id]: target, 'S-05': hostHaflong, 'S-01': seg('S-01', 'OPEN', 'GREEN') };
}

test('BR-02: Orange risk wins over one-way / heavy restriction / unknown state', () => {
  for (const state of ['RESTRICTED_ONE_WAY', 'RESTRICTED_HEAVY', 'UNKNOWN'] as const) {
    for (const vt of ['all', 'light', 'heavy'] as const) {
      const t = seg('S-07', state, 'ORANGE');
      const r = evaluateApproachZoneDecision(ZONE, t, world(t), HP, { vehicleType: vt });
      assert.equal(r.decision, 'HOLD', `${state}/${vt} with ORANGE must HOLD`);
    }
  }
});

test('BR-01: BLOCKED or Red recommends CLOSE; others do not', () => {
  const blocked = seg('S-07', 'BLOCKED', 'RED');
  assert.equal(evaluateApproachZoneDecision(ZONE, blocked, world(blocked), HP).closeRecommended, true);
  const red = seg('S-07', 'OPEN', 'RED');
  assert.equal(evaluateApproachZoneDecision(ZONE, red, world(red), HP).closeRecommended, true);
  const orange = seg('S-07', 'OPEN', 'ORANGE');
  assert.equal(evaluateApproachZoneDecision(ZONE, orange, world(orange), HP).closeRecommended, false);
});

test('BR-04: ineligible nearest holding point falls back to next point back', () => {
  const t = seg('S-07', 'BLOCKED', 'RED');
  const r = evaluateApproachZoneDecision(ZONE, t, world(t, seg('S-05', 'OPEN', 'ORANGE')), HP);
  assert.equal(r.decision, 'HOLD');
  assert.equal(r.holdingPoint?.id, 'HP-LUMDING');
  assert.equal(r.holdingEligibility.isEligible, true);
});

test('BR-04: no eligible holding point -> HOLD with no point named', () => {
  const t = seg('S-07', 'BLOCKED', 'RED');
  const all = { ...world(t, seg('S-05', 'BLOCKED', 'RED')), 'S-01': seg('S-01', 'OPEN', 'NO_DATA') };
  const r = evaluateApproachZoneDecision(ZONE, t, all, HP);
  assert.equal(r.decision, 'HOLD');
  assert.equal(r.holdingPoint, undefined);
  assert.equal(r.holdingEligibility.isEligible, false);
});

test('Expected wait = reopening estimate - now, only for HOLD; no hard-coded waits', () => {
  const now = new Date('2026-11-01T10:00:00');
  const reopen = new Date('2026-11-01T16:00:00');
  const t = seg('S-07', 'BLOCKED', 'RED');
  const r = evaluateApproachZoneDecision(ZONE, t, world(t), HP, { now, reopeningEstimate: reopen });
  assert.equal(r.expectedWaitMinutes, 360);
  const noEst = evaluateApproachZoneDecision(ZONE, t, world(t), HP, { now });
  assert.equal(noEst.expectedWaitMinutes, undefined);
  const oneWay = seg('S-07', 'RESTRICTED_ONE_WAY', 'YELLOW');
  assert.equal(evaluateApproachZoneDecision(ZONE, oneWay, world(oneWay), HP, { now, reopeningEstimate: reopen }).expectedWaitMinutes, undefined);
  const past = evaluateApproachZoneDecision(ZONE, t, world(t), HP, { now: reopen, reopeningEstimate: now });
  assert.equal(past.expectedWaitMinutes, 0);
});

test('BR-06: NO_DATA / UNKNOWN never yields GO', () => {
  for (const [st, rk] of [['OPEN', 'NO_DATA'], ['UNKNOWN', 'GREEN'], ['UNKNOWN', 'NO_DATA']] as const) {
    const t = seg('S-07', st, rk);
    assert.notEqual(evaluateApproachZoneDecision(ZONE, t, world(t), HP).decision, 'GO');
  }
});

test('BR-11: window-closing only on Yellow + IMD heavy warning; no hurry wording', () => {
  const y = seg('S-07', 'OPEN', 'YELLOW', 'IMD Orange Warning: Heavy rainfall');
  const ry = evaluateApproachZoneDecision(ZONE, y, world(y), HP);
  assert.equal(ry.windowClosing, true);
  const o = seg('S-07', 'OPEN', 'ORANGE', 'IMD Orange Warning: Heavy rainfall');
  assert.equal(evaluateApproachZoneDecision(ZONE, o, world(o), HP).windowClosing, false);
  assert.doesNotMatch(ry.travellerAdvisory + ry.actionText, /go now|hurry|quickly|immediately/i);
});

test('parseClockTime parses "4:00 PM" on the reference day', () => {
  const ref = new Date('2026-11-01T09:00:00');
  const d = parseClockTime('4:00 PM', ref)!;
  assert.equal(d.getHours(), 16);
  assert.equal(d.getDate(), 1);
  assert.equal(parseClockTime('later', ref), undefined);
});
