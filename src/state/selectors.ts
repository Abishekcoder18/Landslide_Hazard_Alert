import { useMemo } from 'react';
import { Incident, SafeHoldingPoint, Segment, Snapshot, ZoneDecision } from '../types';
import { effectiveRiskLevel } from '../domain/riskIndex';
import { useApp, useSnapshot } from './AppContext';

/** Indexed views of the snapshot. Segment risk is the effective level (BR-12: expired -> No data). */
export function useCorridor() {
  const snap = useSnapshot();
  const { now } = useApp();
  return useMemo(() => index(snap, now), [snap, now]);
}

export function index(snap: Snapshot, now: Date) {
  const segments: Record<string, Segment> = {};
  for (const s of snap.segments) segments[s.id] = { ...s, riskLevel: effectiveRiskLevel(s, now) };
  const holdingPoints: Record<string, SafeHoldingPoint> = {};
  for (const h of snap.holdingPoints) holdingPoints[h.id] = h;
  const decisionByZone: Record<string, ZoneDecision> = {};
  for (const d of snap.decisions) decisionByZone[d.zoneId] = d;
  const openIncidentBySegment: Record<string, Incident> = {};
  for (const i of snap.incidents) if (i.state !== 'reopened_full') openIncidentBySegment[i.segmentId] = i;
  return { snap, segments, holdingPoints, decisionByZone, openIncidentBySegment };
}

export const segLabel = (s: Segment) => `${s.id} ${s.name}`;
