/**
 * RESILION 2.0 domain types — PRD v1.0 §11.1 data entities.
 * These are the shapes exchanged with the backend (see docs/API_CONTRACT.md).
 * All timestamps are ISO 8601 strings.
 */

export type RiskLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'NO_DATA';

export type RoadState = 'OPEN' | 'RESTRICTED_HEAVY' | 'RESTRICTED_ONE_WAY' | 'BLOCKED' | 'UNKNOWN';

/** Traveller decision (FR-09). CLOSE is a control-room action, carried separately. */
export type DecisionType = 'GO' | 'GO_CAUTION' | 'HOLD' | 'DIVERT';

/** PRD §8 roles. */
export type Role = 'officer' | 'second_approver' | 'road_engineer' | 'patrol' | 'public_reporter' | 'admin';

export type Direction = 'Northbound' | 'Southbound';

export type Susceptibility = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';

export type ImdWarning = 'NONE' | 'YELLOW' | 'ORANGE' | 'RED';

/** FR-02 inputs. `null` = missing (BR-06). */
export interface SegmentInputs {
  /** Category label. With a model score it is derived from the score (display only). */
  susceptibility: Susceptibility | null;
  /** 0–1 landslide susceptibility from the trained model; replaces the category in the Risk Index when present. */
  susceptibilityScore?: number | null;
  modelVersion?: string;
  /** Date of the IMD rainfall used (historical scenario), e.g. "2022-05-15". Absent for sample values. */
  rainfallDate?: string;
  /** Short source labels shown in the segment drawer. */
  sources?: { terrain?: string; rainfall?: string; history?: string };
  slopeDeg: number | null;
  rainfall24h: number | null;
  rainfall3d: number | null;
  rainfall7d: number | null;
  pastIncidents: number | null;
  imdWarning: ImdWarning;
  gsiBulletin: boolean;
  updatedAt: string;
  /** Inputs are scenario values until real feeds are wired. */
  sample: boolean;
}

export interface Segment {
  id: string;
  name: string;
  startKm: number;
  endKm: number;
  coordinates: [number, number][];
  center: [number, number];
  roadState: RoadState;
  riskLevel: RiskLevel;
  riskIndex: number | null;
  reasons: string[];
  computedAt: string;
  validUntil: string;
  inputs: SegmentInputs;
}

export interface DiversionRoute {
  name: string;
  segmentIds: string[];
}

export interface ApproachZone {
  id: string;
  name: string;
  direction: Direction;
  segmentId: string;
  /** Point where the zone starts (geofence centre) and its extent. */
  center: [number, number];
  extentKm: number;
  locationKm: number;
  nearestHoldingPointId: string;
  /** BR-04: next points back, in order. */
  fallbackHoldingPointIds?: string[];
  diversionRoutes?: DiversionRoute[];
}

export interface SafeHoldingPoint {
  id: string;
  name: string;
  shortName: string;
  locationName: string;
  facilities: string[];
  segmentId: string;
  /** null = unknown (OSM has no capacity); never invented. */
  capacityVehicles: number | null;
  /** Where the point comes from, e.g. 'osm:245731951'; absent in sample data. */
  source?: string;
  /** Checked on the ground by the district (false until confirmed). */
  verified?: boolean;
  /** Real location when known (OSM); the map otherwise uses the host segment's centre. */
  lat?: number;
  lon?: number;
  provisional: boolean;
}

export interface DecisionResult {
  decision: DecisionType;
  ruleId: string;
  ruleExplanation: string;
  actionText: string;
  holdingPoint?: SafeHoldingPoint;
  holdingEligibility: { isEligible: boolean; reason: string };
  diversionCheck: { isOffered: boolean; routeCandidateName?: string; details: string };
  expectedWaitMinutes?: number;
  windowClosing: boolean;
  closeRecommended: boolean;
  travellerAdvisory: string;
}

/** Current decision per approach zone (FR-09, FR-18). */
export interface ZoneDecision {
  zoneId: string;
  segmentId: string;
  /** Decision for light vehicles / all traffic. */
  result: DecisionResult;
  /** Present only when heavy vehicles get a different decision (RESTRICTED heavy-only). */
  heavyResult?: DecisionResult;
  officerClearedPassage?: { by: string; at: string };
  at: string;
}

/** FR-18 / §11.1 Decision record (append-only). */
export interface DecisionRecord {
  id: string;
  at: string;
  zoneId: string;
  segmentId: string;
  decision: DecisionType;
  heavyDecision?: DecisionType;
  ruleId: string;
  inputs: { roadState: RoadState; riskLevel: RiskLevel; riskIndex: number | null; imdWarning: ImdWarning };
  holdingPointId?: string;
  diversion?: string;
  expectedWaitMinutes?: number;
  windowClosing: boolean;
  closeRecommended: boolean;
  trigger: string;
  /** SM3: upload → decision ready, excluding officer think time. */
  reportToDecisionMs?: number;
  reportId?: string;
}

export type HazardClass = 'debris' | 'crack' | 'fallen_tree' | 'water' | 'clear' | 'not_relevant';

export interface AiClassification {
  hazardClass: HazardClass;
  blockedShare: number; // 0–100
  confidence: number; // 0–1
  model: string;
  simulated: boolean;
}

export type ReportRoute = 'officer_queue' | 'manual_review' | 'flagged' | 'log_only';

export type ReportStatus = 'unverified' | 'corroborated' | 'confirmed' | 'rejected';

export interface ReportChecks {
  insideCorridor: boolean;
  distanceToCorridorKm: number | null;
  recent: boolean;
  ageMinutes: number;
  duplicateOf?: string;
  groupId: string;
  reporterReportCount: number;
}

export interface Report {
  id: string;
  createdAt: string;
  capturedAt: string;
  queuedAt?: string;
  channel: 'web' | 'field_app';
  reporterName: string;
  reporterRole: Role;
  segmentId: string;
  lat: number | null;
  lon: number | null;
  locationText: string;
  photoUrl: string;
  note: string;
  ai: AiClassification | null;
  aiError?: string;
  checks: ReportChecks;
  route: ReportRoute;
  status: ReportStatus;
  incidentId?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export type ClosureType = 'FULL' | 'HEAVY_ONLY' | 'ONE_WAY';

export type IncidentState =
  | 'reported'
  | 'verified'
  | 'closed'
  | 'clearance_in_progress'
  | 'reopened_one_way'
  | 'reopened_full';

export interface CrewAssignment {
  unitName: string;
  leader: string;
  contact: string;
  dispatchedAt: string;
}

export interface Incident {
  id: string;
  segmentId: string;
  state: IncidentState;
  closureType?: ClosureType;
  openedAt: string;
  reportIds: string[];
  crew?: CrewAssignment;
  reopeningEstimate?: string;
  equipment: string[];
  log: { at: string; by: string; text: string }[];
}

export type ApprovalKind = 'closure' | 'reopening' | 'alert';
/** 'withdrawn': a CLOSE recommendation the rules no longer support, withdrawn by the decision engine (never approved by it). */
export type ApprovalStatus = 'pending' | 'escalated' | 'approved' | 'rejected' | 'withdrawn';

export interface Approval {
  id: string;
  kind: ApprovalKind;
  segmentId: string;
  incidentId?: string;
  alertId?: string;
  /** closure: recommended/selected closure type. reopening: target. */
  closureType?: ClosureType;
  reopenTo?: 'one_way' | 'full';
  reason: string;
  status: ApprovalStatus;
  createdAt: string;
  escalateAt: string;
  escalatedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export type AlertTemplate = 'HOLD' | 'DIVERT' | 'CLOSE' | 'CAUTION' | 'REOPEN';
export type AlertLanguage = 'en' | 'hi' | 'as' | 'bn' | 'dis';

export interface AlertValidation {
  ok: boolean;
  errors: string[];
}

export interface AlertText {
  lang: AlertLanguage;
  text: string;
  source: 'llm' | 'template' | 'officer_edit' | 'pending_translation';
  validation: AlertValidation;
  /** BR-09: when validation fails the officer receives the plain template. */
  blocked: boolean;
}

export interface AlertFields {
  segmentId: string;
  place: string;
  template: AlertTemplate;
  zones: { zoneId: string; direction: Direction; decision: DecisionType; place?: string }[];
  noSafeDiversion: boolean;
  reopeningEstimate?: string; // clock text, e.g. "4:00 PM"
  certainty: 'Observed' | 'Likely';
}

export interface Alert {
  id: string;
  createdAt: string;
  segmentId: string;
  zoneIds: string[];
  fields: AlertFields;
  texts: AlertText[];
  status: 'draft' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  capXml?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  role: Role | 'system';
  action: string;
  entity?: string;
  before?: string;
  after?: string;
  details: string;
}

/** NFR-09: configuration, not code. */
export interface Config {
  weights: { susceptibility: number; rainfall: number; slope: number; history: number };
  thresholds: { yellow: number; orange: number; red: number };
  validityHours: number;
  staleInputHours: number;
  approachZoneExtentKm: number;
  duplicateWindowMinutes: number;
  duplicateDistanceKm: number;
  reportMaxAgeMinutes: number;
  corridorBufferKm: number;
  aiConfidenceThreshold: number;
  escalationMinutes: number;
  retentionDays: number;
  aiServiceOnline: boolean;
  /** Real corridor only: date of the IMD rainfall used for the rainfall inputs (YYYY-MM-DD). */
  scenarioDate?: string;
}

/** Where the corridor data comes from (backend snapshot). Absent or 'sample' = 12-segment sample seed. */
export interface CorridorMeta {
  source: 'postgis' | 'sample';
  scenarioDate?: string;
  segments?: number;
  zones?: number;
  modelVersion?: string | null;
  modelCv?: { roc_auc_mean: number; roc_auc_std: number; pr_auc_mean: number; pr_auc_std: number } | null;
}

export interface Session {
  userId: string;
  name: string;
  role: Role;
  token: string;
}

export interface Snapshot {
  serverTime: string;
  segments: Segment[];
  zones: ApproachZone[];
  holdingPoints: SafeHoldingPoint[];
  decisions: ZoneDecision[];
  decisionRecords: DecisionRecord[];
  reports: Report[];
  incidents: Incident[];
  approvals: Approval[];
  alerts: Alert[];
  audit: AuditEntry[];
  config: Config;
  corridor?: CorridorMeta;
}
