import { ClosureType, Config, IncidentState, Role, RoadState, SegmentInputs, Session, Snapshot, AlertLanguage, Report, CrewAssignment } from '../types';

/**
 * Frontend <-> backend contract. `mockApi` implements it in the browser with sample data;
 * `httpApi` calls the FastAPI backend (see docs/API_CONTRACT.md). Pages only use this interface.
 */

export type PhotoInput =
  | { kind: 'sample'; sampleId: string }
  | { kind: 'upload'; dataUrl: string; fileName: string };

export interface NewReportInput {
  segmentId: string;
  lat: number | null;
  lon: number | null;
  locationText: string;
  note: string;
  photo: PhotoInput;
  capturedAt?: string;
  reporterName?: string;
}

export interface IncidentPatch {
  state?: Extract<IncidentState, 'clearance_in_progress'>;
  reopeningEstimate?: string | null;
  crew?: CrewAssignment;
  equipment?: string[];
}

export interface ZonePatch {
  extentKm?: number;
  fallbackHoldingPointIds?: string[];
}

export interface ResilionApi {
  readonly mode: 'mock' | 'http';
  login(userId: string, role: Role): Promise<Session>;
  getSnapshot(session: Session): Promise<Snapshot>;

  // F3 Verified Ground Reports
  submitReport(session: Session, input: NewReportInput): Promise<Report>;
  confirmReport(session: Session, reportId: string, newState: Exclude<RoadState, 'OPEN' | 'UNKNOWN'>): Promise<void>;
  rejectReport(session: Session, reportId: string): Promise<void>;

  // F2 Safe Passage and Closure Engine
  clearPassage(session: Session, zoneId: string): Promise<void>;
  draftAlert(session: Session, segmentId: string): Promise<void>;
  decideApproval(session: Session, approvalId: string, approve: boolean, closureType?: ClosureType): Promise<void>;
  updateIncident(session: Session, incidentId: string, patch: IncidentPatch): Promise<void>;
  requestReopening(session: Session, incidentId: string, to: 'one_way' | 'full'): Promise<void>;

  // F4 Alerts
  editAlertText(session: Session, alertId: string, lang: AlertLanguage, text: string): Promise<void>;

  // Administration (NFR-09) and sample input feed
  updateConfig(session: Session, patch: Partial<Config>): Promise<void>;
  updateZone(session: Session, zoneId: string, patch: ZonePatch): Promise<void>;
  updateSegmentInputs(session: Session, segmentId: string, patch: Partial<SegmentInputs>): Promise<void>;
  resetSampleData(session: Session): Promise<void>;
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'ApiError';
  }
}
