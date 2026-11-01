import { ImdWarning, Segment } from '../types';

/** Test helper: minimal segment. */
export function seg(id: string, roadState: Segment['roadState'], riskLevel: Segment['riskLevel'], imd: ImdWarning = 'NONE'): Segment {
  return {
    id, name: `${id} test`, startKm: 0, endKm: 1,
    coordinates: [[25, 93]], center: [25, 93], roadState, riskLevel, riskIndex: null, reasons: [],
    computedAt: '2026-11-01T09:00:00Z', validUntil: '2026-11-01T15:00:00Z',
    inputs: { susceptibility: 'Low', slopeDeg: 10, rainfall24h: 0, rainfall3d: 0, rainfall7d: 0, pastIncidents: 0, imdWarning: imd, gsiBulletin: false, updatedAt: '2026-11-01T09:00:00Z', sample: true }
  };
}

