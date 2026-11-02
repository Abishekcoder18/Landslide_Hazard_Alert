/**
 * Phase 9: writes backend/inputs/translations_review.csv — every alert template line for hi / as / bn, straight from
 * GLOSSARY in src/domain/alerts.ts, for native-speaker review. Translations are NOT changed here; the owner returns the
 * sheet with corrected_text / reviewer_name / ok filled in.
 * Run: npx tsx scripts/translation-sheet.ts
 */
import fs from 'node:fs';
import { GLOSSARY } from '../src/domain/alerts';

type Row = { template_id: string; lang: string; text: string; english_reference: string };
const rows: Row[] = [];
const en = GLOSSARY.en;
for (const lang of ['hi', 'as', 'bn'] as const) {
  const g = GLOSSARY[lang];
  for (const k of Object.keys(g.head) as (keyof typeof g.head)[]) rows.push({ template_id: `head.${k}`, lang, text: g.head[k], english_reference: en.head[k] });
  for (const k of Object.keys(g.dir) as (keyof typeof g.dir)[]) rows.push({ template_id: `dir.${k}`, lang, text: g.dir[k], english_reference: en.dir[k] });
  for (const k of Object.keys(g.zone) as (keyof typeof g.zone)[]) rows.push({ template_id: `zone.${k}`, lang, text: g.zone[k], english_reference: en.zone[k] });
  rows.push({ template_id: 'noDiversion', lang, text: g.noDiversion, english_reference: en.noDiversion });
  rows.push({ template_id: 'estimate', lang, text: g.estimate, english_reference: en.estimate });
  g.forbidden.forEach((w, i) => rows.push({ template_id: `forbidden.${i + 1}`, lang, text: w, english_reference: '(word that must never appear: no hurry wording, BR-11)' }));
}
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const header = 'template_id,lang,text,english_reference,corrected_text,reviewer_name,ok';
const lines = rows.map(r => [r.template_id, r.lang, q(r.text), q(r.english_reference), '', '', ''].join(','));
fs.mkdirSync('backend/inputs', { recursive: true });
// BOM so Excel opens the Devanagari / Bengali-Assamese text as UTF-8.
fs.writeFileSync('backend/inputs/translations_review.csv', '﻿' + [header, ...lines].join('\n') + '\n', 'utf8');
console.log(`${rows.length} rows -> backend/inputs/translations_review.csv`);
