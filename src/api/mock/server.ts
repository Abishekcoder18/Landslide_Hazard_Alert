import {
  Alert,
  AlertFields,
  AlertTemplate,
  Approval,
  ApproachZone,
  AuditEntry,
  ClosureType,
  Config,
  DecisionRecord,
  Incident,
  Report,
  Role,
  RoadState,
  SafeHoldingPoint,
  Segment,
  SegmentInputs,
  Session,
  Snapshot,
  ZoneDecision,
  AlertLanguage
} from '../../types';
import { DEFAULT_CONFIG } from '../../domain/config';
import { applyRisk, effectiveRiskLevel } from '../../domain/riskIndex';
import { evaluateZoneAhead, segmentsAhead } from '../../domain/decisionEngine';
import { routeReport, runReportChecks } from '../../domain/reportChecks';
import { applyOfficerEdit, buildAlertTexts, buildCap } from '../../domain/alerts';
import { assertCan, canDecideApproval, PermissionError, ROLE_LABEL } from '../../domain/permissions';
import { ApiError, IncidentPatch, NewReportInput, ZonePatch } from '../types';
import { SAMPLE_PHOTOS, SEED_HOLDING_POINTS, seedReports, seedSegments, seedZones } from './seed';

/** Clock text used in alerts and traveller messages, e.g. "4:00 PM". */
export function clockText(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const OPEN_INCIDENT = (i: Incident) => i.state !== 'reopened_full';

interface State {
  config: Config;
  segments: Record<string, Segment>;
  zones: ApproachZone[];
  holdingPoints: Record<string, SafeHoldingPoint>;
  reports: Report[];
  incidents: Incident[];
  approvals: Approval[];
  alerts: Alert[];
  decisions: Record<string, ZoneDecision>;
  decisionRecords: DecisionRecord[];
  audit: AuditEntry[];
  overrides: Record<string, { by: string; at: string }>;
  seq: number;
}

/**
 * In-browser implementation of the backend workflow (sample data). The FastAPI backend implements the same
 * behaviour against PostGIS; this class is the reference for it.
 */
export class MockServer {
  private s!: State;
  constructor(private clock: () => Date = () => new Date()) {
    this.reset();
  }

  // ---------- helpers ----------
  private now() {
    return this.clock();
  }
  private iso() {
    return this.now().toISOString();
  }
  private id(prefix: string) {
    this.s.seq += 1;
    return `${prefix}-${String(this.s.seq).padStart(4, '0')}`;
  }
  private actor(session: Session) {
    return `${session.name} (${ROLE_LABEL[session.role]})`;
  }
  private audit(actor: string, role: Role | 'system', action: string, details: string, extra: Partial<AuditEntry> = {}) {
    // FR-34: append-only — entries are only ever added.
    this.s.audit.unshift({ id: this.id('AUD'), at: this.iso(), actor, role, action, details, ...extra });
  }
  private guard(session: Session, fn: () => void) {
    try {
      fn();
    } catch (e) {
      if (e instanceof PermissionError) {
        this.audit(this.actor(session), session.role, 'Action refused', e.message);
        throw new ApiError(e.message, 403);
      }
      throw e;
    }
  }
  private segment(id: string) {
    const seg = this.s.segments[id];
    if (!seg) throw new ApiError(`Unknown segment ${id}`, 404);
    return seg;
  }
  private openIncident(segmentId: string) {
    return this.s.incidents.find(i => i.segmentId === segmentId && OPEN_INCIDENT(i));
  }
  private placeOf(seg: Segment) {
    return seg.name;
  }
  private knownPlaces(): string[] {
    const names = new Set<string>();
    Object.values(this.s.holdingPoints).forEach(h => names.add(h.shortName));
    this.s.zones.forEach(z => z.diversionRoutes?.forEach(r => names.add(r.name)));
    return [...names];
  }

  reset() {
    const now = this.now();
    const config = { ...DEFAULT_CONFIG };
    const segments: Record<string, Segment> = {};
    for (const seg of seedSegments(now)) segments[seg.id] = applyRisk(seg, config, now);
    const holdingPoints: Record<string, SafeHoldingPoint> = {};
    SEED_HOLDING_POINTS.forEach(h => (holdingPoints[h.id] = { ...h }));
    this.s = {
      config,
      segments,
      zones: seedZones(Object.values(segments), config.approachZoneExtentKm),
      holdingPoints,
      reports: [],
      incidents: [],
      approvals: [],
      alerts: [],
      decisions: {},
      decisionRecords: [],
      audit: [],
      overrides: {},
      seq: 0
    };
    for (const r of seedReports(now)) {
      const checks = runReportChecks(r, this.s.reports, Object.values(segments), config, now);
      const report: Report = { ...r, checks, route: routeReport(checks, r.ai, r.reporterRole, config.aiConfidenceThreshold), status: checks.duplicateOf ? 'corroborated' : 'unverified' };
      this.s.reports.unshift(report);
    }
    this.audit('System', 'system', 'Sample data loaded', 'Initial corridor NH-27 Dima Hasao · sample inputs');
    this.recompute('Initial evaluation');
  }

  // ---------- engine ----------
  /** FR-09 / FR-18: evaluate every approach zone; record changes in the decision record. */
  private recompute(trigger: string, ctx: { reportId?: string; reportToDecisionMs?: number } = {}) {
    const now = this.now();
    const segs = this.s.segments;
    // BR-12: expired levels are shown as No data for decisions.
    const effective: Record<string, Segment> = {};
    for (const [id, seg] of Object.entries(segs)) effective[id] = { ...seg, riskLevel: effectiveRiskLevel(seg, now) };

    // BR-01 overrides end when the zone's own segment is no longer Orange.
    for (const zone of this.s.zones) {
      if (this.s.overrides[zone.id] && effective[zone.segmentId].riskLevel !== 'ORANGE') delete this.s.overrides[zone.id];
    }
    // Officer-cleared passage applies to that segment in that direction for every zone looking at it.
    const cleared = new Set(this.s.zones.filter(z => this.s.overrides[z.id]).map(z => `${z.segmentId}|${z.direction}`));
    // FR-09: corridor chainage order; diversion-road segments (offCorridor) are not part of it.
    const order = Object.values(segs).filter(s => !s.offCorridor).sort((a, b) => a.startKm - b.startKm).map(s => s.id);
    const zoneOf = new Map(this.s.zones.map(z => [`${z.segmentId}|${z.direction}`, z] as const));
    const estimateOf = (sid: string) => {
      const inc = this.openIncident(sid);
      return inc?.reopeningEstimate ? new Date(inc.reopeningEstimate) : undefined;
    };

    for (const zone of this.s.zones) {
      const target = effective[zone.segmentId];
      const override = this.s.overrides[zone.id];
      const ahead = segmentsAhead(zone, order, this.s.holdingPoints);
      const optionsFor = (vehicleType: 'light' | 'heavy') => (sid: string) => ({
        now, vehicleType, reopeningEstimate: estimateOf(sid), officerClearedPassage: cleared.has(`${sid}|${zone.direction}`)
      });
      const diversionsFor = (sid: string) => zoneOf.get(`${sid}|${zone.direction}`)?.diversionRoutes ?? [];
      const result = evaluateZoneAhead(zone, ahead, effective, this.s.holdingPoints, optionsFor('light'), diversionsFor);
      const heavy = evaluateZoneAhead(zone, ahead, effective, this.s.holdingPoints, optionsFor('heavy'), diversionsFor);
      const heavyResult = heavy.decision !== result.decision ? heavy : undefined;

      const prev = this.s.decisions[zone.id];
      const next: ZoneDecision = { zoneId: zone.id, segmentId: zone.segmentId, result, heavyResult, officerClearedPassage: override, at: prev?.at ?? now.toISOString() };
      const changed =
        !prev ||
        prev.result.decision !== result.decision ||
        prev.result.ruleId !== result.ruleId ||
        prev.result.holdingPoint?.id !== result.holdingPoint?.id ||
        prev.result.windowClosing !== result.windowClosing ||
        prev.heavyResult?.decision !== heavyResult?.decision;
      if (changed) {
        next.at = now.toISOString();
        this.s.decisionRecords.unshift({
          id: this.id('DEC'),
          at: next.at,
          zoneId: zone.id,
          segmentId: zone.segmentId,
          decision: result.decision,
          heavyDecision: heavyResult?.decision,
          ruleId: result.ruleId,
          inputs: { roadState: target.roadState, riskLevel: target.riskLevel, riskIndex: target.riskIndex, imdWarning: target.inputs.imdWarning },
          holdingPointId: result.holdingPoint?.id,
          diversion: result.diversionCheck.isOffered ? result.diversionCheck.routeCandidateName : undefined,
          expectedWaitMinutes: result.expectedWaitMinutes,
          windowClosing: result.windowClosing,
          closeRecommended: result.closeRecommended,
          trigger,
          reportId: ctx.reportId,
          reportToDecisionMs: ctx.reportToDecisionMs
        });
      } else {
        next.at = prev.at;
      }
      this.s.decisions[zone.id] = next;
    }

    // FR-12: raise a CLOSE recommendation for officer approval.
    const recommended = new Set(Object.values(this.s.decisions).filter(d => d.result.closeRecommended).map(d => d.segmentId));
    for (const segmentId of recommended) {
      const pending = this.s.approvals.some(a => a.segmentId === segmentId && a.kind === 'closure' && (a.status === 'pending' || a.status === 'escalated'));
      const inc = this.openIncident(segmentId);
      const alreadyClosed = inc && ['closed', 'clearance_in_progress'].includes(inc.state);
      if (!pending && !alreadyClosed) {
        const seg = segs[segmentId];
        this.createApproval({
          kind: 'closure',
          segmentId,
          incidentId: inc?.id,
          closureType: seg.roadState === 'RESTRICTED_HEAVY' ? 'HEAVY_ONLY' : seg.roadState === 'RESTRICTED_ONE_WAY' ? 'ONE_WAY' : 'FULL',
          reason: `${seg.roadState} · ${effective[segmentId].riskLevel}`
        });
      }
    }
    // A pending CLOSE recommendation is withdrawn once the rules no longer recommend it (e.g. rainfall fell).
    // Withdrawal is not an approval: only an officer can approve a closure (BR-08).
    for (const a of this.s.approvals) {
      if (a.kind === 'closure' && (a.status === 'pending' || a.status === 'escalated') && !recommended.has(a.segmentId)) {
        const before = a.status;
        a.status = 'withdrawn';
        a.decidedBy = 'Decision engine';
        a.decidedAt = this.now().toISOString();
        this.audit('Decision engine', 'system', 'CLOSE recommendation withdrawn', `${a.segmentId} · ${effective[a.segmentId]?.riskLevel ?? '—'}`, { entity: a.id, before, after: 'withdrawn' });
      }
    }
  }

  private createApproval(a: Omit<Approval, 'id' | 'status' | 'createdAt' | 'escalateAt'>): Approval {
    const now = this.now();
    const approval: Approval = {
      ...a,
      id: this.id('APR'),
      status: 'pending',
      createdAt: now.toISOString(),
      escalateAt: new Date(now.getTime() + this.s.config.escalationMinutes * 60000).toISOString()
    };
    this.s.approvals.unshift(approval);
    this.audit('Decision engine', 'system', `${a.kind === 'closure' ? 'CLOSE recommended' : a.kind === 'reopening' ? 'Reopening requested' : 'Alert drafted'}`, `${a.segmentId} · ${a.reason}`, { entity: approval.id });
    return approval;
  }

  /** FR-17 escalation and BR-12 expiry, evaluated on every read. */
  private tick() {
    const now = this.now();
    for (const a of this.s.approvals) {
      if (a.status === 'pending' && new Date(a.escalateAt).getTime() <= now.getTime()) {
        a.status = 'escalated';
        a.escalatedAt = now.toISOString();
        this.audit('System', 'system', 'Escalated to second approver', `${a.id} not acted on within ${this.s.config.escalationMinutes} min`, { entity: a.id, before: 'pending', after: 'escalated' });
      }
    }
    let expired = false;
    for (const seg of Object.values(this.s.segments)) {
      if (new Date(seg.validUntil).getTime() < now.getTime()) {
        this.s.segments[seg.id] = applyRisk(seg, this.s.config, now);
        expired = true;
      }
    }
    if (expired) this.recompute('Risk Level validity expired (6 h)');
  }

  // ---------- alerts ----------
  private alertFields(segmentId: string, template?: AlertTemplate): AlertFields {
    const seg = this.s.segments[segmentId];
    const zones = this.s.zones.filter(z => z.segmentId === segmentId);
    const decs = zones.map(z => this.s.decisions[z.id]);
    const inc = this.openIncident(segmentId);
    const anyDivert = decs.some(d => d.result.decision === 'DIVERT');
    const anyHold = decs.some(d => d.result.decision === 'HOLD');
    const closed = seg.roadState === 'BLOCKED' || decs.some(d => d.result.closeRecommended);
    const t: AlertTemplate = template ?? (closed ? (anyDivert ? 'DIVERT' : 'CLOSE') : anyHold ? 'HOLD' : 'CAUTION');
    const confirmed = inc?.reportIds.some(id => this.s.reports.find(r => r.id === id)?.status === 'confirmed');
    return {
      segmentId,
      place: this.placeOf(seg),
      template: t,
      zones: zones.map((z, i) => {
        const r = decs[i].result;
        return {
          zoneId: z.id,
          direction: z.direction,
          decision: r.decision,
          place: r.decision === 'HOLD' ? r.holdingPoint?.shortName : r.decision === 'DIVERT' ? r.diversionCheck.routeCandidateName : undefined
        };
      }),
      // BR-03: blocked/Red and no checked diversion -> state that no safe diversion exists.
      noSafeDiversion: decs.some(d => d.result.decision === 'HOLD' && d.result.closeRecommended),
      reopeningEstimate: inc?.reopeningEstimate && t !== 'REOPEN' && t !== 'CAUTION' ? clockText(inc.reopeningEstimate) : undefined,
      certainty: confirmed ? 'Observed' : 'Likely'
    };
  }

  private createAlert(segmentId: string, template?: AlertTemplate) {
    const fields = this.alertFields(segmentId, template);
    const alert: Alert = {
      id: this.id('ALR'),
      createdAt: this.iso(),
      segmentId,
      // FR-31 CAP audience: the segment's own zones plus every zone that holds because this segment is ahead (FR-09).
      zoneIds: [
        ...fields.zones.map(z => z.zoneId),
        ...Object.values(this.s.decisions)
          .filter(d => d.result.aheadSegmentId === segmentId && !fields.zones.some(z => z.zoneId === d.zoneId))
          .map(d => d.zoneId)
      ],
      fields,
      texts: buildAlertTexts(fields, this.knownPlaces()),
      status: 'draft'
    };
    this.s.alerts.unshift(alert);
    this.createApproval({ kind: 'alert', segmentId, alertId: alert.id, incidentId: this.openIncident(segmentId)?.id, reason: `${fields.template} alert` });
  }

  // ---------- public API ----------
  login(userId: string, role: Role): Session {
    if (!userId.trim()) throw new ApiError('User ID required');
    const session = { userId: userId.trim(), name: userId.trim(), role, token: `mock.${role}.${userId.trim()}` };
    this.audit(this.actor(session), role, 'Signed in', ROLE_LABEL[role]);
    return session;
  }

  snapshot(): Snapshot {
    this.tick();
    return structuredClone({
      serverTime: this.iso(),
      segments: Object.values(this.s.segments),
      zones: this.s.zones,
      holdingPoints: Object.values(this.s.holdingPoints),
      decisions: this.s.zones.map(z => this.s.decisions[z.id]),
      decisionRecords: this.s.decisionRecords,
      reports: this.s.reports,
      incidents: this.s.incidents,
      approvals: this.s.approvals,
      alerts: this.s.alerts,
      audit: this.s.audit,
      config: this.s.config
    });
  }

  submitReport(session: Session, input: NewReportInput): Report {
    this.guard(session, () => assertCan(session.role, 'submit_report'));
    this.segment(input.segmentId);
    const createdAt = this.iso();
    let photoUrl = '';
    let ai: Report['ai'] = null;
    let aiError: string | undefined;
    if (input.photo.kind === 'sample') {
      const sample = SAMPLE_PHOTOS.find(p => p.id === (input.photo as { sampleId: string }).sampleId);
      if (!sample) throw new ApiError('Unknown sample photo');
      photoUrl = sample.url;
      if (this.s.config.aiServiceOnline) ai = { ...sample.ai, model: 'simulated', simulated: true };
      else aiError = 'AI service unavailable';
    } else {
      photoUrl = input.photo.dataUrl;
      aiError = this.s.config.aiServiceOnline ? 'Photo check not connected' : 'AI service unavailable';
    }
    const base = {
      id: this.id('REP'),
      createdAt,
      capturedAt: input.capturedAt ?? createdAt,
      channel: 'web' as const,
      reporterName: input.reporterName ?? session.name,
      reporterRole: session.role,
      segmentId: input.segmentId,
      lat: input.lat,
      lon: input.lon,
      locationText: input.locationText,
      photoUrl,
      // BR-10: stored as data only; never interpreted.
      note: input.note
    };
    const checks = runReportChecks(base, this.s.reports, Object.values(this.s.segments), this.s.config, this.now());
    const route = routeReport(checks, ai, session.role, this.s.config.aiConfidenceThreshold);
    const report: Report = { ...base, ai, aiError, checks, route, status: checks.duplicateOf ? 'corroborated' : 'unverified', queuedAt: this.iso() };
    this.s.reports.unshift(report);
    this.audit(this.actor(session), session.role, 'Report submitted', `${report.id} · ${report.segmentId} · ${route}`, { entity: report.id });
    if (ai && route === 'officer_queue') {
      this.audit('Photo check', 'system', 'AI flag', `${report.segmentId} flagged for officer review (${ai.hazardClass}, ${ai.blockedShare}% blocked) · no state change`, { entity: report.id });
    }
    return structuredClone(report);
  }

  confirmReport(session: Session, reportId: string, newState: Exclude<RoadState, 'OPEN' | 'UNKNOWN'>) {
    this.guard(session, () => assertCan(session.role, 'review_report'));
    const report = this.s.reports.find(r => r.id === reportId);
    if (!report) throw new ApiError('Report not found', 404);
    if (report.status === 'confirmed' || report.status === 'rejected') throw new ApiError('Report already decided');
    if (report.route === 'flagged' || report.route === 'log_only') throw new ApiError('Report is not in a review queue');
    const confirmedAt = this.now();
    const group = this.s.reports.filter(r => r.checks.groupId === report.checks.groupId && (r.status === 'unverified' || r.status === 'corroborated'));
    const seg = this.segment(report.segmentId);
    const before = `${seg.roadState} · ${seg.riskLevel}`;
    seg.roadState = newState;

    let inc = this.openIncident(seg.id);
    if (!inc) {
      inc = { id: this.id('INC'), segmentId: seg.id, state: 'verified', openedAt: this.iso(), reportIds: [], equipment: [], log: [] };
      this.s.incidents.unshift(inc);
    } else if (inc.state === 'reported') {
      inc.state = 'verified';
    }
    for (const r of group) {
      r.status = 'confirmed';
      r.decidedBy = this.actor(session);
      r.decidedAt = this.iso();
      r.incidentId = inc.id;
      if (!inc.reportIds.includes(r.id)) inc.reportIds.push(r.id);
    }
    inc.log.push({ at: this.iso(), by: this.actor(session), text: `${report.id} confirmed · ${newState}` });
    this.audit(this.actor(session), session.role, 'Report confirmed', `${group.map(r => r.id).join(', ')} → ${seg.id} ${newState}`, { entity: report.id, before, after: newState });

    // SM3: upload -> decision ready, excluding officer think time (queue wait).
    const t0 = performance.now();
    this.recompute(`Report ${report.id} confirmed`, { reportId: report.id });
    const engineMs = performance.now() - t0;
    const intakeMs = new Date(report.queuedAt ?? report.createdAt).getTime() - new Date(report.createdAt).getTime();
    const ms = Math.round(intakeMs + engineMs + (this.now().getTime() - confirmedAt.getTime()));
    this.s.decisionRecords.filter(d => d.reportId === report.id).forEach(d => (d.reportToDecisionMs = ms));
  }

  rejectReport(session: Session, reportId: string) {
    this.guard(session, () => assertCan(session.role, 'review_report'));
    const report = this.s.reports.find(r => r.id === reportId);
    if (!report) throw new ApiError('Report not found', 404);
    if (report.status === 'confirmed' || report.status === 'rejected') throw new ApiError('Report already decided');
    report.status = 'rejected';
    report.decidedBy = this.actor(session);
    report.decidedAt = this.iso();
    this.audit(this.actor(session), session.role, 'Report rejected', `${report.id} · no state change`, { entity: report.id });
  }

  clearPassage(session: Session, zoneId: string) {
    this.guard(session, () => assertCan(session.role, 'clear_passage'));
    const zone = this.s.zones.find(z => z.id === zoneId);
    if (!zone) throw new ApiError('Zone not found', 404);
    const seg = this.segment(zone.segmentId);
    if (effectiveRiskLevel(seg, this.now()) !== 'ORANGE' || seg.roadState !== 'OPEN') throw new ApiError('Passage can be cleared only for an open Orange segment');
    this.s.overrides[zoneId] = { by: this.actor(session), at: this.iso() };
    this.audit(this.actor(session), session.role, 'Passage cleared', `${zoneId} · ${seg.id} Orange`, { entity: zoneId, before: 'HOLD', after: 'GO_CAUTION' });
    this.recompute(`Officer cleared passage ${zoneId}`);
  }

  draftAlert(session: Session, segmentId: string) {
    this.guard(session, () => assertCan(session.role, 'approve_alert'));
    this.segment(segmentId);
    const pending = this.s.approvals.some(a => a.kind === 'alert' && a.segmentId === segmentId && (a.status === 'pending' || a.status === 'escalated'));
    if (pending) throw new ApiError('An alert for this segment is already awaiting approval');
    this.createAlert(segmentId);
  }

  decideApproval(session: Session, approvalId: string, approve: boolean, closureType?: ClosureType) {
    const a = this.s.approvals.find(x => x.id === approvalId);
    if (!a) throw new ApiError('Approval not found', 404);
    this.guard(session, () => {
      assertCan(session.role, a.kind === 'alert' ? 'approve_alert' : 'approve_closure');
      if (!canDecideApproval(session.role, a.status)) {
        throw new PermissionError(session.role, session.role === 'second_approver' ? 'approve before escalation' : 'decide this approval');
      }
    });
    a.decidedBy = this.actor(session);
    a.decidedAt = this.iso();
    if (!approve) {
      a.status = 'rejected';
      if (a.alertId) {
        const alert = this.s.alerts.find(x => x.id === a.alertId);
        if (alert) alert.status = 'rejected';
      }
      this.audit(this.actor(session), session.role, `${a.kind} rejected`, `${a.id} · ${a.segmentId}`, { entity: a.id });
      return;
    }
    a.status = 'approved';
    const seg = this.segment(a.segmentId);

    if (a.kind === 'closure') {
      const type = closureType ?? a.closureType ?? 'FULL';
      a.closureType = type;
      const before = seg.roadState;
      seg.roadState = type === 'FULL' ? 'BLOCKED' : type === 'HEAVY_ONLY' ? 'RESTRICTED_HEAVY' : 'RESTRICTED_ONE_WAY';
      let inc = this.openIncident(seg.id);
      if (!inc) {
        inc = { id: this.id('INC'), segmentId: seg.id, state: 'closed', openedAt: this.iso(), reportIds: [], equipment: [], log: [] };
        this.s.incidents.unshift(inc);
      }
      inc.state = 'closed';
      inc.closureType = type;
      inc.log.push({ at: this.iso(), by: this.actor(session), text: `Closure approved · ${type}` });
      this.audit(this.actor(session), session.role, 'Closure approved', `${seg.id} · ${type}`, { entity: a.id, before, after: seg.roadState });
      this.recompute(`Closure ${type} approved`);
      this.createAlert(seg.id);
    } else if (a.kind === 'reopening') {
      const inc = this.s.incidents.find(i => i.id === a.incidentId);
      const before = seg.roadState;
      seg.roadState = a.reopenTo === 'full' ? 'OPEN' : 'RESTRICTED_ONE_WAY';
      if (inc) {
        inc.state = a.reopenTo === 'full' ? 'reopened_full' : 'reopened_one_way';
        inc.log.push({ at: this.iso(), by: this.actor(session), text: `Reopening approved · ${a.reopenTo === 'full' ? 'full' : 'one-way'}` });
        if (a.reopenTo === 'full') inc.reopeningEstimate = undefined;
      }
      this.audit(this.actor(session), session.role, 'Reopening approved', `${seg.id} · ${a.reopenTo}`, { entity: a.id, before, after: seg.roadState });
      this.recompute(`Reopening ${a.reopenTo} approved`);
      this.createAlert(seg.id, a.reopenTo === 'full' ? 'REOPEN' : 'CAUTION');
    } else {
      const alert = this.s.alerts.find(x => x.id === a.alertId);
      if (!alert) throw new ApiError('Alert not found', 404);
      alert.status = 'approved';
      alert.approvedBy = this.actor(session);
      alert.approvedAt = this.iso();
      alert.capXml = buildCap({
        identifier: `RESILION-${alert.id}`,
        sent: this.now(),
        fields: alert.fields,
        texts: alert.texts,
        zones: this.s.zones.filter(z => alert.zoneIds.includes(z.id))
      });
      this.audit(this.actor(session), session.role, 'Alert approved', `${alert.id} · ${alert.fields.template} · CAP ready`, { entity: alert.id });
    }
  }

  updateIncident(session: Session, incidentId: string, patch: IncidentPatch) {
    this.guard(session, () => assertCan(session.role, 'update_clearance'));
    const inc = this.s.incidents.find(i => i.id === incidentId);
    if (!inc) throw new ApiError('Incident not found', 404);
    const by = this.actor(session);
    if (patch.state === 'clearance_in_progress') {
      if (inc.state !== 'closed') throw new ApiError('Clearance starts after closure');
      inc.state = 'clearance_in_progress';
      inc.log.push({ at: this.iso(), by, text: 'Clearance in progress' });
    }
    if (patch.crew) {
      inc.crew = patch.crew;
      inc.log.push({ at: this.iso(), by, text: `Crew dispatched · ${patch.crew.unitName}` });
    }
    if (patch.equipment) {
      inc.equipment = patch.equipment;
      inc.log.push({ at: this.iso(), by, text: `Equipment · ${patch.equipment.length} items` });
    }
    if (patch.reopeningEstimate !== undefined) {
      inc.reopeningEstimate = patch.reopeningEstimate ?? undefined;
      inc.log.push({ at: this.iso(), by, text: patch.reopeningEstimate ? `Reopening est. ${clockText(patch.reopeningEstimate)}` : 'Reopening estimate cleared' });
    }
    this.audit(by, session.role, 'Incident updated', `${inc.id} · ${Object.keys(patch).join(', ')}`, { entity: inc.id });
    this.recompute(`Incident ${inc.id} updated`);
  }

  requestReopening(session: Session, incidentId: string, to: 'one_way' | 'full') {
    this.guard(session, () => assertCan(session.role, 'update_clearance'));
    const inc = this.s.incidents.find(i => i.id === incidentId);
    if (!inc) throw new ApiError('Incident not found', 404);
    if (!['closed', 'clearance_in_progress', 'reopened_one_way'].includes(inc.state)) throw new ApiError('Incident is not closed');
    if (this.s.approvals.some(a => a.kind === 'reopening' && a.incidentId === inc.id && (a.status === 'pending' || a.status === 'escalated'))) {
      throw new ApiError('Reopening already awaiting approval');
    }
    this.createApproval({ kind: 'reopening', segmentId: inc.segmentId, incidentId: inc.id, reopenTo: to, reason: to === 'full' ? 'Full reopening' : 'One-way reopening' });
  }

  editAlertText(session: Session, alertId: string, lang: AlertLanguage, text: string) {
    this.guard(session, () => assertCan(session.role, 'approve_alert'));
    const alert = this.s.alerts.find(a => a.id === alertId);
    if (!alert || alert.status !== 'draft') throw new ApiError('Alert is not editable');
    const idx = alert.texts.findIndex(t => t.lang === lang);
    const updated = applyOfficerEdit(alert.texts[idx], text, alert.fields, this.knownPlaces());
    alert.texts[idx] = updated;
    this.audit(this.actor(session), session.role, updated.blocked ? 'Alert edit blocked' : 'Alert edited', `${alert.id} · ${lang}${updated.blocked ? ' · ' + updated.validation.errors.join('; ') : ''}`, { entity: alert.id });
  }

  updateConfig(session: Session, patch: Partial<Config>) {
    this.guard(session, () => assertCan(session.role, 'configure'));
    const before = JSON.stringify(this.s.config);
    this.s.config = { ...this.s.config, ...patch, weights: { ...this.s.config.weights, ...patch.weights }, thresholds: { ...this.s.config.thresholds, ...patch.thresholds } };
    const t = this.s.config.thresholds;
    if (!(t.yellow < t.orange && t.orange < t.red)) {
      this.s.config = JSON.parse(before);
      throw new ApiError('Thresholds must increase: Yellow < Orange < Red');
    }
    this.audit(this.actor(session), session.role, 'Configuration changed', Object.keys(patch).join(', '), { before, after: JSON.stringify(this.s.config) });
    const now = this.now();
    for (const id of Object.keys(this.s.segments)) this.s.segments[id] = applyRisk(this.s.segments[id], this.s.config, now);
    this.recompute('Configuration changed');
  }

  updateZone(session: Session, zoneId: string, patch: ZonePatch) {
    this.guard(session, () => assertCan(session.role, 'configure'));
    const z = this.s.zones.find(x => x.id === zoneId);
    if (!z) throw new ApiError('Zone not found', 404);
    const before = JSON.stringify({ extentKm: z.extentKm, fallback: z.fallbackHoldingPointIds });
    if (patch.extentKm !== undefined) z.extentKm = patch.extentKm;
    if (patch.fallbackHoldingPointIds) z.fallbackHoldingPointIds = patch.fallbackHoldingPointIds.filter(id => id !== z.nearestHoldingPointId && this.s.holdingPoints[id]);
    this.audit(this.actor(session), session.role, 'Approach zone changed', zoneId, { entity: zoneId, before, after: JSON.stringify({ extentKm: z.extentKm, fallback: z.fallbackHoldingPointIds }) });
    this.recompute(`Zone ${zoneId} changed`);
  }

  updateSegmentInputs(session: Session, segmentId: string, patch: Partial<SegmentInputs>) {
    this.guard(session, () => assertCan(session.role, 'configure'));
    const seg = this.segment(segmentId);
    const before = `${seg.riskLevel} (${seg.riskIndex ?? '—'})`;
    seg.inputs = { ...seg.inputs, ...patch, updatedAt: this.iso(), sample: true };
    this.s.segments[segmentId] = applyRisk(seg, this.s.config, this.now());
    const after = this.s.segments[segmentId];
    this.audit(this.actor(session), session.role, 'Inputs updated', `${segmentId} · ${Object.keys(patch).join(', ')}`, { entity: segmentId, before, after: `${after.riskLevel} (${after.riskIndex ?? '—'})` });
    this.recompute(`Inputs updated ${segmentId}`);
  }

  resetSampleData(session: Session) {
    this.guard(session, () => assertCan(session.role, 'configure'));
    this.reset();
  }
}
