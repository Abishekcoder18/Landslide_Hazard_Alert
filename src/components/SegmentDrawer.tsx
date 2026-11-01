import React from 'react';
import { useDemo } from '../context/DemoContext';
import { evaluateApproachZoneDecision } from '../utils/decisionEngine';
import { RiskBadge, RoadStateBadge, DecisionChip, EstTag } from './Badges';
import { X, Clock, MapPin, Compass, AlertTriangle } from 'lucide-react';

interface SegmentDrawerProps {
  segmentId: string | null;
  onClose: () => void;
}

export const SegmentDrawer: React.FC<SegmentDrawerProps> = ({ segmentId, onClose }) => {
  const { segments, holdingPoints, approachZones } = useDemo();

  if (!segmentId) return null;
  const segment = segments[segmentId];
  if (!segment) return null;

  const relatedZones = approachZones.filter(z => z.segmentId === segment.id);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-[#E7E3DA] flex flex-col shadow-xl">
          
          {/* Header */}
          <div className="h-14 px-5 border-b border-[#E7E3DA] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E7E3DA] text-[#1F2933]">
                {segment.id}
              </span>
              <h2 className="text-sm font-semibold text-[#1F2933] truncate">
                {segment.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[#6B7280] hover:text-[#1F2933] hover:bg-[#FAF8F3]"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs text-[#1F2933]">
            
            {/* Status & Validity Card */}
            <div className="p-3.5 rounded-lg border border-[#E7E3DA] bg-[#FAF8F3] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6B7280] font-medium">Status</span>
                <div className="flex items-center gap-1.5">
                  <RiskBadge level={segment.riskLevel} />
                  <RoadStateBadge state={segment.roadState} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#6B7280] pt-1 border-t border-[#E7E3DA]">
                <span>Valid: <b className="text-[#1F2933] font-mono">{segment.validUntil}</b></span>
                <span>Freshness: <b className="text-[#1F2933]">{segment.freshness}</b></span>
              </div>

              {segment.windowClosing && (
                <div className="p-2 rounded bg-[#FBF1CC] border border-[#F3E29F] text-[#7A5B00] text-[11px] font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Window closing · High rainfall expected</span>
                </div>
              )}
            </div>

            {/* Top 3 Reasons as Short Chips */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Key factors
              </div>
              <div className="flex flex-wrap gap-1.5">
                {segment.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="inline-block px-2.5 py-1 rounded-md text-xs bg-[#FAF8F3] border border-[#E7E3DA] text-[#1F2933]"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>

            {/* Inputs Table */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Inputs
              </div>

              <div className="rounded-lg border border-[#E7E3DA] overflow-hidden divide-y divide-[#E7E3DA]">
                <div className="px-3 py-2 flex justify-between bg-white">
                  <span className="text-[#6B7280]">Susceptibility</span>
                  <span className="font-medium text-[#1F2933]">{segment.inputs.susceptibility}</span>
                </div>
                <div className="px-3 py-2 flex justify-between bg-white">
                  <span className="text-[#6B7280]">Slope</span>
                  <span className="font-medium text-[#1F2933]">{segment.inputs.slope}</span>
                </div>
                <div className="px-3 py-2 flex justify-between bg-white">
                  <span className="text-[#6B7280]">Rainfall 24h / 3d / 7d</span>
                  <span className="font-mono text-[#1F2933]">
                    {segment.inputs.rainfall24h} / {segment.inputs.rainfall3d} / {segment.inputs.rainfall7d} mm
                  </span>
                </div>
                <div className="px-3 py-2 flex justify-between bg-white">
                  <span className="text-[#6B7280]">Past incidents</span>
                  <span className="font-medium text-[#1F2933]">{segment.inputs.pastIncidents}</span>
                </div>
                <div className="px-3 py-2 flex justify-between bg-white">
                  <span className="text-[#6B7280]">Warnings</span>
                  <span className="font-medium text-[#1F2933] truncate max-w-[180px]">{segment.inputs.warnings}</span>
                </div>
              </div>
            </div>

            {/* Approach Zone Decisions */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Approach zones
              </div>

              {relatedZones.length === 0 ? (
                <div className="p-3 text-center text-[#6B7280] bg-[#FAF8F3] rounded-lg border border-[#E7E3DA]">
                  No approach zones mapped
                </div>
              ) : (
                <div className="space-y-2">
                  {relatedZones.map(zone => {
                    const res = evaluateApproachZoneDecision(zone, segment, segments, holdingPoints);
                    return (
                      <div key={zone.id} className="p-3 rounded-lg border border-[#E7E3DA] bg-white space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-xs text-[#1F2933]">{zone.name}</span>
                            <div className="text-[11px] text-[#6B7280]">{zone.locationKm}</div>
                          </div>
                          <DecisionChip decision={res.decision} size="sm" />
                        </div>

                        <div className="text-[11px] text-[#6B7280]">
                          Rule: <span className="font-mono text-[#1F2933]">{res.ruleId}</span>
                        </div>

                        {res.holdingPoint && (
                          <div className="text-[11px] text-[#1F2933] pt-1 border-t border-[#E7E3DA]">
                            Holding: {res.holdingPoint.name} · {res.holdingEligibility.isEligible ? 'eligible' : 'ineligible'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
