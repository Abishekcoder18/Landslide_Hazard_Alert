import { Config, RiskLevel, Segment, SegmentInputs, Susceptibility } from '../types';

/**
 * Rule-based Risk Index (FR-03, FR-05, FR-06). Not machine learning.
 * Weights and thresholds come from Config (NFR-09). All values are configurable assumptions to be calibrated.
 */

const SUSCEPTIBILITY_SCORE: Record<Susceptibility, number> = {
  'Very Low': 0.1, Low: 0.25, Moderate: 0.5, High: 0.75, 'Very High': 1
};

/** Rainfall normalisers (mm at which the component saturates). Configurable later. */
const RAIN_SATURATION = { h24: 100, d3: 200, d7: 300 };
const SLOPE_SATURATION_DEG = 45;
const HISTORY_SATURATION = 5;

const LEVEL_ORDER: RiskLevel[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
const IMD_FLOOR: Record<'YELLOW' | 'ORANGE' | 'RED', RiskLevel> = { YELLOW: 'YELLOW', ORANGE: 'YELLOW', RED: 'ORANGE' };
const rank = (l: RiskLevel) => LEVEL_ORDER.indexOf(l);
const maxLevel = (a: RiskLevel, b: RiskLevel) => (rank(a) >= rank(b) ? a : b);

export interface RiskComputation {
  riskIndex: number | null;
  riskLevel: RiskLevel;
  reasons: string[];
  computedAt: string;
  validUntil: string;
}

export function missingInputs(inputs: SegmentInputs): string[] {
  const missing: string[] = [];
  if (inputs.susceptibility === null) missing.push('susceptibility');
  if (inputs.slopeDeg === null) missing.push('slope');
  if (inputs.rainfall24h === null || inputs.rainfall3d === null || inputs.rainfall7d === null) missing.push('rainfall');
  if (inputs.pastIncidents === null) missing.push('past incidents');
  return missing;
}

export function computeRisk(inputs: SegmentInputs, config: Config, now: Date = new Date()): RiskComputation {
  const computedAt = now.toISOString();
  const validUntil = new Date(now.getTime() + config.validityHours * 3600_000).toISOString();

  // BR-06: missing or stale input -> No data.
  const missing = missingInputs(inputs);
  const ageHours = (now.getTime() - new Date(inputs.updatedAt).getTime()) / 3600_000;
  if (missing.length > 0) {
    return { riskIndex: null, riskLevel: 'NO_DATA', reasons: [`Missing input: ${missing.join(', ')}`], computedAt, validUntil };
  }
  if (!(ageHours <= config.staleInputHours)) {
    return { riskIndex: null, riskLevel: 'NO_DATA', reasons: [`Inputs stale (${Math.floor(ageHours)} h old)`], computedAt, validUntil };
  }

  const components = [
    {
      key: 'susceptibility',
      weight: config.weights.susceptibility,
      score: SUSCEPTIBILITY_SCORE[inputs.susceptibility!],
      reason: `GSI susceptibility ${inputs.susceptibility}`
    },
    {
      key: 'rainfall',
      weight: config.weights.rainfall,
      score: Math.min(1, Math.max(
        inputs.rainfall24h! / RAIN_SATURATION.h24,
        inputs.rainfall3d! / RAIN_SATURATION.d3,
        inputs.rainfall7d! / RAIN_SATURATION.d7
      )),
      reason: `Rain 24h ${inputs.rainfall24h} mm · 3d ${inputs.rainfall3d} mm`
    },
    {
      key: 'slope',
      weight: config.weights.slope,
      score: Math.min(1, inputs.slopeDeg! / SLOPE_SATURATION_DEG),
      reason: `Slope ${inputs.slopeDeg}°`
    },
    {
      key: 'history',
      weight: config.weights.history,
      score: Math.min(1, inputs.pastIncidents! / HISTORY_SATURATION),
      reason: `${inputs.pastIncidents} past incident${inputs.pastIncidents === 1 ? '' : 's'}`
    }
  ];

  const totalWeight = components.reduce((a, c) => a + c.weight, 0) || 1;
  const riskIndex = Math.round((components.reduce((a, c) => a + c.weight * c.score, 0) / totalWeight) * 100);

  const t = config.thresholds;
  let level: RiskLevel = riskIndex >= t.red ? 'RED' : riskIndex >= t.orange ? 'ORANGE' : riskIndex >= t.yellow ? 'YELLOW' : 'GREEN';

  const reasons = [...components]
    .sort((a, b) => b.weight * b.score - a.weight * a.score)
    .slice(0, 3)
    .map(c => c.reason);

  // BR-05: IMD warning / GSI bulletin can only raise a level.
  // Floors (assumption, to calibrate): IMD Yellow/Orange -> at least Yellow, IMD Red -> at least Orange,
  // GSI landslide bulletin -> at least Orange. A Yellow segment under an IMD Orange warning therefore stays
  // Yellow and triggers the control-room window-closing flag (BR-11).
  const before = level;
  if (inputs.imdWarning !== 'NONE') level = maxLevel(level, IMD_FLOOR[inputs.imdWarning]);
  if (inputs.gsiBulletin) level = maxLevel(level, 'ORANGE');
  if (level !== before) {
    reasons.unshift(inputs.imdWarning !== 'NONE' ? `IMD ${inputs.imdWarning.toLowerCase()} warning (raised)` : 'GSI bulletin (raised)');
  } else if (inputs.imdWarning !== 'NONE') {
    reasons.push(`IMD ${inputs.imdWarning.toLowerCase()} warning`);
  }

  return { riskIndex, riskLevel: level, reasons: reasons.slice(0, 3), computedAt, validUntil };
}

/** BR-12: a Risk Level is valid for `validityHours`; after that it is shown as No data until recomputed. */
export function effectiveRiskLevel(segment: Segment, now: Date = new Date()): RiskLevel {
  return new Date(segment.validUntil).getTime() < now.getTime() ? 'NO_DATA' : segment.riskLevel;
}

export function applyRisk(segment: Segment, config: Config, now: Date = new Date()): Segment {
  const r = computeRisk(segment.inputs, config, now);
  return { ...segment, ...r };
}
