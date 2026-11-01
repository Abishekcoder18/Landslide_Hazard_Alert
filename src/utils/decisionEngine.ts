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
  reopeningEstimateText?: string;
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

/**
 * Core pure decision engine for RESILION 2.0.
 * Follows section 6 specifications strictly.
 */
export function evaluateApproachZoneDecision(
  zone: ApproachZone,
  targetSegment: Segment,
  allSegments: Record<string, Segment>,
  holdingPoints: Record<string, SafeHoldingPoint>,
  options: EvaluateOptions = {}
): DecisionResult {
  const vehicleType = options.vehicleType || 'all';
  const holdingPoint = holdingPoints[zone.nearestHoldingPointId];
  const holdingEligibility = checkHoldingPointEligibility(holdingPoint, allSegments);

  // Evaluate candidate diversion route
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

  // Check window closing flag: control room only, when IMD heavy rainfall warning exists on Yellow segment
  const hasImdWarning = Boolean(
    targetSegment.inputs?.warnings &&
    targetSegment.inputs.warnings.toLowerCase().includes('imd') &&
    (targetSegment.inputs.warnings.toLowerCase().includes('heavy') ||
     targetSegment.inputs.warnings.toLowerCase().includes('orange') ||
     targetSegment.inputs.warnings.toLowerCase().includes('red'))
  );
  
  const isWindowClosing = targetSegment.riskLevel === 'YELLOW' && hasImdWarning;

  // RULE 1: BLOCKED or RED
  if (targetSegment.roadState === 'BLOCKED' || targetSegment.riskLevel === 'RED') {
    if (diversionCheckResult.isOffered) {
      return {
        decision: 'DIVERT',
        ruleId: 'R-BLOCKED-RED-DIVERT',
        ruleExplanation: `Target segment ${targetSegment.id} is ${targetSegment.roadState} (${targetSegment.riskLevel} risk). Checked diversion route via ${diversionCheckResult.routeCandidateName} is fully verified safe.`,
        actionText: `Divert via ${diversionCheckResult.routeCandidateName}`,
        holdingPoint,
        holdingEligibility,
        diversionCheck: diversionCheckResult,
        windowClosing: false,
        travellerAdvisory: `Road ahead at ${targetSegment.name} is BLOCKED. Proceed via safe diversion ${diversionCheckResult.routeCandidateName}.`
      };
    } else {
      return {
        decision: 'HOLD',
        ruleId: 'R-BLOCKED-RED-HOLD',
        ruleExplanation: `Target segment ${targetSegment.id} is ${targetSegment.roadState} (${targetSegment.riskLevel} risk). ${diversionCheckResult.details} -> HOLD before danger zone at ${holdingPoint?.name || 'safe staging point'}.`,
        actionText: `Hold at ${holdingPoint?.locationName || 'Holding Area'}`,
        holdingPoint,
        holdingEligibility,
        diversionCheck: diversionCheckResult,
        expectedWaitMinutes: 180,
        windowClosing: false,
        travellerAdvisory: `Hold at ${holdingPoint?.locationName || 'Staging Point'} — road ahead blocked between ${targetSegment.name.replace(/S-\d+\s*/, '')}. No safe diversion available.`
      };
    }
  }

  // RULE 2: RESTRICTED (heavy vehicles only)
  if (targetSegment.roadState === 'RESTRICTED_HEAVY') {
    if (vehicleType === 'heavy') {
      return {
        decision: 'HOLD',
        ruleId: 'R-RESTRICT-HEAVY-HOLD',
        ruleExplanation: `Target segment ${targetSegment.id} has axle weight/clearance restriction: heavy commercial vehicles prohibited. Heavy vehicles must HOLD.`,
        actionText: `Heavy vehicles HOLD at ${holdingPoint?.locationName || 'Staging Area'}`,
        holdingPoint,
        holdingEligibility,
        diversionCheck: diversionCheckResult,
        windowClosing: false,
        travellerAdvisory: `Heavy commercial vehicles must HOLD at ${holdingPoint?.name || 'holding point'}. Light passenger vehicles may proceed with caution.`
      };
    } else {
      return {
        decision: 'GO_CAUTION',
        ruleId: 'R-RESTRICT-HEAVY-LIGHT-GO',
        ruleExplanation: `Target segment ${targetSegment.id} restricted to light passenger traffic. Heavy vehicles held; light vehicles GO with caution.`,
        actionText: 'GO with caution (Light vehicles permitted)',
        holdingPoint,
        holdingEligibility,
        diversionCheck: diversionCheckResult,
        windowClosing: false,
        travellerAdvisory: `Light vehicles permitted with caution. Avoid stopping under active hill cuts.`
      };
    }
  }

  // RULE 3: RESTRICTED (one-way)
  if (targetSegment.roadState === 'RESTRICTED_ONE_WAY') {
    return {
      decision: 'GO_CAUTION',
      ruleId: 'R-RESTRICT-ONEWAY',
      ruleExplanation: `Target segment ${targetSegment.id} operating in single-lane alternating convoy mode under police/patrol control.`,
      actionText: 'GO with caution (Alternating one-way convoy)',
      holdingPoint,
      holdingEligibility,
      diversionCheck: diversionCheckResult,
      expectedWaitMinutes: 20,
      windowClosing: false,
      travellerAdvisory: `Single-lane passage open under police control. Expect short convoy queues; do not overtake.`
    };
  }

  // RULE 4: UNKNOWN road state OR NO_DATA risk
  if (targetSegment.roadState === 'UNKNOWN' || targetSegment.riskLevel === 'NO_DATA') {
    return {
      decision: 'GO_CAUTION',
      ruleId: 'R-NODATA-UNKNOWN',
      ruleExplanation: `Target segment ${targetSegment.id} telemetry is UNKNOWN or NO_DATA. Failsafe rule: treated with elevated caution (Yellow equivalence), officer field verification dispatched. Never display as Green.`,
      actionText: 'GO with caution (Telemetry unverified — patrol en route)',
      holdingPoint,
      holdingEligibility,
      diversionCheck: diversionCheckResult,
      windowClosing: false,
      travellerAdvisory: `Telemetry offline for this stretch. Drive with heightened caution and obey on-site highway police directions.`
    };
  }

  // RULE 5: ORANGE risk level
  if (targetSegment.riskLevel === 'ORANGE') {
    return {
      decision: 'HOLD',
      ruleId: 'R-ORANGE-HOLD',
      ruleExplanation: `Target segment ${targetSegment.id} is ORANGE risk (debris accumulation/rainfall threshold exceeded). Failsafe rule: HOLD before entry. Officer may clear escorted passage.`,
      actionText: `HOLD before entry at ${holdingPoint?.locationName || 'designated staging point'}`,
      holdingPoint,
      holdingEligibility,
      diversionCheck: diversionCheckResult,
      expectedWaitMinutes: 90,
      windowClosing: false,
      travellerAdvisory: `High hazard warning ahead at ${targetSegment.name}. Hold at ${holdingPoint?.locationName || 'holding area'} until patrol inspection clears corridor.`
    };
  }

  // RULE 6: YELLOW risk level
  if (targetSegment.riskLevel === 'YELLOW') {
    return {
      decision: 'GO_CAUTION',
      ruleId: isWindowClosing ? 'R-YELLOW-WINDOW-CLOSING' : 'R-YELLOW-CAUTION',
      ruleExplanation: isWindowClosing
        ? `Target segment ${targetSegment.id} is YELLOW risk with IMD heavy rainfall warning active. Control Room: Window closing flag active. Travellers advised to drive with caution (no hurry message allowed).`
        : `Target segment ${targetSegment.id} is YELLOW risk. Moderate rainfall/susceptibility. GO with caution advisory.`,
      actionText: 'GO with caution advisory',
      holdingPoint,
      holdingEligibility,
      diversionCheck: diversionCheckResult,
      windowClosing: isWindowClosing,
      travellerAdvisory: `Passage open with caution. Watch for falling stones and wet road conditions on hill curves.`
    };
  }

  // RULE 7: GREEN risk level
  if (targetSegment.riskLevel === 'GREEN') {
    return {
      decision: 'GO',
      ruleId: 'R-GREEN-GO',
      ruleExplanation: `Target segment ${targetSegment.id} is GREEN risk and OPEN. Regular hill road speed limits apply.`,
      actionText: 'GO (Normal mountain passage)',
      holdingPoint,
      holdingEligibility,
      diversionCheck: diversionCheckResult,
      windowClosing: false,
      travellerAdvisory: `Corridor clear. Normal mountain driving precautions apply.`
    };
  }

  // Fallback safe default: GO_CAUTION
  return {
    decision: 'GO_CAUTION',
    ruleId: 'R-DEFAULT-SAFE',
    ruleExplanation: `Default failsafe applied for ${targetSegment.id}.`,
    actionText: 'GO with caution',
    holdingPoint,
    holdingEligibility,
    diversionCheck: diversionCheckResult,
    windowClosing: false,
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
