import { AiClassification, Config, Report, ReportChecks, ReportRoute, Role, Segment } from '../types';

/** Haversine distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Shortest distance from a point to the corridor polyline (sampled along each leg). */
export function distanceToCorridorKm(point: [number, number], segments: Segment[]): number {
  let best = Infinity;
  for (const s of segments) {
    const c = s.coordinates;
    for (let i = 0; i < c.length; i++) {
      if (i === c.length - 1) {
        best = Math.min(best, distanceKm(point, c[i]));
        continue;
      }
      for (let t = 0; t <= 10; t++) {
        const p: [number, number] = [c[i][0] + ((c[i + 1][0] - c[i][0]) * t) / 10, c[i][1] + ((c[i + 1][1] - c[i][1]) * t) / 10];
        best = Math.min(best, distanceKm(point, p));
      }
    }
  }
  return best;
}

export interface CheckInput {
  id: string;
  capturedAt: string;
  segmentId: string;
  lat: number | null;
  lon: number | null;
  reporterName: string;
}

/**
 * FR-22 automatic checks. Only structured fields are read; the free-text note is never interpreted (BR-10).
 */
export function runReportChecks(
  report: CheckInput,
  existing: Report[],
  segments: Segment[],
  config: Config,
  now: Date = new Date()
): ReportChecks {
  const segKnown = segments.some(s => s.id === report.segmentId);
  let distance: number | null = null;
  if (report.lat !== null && report.lon !== null) {
    distance = Math.round(distanceToCorridorKm([report.lat, report.lon], segments) * 100) / 100;
  }
  const insideCorridor = segKnown && (distance === null || distance <= config.corridorBufferKm);

  const ageMinutes = Math.max(0, Math.round((now.getTime() - new Date(report.capturedAt).getTime()) / 60000));
  const recent = ageMinutes <= config.reportMaxAgeMinutes;

  // AC-16: group reports of one slide within distance and time window.
  const capturedMs = new Date(report.capturedAt).getTime();
  const candidates = existing
    .filter(r => r.id !== report.id && r.status !== 'rejected' && r.route !== 'flagged')
    .filter(r => Math.abs(new Date(r.capturedAt).getTime() - capturedMs) <= config.duplicateWindowMinutes * 60000)
    .filter(r => {
      if (report.lat !== null && report.lon !== null && r.lat !== null && r.lon !== null) {
        return distanceKm([report.lat, report.lon], [r.lat, r.lon]) <= config.duplicateDistanceKm;
      }
      return r.segmentId === report.segmentId;
    })
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const first = candidates[0];

  return {
    insideCorridor,
    distanceToCorridorKm: distance,
    recent,
    ageMinutes,
    duplicateOf: first?.id,
    groupId: first ? first.checks.groupId : `GRP-${report.id}`,
    reporterReportCount: existing.filter(r => r.reporterName === report.reporterName).length
  };
}

/**
 * FR-23 / FR-26 routing.
 * - Outside corridor or too old -> flagged, not routed as a valid new incident (AC-15).
 * - AI unavailable -> manual review (AC-20).
 * - clear / not relevant -> logged only.
 * - debris, crack (and other hazards) -> officer queue, ordered by confidence.
 */
/** Reporters whose photo is never only logged on the model's word: field staff (patrol, officer, road engineer). */
export const TRUSTED_REPORTERS: Role[] = ['patrol', 'officer', 'road_engineer'];

/**
 * FR-22/23 routing. A "clear" / "not_relevant" photo is only logged when the reporter is the public AND the model is
 * confident; from field staff, or below `confidenceThreshold`, it goes to the officer queue, so a model "clear" can
 * never hide a hazard a trusted reporter photographed (BR-07: the model never decides).
 */
export function routeReport(
  checks: ReportChecks, ai: AiClassification | null, reporterRole?: Role, confidenceThreshold = 0.7
): ReportRoute {
  if (!checks.insideCorridor || !checks.recent) return 'flagged';
  if (!ai) return 'manual_review';
  if (ai.hazardClass === 'clear' || ai.hazardClass === 'not_relevant') {
    const trusted = reporterRole !== undefined && TRUSTED_REPORTERS.includes(reporterRole);
    return trusted || ai.confidence < confidenceThreshold ? 'officer_queue' : 'log_only';
  }
  return 'officer_queue';
}

/** Officer queue order: highest AI confidence first. */
export function sortQueue(reports: Report[]): Report[] {
  return [...reports].sort((a, b) => (b.ai?.confidence ?? 0) - (a.ai?.confidence ?? 0));
}
