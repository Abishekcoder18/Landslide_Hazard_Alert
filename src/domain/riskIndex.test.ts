import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRisk, effectiveRiskLevel, applyRisk, susceptibilityCategory } from './riskIndex';
import { DEFAULT_CONFIG } from './config';
import { SegmentInputs, Segment } from '../types';

const NOW = new Date('2026-11-01T10:00:00Z');
const base = (o: Partial<SegmentInputs> = {}): SegmentInputs => ({
  susceptibility: 'Low', slopeDeg: 10, rainfall24h: 5, rainfall3d: 10, rainfall7d: 20, pastIncidents: 0,
  imdWarning: 'NONE', gsiBulletin: false, updatedAt: '2026-11-01T09:30:00Z', sample: true, ...o
});

test('AC-02: inputs produce one of Green/Yellow/Orange/Red with top reasons', () => {
  const low = computeRisk(base(), DEFAULT_CONFIG, NOW);
  assert.equal(low.riskLevel, 'GREEN');
  assert.ok(low.reasons.length > 0 && low.reasons.length <= 3);
  const high = computeRisk(base({ susceptibility: 'Very High', slopeDeg: 40, rainfall24h: 120, rainfall3d: 220, rainfall7d: 300, pastIncidents: 5 }), DEFAULT_CONFIG, NOW);
  assert.equal(high.riskLevel, 'RED');
  assert.ok(['GREEN', 'YELLOW', 'ORANGE', 'RED'].includes(computeRisk(base({ rainfall3d: 120 }), DEFAULT_CONFIG, NOW).riskLevel));
});

test('AC-03: recomputed level uses configured thresholds; valid for configured hours', () => {
  const inputs = base({ susceptibility: 'High', slopeDeg: 30, rainfall3d: 100 });
  const a = computeRisk(inputs, DEFAULT_CONFIG, NOW);
  const strict = computeRisk(inputs, { ...DEFAULT_CONFIG, thresholds: { yellow: 5, orange: 10, red: 15 } }, NOW);
  assert.equal(strict.riskLevel, 'RED');
  assert.notEqual(a.riskLevel, 'RED');
  assert.equal(new Date(a.validUntil).getTime() - NOW.getTime(), DEFAULT_CONFIG.validityHours * 3600_000);
});

test('AC-04 / BR-05: IMD warning or GSI bulletin never lowers a level, may raise it', () => {
  const levels = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
  for (const inp of [base(), base({ susceptibility: 'Very High', slopeDeg: 40, rainfall3d: 220, pastIncidents: 5 })]) {
    const before = computeRisk(inp, DEFAULT_CONFIG, NOW).riskLevel;
    for (const w of ['YELLOW', 'ORANGE', 'RED'] as const) {
      const after = computeRisk({ ...inp, imdWarning: w }, DEFAULT_CONFIG, NOW).riskLevel;
      assert.ok(levels.indexOf(after) >= levels.indexOf(before), `${before} -> ${after}`);
    }
    const gsi = computeRisk({ ...inp, gsiBulletin: true }, DEFAULT_CONFIG, NOW).riskLevel;
    assert.ok(levels.indexOf(gsi) >= levels.indexOf(before));
  }
  assert.equal(computeRisk(base({ imdWarning: 'ORANGE' }), DEFAULT_CONFIG, NOW).riskLevel, 'YELLOW');
  assert.equal(computeRisk(base({ imdWarning: 'RED' }), DEFAULT_CONFIG, NOW).riskLevel, 'ORANGE');
  assert.equal(computeRisk(base({ gsiBulletin: true }), DEFAULT_CONFIG, NOW).riskLevel, 'ORANGE');
});

test('AC-05 / BR-06: missing or stale input -> No data, never Green', () => {
  assert.equal(computeRisk(base({ rainfall3d: null }), DEFAULT_CONFIG, NOW).riskLevel, 'NO_DATA');
  assert.equal(computeRisk(base({ susceptibility: null }), DEFAULT_CONFIG, NOW).riskLevel, 'NO_DATA');
  assert.equal(computeRisk(base({ updatedAt: '2026-10-31T10:00:00Z' }), DEFAULT_CONFIG, NOW).riskLevel, 'NO_DATA');
});

test('BR-12: an expired Risk Level displays as No data', () => {
  const s = applyRisk({ inputs: base() } as Segment, DEFAULT_CONFIG, NOW);
  assert.equal(effectiveRiskLevel(s, NOW), 'GREEN');
  assert.equal(effectiveRiskLevel(s, new Date(NOW.getTime() + 7 * 3600_000)), 'NO_DATA');
});

test('F1 model: susceptibilityScore replaces the category in the Risk Index and is shown as a reason', () => {
  const cat = computeRisk(base({ susceptibility: 'Low', slopeDeg: 30, rainfall3d: 150, pastIncidents: 3 }), DEFAULT_CONFIG, NOW);
  const model = computeRisk(base({ susceptibility: 'Low', susceptibilityScore: 0.92, slopeDeg: 30, rainfall3d: 150, pastIncidents: 3 }), DEFAULT_CONFIG, NOW);
  assert.ok(model.riskIndex! > cat.riskIndex!);
  // 0.92 vs Low (0.25) with weight 35/100 -> +23.45 points before rounding each index separately
  assert.ok([23, 24].includes(model.riskIndex! - cat.riskIndex!));
  assert.ok(model.reasons.includes('Model susceptibility 0.92'));
  assert.ok(!model.reasons.some(r => r.startsWith('GSI susceptibility')));
});

test('F1 model: score alone counts as the susceptibility input (BR-06); out-of-range scores are clamped', () => {
  assert.notEqual(computeRisk(base({ susceptibility: null, susceptibilityScore: 0.4 }), DEFAULT_CONFIG, NOW).riskLevel, 'NO_DATA');
  assert.equal(computeRisk(base({ susceptibility: null, susceptibilityScore: null }), DEFAULT_CONFIG, NOW).riskLevel, 'NO_DATA');
  const hi = computeRisk(base({ susceptibilityScore: 1.7, slopeDeg: 45, rainfall24h: 100, pastIncidents: 5 }), DEFAULT_CONFIG, NOW);
  assert.equal(hi.riskIndex, 100);
});

test('F1 model: category label derived from the score with the model cut-offs', () => {
  assert.equal(susceptibilityCategory(0.05), 'Very Low');
  assert.equal(susceptibilityCategory(0.2), 'Low');
  assert.equal(susceptibilityCategory(0.59), 'Moderate');
  assert.equal(susceptibilityCategory(0.6), 'High');
  assert.equal(susceptibilityCategory(0.8), 'Very High');
});
