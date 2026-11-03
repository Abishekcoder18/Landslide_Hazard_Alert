import React, { useState } from 'react';
import { AlertOctagon, AlertTriangle, CircleSlash, FileCheck2, Hand } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { CorridorMap } from '../components/CorridorMap';
import { RISK_BAR, RISK_LINE, RiskBadge, RoadStateBadge } from '../components/Badges';
import { SegmentDrawer } from '../components/SegmentDrawer';
import { Card, CardHeader, Kpi, PageBody, cx } from '../components/ui';
import { useCorridor } from '../state/selectors';

export const CorridorPage: React.FC = () => {
  const { snap, segments, corridorSegments, holdingPoints, decisionByZone, openIncidentBySegment } = useCorridor();
  const [selected, setSelected] = useState<string | null>(null);
  const list = corridorSegments;

  const atRisk = list.filter(s => s.riskLevel === 'ORANGE' || s.riskLevel === 'RED' || s.roadState === 'BLOCKED').length;
  const holds = Object.values(decisionByZone).filter(d => d.result.decision === 'HOLD' || d.heavyResult?.decision === 'HOLD').length;
  const noData = list.filter(s => s.riskLevel === 'NO_DATA' || s.roadState === 'UNKNOWN').length;
  const openApprovals = snap.approvals.filter(a => a.status === 'pending' || a.status === 'escalated').length;
  const escalated = snap.approvals.filter(a => a.status === 'escalated').length;
  const openIncidents = Object.keys(openIncidentBySegment).length;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Corridor" />
      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="Segments at risk" value={atRisk} sub={`of ${list.length} segments`} icon={AlertTriangle} tone="red" accent={atRisk > 0} />
          <Kpi label="Zones on HOLD" value={holds} sub={`of ${snap.zones.length} zones`} icon={Hand} tone="orange" accent={holds > 0} />
          <Kpi label="No data" value={noData} sub={`of ${list.length} segments`} icon={CircleSlash} tone="neutral" />
          <Kpi label="Open approvals" value={openApprovals} sub={escalated ? `${escalated} escalated` : 'none escalated'} icon={FileCheck2} tone="primary" />
          <Kpi label="Open incidents" value={openIncidents} sub="not fully reopened" icon={AlertOctagon} tone="primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-start">
          <div className="lg:col-span-7">
            <CorridorMap
              segments={segments}
              holdingPoints={holdingPoints}
              zones={snap.zones}
              selectedSegmentId={selected}
              onSelectSegment={setSelected}
              heightClass="h-[600px]"
            />
          </div>

          <Card className="lg:col-span-3 flex flex-col h-[600px] overflow-hidden">
            <CardHeader title={`Segments · ${list.length}`} right={<span className="text-[11px] font-semibold uppercase tracking-[.05em] text-ink-3">Risk Index</span>} />
            <div className="flex-1 overflow-y-auto divide-y divide-line">
              {list.map(seg => {
                const blocked = seg.roadState === 'BLOCKED';
                const ri = seg.riskIndex;
                return (
                  <button
                    key={seg.id}
                    onClick={() => setSelected(seg.id)}
                    className={cx(
                      'relative w-full text-left pl-5 pr-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                      selected === seg.id ? 'bg-primary-tint' : 'hover:bg-subtle'
                    )}
                  >
                    <span className={cx('absolute left-0 inset-y-0 w-1', blocked ? RISK_BAR.RED : RISK_BAR[seg.riskLevel])} aria-hidden />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-ink truncate">
                        <span className="font-mono text-[12px] text-ink-2 mr-1.5">{seg.id}</span>
                        {seg.name}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0" title={`Risk Index ${ri ?? '—'}`}>
                        <span className="w-12 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden>
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, ri ?? 0))}%`, background: RISK_LINE[seg.riskLevel] }} />
                        </span>
                        <span className="w-6 text-right text-[12px] font-mono font-semibold text-ink tabular-nums">{ri ?? '—'}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <div className="flex items-center gap-1.5">
                        <RiskBadge level={seg.riskLevel} />
                        <RoadStateBadge state={seg.roadState} />
                      </div>
                      <span className="text-[11px] font-mono text-ink-3 tabular-nums">km {seg.startKm}–{seg.endKm}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </PageBody>
      <SegmentDrawer segmentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
};
