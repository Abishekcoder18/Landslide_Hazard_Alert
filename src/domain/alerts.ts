import {
  AlertFields,
  AlertLanguage,
  AlertTemplate,
  AlertText,
  AlertValidation,
  ApproachZone,
  DecisionType,
  Direction
} from '../types';

/**
 * Alerts (FR-27–FR-31).
 * - Templates per language with a fixed safety glossary (FR-28). Place names and segment IDs stay in Roman script
 *   in every language so they match road signage and can be validated exactly (assumption, to confirm with district).
 * - The backend fills/translates with the language model; this module provides the plain template version, which is
 *   also the BR-09 fallback when an alert fails validation.
 * - Dimasa (FR-29) comes only from native-speaker templates, which are pending; it is never generated.
 */

export const ALERT_LANGUAGES: { code: AlertLanguage; label: string; capCode: string }[] = [
  { code: 'en', label: 'English', capCode: 'en-IN' },
  { code: 'hi', label: 'Hindi', capCode: 'hi-IN' },
  { code: 'as', label: 'Assamese', capCode: 'as-IN' },
  { code: 'bn', label: 'Bengali', capCode: 'bn-IN' },
  { code: 'dis', label: 'Dimasa', capCode: 'dis' }
];

type Lang = Exclude<AlertLanguage, 'dis'>;

interface Glossary {
  head: Record<'CLOSE' | 'RISK' | 'CAUTION' | 'REOPEN', string>;
  dir: Record<Direction, string>;
  zone: Record<DecisionType, string>;
  noDiversion: string;
  estimate: string;
  forbidden: string[];
}

/** {seg} segment ID, {place} segment place, {d} direction, {p} holding point / route, {t} time. */
export const GLOSSARY: Record<Lang, Glossary> = {
  en: {
    head: { CLOSE: 'NH-27 {seg} ({place}) CLOSED.', RISK: 'NH-27 {seg} ({place}) high landslide risk.', CAUTION: 'NH-27 {seg} ({place}) open with caution.', REOPEN: 'NH-27 {seg} ({place}) REOPENED.' },
    dir: { Northbound: 'Northbound', Southbound: 'Southbound' },
    zone: { HOLD: '{d}: HOLD at {p}.', DIVERT: '{d}: DIVERT via {p}.', GO_CAUTION: '{d}: GO with caution.', GO: '{d}: GO.' },
    noDiversion: 'No safe diversion.',
    estimate: 'Reopening est. {t}.',
    forbidden: ['go now', 'hurry', 'quickly', 'rush']
  },
  hi: {
    head: { CLOSE: 'NH-27 {seg} ({place}) बंद (CLOSED)।', RISK: 'NH-27 {seg} ({place}) भूस्खलन का उच्च खतरा।', CAUTION: 'NH-27 {seg} ({place}) सावधानी के साथ खुला।', REOPEN: 'NH-27 {seg} ({place}) फिर से खुला (REOPENED)।' },
    dir: { Northbound: 'उत्तर दिशा', Southbound: 'दक्षिण दिशा' },
    zone: { HOLD: '{d}: {p} पर रुकें (HOLD)।', DIVERT: '{d}: {p} से वैकल्पिक मार्ग लें (DIVERT)।', GO_CAUTION: '{d}: सावधानी से चलें (GO)।', GO: '{d}: चलें (GO)।' },
    noDiversion: 'कोई सुरक्षित वैकल्पिक मार्ग नहीं।',
    estimate: 'खुलने का अनुमानित समय {t} (अनुमान)।',
    forbidden: ['जल्दी', 'तुरंत निकल', 'go now']
  },
  as: {
    head: { CLOSE: 'NH-27 {seg} ({place}) বন্ধ (CLOSED)।', RISK: 'NH-27 {seg} ({place}) ভূমিস্খলনৰ উচ্চ বিপদ।', CAUTION: 'NH-27 {seg} ({place}) সাৱধানে মুকলি।', REOPEN: 'NH-27 {seg} ({place}) পুনৰ মুকলি (REOPENED)।' },
    dir: { Northbound: 'উত্তৰমুখী', Southbound: 'দক্ষিণমুখী' },
    zone: { HOLD: '{d}: {p} ত ৰওক (HOLD)।', DIVERT: '{d}: {p} পথেৰে যাওক (DIVERT)।', GO_CAUTION: '{d}: সাৱধানে যাওক (GO)।', GO: '{d}: যাওক (GO)।' },
    noDiversion: 'কোনো সুৰক্ষিত বিকল্প পথ নাই।',
    estimate: 'মুকলি হোৱাৰ আনুমানিক সময় {t} (আনুমানিক)।',
    forbidden: ['সোনকালে', 'খৰকৈ', 'go now']
  },
  bn: {
    head: { CLOSE: 'NH-27 {seg} ({place}) বন্ধ (CLOSED)।', RISK: 'NH-27 {seg} ({place}) ভূমিধসের উচ্চ ঝুঁকি।', CAUTION: 'NH-27 {seg} ({place}) সতর্কতার সঙ্গে খোলা।', REOPEN: 'NH-27 {seg} ({place}) আবার খোলা (REOPENED)।' },
    dir: { Northbound: 'উত্তরমুখী', Southbound: 'দক্ষিণমুখী' },
    zone: { HOLD: '{d}: {p}-এ থামুন (HOLD)।', DIVERT: '{d}: {p} দিয়ে বিকল্প পথে যান (DIVERT)।', GO_CAUTION: '{d}: সাবধানে চলুন (GO)।', GO: '{d}: চলুন (GO)।' },
    noDiversion: 'কোনো নিরাপদ বিকল্প পথ নেই।',
    estimate: 'খোলার আনুমানিক সময় {t} (আনুমানিক)।',
    forbidden: ['তাড়াতাড়ি', 'দ্রুত', 'go now']
  }
};

const KEYWORD: Record<DecisionType, string> = { HOLD: 'HOLD', DIVERT: 'DIVERT', GO_CAUTION: 'GO', GO: 'GO' };
/** CLOSE/DIVERT: road closed. HOLD: risk hold without closure. */
const HEAD_KEYWORD: Partial<Record<AlertTemplate, string>> = { CLOSE: 'CLOSED', DIVERT: 'CLOSED', REOPEN: 'REOPENED' };

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

function headFor(template: AlertTemplate): 'CLOSE' | 'RISK' | 'CAUTION' | 'REOPEN' {
  if (template === 'REOPEN') return 'REOPEN';
  if (template === 'CAUTION') return 'CAUTION';
  if (template === 'HOLD') return 'RISK';
  return 'CLOSE';
}

/** FR-27: plain template version of an alert (also the BR-09 fallback). */
export function renderTemplate(fields: AlertFields, lang: Lang): string {
  const g = GLOSSARY[lang];
  const parts = [fill(g.head[headFor(fields.template)], { seg: fields.segmentId, place: fields.place })];
  for (const z of fields.zones) {
    parts.push(fill(g.zone[z.decision], { d: g.dir[z.direction], p: z.place ?? '' }));
  }
  if (fields.noSafeDiversion) parts.push(g.noDiversion);
  if (fields.reopeningEstimate) parts.push(fill(g.estimate, { t: fields.reopeningEstimate }));
  return parts.join(' ');
}

/**
 * FR-30 / BR-09: every place, time and decision must match the source fields.
 * Checks: segment ID, each zone's direction + decision keyword + place, head keyword, the reopening time,
 * no other clock times, no other known place names, no "hurry" wording (BR-11).
 */
export function validateAlert(text: string, fields: AlertFields, lang: Lang, knownPlaces: string[]): AlertValidation {
  const g = GLOSSARY[lang];
  const errors: string[] = [];
  const lower = text.toLowerCase();

  if (!text.includes(fields.segmentId)) errors.push(`Segment ${fields.segmentId} missing`);
  const headKw = HEAD_KEYWORD[fields.template];
  if (headKw && !text.includes(headKw)) errors.push(`${headKw} missing`);

  for (const z of fields.zones) {
    if (!text.includes(g.dir[z.direction])) errors.push(`${z.direction} missing`);
    if (!text.includes(KEYWORD[z.decision])) errors.push(`${KEYWORD[z.decision]} missing (${z.direction})`);
    if (z.place && !text.includes(z.place)) errors.push(`Place "${z.place}" missing`);
  }
  if (fields.zones.every(z => z.decision !== 'HOLD') && /\bHOLD\b/.test(text)) errors.push('HOLD not in decision');
  if (fields.zones.every(z => z.decision !== 'DIVERT') && /\bDIVERT\b/.test(text)) errors.push('DIVERT not in decision');
  if (fields.noSafeDiversion && !text.includes(g.noDiversion)) errors.push('"No safe diversion" missing');

  const times = text.match(/\b\d{1,2}:\d{2}\s?(AM|PM)?/gi) ?? [];
  if (fields.reopeningEstimate) {
    if (!text.includes(fields.reopeningEstimate)) errors.push(`Time ${fields.reopeningEstimate} missing`);
    for (const t of times) if (t.trim() !== fields.reopeningEstimate) errors.push(`Unexpected time ${t.trim()}`);
  } else if (times.length) {
    errors.push(`Unexpected time ${times[0]!.trim()}`);
  }

  const allowed = new Set([fields.place, ...fields.zones.map(z => z.place).filter(Boolean) as string[]]);
  for (const p of knownPlaces) {
    if (!allowed.has(p) && ![...allowed].some(a => a.includes(p)) && text.includes(p)) errors.push(`Place "${p}" not in decision`);
  }
  for (const f of g.forbidden) if (lower.includes(f.toLowerCase())) errors.push(`Forbidden wording "${f}"`);

  return { ok: errors.length === 0, errors };
}

/**
 * Builds the text for each language. `generated` holds model output from the backend (may be absent);
 * when it fails validation the alert is blocked and the plain template is used (BR-09).
 */
export function buildAlertTexts(
  fields: AlertFields,
  knownPlaces: string[],
  generated: Partial<Record<Lang, string>> = {}
): AlertText[] {
  const out: AlertText[] = [];
  for (const lang of ['en', 'hi', 'as', 'bn'] as Lang[]) {
    const candidate = generated[lang];
    if (candidate !== undefined) {
      const v = validateAlert(candidate, fields, lang, knownPlaces);
      if (v.ok) {
        out.push({ lang, text: candidate, source: 'llm', validation: v, blocked: false });
        continue;
      }
      const tpl = renderTemplate(fields, lang);
      out.push({ lang, text: tpl, source: 'template', validation: v, blocked: true });
      continue;
    }
    const tpl = renderTemplate(fields, lang);
    out.push({ lang, text: tpl, source: 'template', validation: validateAlert(tpl, fields, lang, knownPlaces), blocked: false });
  }
  out.push({ lang: 'dis', text: '', source: 'pending_translation', validation: { ok: false, errors: ['Native-speaker template pending'] }, blocked: true });
  return out;
}

/** Re-validate after an officer edit. A failing edit is blocked and the template is kept (BR-09). */
export function applyOfficerEdit(current: AlertText, text: string, fields: AlertFields, knownPlaces: string[]): AlertText {
  if (current.lang === 'dis') return current;
  const lang = current.lang as Lang;
  const v = validateAlert(text, fields, lang, knownPlaces);
  if (v.ok) return { lang, text, source: 'officer_edit', validation: v, blocked: false };
  return { lang, text: renderTemplate(fields, lang), source: 'template', validation: v, blocked: true };
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * FR-31 / AC-22 CAP 1.2 export.
 * Mapping: CLOSE/HOLD/DIVERT -> Severe, Immediate; certainty Observed (officer-confirmed report) or Likely (risk only).
 * Caution -> Moderate, Expected. Reopening -> Minor, Expected (assumption). Area = approach-zone geofence circles.
 */
export function buildCap(params: {
  identifier: string;
  sent: Date;
  fields: AlertFields;
  texts: AlertText[];
  zones: ApproachZone[];
  sender?: string;
}): string {
  const { fields } = params;
  const severe = ['CLOSE', 'HOLD', 'DIVERT'].includes(fields.template);
  const severity = severe ? 'Severe' : fields.template === 'CAUTION' ? 'Moderate' : 'Minor';
  const urgency = severe ? 'Immediate' : 'Expected';
  const certainty = fields.template === 'REOPEN' ? 'Observed' : fields.certainty;
  const sent = params.sent.toISOString().replace(/\.\d{3}Z$/, '+00:00');

  const areas = params.zones
    .map(z => `      <area>\n        <areaDesc>${xmlEscape(`${z.id} ${z.name}`)}</areaDesc>\n        <circle>${z.center[0].toFixed(4)},${z.center[1].toFixed(4)} ${z.extentKm.toFixed(1)}</circle>\n      </area>`)
    .join('\n');

  const infos = params.texts
    .filter(t => t.lang !== 'dis' && t.text)
    .map(t => {
      const capCode = ALERT_LANGUAGES.find(l => l.code === t.lang)!.capCode;
      return `  <info>
    <language>${capCode}</language>
    <category>Geo</category>
    <event>Hill road landslide hazard</event>
    <urgency>${urgency}</urgency>
    <severity>${severity}</severity>
    <certainty>${certainty}</certainty>
    <headline>${xmlEscape(`NH-27 ${fields.segmentId} ${fields.template}`)}</headline>
    <description>${xmlEscape(t.text)}</description>
${areas}
  </info>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${xmlEscape(params.identifier)}</identifier>
  <sender>${xmlEscape(params.sender ?? 'resilion-2.0@control-room.local')}</sender>
  <sent>${sent}</sent>
  <status>Actual</status>
  <msgType>${fields.template === 'REOPEN' ? 'Update' : 'Alert'}</msgType>
  <scope>Public</scope>
${infos}
</alert>`;
}

export function capField(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
}
