import test from 'node:test';
import assert from 'node:assert/strict';
import { runReportChecks, routeReport, sortQueue } from './reportChecks';
import { DEFAULT_CONFIG } from './config';
import { seg } from './testUtils';
import { AiClassification, Report, Segment } from '../types';

const NOW = new Date('2026-11-01T10:00:00Z');
const S07: Segment = { ...seg('S-07', 'OPEN', 'YELLOW'), coordinates: [[25.12, 92.99], [25.05, 92.89]] };
const SEGS = [S07];
const debris: AiClassification = { hazardClass: 'debris', blockedShare: 100, confidence: 0.9, model: 'x', simulated: true };

const input = (o: Partial<{ id: string; capturedAt: string; segmentId: string; lat: number | null; lon: number | null }> = {}) => ({
  id: 'R1', capturedAt: '2026-11-01T09:55:00Z', segmentId: 'S-07', lat: 25.1, lon: 92.96, reporterName: 'HP-03', ...o
});

function asReport(i: ReturnType<typeof input>, groupId: string): Report {
  return {
    ...i, createdAt: i.capturedAt, channel: 'web', reporterRole: 'patrol', locationText: '', photoUrl: '', note: '',
    ai: debris, checks: { insideCorridor: true, distanceToCorridorKm: 0, recent: true, ageMinutes: 0, groupId, reporterReportCount: 0 },
    route: 'officer_queue', status: 'unverified'
  };
}

test('AC-15: report outside the corridor is flagged, not routed as a new incident', () => {
  const c = runReportChecks(input({ lat: 26.5, lon: 91.7 }), [], SEGS, DEFAULT_CONFIG, NOW);
  assert.equal(c.insideCorridor, false);
  assert.equal(routeReport(c, debris), 'flagged');
});

test('AC-15: report older than the configured limit is flagged', () => {
  const c = runReportChecks(input({ capturedAt: '2026-11-01T05:00:00Z' }), [], SEGS, DEFAULT_CONFIG, NOW);
  assert.equal(c.recent, false);
  assert.equal(routeReport(c, debris), 'flagged');
});

test('AC-16: reports of one slide within distance and window share one group', () => {
  const first = asReport(input({ id: 'R1' }), 'GRP-R1');
  const c = runReportChecks(input({ id: 'R2', capturedAt: '2026-11-01T09:58:00Z', lat: 25.101, lon: 92.961 }), [first], SEGS, DEFAULT_CONFIG, NOW);
  assert.equal(c.duplicateOf, 'R1');
  assert.equal(c.groupId, 'GRP-R1');
  const far = runReportChecks(input({ id: 'R3', lat: 25.06, lon: 92.9 }), [first], SEGS, DEFAULT_CONFIG, NOW);
  assert.equal(far.duplicateOf, undefined);
});

test('AC-20 / FR-26: AI unavailable -> manual review', () => {
  const c = runReportChecks(input(), [], SEGS, DEFAULT_CONFIG, NOW);
  assert.equal(routeReport(c, null), 'manual_review');
});

test('FR-23: debris/crack to officer queue; clear/not relevant logged only; queue by confidence', () => {
  const c = runReportChecks(input(), [], SEGS, DEFAULT_CONFIG, NOW);
  assert.equal(routeReport(c, debris), 'officer_queue');
  assert.equal(routeReport(c, { ...debris, hazardClass: 'crack' }), 'officer_queue');
  assert.equal(routeReport(c, { ...debris, hazardClass: 'clear' }), 'log_only');
  assert.equal(routeReport(c, { ...debris, hazardClass: 'not_relevant' }), 'log_only');
  const a = { ...asReport(input({ id: 'A' }), 'g'), ai: { ...debris, confidence: 0.6 } };
  const b = { ...asReport(input({ id: 'B' }), 'g'), ai: { ...debris, confidence: 0.95 } };
  assert.deepEqual(sortQueue([a, b]).map(r => r.id), ['B', 'A']);
});

test('FR-23 / BR-07: a model "clear" never hides a hazard from field staff or at low confidence', () => {
  const c = runReportChecks(input(), [], SEGS, DEFAULT_CONFIG, NOW);
  const t = DEFAULT_CONFIG.aiConfidenceThreshold;
  for (const hazardClass of ['clear', 'not_relevant'] as const) {
    const sure = { ...debris, hazardClass, confidence: 0.95 };
    for (const role of ['patrol', 'officer', 'road_engineer'] as const) assert.equal(routeReport(c, sure, role, t), 'officer_queue', role);
    assert.equal(routeReport(c, sure, 'public_reporter', t), 'log_only');
    assert.equal(routeReport(c, { ...sure, confidence: t - 0.01 }, 'public_reporter', t), 'officer_queue');
    assert.equal(routeReport(c, { ...sure, confidence: t }, 'public_reporter', t), 'log_only');
  }
  assert.equal(routeReport(c, debris, 'public_reporter', t), 'officer_queue');
});
