import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { DecisionChip, IncidentBadge, RiskBadge, RoadStateBadge, SampleTag } from './Badges';
import { Row } from './ui';
import { fmtAgo, fmtRemaining, fmtTime } from '../lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2022-05-15" -> "15 May 2022" (calendar date, no time-zone shift). */
const fmtDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return y && m && day ? `${day} ${MONTHS[m - 1]} ${y}` : d;
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-1.5">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">{title}</div>
    {children}
  </div>
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
  const v = (n: number | null, unit = '') => (n === null ? <span className="text-[#9B2C2C]">Missing</span> : `${n}${unit}`);

  return (
    <div className="fixed inset-0 z-[1200]">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-[#E7E3DA] flex flex-col shadow-xl" aria-label={`Segment ${seg.id}`}>
        <div className="h-14 px-5 border-b border-[#E7E3DA] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[#1F2933] truncate">
              <span className="font-mono text-[#6B7280] mr-1.5">{seg.id}</span>
              {seg.name}
            </div>
            <div className="text-[11px] text-[#6B7280] font-mono">km {seg.startKm}–{seg.endKm}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#FAF8F3]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          <div className="rounded-lg border border-[#E7E3DA] divide-y divide-[#E7E3DA]">
            <Row label="Risk level">
              <span className="inline-flex items-center gap-2">
                <RiskBadge level={seg.riskLevel} />
                <span className="font-mono text-[#6B7280]">{seg.riskIndex ?? '—'}</span>
              </span>
            </Row>
            <Row label="Road state"><RoadStateBadge state={seg.roadState} /></Row>
            <Row label="Computed">{fmtTime(seg.computedAt)}</Row>
            <Row label="Valid for">{fmtRemaining(seg.validUntil, now)}</Row>
          </div>

          {controlRoom && windowClosing && (
            <div className="px-3 py-2 rounded-md bg-[#FBF1CC] border border-[#F3E29F] text-[#7A5B00] text-[13px] font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Window closing · IMD heavy rainfall
            </div>
          )}

          <Section title="Top reasons">
            <div className="flex flex-wrap gap-1.5">
              {seg.reasons.map(r => (
                <span key={r} className="px-2 py-1 rounded-md text-xs bg-[#FAF8F3] border border-[#E7E3DA]">{r}</span>
              ))}
            </div>
          </Section>

          <Section title="Inputs">
            <div className="rounded-lg border border-[#E7E3DA] divide-y divide-[#E7E3DA]">
              {typeof i.susceptibilityScore === 'number' ? (
                <>
                  <Row label="Model susceptibility">
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono">{i.susceptibilityScore.toFixed(2)}</span>
                      <span className="text-[#6B7280]">{i.susceptibility}</span>
                    </span>
                  </Row>
                  {i.modelVersion && <Row label="Model"><span className="font-mono text-xs">{i.modelVersion}</span></Row>}
                </>
              ) : (
                <Row label="GSI susceptibility">{i.susceptibility ?? <span className="text-[#9B2C2C]">Missing</span>}</Row>
              )}
              <Row label="Slope">{v(i.slopeDeg, '°')}</Row>
              <Row label="Rain 24h / 3d / 7d">
                <span className="font-mono">{v(i.rainfall24h)} / {v(i.rainfall3d)} / {v(i.rainfall7d)} mm</span>
              </Row>
              {i.rainfallDate && (
                <Row label="Rainfall">
                  <span className="font-mono">
                    {i.sources?.rainfall ?? (i.rainfallDate === 'live' ? 'Open-Meteo live' : `IMD · ${fmtDay(i.rainfallDate)}`)}
                  </span>
                </Row>
              )}
              <Row label={i.sources?.history ? 'Past landslides ≤ 500 m' : 'Past incidents'}>{v(i.pastIncidents)}</Row>
              <Row label="IMD warning">
                <span className="inline-flex flex-col items-end">
                  <span>{i.imdWarning === 'NONE' ? 'None' : i.imdWarning}</span>
                  {i.imdWarningSource && <span className="text-[11px] text-[#6B7280] font-mono">{i.imdWarningSource}</span>}
                </span>
              </Row>
              <Row label="GSI bulletin">{i.gsiBulletin ? 'Yes' : 'None'}</Row>
              <Row label="Updated">{fmtAgo(i.updatedAt, now)}</Row>
            </div>
            {i.sample ? (
              <SampleTag />
            ) : i.sources ? (
              <div className="flex flex-wrap gap-1.5">
                {[i.sources.terrain, i.sources.rainfall, i.sources.history].filter(Boolean).map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-md text-[11px] text-[#6B7280] bg-[#FAF8F3] border border-[#E7E3DA]">{s}</span>
                ))}
              </div>
            ) : null}
          </Section>

          {zones.length > 0 && (
            <Section title="Approach zones">
              <div className="space-y-2">
                {zones.map(z => {
                  const d = decisionByZone[z.id];
                  return (
                    <div key={z.id} className="rounded-lg border border-[#E7E3DA] px-3 py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium">
                          <span className="font-mono mr-1.5">{z.id}</span>
                          <span className="text-[#6B7280]">{z.direction}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <DecisionChip decision={d.result.decision} />
                          {d.heavyResult && <DecisionChip decision={d.heavyResult.decision} />}
                        </div>
                      </div>
                      <div className="text-xs text-[#6B7280] font-mono">{d.result.ruleId}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {inc && (
            <Section title="Incident">
              <div className="rounded-lg border border-[#E7E3DA] px-3 py-2.5 flex items-center justify-between text-[13px]">
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
