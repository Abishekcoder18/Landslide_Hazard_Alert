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
import { SafeHoldingPoint, ApproachZone, Segment } from '../types';
import { seg } from './testUtils';

const hp = (id: string, name: string, segmentId: string): SafeHoldingPoint =>
  ({ id, name, shortName: name, locationName: name, facilities: [], segmentId, capacityVehicles: 1, provisional: false });

const HP: Record<string, SafeHoldingPoint> = {
  'HP-HAFLONG': hp('HP-HAFLONG', 'Haflong', 'S-05'),
  'HP-LUMDING': hp('HP-LUMDING', 'Lumding', 'S-01')
};

const ZONE: ApproachZone = {
  id: 'AZ-T', name: 'AZ-T', direction: 'Southbound', segmentId: 'S-07', center: [25, 93], extentKm: 2.5, locationKm: 164,
  nearestHoldingPointId: 'HP-HAFLONG', fallbackHoldingPointIds: ['HP-LUMDING']
};

function world(target: Segment, hostHaflong: Segment = seg('S-05', 'OPEN', 'GREEN')) {
  return { [target.id]: target, 'S-05': hostHaflong, 'S-01': seg('S-01', 'OPEN', 'GREEN') };
}

test('BR-03 / AC-08: diversion rejected when any segment is No data, BLOCKED, Orange or Red', () => {
  const segs = { A: seg('A', 'OPEN', 'GREEN'), B: seg('B', 'OPEN', 'NO_DATA'), C: seg('C', 'OPEN', 'ORANGE'), D: seg('D', 'BLOCKED', 'YELLOW'), E: seg('E', 'OPEN', 'YELLOW') };
  assert.equal(checkDiversionSafety(['A', 'E'], segs).isSafe, true);
  for (const bad of ['B', 'C', 'D']) assert.equal(checkDiversionSafety(['A', bad], segs).isSafe, false, bad);
  assert.equal(checkDiversionSafety([], segs).isSafe, false);
});

test('BR-04: holding point eligible only while its segment is OPEN and Green/Yellow', () => {
  assert.equal(checkHoldingPointEligibility(HP['HP-HAFLONG'], { 'S-05': seg('S-05', 'OPEN', 'YELLOW') }).isEligible, true);
  assert.equal(checkHoldingPointEligibility(HP['HP-HAFLONG'], { 'S-05': seg('S-05', 'BLOCKED', 'GREEN') }).isEligible, false);
  assert.equal(checkHoldingPointEligibility(HP['HP-HAFLONG'], { 'S-05': seg('S-05', 'OPEN', 'NO_DATA') }).isEligible, false);
});

test('SM1: every scripted scenario returns the decision specified by the rules', () => {
  assert.equal(SCRIPTED_SCENARIOS.length, 14);
  for (const scenario of SCRIPTED_SCENARIOS) {
    const outcome = runScriptedScenario(scenario);
    assert.equal(outcome.passed, true, `Scenario ${scenario.id} (${scenario.name}) failed: ${outcome.details}`);
  }
});

test('BR-02 / AC-07: Orange risk wins over one-way / heavy restriction / unknown state', () => {
  for (const state of ['RESTRICTED_ONE_WAY', 'RESTRICTED_HEAVY', 'UNKNOWN'] as const) {
    for (const vt of ['all', 'light', 'heavy'] as const) {
      const t = seg('S-07', state, 'ORANGE');
      assert.equal(evaluateApproachZoneDecision(ZONE, t, world(t), HP, { vehicleType: vt }).decision, 'HOLD', `${state}/${vt}`);
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

test('BR-01: officer-cleared passage applies to Orange only', () => {
  const orange = seg('S-07', 'OPEN', 'ORANGE');
  assert.equal(evaluateApproachZoneDecision(ZONE, orange, world(orange), HP, { officerClearedPassage: true }).decision, 'GO_CAUTION');
  const red = seg('S-07', 'OPEN', 'RED');
  assert.equal(evaluateApproachZoneDecision(ZONE, red, world(red), HP, { officerClearedPassage: true }).decision, 'HOLD');
});

test('BR-01: heavy-only restriction holds heavy vehicles, others GO with caution', () => {
  const t = seg('S-07', 'RESTRICTED_HEAVY', 'YELLOW');
  assert.equal(evaluateApproachZoneDecision(ZONE, t, world(t), HP, { vehicleType: 'heavy' }).decision, 'HOLD');
  assert.equal(evaluateApproachZoneDecision(ZONE, t, world(t), HP, { vehicleType: 'light' }).decision, 'GO_CAUTION');
});

test('BR-04 / AC-09: ineligible nearest holding point falls back to next point back', () => {
  const t = seg('S-07', 'BLOCKED', 'RED');
  const r = evaluateApproachZoneDecision(ZONE, t, world(t, seg('S-05', 'OPEN', 'ORANGE')), HP);
  assert.equal(r.decision, 'HOLD');
  assert.equal(r.holdingPoint?.id, 'HP-LUMDING');
});

test('BR-04: no eligible holding point -> HOLD with no point named', () => {
  const t = seg('S-07', 'BLOCKED', 'RED');
  const all = { ...world(t, seg('S-05', 'BLOCKED', 'RED')), 'S-01': seg('S-01', 'OPEN', 'NO_DATA') };
  const r = evaluateApproachZoneDecision(ZONE, t, all, HP);
  assert.equal(r.decision, 'HOLD');
  assert.equal(r.holdingPoint, undefined);
});

test('AC-11: expected wait = reopening estimate - now, HOLD only', () => {
  const now = new Date('2026-11-01T10:00:00');
  const reopen = new Date('2026-11-01T16:00:00');
  const t = seg('S-07', 'BLOCKED', 'RED');
  assert.equal(evaluateApproachZoneDecision(ZONE, t, world(t), HP, { now, reopeningEstimate: reopen }).expectedWaitMinutes, 360);
  assert.equal(evaluateApproachZoneDecision(ZONE, t, world(t), HP, { now }).expectedWaitMinutes, undefined);
  const oneWay = seg('S-07', 'RESTRICTED_ONE_WAY', 'YELLOW');
  assert.equal(evaluateApproachZoneDecision(ZONE, oneWay, world(oneWay), HP, { now, reopeningEstimate: reopen }).expectedWaitMinutes, undefined);
  assert.equal(evaluateApproachZoneDecision(ZONE, t, world(t), HP, { now: reopen, reopeningEstimate: now }).expectedWaitMinutes, 0);
});

test('BR-06: NO_DATA / UNKNOWN never yields GO', () => {
  for (const [st, rk] of [['OPEN', 'NO_DATA'], ['UNKNOWN', 'GREEN'], ['UNKNOWN', 'NO_DATA']] as const) {
    const t = seg('S-07', st, rk);
    assert.notEqual(evaluateApproachZoneDecision(ZONE, t, world(t), HP).decision, 'GO');
  }
});

test('BR-11 / AC-12: window-closing only on Yellow + IMD heavy warning; no hurry wording', () => {
  const y = seg('S-07', 'OPEN', 'YELLOW', 'ORANGE');
  const ry = evaluateApproachZoneDecision(ZONE, y, world(y), HP);
  assert.equal(ry.windowClosing, true);
  const o = seg('S-07', 'OPEN', 'ORANGE', 'ORANGE');
  assert.equal(evaluateApproachZoneDecision(ZONE, o, world(o), HP).windowClosing, false);
  assert.doesNotMatch(ry.travellerAdvisory + ry.actionText, /go now|hurry|quickly|immediately/i);
});

test('parseClockTime parses "4:00 PM" on the reference day', () => {
  const ref = new Date('2026-11-01T09:00:00');
  const d = parseClockTime('4:00 PM', ref)!;
  assert.equal(d.getHours(), 16);
  assert.equal(parseClockTime('later', ref), undefined);
});
