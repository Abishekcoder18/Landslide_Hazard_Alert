import React, { useState } from 'react';
import { useDemo } from '../context/DemoContext';
import { TopBar } from '../components/TopBar';
import { DecisionChip, EstTag } from '../components/Badges';
import { evaluateApproachZoneDecision, SCRIPTED_SCENARIOS, runScriptedScenario, parseClockTime } from '../utils/decisionEngine';
import { ChevronDown, ChevronRight, CheckCircle2, MessageSquare, CornerUpRight, PauseCircle } from 'lucide-react';

export const DecisionsPage: React.FC = () => {
  const { approachZones, segments, holdingPoints, incident } = useDemo();
  const [activeTab, setActiveTab] = useState<'cards' | 'traveller'>('cards');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('AZ-07N');
  const [ruleChecksOpen, setRuleChecksOpen] = useState<boolean>(false);
  const [travellerLang, setTravellerLang] = useState<'en' | 'hi' | 'as' | 'dimasa'>('en');

  // Scripted scenario test results
  const testResults = SCRIPTED_SCENARIOS.map(s => ({
    scenario: s,
    result: runScriptedScenario(s)
  }));
  const passedCount = testResults.filter(t => t.result.passed).length;

  const reopeningEstimate = parseClockTime(incident.reopeningEstimate);
  const formatWait = (min?: number) =>
    min === undefined ? '—' : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

  const selectedZone = approachZones.find(z => z.id === selectedZoneId) || approachZones[0];
  const targetSeg = segments[selectedZone.segmentId] || segments['S-07'];
  const activeDecision = evaluateApproachZoneDecision(selectedZone, targetSeg, segments, holdingPoints, { reopeningEstimate });

  const travellerTexts = {
    en: {
      hold: 'Hold at Haflong',
      detail: 'Road ahead blocked between Jatinga and Harangajao',
      diversion: 'No safe diversion',
      facilities: 'Facilities: food, fuel, shelter, medical aid'
    },
    hi: {
      hold: 'हाफलोंग में रुकें (HOLD)',
      detail: 'जटिंगा और हरंगजाओ के बीच मार्ग अवरुद्ध',
      diversion: 'कोई सुरक्षित वैकल्पिक मार्ग नहीं',
      facilities: 'सुविधाएं: भोजन, ईंधन, विश्राम केंद्र, चिकित्सा'
    },
    as: {
      hold: 'হাফলঙত ৰওক (HOLD)',
      detail: 'জাতিংগা আৰু হাৰাংগাজাওৰ মাজত পথ বন্ধ',
      diversion: 'কোনো সুৰক্ষিত বিকল্প পথ নাই',
      facilities: 'সুবিধাসমূহ: খাদ্য, ইন্ধন, আশ্ৰয়স্থল, চিকিৎসা'
    },
    dimasa: {
      hold: 'Haflong ha thikhnani (HOLD)',
      detail: 'Jatinga aroni Harangajao gajao lama phan dong',
      diversion: 'Gasa lama dongya',
      facilities: 'Subida: jiba, thikhna, doro'
    }
  };

  const currentMsg = travellerTexts[travellerLang];

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Decisions" />

      <div className="p-6 space-y-5 max-w-[1720px] w-full mx-auto">
        
        {/* Tabs: Decisions vs Traveller message */}
        <div className="flex items-center gap-1 border-b border-[#E7E3DA] pb-2 text-xs">
          <button
            onClick={() => setActiveTab('cards')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'cards'
                ? 'bg-[#3780C8] text-white'
                : 'text-[#6B7280] hover:text-[#1F2933]'
            }`}
          >
            Approach zones ({approachZones.length})
          </button>
          <button
            onClick={() => setActiveTab('traveller')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'traveller'
                ? 'bg-[#3780C8] text-white'
                : 'text-[#6B7280] hover:text-[#1F2933]'
            }`}
          >
            Traveller message
          </button>
        </div>

        {/* Tab 1: Grid of approach-zone cards */}
        {activeTab === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {approachZones.map(zone => {
              const seg = segments[zone.segmentId] || segments['S-07'];
              const res = evaluateApproachZoneDecision(zone, seg, segments, holdingPoints, { reopeningEstimate });
              const hp = res.holdingPoint;
              const isEligible = res.holdingEligibility.isEligible;
              const diversionText = res.diversionCheck.isOffered 
                ? (res.diversionCheck.routeCandidateName || 'Checked route') 
                : 'No safe diversion';

              return (
                <div
                  key={zone.id}
                  className="bg-white rounded-lg border border-[#E7E3DA] p-4 shadow-xs space-y-3"
                >
                  {/* Top row: Zone ID, direction, segment ahead, decision chip */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#E7E3DA] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E7E3DA] text-[#1F2933]">
                          {zone.id}
                        </span>
                        <span className="font-semibold text-sm text-[#1F2933]">
                          {zone.name}
                        </span>
                      </div>
                      <div className="text-xs text-[#6B7280] mt-1">
                        {zone.direction} · {zone.targetSegmentName} ({zone.locationKm})
                      </div>
                    </div>

                    <DecisionChip decision={res.decision} size="lg" />
                  </div>

                  {/* Summary items: Holding point, Diversion result, Expected wait */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-[#FAF8F3] border border-[#E7E3DA] space-y-0.5">
                      <span className="text-[11px] text-[#6B7280] block">Holding point</span>
                      <span className="font-medium text-[#1F2933] block truncate">
                        {hp ? `${hp.name.split(' ')[0]} · ${isEligible ? 'eligible' : 'ineligible'}` : 'None'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-[#FAF8F3] border border-[#E7E3DA] space-y-0.5">
                      <span className="text-[11px] text-[#6B7280] block">Diversion</span>
                      <span className="font-medium text-[#1F2933] block truncate">
                        {diversionText}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: expected wait & rule ID */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="text-[#1F2933]">
                      <span className="text-[#6B7280]">Expected wait: </span>
                      <span className="font-mono font-medium">{formatWait(res.expectedWaitMinutes)}</span>
                      {res.expectedWaitMinutes !== undefined && <EstTag className="ml-1" />}
                    </div>

                    <div className="font-mono text-[11px] text-[#6B7280]">
                      {res.ruleId}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Traveller message mockup */}
        {activeTab === 'traveller' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            
            {/* Phone Mockup (5 cols) */}
            <div className="md:col-span-5 flex justify-center">
              <div className="w-[340px] rounded-3xl bg-[#1F2933] p-3 shadow-xl border-2 border-[#E7E3DA]">
                <div className="bg-[#FAF8F3] rounded-2xl overflow-hidden min-h-[520px] flex flex-col p-4 space-y-4 text-xs text-[#1F2933]">
                  
                  {/* Phone Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#E7E3DA]">
                    <span className="font-semibold text-xs text-[#1F2933]">NH-27 Pass</span>
                    <div className="flex gap-1 text-[10px]">
                      {(['en', 'hi', 'as', 'dimasa'] as const).map(l => (
                        <button
                          key={l}
                          onClick={() => setTravellerLang(l)}
                          className={`px-1.5 py-0.5 rounded font-medium ${
                            travellerLang === l ? 'bg-[#3780C8] text-white' : 'text-[#6B7280]'
                          }`}
                        >
                          {l.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Large Message Card */}
                  <div className="p-4 rounded-xl border border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00] space-y-2">
                    <div className="font-bold text-sm">
                      {currentMsg.hold}
                    </div>
                    <div className="text-xs">
                      {currentMsg.detail}
                    </div>
                    <div className="text-[11px] pt-1 border-t border-[#F3E29F]">
                      Reopening: <b>~{incident.reopeningEstimate || '4:00 PM'}</b> <EstTag />
                    </div>
                  </div>

                  {/* Diversion note */}
                  <div className="p-3 rounded-lg border border-[#E7E3DA] bg-white text-[11px] text-[#6B7280]">
                    {currentMsg.diversion}
                  </div>

                  {/* Facilities */}
                  <div className="p-3 rounded-lg border border-[#E7E3DA] bg-white text-[11px] space-y-1">
                    <div className="font-semibold text-[#1F2933]">Haflong Holding Area</div>
                    <div className="text-[#6B7280]">{currentMsg.facilities}</div>
                  </div>

                </div>
              </div>
            </div>

            {/* SMS Preview (7 cols) */}
            <div className="md:col-span-7 bg-white rounded-lg border border-[#E7E3DA] p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-2">
                <span className="font-semibold text-xs text-[#1F2933]">SMS query & reply</span>
                <span className="font-mono text-[11px] text-[#6B7280]">51969</span>
              </div>

              <div className="p-4 rounded-lg bg-[#FAF8F3] border border-[#E7E3DA] space-y-3 font-mono text-xs">
                <div className="flex justify-end">
                  <span className="px-3 py-1.5 rounded-lg bg-[#3780C8] text-white">
                    NH27 HAFLONG
                  </span>
                </div>
                <div className="flex justify-start">
                  <span className="px-3 py-1.5 rounded-lg bg-white border border-[#E7E3DA] text-[#1F2933] max-w-sm">
                    NH-27 S-07 BLOCKED. HOLD at Haflong. Est. reopening ~{incident.reopeningEstimate || '4:00 PM'}. No safe diversion.
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Collapsed "Rule checks · 12/12 passed" row at bottom */}
        <div className="border border-[#E7E3DA] rounded-lg bg-white overflow-hidden shadow-xs">
          <button
            onClick={() => setRuleChecksOpen(prev => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#1F2933] hover:bg-[#FAF8F3] transition-colors"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-4 h-4 ${passedCount === testResults.length ? 'text-[#2F6B45]' : 'text-[#9B2C2C]'}`} />
              <span>Rule checks · {passedCount}/{testResults.length} passed</span>
            </div>
            {ruleChecksOpen ? <ChevronDown className="w-4 h-4 text-[#6B7280]" /> : <ChevronRight className="w-4 h-4 text-[#6B7280]" />}
          </button>

          {ruleChecksOpen && (
            <div className="p-4 border-t border-[#E7E3DA] bg-[#FAF8F3] divide-y divide-[#E7E3DA] text-xs">
              {testResults.map(({ scenario, result }) => (
                <div key={scenario.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-medium text-[#1F2933] mr-2">{scenario.id}</span>
                    <span className="text-[#6B7280]">{scenario.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-[#6B7280]">{result.actualRuleId}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${result.passed ? 'bg-[#DFF1E5] text-[#2F6B45]' : 'bg-[#F8D7D7] text-[#9B2C2C]'}`}>
                      {result.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
