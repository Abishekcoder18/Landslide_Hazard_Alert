import React, { useState } from 'react';
import { useDemo } from '../context/DemoContext';
import { CorridorMap } from '../components/CorridorMap';
import { RiskBadge, RoadStateBadge } from '../components/Badges';
import { SegmentDrawer } from '../components/SegmentDrawer';
import { TopBar } from '../components/TopBar';

export const CorridorPage: React.FC = () => {
  const { segments, holdingPoints, pendingApprovalsCount, incident } = useDemo();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const segmentList = Object.values(segments);

  // 4 KPI tiles: Segments at risk, Active holds, Pending approvals, Open incidents
  const segmentsAtRisk = segmentList.filter(s => s.riskLevel === 'ORANGE' || s.riskLevel === 'RED' || s.roadState === 'BLOCKED').length;
  const activeHolds = segmentList.filter(s => s.riskLevel === 'ORANGE' || s.roadState === 'BLOCKED').length;
  const openIncidents = incident.status !== 'reopened_full' ? 1 : 0;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Corridor" />

      <div className="p-6 space-y-4 max-w-[1720px] w-full mx-auto">
        
        {/* Above the map: Four small KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-[#E7E3DA] p-3 shadow-xs">
            <div className="text-[11px] font-medium text-[#6B7280]">Segments at risk</div>
            <div className="text-xl font-semibold text-[#1F2933] mt-0.5">{segmentsAtRisk}</div>
          </div>

          <div className="bg-white rounded-lg border border-[#E7E3DA] p-3 shadow-xs">
            <div className="text-[11px] font-medium text-[#6B7280]">Active holds</div>
            <div className="text-xl font-semibold text-[#1F2933] mt-0.5">{activeHolds}</div>
          </div>

          <div className="bg-white rounded-lg border border-[#E7E3DA] p-3 shadow-xs">
            <div className="text-[11px] font-medium text-[#6B7280]">Pending approvals</div>
            <div className="text-xl font-semibold text-[#1F2933] mt-0.5">{pendingApprovalsCount}</div>
          </div>

          <div className="bg-white rounded-lg border border-[#E7E3DA] p-3 shadow-xs">
            <div className="text-[11px] font-medium text-[#6B7280]">Open incidents</div>
            <div className="text-xl font-semibold text-[#1F2933] mt-0.5">{openIncidents}</div>
          </div>
        </div>

        {/* Map (about 70% width) + Narrow Right Panel Listing Segments (about 30% width) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-start">
          
          {/* Main Map (7 cols) */}
          <div className="lg:col-span-7">
            <CorridorMap
              segments={segments}
              holdingPoints={holdingPoints}
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={segId => setSelectedSegmentId(segId)}
              heightClass="h-[620px]"
            />
          </div>

          {/* Narrow Right Panel Listing Segments (3 cols) */}
          <div className="lg:col-span-3 bg-white rounded-lg border border-[#E7E3DA] shadow-xs flex flex-col h-[620px] overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-[#E7E3DA] flex items-center justify-between text-xs font-medium text-[#6B7280]">
              <span>Segments ({segmentList.length})</span>
              <span>NH-27</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#E7E3DA]">
              {segmentList.map(seg => {
                const isSelected = selectedSegmentId === seg.id;
                return (
                  <div
                    key={seg.id}
                    onClick={() => setSelectedSegmentId(seg.id)}
                    className={`p-3 transition-colors cursor-pointer text-xs ${
                      isSelected 
                        ? 'bg-[#3780C8]/10' 
                        : 'hover:bg-[#FAF8F3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="font-semibold text-[#1F2933] truncate">
                        {seg.name}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <RiskBadge level={seg.riskLevel} size="sm" />
                        <RoadStateBadge state={seg.roadState} />
                      </div>
                      <span className="text-[11px] text-[#6B7280] font-mono shrink-0">
                        {seg.kmRange.replace('km ', '')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2 border-t border-[#E7E3DA] text-[11px] text-[#6B7280] bg-[#FAF8F3] text-center">
              Click segment to open details
            </div>
          </div>

        </div>

      </div>

      {/* Segment details drawer */}
      <SegmentDrawer
        segmentId={selectedSegmentId}
        onClose={() => setSelectedSegmentId(null)}
      />
    </div>
  );
};
