import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlertTexts, validateAlert, renderTemplate, applyOfficerEdit, buildCap, capField } from './alerts';
import { AlertFields, ApproachZone } from '../types';

const PLACES = ['Haflong', 'Lumding', 'Silchar-side staging', 'Jatinga', 'Harangajao', 'Maibong'];
const FIELDS: AlertFields = {
  segmentId: 'S-07', place: 'Jatinga–Harangajao', template: 'CLOSE',
  zones: [
    { zoneId: 'AZ-07N', direction: 'Southbound', decision: 'HOLD', place: 'Haflong' },
    { zoneId: 'AZ-07S', direction: 'Northbound', decision: 'HOLD', place: 'Silchar-side staging' }
  ],
  noSafeDiversion: true, reopeningEstimate: '4:00 PM', certainty: 'Observed'
};
const ZONES: ApproachZone[] = [
  { id: 'AZ-07N', name: 'from Haflong side', direction: 'Southbound', segmentId: 'S-07', center: [25.13, 93.0], extentKm: 2.5, locationKm: 164, nearestHoldingPointId: 'HP-HAFLONG' }
];

test('AC-21: template alerts in all four languages match source fields', () => {
  const texts = buildAlertTexts(FIELDS, PLACES);
  for (const t of texts.filter(t => t.lang !== 'dis')) {
    assert.equal(t.validation.ok, true, `${t.lang}: ${t.validation.errors.join('; ')}`);
    assert.equal(t.blocked, false);
  }
  const dis = texts.find(t => t.lang === 'dis')!;
  assert.equal(dis.source, 'pending_translation');
});

test('AC-21 / BR-09: mismatching place, time or decision is blocked; officer receives the template', () => {
  const good = renderTemplate(FIELDS, 'en');
  const cases = [
    good.replace('Haflong', 'Lumding'),
    good.replace('4:00 PM', '5:30 PM'),
    good.replace('HOLD at Haflong', 'DIVERT via Haflong'),
    good + ' Go now before it closes.',
    good.replace('No safe diversion.', '')
  ];
  for (const bad of cases) {
    assert.equal(validateAlert(bad, FIELDS, 'en', PLACES).ok, false, bad);
    const texts = buildAlertTexts(FIELDS, PLACES, { en: bad });
    const en = texts.find(t => t.lang === 'en')!;
    assert.equal(en.blocked, true);
    assert.equal(en.text, good);
  }
  const hiBad = renderTemplate(FIELDS, 'hi').replace('Haflong', 'Lumding');
  assert.equal(validateAlert(hiBad, FIELDS, 'hi', PLACES).ok, false);
  assert.equal(validateAlert(good.replace('CLOSED', 'open'), FIELDS, 'en', PLACES).ok, false);
  const risk = { ...FIELDS, template: 'HOLD' as const };
  for (const l of ['en', 'hi', 'as', 'bn'] as const) assert.equal(validateAlert(renderTemplate(risk, l), risk, l, PLACES).ok, true, l);
});

test('BR-09: officer edit that keeps facts passes; one that changes facts is blocked', () => {
  const texts = buildAlertTexts(FIELDS, PLACES);
  const en = texts.find(t => t.lang === 'en')!;
  const ok = applyOfficerEdit(en, en.text + ' Follow police directions.', FIELDS, PLACES);
  assert.equal(ok.blocked, false);
  assert.equal(ok.source, 'officer_edit');
  const bad = applyOfficerEdit(en, en.text.replace('4:00 PM', '6:00 PM'), FIELDS, PLACES);
  assert.equal(bad.blocked, true);
});

test('AC-22: HOLD alert CAP carries Severe, Immediate, certainty per mapping, approach-zone area', () => {
  const texts = buildAlertTexts(FIELDS, PLACES);
  const xml = buildCap({ identifier: 'ALR-1', sent: new Date('2026-11-01T10:00:00Z'), fields: FIELDS, texts, zones: ZONES });
  assert.equal(capField(xml, 'severity'), 'Severe');
  assert.equal(capField(xml, 'urgency'), 'Immediate');
  assert.equal(capField(xml, 'certainty'), 'Observed');
  assert.match(xml, /<circle>25\.1300,93\.0000 2\.5<\/circle>/);
  assert.match(xml, /<language>hi-IN<\/language>/);
  const likely = buildCap({ identifier: 'ALR-2', sent: new Date(), fields: { ...FIELDS, certainty: 'Likely' }, texts, zones: ZONES });
  assert.equal(capField(likely, 'certainty'), 'Likely');
  const caution = buildCap({ identifier: 'ALR-3', sent: new Date(), fields: { ...FIELDS, template: 'CAUTION' }, texts, zones: ZONES });
  assert.equal(capField(caution, 'severity'), 'Moderate');
  assert.equal(capField(caution, 'urgency'), 'Expected');
});
