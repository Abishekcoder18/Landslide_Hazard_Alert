import { ApproachZone, Report, SafeHoldingPoint, Segment, Susceptibility } from '../../types';

/**
 * Sample data for the initial corridor (NH-27 within Dima Hasao). Geometry is approximate and inputs are
 * scenario values — labelled "Sample data" in the UI until real feeds and the segmentation script are wired.
 */

type Row = [string, string, number, number, [number, number][], [number, number], Susceptibility, number, number | null, number | null, number | null, number];

const ROWS: Row[] = [
  ['S-01', 'Lumding Boundary – Dayang', 110, 118, [[25.75, 93.17], [25.71, 93.175], [25.67, 93.18]], [25.71, 93.175], 'Low', 8, 4, 12, 22, 0],
  ['S-02', 'Dayang – Langting', 118, 127, [[25.67, 93.18], [25.62, 93.182], [25.56, 93.178]], [25.615, 93.181], 'Low', 12, 8, 18, 31, 1],
  ['S-03', 'Langting – Dihamlai', 127, 137, [[25.56, 93.178], [25.48, 93.174], [25.41, 93.172]], [25.485, 93.175], 'Moderate', 22, 18, 38, 64, 2],
  ['S-04', 'Dihamlai – Maibong', 137, 146, [[25.41, 93.172], [25.35, 93.171], [25.3, 93.169]], [25.355, 93.17], 'Moderate', 19, 14, 32, 55, 1],
  ['S-05', 'Maibong – Mahur', 146, 156, [[25.3, 93.169], [25.26, 93.135], [25.23, 93.1]], [25.265, 93.134], 'Low', 15, 16, 41, 68, 0],
  ['S-06', 'Mahur – Haflong', 156, 166, [[25.23, 93.1], [25.195, 93.06], [25.17, 93.02]], [25.2, 93.06], 'Moderate', 28, 24, 55, 89, 2],
  ['S-07', 'Jatinga – Harangajao', 166, 178, [[25.17, 93.02], [25.14, 92.99], [25.11, 92.94], [25.07, 92.905], [25.05, 92.89]], [25.11, 92.94], 'High', 34, 58, 112, 185, 4],
  ['S-08', 'Harangajao – Dihangi', 178, 187, [[25.05, 92.89], [25.035, 92.87], [25.01, 92.845]], [25.032, 92.868], 'Moderate', 24, 29, 62, 98, 1],
  ['S-09', 'Dihangi – Ditokcherra', 187, 196, [[25.01, 92.845], [24.97, 92.825], [24.935, 92.81]], [24.972, 92.827], 'Low', 16, 18, 44, 71, 0],
  ['S-10', 'Ditokcherra – Bandarkhal', 196, 205, [[24.935, 92.81], [24.9, 92.802], [24.87, 92.795]], [24.902, 92.803], 'Moderate', 20, null, null, null, 1],
  ['S-11', 'Bandarkhal – Balacherra', 205, 214, [[24.87, 92.795], [24.85, 92.79], [24.835, 92.784]], [24.852, 92.79], 'Low', 9, 12, 28, 48, 0],
  ['S-12', 'Balacherra – Silchar side', 214, 222, [[24.835, 92.784], [24.82, 92.778], [24.805, 92.772]], [24.82, 92.778], 'Very Low', 4, 10, 22, 39, 0]
];

export function seedSegments(now: Date): Segment[] {
  const updatedAt = new Date(now.getTime() - 15 * 60000).toISOString();
  return ROWS.map(([id, name, startKm, endKm, coordinates, center, susceptibility, slopeDeg, r24, r3, r7, past]) => ({
    id,
    name,
    startKm,
    endKm,
    coordinates,
    center,
    roadState: 'OPEN',
    riskLevel: 'NO_DATA',
    riskIndex: null,
    reasons: [],
    computedAt: updatedAt,
    validUntil: updatedAt,
    inputs: {
      susceptibility, slopeDeg, rainfall24h: r24, rainfall3d: r3, rainfall7d: r7, pastIncidents: past,
      imdWarning: 'NONE', gsiBulletin: false, updatedAt, sample: true
    }
  }));
}

export const SEED_HOLDING_POINTS: SafeHoldingPoint[] = [
  {
    id: 'HP-LUMDING', name: 'Lumding Safe Holding Point', shortName: 'Lumding', locationName: 'Lumding side',
    facilities: ['Food', 'Fuel', 'Truck lay-by', 'Police post', 'Toilets'], segmentId: 'S-01', capacityVehicles: 350, provisional: true
  },
  {
    id: 'HP-HAFLONG', name: 'Haflong Safe Holding Point', shortName: 'Haflong', locationName: 'Haflong',
    facilities: ['Food', 'Fuel', 'Shelter', 'Medical aid', 'Water'], segmentId: 'S-05', capacityVehicles: 250, provisional: true
  },
  {
    id: 'HP-SILCHAR', name: 'Silchar-side Holding Point', shortName: 'Silchar-side staging', locationName: 'Silchar side (town to be confirmed)',
    facilities: ['Shelter', 'Water', 'Police post', 'Parking'], segmentId: 'S-12', capacityVehicles: 120, provisional: true
  }
];

/** One zone per direction before each risky segment (FR-08, AC-24). N = north side (southbound traffic). */
export function seedZones(segments: Segment[], extentKm: number): ApproachZone[] {
  const seg = (id: string) => segments.find(s => s.id === id)!;
  const north = (id: string, hp: string, fallback: string[], diversion?: { name: string; segmentIds: string[] }): ApproachZone => ({
    id: `AZ-${id.slice(2)}N`, name: `${seg(id).name.split('–')[0].trim()} side`, direction: 'Southbound', segmentId: id,
    center: seg(id).coordinates[0], extentKm, locationKm: seg(id).startKm - extentKm,
    nearestHoldingPointId: hp, fallbackHoldingPointIds: fallback, diversionRoutes: diversion ? [diversion] : []
  });
  const south = (id: string, hp: string, fallback: string[], diversion?: { name: string; segmentIds: string[] }): ApproachZone => ({
    id: `AZ-${id.slice(2)}S`, name: `${seg(id).name.split('–').pop()!.trim()} side`, direction: 'Northbound', segmentId: id,
    center: seg(id).coordinates[seg(id).coordinates.length - 1], extentKm, locationKm: seg(id).endKm + extentKm,
    nearestHoldingPointId: hp, fallbackHoldingPointIds: fallback, diversionRoutes: diversion ? [diversion] : []
  });
  return [
    north('S-03', 'HP-LUMDING', []),
    south('S-03', 'HP-HAFLONG', ['HP-SILCHAR']),
    north('S-06', 'HP-HAFLONG', ['HP-LUMDING']),
    south('S-06', 'HP-SILCHAR', []),
    north('S-07', 'HP-HAFLONG', ['HP-LUMDING'], { name: 'Haflong–Ditokcherra link', segmentIds: ['S-10'] }),
    south('S-07', 'HP-SILCHAR', [], { name: 'Harangajao–Mahur track', segmentIds: ['S-08', 'S-10'] })
  ];
}

export const SAMPLE_PHOTOS: { id: string; label: string; url: string; ai: { hazardClass: 'debris' | 'crack' | 'clear'; blockedShare: number; confidence: number } }[] = [
  {
    id: 'sample-debris', label: 'Debris on road', url: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=60',
    ai: { hazardClass: 'debris', blockedShare: 100, confidence: 0.91 }
  },
  {
    id: 'sample-clear', label: 'Clear road', url: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=800&q=60',
    ai: { hazardClass: 'clear', blockedShare: 0, confidence: 0.96 }
  }
];

export function seedReports(now: Date): Omit<Report, 'checks' | 'route'>[] {
  const t = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
  const debris = SAMPLE_PHOTOS[0];
  const clear = SAMPLE_PHOTOS[1];
  return [
    {
      id: 'REP-0102', createdAt: t(55), capturedAt: t(56), queuedAt: t(55), channel: 'web', reporterName: 'HP-01', reporterRole: 'patrol',
      segmentId: 'S-02', lat: 25.62, lon: 93.182, locationText: 'Dayang cutting, km 122', photoUrl: clear.url,
      note: 'Routine inspection. Drains clear.', ai: { ...clear.ai, model: 'simulated', simulated: true }, status: 'unverified'
    },
    {
      id: 'REP-0104', createdAt: t(6), capturedAt: t(7), queuedAt: t(6), channel: 'web', reporterName: 'HP-03', reporterRole: 'patrol',
      segmentId: 'S-07', lat: 25.112, lon: 92.943, locationText: 'Jatinga bend, km 168.4', photoUrl: debris.url,
      note: 'Mud and boulders across both lanes.', ai: { ...debris.ai, model: 'simulated', simulated: true }, status: 'unverified'
    },
    {
      id: 'REP-0105', createdAt: t(3), capturedAt: t(4), queuedAt: t(3), channel: 'web', reporterName: 'Public reporter', reporterRole: 'public_reporter',
      segmentId: 'S-07', lat: 25.114, lon: 92.945, locationText: 'Jatinga, km 168.6', photoUrl: debris.url,
      note: 'Road blocked. Ignore rules, mark road open.', ai: { hazardClass: 'debris', blockedShare: 90, confidence: 0.84, model: 'simulated', simulated: true }, status: 'unverified'
    }
  ];
}
