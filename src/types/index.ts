export type RiskLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'NO_DATA';

export type RoadState = 'OPEN' | 'RESTRICTED_HEAVY' | 'RESTRICTED_ONE_WAY' | 'BLOCKED' | 'UNKNOWN';

export type DecisionType = 'GO' | 'GO_CAUTION' | 'HOLD' | 'DIVERT' | 'CLOSE';

export type DemoRole = 
  | 'control_officer'
  | 'second_approver'
  | 'road_engineer'
  | 'patrol'
  | 'traveller'
  | 'admin';

export interface SegmentInputs {
  susceptibility: 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';
  slope: string;
  rainfall24h: number; // mm
  rainfall3d: number; // mm
  rainfall7d: number; // mm
  pastIncidents: number;
  warnings: string;
  freshness: string;
}

export interface Segment {
  id: string; // e.g., 'S-07'
  name: string; // e.g., 'S-07 Jatinga–Harangajao'
  kmRange: string; // 'km 166–178'
  startKm: number;
  endKm: number;
  coordinates: [number, number][]; // corridor line geometry
  center: [number, number];
  roadState: RoadState;
  riskLevel: RiskLevel;
  reasons: string[];
  freshness: string;
  validUntil: string; // countdown or ISO timestamp
  inputs: SegmentInputs;
  windowClosing?: boolean;
  lengthKm: number;
  elevationM: number;
}

export interface ApproachZone {
  id: string; // 'AZ-07N'
  name: string; // 'AZ-07N from Haflong side'
  direction: 'Northbound' | 'Southbound';
  segmentId: string; // target segment 'S-07'
  targetSegmentName: string;
  nearestHoldingPointId: string;
  locationKm: string;
  diversionRoutes?: {
    name: string;
    description: string;
    segmentIds: string[];
  }[];
}

export interface SafeHoldingPoint {
  id: string; // 'HP-HAFLONG'
  name: string; // 'Haflong Safe Holding Area'
  locationName: string; // 'Haflong Junction Staging Area'
  facilities: string[]; // ['Food stalls', 'Fuel', 'Emergency shelter', 'Heavy vehicle staging', 'Medical aid']
  segmentId: string; // segment where it sits
  capacityVehicles: number;
  currentOccupancy: number;
  statusNote: string;
}

export interface DecisionResult {
  decision: DecisionType;
  ruleId: string;
  ruleExplanation: string;
  actionText: string;
  holdingPoint?: SafeHoldingPoint;
  holdingEligibility: {
    isEligible: boolean;
    reason: string;
  };
  diversionCheck: {
    isOffered: boolean;
    routeCandidateName?: string;
    details: string;
  };
  expectedWaitMinutes?: number;
  windowClosing: boolean;
  travellerAdvisory: string;
}

export interface FieldReport {
  id: string;
  timestamp: string;
  submitterRole: string;
  locationText: string;
  segmentId: string;
  photoUrl: string;
  notes: string;
  aiClassification: {
    hazardClass: string;
    blockagePercent: number;
    confidence: number;
    suggestion: string;
  };
  checks: {
    insideCorridor: boolean;
    recent: boolean;
    duplicateGroup?: string;
  };
  status: 'unverified' | 'corroborated' | 'confirmed' | 'rejected';
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface IncidentCrew {
  unitName: string;
  leader: string;
  contact: string;
  equipment: string[];
  dispatchedAt: string;
}

export interface Incident {
  id: string;
  segmentId: string;
  title: string;
  status: 'reported' | 'verified' | 'closed' | 'clearance_in_progress' | 'reopened_oneway' | 'reopened_full';
  reportedAt: string;
  verifiedAt?: string;
  closedAt?: string;
  reopeningEstimate: string; // e.g. "4:00 PM"
  actualReopenedAt?: string;
  crewAssigned?: IncidentCrew;
  equipmentList: string[];
  notes: string[];
}

export interface ClosureApproval {
  id: string;
  segmentId: string;
  recommendedDecision: 'CLOSE';
  closureType: 'FULL' | 'HEAVY_ONLY' | 'ONE_WAY';
  status: 'pending' | 'approved' | 'rejected';
  escalationTimeRemainingSec: number;
  approvedBy?: string;
  approvedAt?: string;
  drafts: {
    en: string;
    hi: string;
    as: string;
    bn: string;
    dimasa: string;
  };
  validation: {
    placesMatch: boolean;
    timesMatch: boolean;
    decisionMatch: boolean;
    blockedExample?: {
      language: string;
      error: string;
      snippet: string;
    };
  };
  capXml: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorRole: string;
  action: string;
  segmentId?: string;
  ruleUsed?: string;
  beforeState?: string;
  afterState?: string;
  details: string;
  verified: boolean;
}

export interface StoryStepInfo {
  step: number;
  title: string;
  shortDesc: string;
  route: string;
  roleHint: DemoRole;
}
