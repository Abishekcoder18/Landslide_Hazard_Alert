import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { DecisionChip, IncidentBadge, RISK_BAR, RiskBadge, RoadStateBadge, SampleTag } from './Badges';
import { Row, SectionLabel, cx } from './ui';
import { fmtAgo, fmtDay, fmtRemaining, fmtTime } from '../lib/format';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
    <SectionLabel className="px-3.5 h-9 flex items-center border-b border-line bg-subtle">{title}</SectionLabel>
    {children}
  </section>
);

export const SegmentDrawer: React.FC<{ segmentId: string | null; onClose: () => void }> = ({ segmentId, onClose }) => {
  const { now, can } = useApp();
  const { snap, segments, decisionByZone, openIncidentBySegment } = useCorridor();
  if (!segmentId) return null;
  const seg = segments[segmentId];
  if (!seg) return null;
  const zones = snap.zones.filter(z => z.segmentId === seg.id);
  const inc = openIncidentBySegment[seg.id];
  const i = seg.inputs;
  const controlRoom = can('approve_closure');
  const windowClosing = zones.some(z => decisionByZone[z.id]?.result.windowClosing);
  const v = (n: number | null, unit = '') => (n === null ? <span className="text-risk-red-fg">Missing</span> : `${n}${unit}`);
  const band = seg.roadState === 'BLOCKED' ? RISK_BAR.RED : RISK_BAR[seg.riskLevel];

  return (
    <div className="fixed inset-0 z-[1200]">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full max-w-md bg-app border-l border-line flex flex-col shadow-pop" aria-label={`Segment ${seg.id}`}>
        <div className="sticky top-0 bg-surface border-b border-line shrink-0">
          <div className={cx('h-1', band)} aria-hidden />
          <div className="px-5 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold px-2 h-6 inline-flex items-center rounded-chip bg-nav text-white">{seg.id}</span>
                <RiskBadge level={seg.riskLevel} />
              </div>
              <div className="text-[16px] font-semibold text-ink truncate">{seg.name}</div>
              <div className="text-[12px] text-ink-3 font-mono tabular-nums">km {seg.startKm}–{seg.endKm}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-ctl flex items-center justify-center text-ink-2 hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <Section title="Status">
            <div className="divide-y divide-line">
              <Row label="Risk level">
                <span className="inline-flex items-center gap-2">
                  <RiskBadge level={seg.riskLevel} />
                  <span className="font-mono text-ink">{seg.riskIndex ?? '—'}</span>
                </span>
              </Row>
              <Row label="Road state"><RoadStateBadge state={seg.roadState} /></Row>
              <Row label="Computed">{fmtTime(seg.computedAt)}</Row>
              <Row label="Valid for">{fmtRemaining(seg.validUntil, now)}</Row>
            </div>
          </Section>

          {controlRoom && windowClosing && (
            <div className="px-3 py-2 rounded-ctl bg-dec-caution-bg border border-dec-caution-line text-dec-caution-fg text-[13px] font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Window closing · IMD heavy rainfall
            </div>
          )}

          <Section title="Top reasons">
            <div className="p-3 flex flex-wrap gap-1.5">
              {seg.reasons.map(r => (
                <span key={r} className="px-2 py-1 rounded-chip text-[12px] text-ink bg-subtle border border-line">{r}</span>
              ))}
            </div>
          </Section>

          <Section title="Inputs">
            <div className="divide-y divide-line">
              {typeof i.susceptibilityScore === 'number' ? (
                <>
                  <Row label="Model susceptibility">
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono">{i.susceptibilityScore.toFixed(2)}</span>
                      <span className="text-ink-2">{i.susceptibility}</span>
                    </span>
                  </Row>
                  {i.modelVersion && <Row label="Model"><span className="font-mono text-xs">{i.modelVersion}</span></Row>}
                </>
              ) : (
                <Row label="GSI susceptibility">{i.susceptibility ?? <span className="text-risk-red-fg">Missing</span>}</Row>
              )}
              <Row label="Slope">{v(i.slopeDeg, '°')}</Row>
              <Row label="Rain 24h / 3d / 7d">
                <span className="font-mono">{v(i.rainfall24h)} / {v(i.rainfall3d)} / {v(i.rainfall7d)} mm</span>
              </Row>
              {i.rainfallDate && (
                <Row label="Rainfall">
                  <span className="font-mono text-xs">
                    {i.sources?.rainfall ?? (i.rainfallDate === 'live' ? 'Open-Meteo live' : `IMD · ${fmtDay(i.rainfallDate)}`)}
                  </span>
                </Row>
              )}
              <Row label={i.sources?.history ? 'Past landslides ≤ 500 m' : 'Past incidents'}>{v(i.pastIncidents)}</Row>
              <Row label="IMD warning">
                <span className="inline-flex flex-col items-end">
                  <span>{i.imdWarning === 'NONE' ? 'None' : i.imdWarning}</span>
                  {i.imdWarningSource && <span className="text-[11px] text-ink-3 font-mono">{i.imdWarningSource}</span>}
                </span>
              </Row>
              <Row label="GSI bulletin">{i.gsiBulletin ? 'Yes' : 'None'}</Row>
              <Row label="Updated">{fmtAgo(i.updatedAt, now)}</Row>
            </div>
            {i.sample ? (
              <div className="px-3 py-2.5 border-t border-line"><SampleTag /></div>
            ) : i.sources ? (
              <div className="px-3 py-2.5 border-t border-line flex flex-wrap gap-1.5">
                {[i.sources.terrain, i.sources.rainfall, i.sources.history].filter(Boolean).map(s => (
                  <span key={s} className="px-2 h-6 inline-flex items-center rounded-chip text-[11px] text-ink-2 bg-subtle border border-line">{s}</span>
                ))}
              </div>
            ) : null}
          </Section>

          {zones.length > 0 && (
            <Section title="Approach zones">
              <div className="divide-y divide-line">
                {zones.map(z => {
                  const d = decisionByZone[z.id];
                  return (
                    <div key={z.id} className="px-3.5 py-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">
                          <span className="font-mono mr-1.5">{z.id}</span>
                          <span className="text-ink-2">{z.direction}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <DecisionChip decision={d.result.decision} />
                          {d.heavyResult && <DecisionChip decision={d.heavyResult.decision} />}
                        </div>
                      </div>
                      <div className="text-[11px] text-ink-3 font-mono">{d.result.ruleId}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {inc && (
            <Section title="Incident">
              <div className="px-3.5 py-2.5 flex items-center justify-between text-[13px]">
                <span className="font-mono">{inc.id}</span>
                <IncidentBadge state={inc.state} />
              </div>
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
};
