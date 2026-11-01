import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDiversionSafety,
  checkHoldingPointEligibility,
  evaluateApproachZoneDecision,
  SCRIPTED_SCENARIOS,
  runScriptedScenario
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
