import {
  ApproachZone,
  DecisionResult,
  DecisionType,
  RiskLevel,
  RoadState,
  SafeHoldingPoint,
  Segment
} from '../types';

export interface EvaluateOptions {
  vehicleType?: 'all' | 'heavy' | 'light';
  /** Officer-entered reopening estimate; expected wait = estimate - now (labelled est.). */
  reopeningEstimate?: Date;
  now?: Date;
}

/**
 * Checks if a candidate diversion route is safe.
 * A diversion route is valid ONLY if EVERY segment in it is OPEN and has risk GREEN or YELLOW.
 * If any segment is BLOCKED, RESTRICTED, UNKNOWN, ORANGE, RED, or NO_DATA, diversion is rejected.
 */
export function checkDiversionSafety(
  diversionSegmentIds: string[],
  allSegments: Record<string, Segment>
): { isSafe: boolean; details: string; failingSegmentId?: string } {
  if (!diversionSegmentIds || diversionSegmentIds.length === 0) {
    return {
      isSafe: false,
      details: 'No candidate diversion route mapped for this sector.'
    };
  }

  for (const segId of diversionSegmentIds) {
    const seg = allSegments[segId];
    if (!seg) {
      return {
        isSafe: false,
        details: `Diversion candidate links to unmapped segment ${segId} -> rejected for safety.`,
        failingSegmentId: segId
      };
    }

    if (seg.riskLevel === 'NO_DATA') {
      return {
        isSafe: false,
        details: `Route via ${seg.name} (${seg.id}) contains No-data segments -> not offered.`,
        failingSegmentId: segId
      };
    }

    if (seg.roadState === 'BLOCKED') {
      return {
        isSafe: false,
        details: `Route via ${seg.name} (${seg.id}) is BLOCKED -> not offered.`,
        failingSegmentId: segId
      };
    }

    if (seg.roadState === 'UNKNOWN') {
      return {
        isSafe: false,
        details: `Route via ${seg.name} (${seg.id}) has UNKNOWN road state -> not offered.`,
        failingSegmentId: segId
      };
    }

    if (seg.riskLevel === 'RED' || seg.riskLevel === 'ORANGE') {
      return {
        isSafe: false,
        details: `Route via ${seg.name} (${seg.id}) is evaluated as ${seg.riskLevel} risk -> not offered.`,
        failingSegmentId: segId
      };
    }

    if (seg.roadState !== 'OPEN') {
      return {
        isSafe: false,
        details: `Route via ${seg.name} (${seg.id}) has active restriction (${seg.roadState}) -> not offered.`,
        failingSegmentId: segId
      };
    }
  }

  return {
    isSafe: true,
    details: `All segments on diversion route (${diversionSegmentIds.join(', ')}) verified OPEN with Green/Yellow risk.`
  };
}

/**
 * Checks holding point eligibility:
 * A Safe Holding Point is eligible ONLY if its own segment is OPEN and (GREEN or YELLOW).
 */
export function checkHoldingPointEligibility(
  holdingPoint: SafeHoldingPoint | undefined,
  allSegments: Record<string, Segment>
): { isEligible: boolean; reason: string } {
  if (!holdingPoint) {
    return {
      isEligible: false,
      reason: 'No designated safe holding point linked to this approach zone.'
    };
  }

  const hostSegment = allSegments[holdingPoint.segmentId];
  if (!hostSegment) {
    return {
      isEligible: false,
      reason: `Holding point host segment ${holdingPoint.segmentId} is unknown.`
    };
  }

  if (hostSegment.roadState !== 'OPEN') {
    return {
      isEligible: false,
      reason: `Holding point ${holdingPoint.name} disabled: host segment ${hostSegment.id} state is ${hostSegment.roadState}.`
    };
  }

  if (hostSegment.riskLevel !== 'GREEN' && hostSegment.riskLevel !== 'YELLOW') {
    return {
      isEligible: false,
      reason: `Holding point ${holdingPoint.name} disabled: host segment ${hostSegment.id} risk is elevated (${hostSegment.riskLevel}).`
    };
  }

  return {
    isEligible: true,
    reason: `Holding point verified safe: ${holdingPoint.name} on ${hostSegment.id} is OPEN and ${hostSegment.riskLevel} risk.`
  };
}

/** Parses an officer-entered clock time such as "4:00 PM" onto the reference day. */
export function parseClockTime(text: string | undefined, reference: Date = new Date()): Date | undefined {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (min > 59 || h > 23 || (ampm && (h < 1 || h > 12))) return undefined;
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(reference);
  d.setHours(h, min, 0, 0);
  return d;
}

/**
 * BR-04: use the nearest holding point only while its own segment is OPEN and Green/Yellow;
 * otherwise walk back through the zone's fallback chain (e.g. Haflong -> Lumding).
 */
export function selectHoldingPoint(
  zone: ApproachZone,
  allSegments: Record<string, Segment>,
  holdingPoints: Record<string, SafeHoldingPoint>
): { holdingPoint?: SafeHoldingPoint; holdingEligibility: { isEligible: boolean; reason: string } } {
  const chain = [zone.nearestHoldingPointId, ...(zone.fallbackHoldingPointIds || [])];
  const reasons: string[] = [];
  for (const id of chain) {
    const hp = holdingPoints[id];
    const check = checkHoldingPointEligibility(hp, allSegments);
    if (check.isEligible) {
      return {
        holdingPoint: hp,
        holdingEligibility: {
          isEligible: true,
          reason: reasons.length ? `${reasons.join(' ')} Fallback: ${check.reason}` : check.reason
        }
      };
    }
    reasons.push(check.reason);
  }
  return {
    holdingPoint: undefined,
    holdingEligibility: { isEligible: false, reason: `No eligible holding point. ${reasons.join(' ')}` }
  };
}

/**
 * Core pure decision engine for RESILION 2.0 (BR-01, BR-02, BR-03, BR-04, BR-06, BR-11).
 * Rules are checked from most to least restrictive so the most restrictive decision wins (BR-02).
 */
export function evaluateApproachZoneDecision(
  zone: ApproachZone,
  targetSegment: Segment,
  allSegments: Record<string, Segment>,
  holdingPoints: Record<string, SafeHoldingPoint>,
  options: EvaluateOptions = {}
): DecisionResult {
  const vehicleType = options.vehicleType || 'all';
  const { holdingPoint, holdingEligibility } = selectHoldingPoint(zone, allSegments, holdingPoints);
  const holdAt = holdingPoint?.locationName || 'No eligible holding point';

  let diversionCheckResult = {
    isOffered: false,
    routeCandidateName: undefined as string | undefined,
    details: 'No candidate diversion available for this segment.'
  };
  if (zone.diversionRoutes && zone.diversionRoutes.length > 0) {
    const candidate = zone.diversionRoutes[0];
    const safety = checkDiversionSafety(candidate.segmentIds, allSegments);
    diversionCheckResult = {
      isOffered: safety.isSafe,
      routeCandidateName: candidate.name,
      details: safety.details
    };
  }

  // Expected wait (HOLD only) = reopening estimate - now, never negative, never invented.
  const now = options.now || new Date();
  const holdWait = options.reopeningEstimate
    ? Math.max(0, Math.round((options.reopeningEstimate.getTime() - now.getTime()) / 60000))
    : undefined;

  const warnings = (targetSegment.inputs?.warnings || '').toLowerCase();
  const hasImdWarning = warnings.includes('imd') &&
    (warnings.includes('heavy') || warnings.includes('orange') || warnings.includes('red'));
  const isWindowClosing = targetSegment.riskLevel === 'YELLOW' && hasImdWarning;

  const base = { holdingPoint, holdingEligibility, diversionCheck: diversionCheckResult, windowClosing: false, closeRecommended: false };

  // RULE 1: BLOCKED or RED -> CLOSE recommended; DIVERT if checked diversion exists, else HOLD
  if (targetSegment.roadState === 'BLOCKED' || targetSegment.riskLevel === 'RED') {
    if (diversionCheckResult.isOffered) {
      return {
        ...base,
        closeRecommended: true,
        decision: 'DIVERT',
        ruleId: 'R-BLOCKED-RED-DIVERT',
        ruleExplanation: `${targetSegment.id} ${targetSegment.roadState} / ${targetSegment.riskLevel}. Diversion ${diversionCheckResult.routeCandidateName} checked safe.`,
        actionText: `Divert via ${diversionCheckResult.routeCandidateName}`,
        travellerAdvisory: `Road ahead at ${targetSegment.name} closed. Use diversion ${diversionCheckResult.routeCandidateName}.`
      };
    }
    return {
      ...base,
      closeRecommended: true,
      decision: 'HOLD',
      ruleId: 'R-BLOCKED-RED-HOLD',
      ruleExplanation: `${targetSegment.id} ${targetSegment.roadState} / ${targetSegment.riskLevel}. ${diversionCheckResult.details} HOLD: ${holdingEligibility.reason}`,
      actionText: `Hold at ${holdAt}`,
      expectedWaitMinutes: holdWait,
      travellerAdvisory: `Hold at ${holdAt}. Road ahead closed at ${targetSegment.name}. No safe diversion.`
    };
  }

  // RULE 2: ORANGE -> HOLD before entry (checked before restrictions/unknown: BR-02)
  if (targetSegment.riskLevel === 'ORANGE') {
    return {
      ...base,
      decision: 'HOLD',
      ruleId: 'R-ORANGE-HOLD',
      ruleExplanation: `${targetSegment.id} ORANGE risk. HOLD before entry. Officer may clear passage (logged).`,
      actionText: `HOLD before entry at ${holdAt}`,
      expectedWaitMinutes: holdWait,
      travellerAdvisory: `Hold at ${holdAt} until the road ahead at ${targetSegment.name} is cleared.`
    };
  }

  // RULE 3: RESTRICTED heavy-vehicles-only
  if (targetSegment.roadState === 'RESTRICTED_HEAVY') {
    if (vehicleType === 'heavy') {
      return {
        ...base,
        decision: 'HOLD',
        ruleId: 'R-RESTRICT-HEAVY-HOLD',
        ruleExplanation: `${targetSegment.id} closed to heavy vehicles. Heavy vehicles HOLD.`,
        actionText: `Heavy vehicles HOLD at ${holdAt}`,
        expectedWaitMinutes: holdWait,
        travellerAdvisory: `Heavy vehicles hold at ${holdAt}. Light vehicles proceed with caution.`
      };
    }
    return {
      ...base,
      decision: 'GO_CAUTION',
      ruleId: 'R-RESTRICT-HEAVY-LIGHT-GO',
      ruleExplanation: `${targetSegment.id} closed to heavy vehicles. Light vehicles GO with caution.`,
      actionText: 'GO with caution (light vehicles)',
      travellerAdvisory: `Light vehicles proceed with caution. Heavy vehicles hold at ${holdAt}.`
    };
  }

  // RULE 4: RESTRICTED one-way -> GO with caution under police control
  if (targetSegment.roadState === 'RESTRICTED_ONE_WAY') {
    return {
      ...base,
      decision: 'GO_CAUTION',
      ruleId: 'R-RESTRICT-ONEWAY',
      ruleExplanation: `${targetSegment.id} one-way under police control.`,
      actionText: 'GO with caution (one-way, police control)',
      travellerAdvisory: `One-way passage under police control. Follow police directions.`
    };
  }

  // RULE 5: UNKNOWN state or NO_DATA risk -> treated as Yellow, never Green (BR-06)
  if (targetSegment.roadState === 'UNKNOWN' || targetSegment.riskLevel === 'NO_DATA') {
    return {
      ...base,
      decision: 'GO_CAUTION',
      ruleId: 'R-NODATA-UNKNOWN',
      ruleExplanation: `${targetSegment.id} UNKNOWN / No data. Treated as Yellow, never Green.`,
      actionText: 'GO with caution (No data)',
      travellerAdvisory: `Road status not confirmed. Drive with caution.`
    };
  }

  // RULE 6: YELLOW -> GO with caution (+ control-room window-closing flag, BR-11)
  if (targetSegment.riskLevel === 'YELLOW') {
    return {
      ...base,
      windowClosing: isWindowClosing,
      decision: 'GO_CAUTION',
      ruleId: isWindowClosing ? 'R-YELLOW-WINDOW-CLOSING' : 'R-YELLOW-CAUTION',
      ruleExplanation: isWindowClosing
        ? `${targetSegment.id} YELLOW with IMD heavy-rainfall warning. Window-closing flag (control room only).`
        : `${targetSegment.id} YELLOW risk.`,
      actionText: 'GO with caution',
      travellerAdvisory: `Proceed with caution. Watch for falling stones on hill curves.`
    };
  }

  // RULE 7: GREEN and OPEN -> GO
  if (targetSegment.riskLevel === 'GREEN' && targetSegment.roadState === 'OPEN') {
    return {
      ...base,
      decision: 'GO',
      ruleId: 'R-GREEN-GO',
      ruleExplanation: `${targetSegment.id} GREEN and OPEN.`,
      actionText: 'GO',
      travellerAdvisory: `Road open.`
    };
  }

  return {
    ...base,
    decision: 'GO_CAUTION',
    ruleId: 'R-DEFAULT-SAFE',
    ruleExplanation: `Default caution for ${targetSegment.id}.`,
    actionText: 'GO with caution',
    travellerAdvisory: `Drive with caution.`
  };
}

/**
 * Scripted correctness test cases for the 12 scenarios verification panel.
 */
export interface ScriptedScenario {
  id: string;
  name: string;
  description: string;
  expectedDecision: DecisionType;
  expectedRuleId: string;
  setup: {
    roadState: RoadState;
    riskLevel: RiskLevel;
    vehicleType?: 'all' | 'heavy' | 'light';
    diversionSafe?: boolean;
    hasImdWarning?: boolean;
  };
}

export const SCRIPTED_SCENARIOS: ScriptedScenario[] = [
  {
    id: 'SC-01',
    name: 'Normal Clear Day',
    description: 'Road OPEN, Green risk -> GO',
    expectedDecision: 'GO',
    expectedRuleId: 'R-GREEN-GO',
    setup: { roadState: 'OPEN', riskLevel: 'GREEN' }
  },
  {
    id: 'SC-02',
    name: 'Light Rain Advisory',
    description: 'Road OPEN, Yellow risk -> GO_CAUTION',
    expectedDecision: 'GO_CAUTION',
    expectedRuleId: 'R-YELLOW-CAUTION',
    setup: { roadState: 'OPEN', riskLevel: 'YELLOW' }
  },
  {
    id: 'SC-03',
    name: 'Window Closing Event',
    description: 'Road OPEN, Yellow risk with IMD heavy rain warning -> GO_CAUTION + window closing flag',
    expectedDecision: 'GO_CAUTION',
    expectedRuleId: 'R-YELLOW-WINDOW-CLOSING',
    setup: { roadState: 'OPEN', riskLevel: 'YELLOW', hasImdWarning: true }
  },
  {
    id: 'SC-04',
    name: 'Pre-failure Hazard (Orange)',
    description: 'Road OPEN, Orange risk -> HOLD before entry',
    expectedDecision: 'HOLD',
    expectedRuleId: 'R-ORANGE-HOLD',
    setup: { roadState: 'OPEN', riskLevel: 'ORANGE' }
  },
  {
    id: 'SC-05',
    name: 'Active Landslide Blockage (No Diversion)',
    description: 'Road BLOCKED, Red risk, no safe diversion -> HOLD at safe holding point',
    expectedDecision: 'HOLD',
    expectedRuleId: 'R-BLOCKED-RED-HOLD',
    setup: { roadState: 'BLOCKED', riskLevel: 'RED', diversionSafe: false }
  },
  {
    id: 'SC-06',
    name: 'Active Blockage with Valid Diversion',
    description: 'Road BLOCKED, Red risk, diversion segments all Green/Yellow OPEN -> DIVERT',
    expectedDecision: 'DIVERT',
    expectedRuleId: 'R-BLOCKED-RED-DIVERT',
    setup: { roadState: 'BLOCKED', riskLevel: 'RED', diversionSafe: true }
  },
  {
    id: 'SC-07',
    name: 'Diversion with No-Data Segment',
    description: 'Diversion candidate passes through unverified segment -> rejected, fallback to HOLD',
    expectedDecision: 'HOLD',
    expectedRuleId: 'R-BLOCKED-RED-HOLD',
    setup: { roadState: 'BLOCKED', riskLevel: 'RED', diversionSafe: false }
  },
  {
    id: 'SC-08',
    name: 'Heavy Vehicle Restriction (Truck)',
    description: 'Road RESTRICTED_HEAVY, evaluating heavy freight -> HOLD',
    expectedDecision: 'HOLD',
    expectedRuleId: 'R-RESTRICT-HEAVY-HOLD',
    setup: { roadState: 'RESTRICTED_HEAVY', riskLevel: 'YELLOW', vehicleType: 'heavy' }
  },
  {
    id: 'SC-09',
    name: 'Heavy Vehicle Restriction (Passenger Car)',
    description: 'Road RESTRICTED_HEAVY, evaluating light vehicle -> GO_CAUTION',
    expectedDecision: 'GO_CAUTION',
    expectedRuleId: 'R-RESTRICT-HEAVY-LIGHT-GO',
    setup: { roadState: 'RESTRICTED_HEAVY', riskLevel: 'YELLOW', vehicleType: 'light' }
  },
  {
    id: 'SC-10',
    name: 'Alternating Single-Lane Convoy',
    description: 'Road RESTRICTED_ONE_WAY -> GO_CAUTION under patrol convoy',
    expectedDecision: 'GO_CAUTION',
    expectedRuleId: 'R-RESTRICT-ONEWAY',
    setup: { roadState: 'RESTRICTED_ONE_WAY', riskLevel: 'YELLOW' }
  },
  {
    id: 'SC-11',
    name: 'Sensor Outage (No Data)',
    description: 'Risk NO_DATA, road OPEN -> treated as Yellow (GO_CAUTION), never Green',
    expectedDecision: 'GO_CAUTION',
    expectedRuleId: 'R-NODATA-UNKNOWN',
    setup: { roadState: 'OPEN', riskLevel: 'NO_DATA' }
  },
  {
    id: 'SC-12',
    name: 'Unknown Road State',
    description: 'State UNKNOWN -> treated as Yellow (GO_CAUTION) pending patrol check',
    expectedDecision: 'GO_CAUTION',
    expectedRuleId: 'R-NODATA-UNKNOWN',
    setup: { roadState: 'UNKNOWN', riskLevel: 'GREEN' }
  }
];

export function runScriptedScenario(scenario: ScriptedScenario): {
  passed: boolean;
  actualDecision: DecisionType;
  actualRuleId: string;
  details: string;
} {
  const dummySegment: Segment = {
    id: 'S-07',
    name: 'S-07 Jatinga–Harangajao',
    kmRange: 'km 166–178',
    startKm: 166,
    endKm: 178,
    coordinates: [[25.12, 92.99], [25.05, 92.89]],
    center: [25.08, 92.94],
    roadState: scenario.setup.roadState,
    riskLevel: scenario.setup.riskLevel,
    reasons: ['Scripted test input'],
    freshness: '1m ago',
    validUntil: '5h 59m',
    inputs: {
      susceptibility: 'High',
      slope: '34°',
      rainfall24h: 80,
      rainfall3d: 140,
      rainfall7d: 220,
      pastIncidents: 4,
      warnings: scenario.setup.hasImdWarning ? 'IMD Orange Warning: Heavy rainfall' : 'None',
      freshness: 'Just now'
    },
    lengthKm: 12,
    elevationM: 610
  };

  const dummyAllSegments: Record<string, Segment> = {
    'S-07': dummySegment,
    'S-05': {
      id: 'S-05',
      name: 'S-05 Maibong–Mahur',
      kmRange: 'km 146–156',
      startKm: 146,
      endKm: 156,
      coordinates: [[25.30, 93.17], [25.24, 93.10]],
      center: [25.27, 93.13],
      roadState: 'OPEN',
      riskLevel: 'GREEN',
      reasons: ['Stable stretch'],
      freshness: '5m ago',
      validUntil: '6h',
      inputs: {
        susceptibility: 'Low',
        slope: '14°',
        rainfall24h: 12,
        rainfall3d: 25,
        rainfall7d: 40,
        pastIncidents: 0,
        warnings: 'None',
        freshness: '5m ago'
      },
      lengthKm: 10,
      elevationM: 520
    },
    'DIV-01': {
      id: 'DIV-01',
      name: 'Alternative Bypass Road',
      kmRange: 'km 0–15',
      startKm: 0,
      endKm: 15,
      coordinates: [[25.15, 93.00], [25.02, 92.85]],
      center: [25.08, 92.92],
      roadState: scenario.setup.diversionSafe ? 'OPEN' : 'BLOCKED',
      riskLevel: scenario.setup.diversionSafe ? 'GREEN' : 'RED',
      reasons: ['Bypass route'],
      freshness: '2m ago',
      validUntil: '6h',
      inputs: {
        susceptibility: 'Moderate',
        slope: '18°',
        rainfall24h: 20,
        rainfall3d: 35,
        rainfall7d: 50,
        pastIncidents: 0,
        warnings: 'None',
        freshness: '2m ago'
      },
      lengthKm: 15,
      elevationM: 450
    }
  };

  const dummyHoldingPoint: SafeHoldingPoint = {
    id: 'HP-HAFLONG',
    name: 'Haflong Safe Holding Area',
    locationName: 'Haflong Junction Staging Area',
    facilities: ['Food stalls', 'Fuel', 'Emergency shelter', 'Heavy vehicle staging'],
    segmentId: 'S-05',
    capacityVehicles: 300,
    currentOccupancy: 45,
    statusNote: 'Operational'
  };

  const dummyZone: ApproachZone = {
    id: 'AZ-07N',
    name: 'AZ-07N from Haflong side',
    direction: 'Northbound',
    segmentId: 'S-07',
    targetSegmentName: 'S-07 Jatinga–Harangajao',
    nearestHoldingPointId: 'HP-HAFLONG',
    locationKm: 'km 164',
    diversionRoutes: [
      {
        name: 'Bypass Road',
        description: 'Via bypass road',
        segmentIds: ['DIV-01']
      }
    ]
  };

  const result = evaluateApproachZoneDecision(
    dummyZone,
    dummySegment,
    dummyAllSegments,
    { 'HP-HAFLONG': dummyHoldingPoint },
    { vehicleType: scenario.setup.vehicleType }
  );

  const decisionMatches = result.decision === scenario.expectedDecision;
  const ruleMatches = result.ruleId === scenario.expectedRuleId;
  const passed = decisionMatches && ruleMatches;

  return {
    passed,
    actualDecision: result.decision,
    actualRuleId: result.ruleId,
    details: passed 
      ? `Matched rule ${result.ruleId} and decision ${result.decision}`
      : `Expected ${scenario.expectedDecision} (${scenario.expectedRuleId}) but got ${result.decision} (${result.ruleId})`
  };
}
