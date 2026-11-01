import React, { useMemo, useState } from 'react';
import { AlertTriangle, MapPin, Route, Clock, ShieldCheck, Megaphone } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { DecisionChip, EstTag, Pill, RiskBadge, RoadStateBadge } from '../components/Badges';
import { Button, Card, CardHeader, PageBody, Tabs, Td, Th, cx } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { api } from '../api';
import { SCRIPTED_SCENARIOS, runScriptedScenario } from '../domain/decisionEngine';
import { ALERT_LANGUAGES, renderTemplate } from '../domain/alerts';
import { AlertFields, AlertTemplate, ApproachZone, DecisionResult, ZoneDecision } from '../types';
import { fmtClock, fmtTime, fmtWait } from '../lib/format';

const Line: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-2 text-[13px]">
    <span className="text-[#6B7280] mt-0.5">{icon}</span>
    <span className="text-[#6B7280] w-24 shrink-0">{label}</span>
    <span className="text-[#1F2933] font-medium min-w-0">{children}</span>
  </div>
);

function holdingText(r: DecisionResult) {
  if (r.decision !== 'HOLD') return r.holdingPoint ? `${r.holdingPoint.shortName} · standby` : '—';
  return r.holdingPoint ? r.holdingPoint.name : 'No eligible holding point';
}

const ZoneCard: React.FC<{ zone: ApproachZone; d: ZoneDecision }> = ({ zone, d }) => {
  const { can, act } = useApp();
  const { segments } = useCorridor();
  const seg = segments[zone.segmentId];
  const r = d.result;
  const controlRoom = can('approve_closure');
  const hasDiversion = (zone.diversionRoutes?.length ?? 0) > 0;

  return (
    <Card>
      <div className="px-4 py-3 border-b border-[#E7E3DA] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">
            <span className="font-mono mr-1.5">{zone.id}</span>
            <span className="text-[#6B7280] font-medium">{zone.direction} · km {zone.locationKm.toFixed(1)}</span>
          </div>
          <div className="text-xs text-[#6B7280] mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{seg.id} {seg.name}</span>
            <RiskBadge level={seg.riskLevel} />
            <RoadStateBadge state={seg.roadState} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <DecisionChip decision={r.decision} size="lg" />
          {d.heavyResult && (
            <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
              Heavy <DecisionChip decision={d.heavyResult.decision} />
            </span>
          )}
          {r.closeRecommended && <DecisionChip decision="CLOSE" />}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <Line icon={<ShieldCheck className="w-3.5 h-3.5" />} label="Rule">
          <span className="font-mono">{r.ruleId}</span>
        </Line>
        <Line icon={<MapPin className="w-3.5 h-3.5" />} label="Holding">
          {holdingText(r)}
          {r.decision === 'HOLD' && r.holdingPoint?.provisional && <Pill tone="grey" className="ml-1.5 !text-[10px]">Provisional</Pill>}
        </Line>
        {(hasDiversion || r.decision === 'DIVERT') && (
          <Line icon={<Route className="w-3.5 h-3.5" />} label="Diversion">
            {r.diversionCheck.isOffered ? r.diversionCheck.routeCandidateName : 'No safe diversion'}
          </Line>
        )}
        <Line icon={<Clock className="w-3.5 h-3.5" />} label="Expected wait">
          {r.expectedWaitMinutes !== undefined ? (
            <span className="inline-flex items-center gap-1.5">
              {fmtWait(r.expectedWaitMinutes)} <EstTag />
            </span>
          ) : (
            '—'
          )}
        </Line>
        {controlRoom && r.windowClosing && (
          <div className="px-2.5 py-1.5 rounded-md bg-[#FBF1CC] border border-[#F3E29F] text-[#7A5B00] text-xs font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Window closing
          </div>
        )}
        {d.officerClearedPassage && (
          <div className="text-xs text-[#2A649C]">Passage cleared · {d.officerClearedPassage.by} · {fmtTime(d.officerClearedPassage.at)}</div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-[#E7E3DA] flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#6B7280]">Since {fmtTime(d.at)}</span>
        {can('clear_passage') && seg.riskLevel === 'ORANGE' && seg.roadState === 'OPEN' && !d.officerClearedPassage && (
          <Button size="sm" onClick={() => act(s => api.clearPassage(s, zone.id), `${zone.id} passage cleared`)}>
            Clear passage
          </Button>
        )}
      </div>
    </Card>
  );
};

function travellerFields(zone: ApproachZone, d: ZoneDecision, segName: string, estimate?: string): AlertFields {
  const r = d.result;
  const template: AlertTemplate = r.closeRecommended ? (r.decision === 'DIVERT' ? 'DIVERT' : 'CLOSE') : r.decision === 'HOLD' ? 'HOLD' : 'CAUTION';
  return {
    segmentId: zone.segmentId,
    place: segName,
    template,
    zones: [
      {
        zoneId: zone.id,
        direction: zone.direction,
        decision: r.decision,
        place: r.decision === 'HOLD' ? r.holdingPoint?.shortName : r.decision === 'DIVERT' ? r.diversionCheck.routeCandidateName : undefined
      }
    ],
    noSafeDiversion: r.decision === 'HOLD' && r.closeRecommended,
    reopeningEstimate: r.decision === 'HOLD' && estimate ? fmtClock(estimate) : undefined,
    certainty: 'Likely'
  };
}

const TravellerPreview: React.FC = () => {
  const { snap, segments, decisionByZone, openIncidentBySegment } = useCorridor();
  const [zoneId, setZoneId] = useState(() => (snap.zones.find(z => ['HOLD', 'DIVERT'].includes(decisionByZone[z.id]?.result.decision)) ?? snap.zones[0])?.id);
  const [lang, setLang] = useState<'en' | 'hi' | 'as' | 'bn' | 'dis'>('en');
  const zone = snap.zones.find(z => z.id === zoneId)!;
  const d = decisionByZone[zone.id];
  const seg = segments[zone.segmentId];
  const inc = openIncidentBySegment[zone.segmentId];
  const fields = travellerFields(zone, d, seg.name, inc?.reopeningEstimate);
  const r = d.result;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <Card className="lg:col-span-4">
        <CardHeader title="Approach zone" />
        <div className="divide-y divide-[#E7E3DA]">
          {snap.zones.map(z => (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              className={cx('w-full px-4 py-2.5 flex items-center justify-between text-left', z.id === zoneId ? 'bg-[#3780C8]/10' : 'hover:bg-[#FAF8F3]')}
            >
              <span className="text-[13px]">
                <span className="font-mono font-medium mr-1.5">{z.id}</span>
                <span className="text-[#6B7280]">{z.direction}</span>
              </span>
              <DecisionChip decision={decisionByZone[z.id].result.decision} />
            </button>
          ))}
        </div>
      </Card>

      <Card className="lg:col-span-8">
        <CardHeader
          title={`Traveller message · ${zone.id}`}
          right={
            <div className="flex gap-1">
              {ALERT_LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={cx('px-2 h-7 rounded-md text-xs font-medium', lang === l.code ? 'bg-[#3780C8] text-white' : 'text-[#6B7280] hover:bg-[#FAF8F3]')}
                >
                  {l.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#E7E3DA] bg-[#FAF8F3] p-4 space-y-3">
            <DecisionChip decision={r.decision} size="lg" />
            <div className="text-[15px] font-semibold text-[#1F2933]">
              {r.decision === 'HOLD' ? `Hold at ${r.holdingPoint?.shortName ?? '—'}` : r.decision === 'DIVERT' ? `Divert via ${r.diversionCheck.routeCandidateName}` : r.decision === 'GO_CAUTION' ? 'Proceed with caution' : 'Road open'}
            </div>
            <div className="text-[13px] text-[#6B7280]">{seg.id} {seg.name}</div>
            {r.decision === 'HOLD' && r.closeRecommended && <div className="text-[13px]">No safe diversion</div>}
            {r.decision === 'HOLD' && (
              <div className="text-[13px] flex items-center gap-1.5">
                Reopening {inc?.reopeningEstimate ? fmtClock(inc.reopeningEstimate) : '—'} <EstTag />
              </div>
            )}
            {r.decision === 'HOLD' && r.holdingPoint && (
              <div className="flex flex-wrap gap-1 pt-1">
                {r.holdingPoint.facilities.map(f => (
                  <Pill key={f} tone="grey" className="!text-[11px]">{f}</Pill>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Text</div>
            {lang === 'dis' ? (
              <Pill tone="yellow">Native-speaker template pending</Pill>
            ) : (
              <div className="rounded-md border border-[#E7E3DA] p-3 text-[13px] leading-relaxed">{renderTemplate(fields, lang)}</div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

const RuleChecks: React.FC = () => {
  const results = useMemo(() => SCRIPTED_SCENARIOS.map(s => ({ s, r: runScriptedScenario(s) })), []);
  const passed = results.filter(x => x.r.passed).length;
  return (
    <Card>
      <CardHeader
        title="Scripted scenarios · SM1"
        right={<Pill tone={passed === results.length ? 'green' : 'red'}>{passed}/{results.length} correct</Pill>}
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#FAF8F3] border-b border-[#E7E3DA]">
            <tr>
              <Th>ID</Th>
              <Th>Scenario</Th>
              <Th>Expected</Th>
              <Th>Actual</Th>
              <Th>Rule</Th>
              <Th>Result</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E3DA]">
            {results.map(({ s, r }) => (
              <tr key={s.id}>
                <Td className="font-mono">{s.id}</Td>
                <Td>{s.name}</Td>
                <Td><DecisionChip decision={s.expectedDecision} /></Td>
                <Td><DecisionChip decision={r.actualDecision} /></Td>
                <Td className="font-mono text-xs">{r.actualRuleId}</Td>
                <Td><Pill tone={r.passed ? 'green' : 'red'}>{r.passed ? 'PASS' : 'FAIL'}</Pill></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export const DecisionsPage: React.FC = () => {
  const { can, act } = useApp();
  const { snap, segments, decisionByZone } = useCorridor();
  const [tab, setTab] = useState<'zones' | 'traveller' | 'checks'>('zones');
  const bySegment = useMemo(() => {
    const m = new Map<string, ApproachZone[]>();
    snap.zones.forEach(z => m.set(z.segmentId, [...(m.get(z.segmentId) ?? []), z]));
    return [...m.entries()];
  }, [snap.zones]);
  const pendingAlert = (segId: string) => snap.approvals.some(a => a.kind === 'alert' && a.segmentId === segId && (a.status === 'pending' || a.status === 'escalated'));

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Decisions" />
      <PageBody>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'zones', label: 'Approach zones', count: snap.zones.length },
            { id: 'traveller', label: 'Traveller message' },
            { id: 'checks', label: 'Rule checks' }
          ]}
        />
        {tab === 'zones' &&
          bySegment.map(([segId, zones]) => (
            <div key={segId} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-[#1F2933]">
                  {segId} {segments[segId].name}
                </h2>
                {can('approve_alert') && (
                  <Button size="sm" icon={<Megaphone className="w-3.5 h-3.5" />} disabled={pendingAlert(segId)} onClick={() => act(s => api.draftAlert(s, segId), `Alert drafted · ${segId}`)}>
                    {pendingAlert(segId) ? 'Alert awaiting approval' : 'Draft alert'}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {zones.map(z => (
                  <ZoneCard key={z.id} zone={z} d={decisionByZone[z.id]} />
                ))}
              </div>
            </div>
          ))}
        {tab === 'traveller' && <TravellerPreview />}
        {tab === 'checks' && <RuleChecks />}
      </PageBody>
    </div>
  );
};
