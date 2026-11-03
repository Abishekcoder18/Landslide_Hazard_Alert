import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { CorridorMap } from '../components/CorridorMap';
import { RiskBadge, RoadStateBadge, SampleTag } from '../components/Badges';
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
  const sample = list.some(s => s.inputs.sample);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Corridor" right={sample ? <SampleTag /> : undefined} />
      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Segments at risk" value={atRisk} tone={atRisk ? 'alert' : 'default'} />
          <Kpi label="Zones on HOLD" value={holds} tone={holds ? 'alert' : 'default'} />
          <Kpi label="No data" value={noData} />
          <Kpi label="Open approvals" value={openApprovals} />
          <Kpi label="Open incidents" value={Object.keys(openIncidentBySegment).length} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-start">
          <div className="lg:col-span-7">
            <CorridorMap
              segments={segments}
              holdingPoints={holdingPoints}
              zones={snap.zones}
              selectedSegmentId={selected}
              onSelectSegment={setSelected}
              heightClass="h-[560px]"
            />
          </div>

          <Card className="lg:col-span-3 flex flex-col h-[560px] overflow-hidden">
            <CardHeader title={`Segments · ${list.length}`} right={<span className="text-[11px] text-[#6B7280]">Risk Index</span>} />
            <div className="flex-1 overflow-y-auto divide-y divide-[#E7E3DA]">
              {list.map(seg => (
                <button
                  key={seg.id}
                  onClick={() => setSelected(seg.id)}
                  className={cx('w-full text-left px-4 py-2.5 transition-colors', selected === seg.id ? 'bg-[#3780C8]/10' : 'hover:bg-[#FAF8F3]')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[#1F2933] truncate">
                      <span className="font-mono text-[#6B7280] mr-1.5">{seg.id}</span>
                      {seg.name}
                    </span>
                    <span className="text-[12px] font-mono text-[#6B7280] tabular-nums">{seg.riskIndex ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <RiskBadge level={seg.riskLevel} />
                      <RoadStateBadge state={seg.roadState} />
                    </div>
                    <span className="text-[11px] font-mono text-[#6B7280]">km {seg.startKm}–{seg.endKm}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </PageBody>
      <SegmentDrawer segmentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
};
