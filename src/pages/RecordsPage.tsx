import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { DecisionChip, Pill, RiskBadge, RoadStateBadge } from '../components/Badges';
import { Button, Card, CardHeader, Empty, PageBody, Tabs, Td, Th, inputClass } from '../components/ui';
import { useCorridor } from '../state/selectors';
import { downloadCsv } from '../lib/csv';
import { fmtDateTime, fmtWait } from '../lib/format';
import { ROLE_LABEL } from '../domain/permissions';

export const RecordsPage: React.FC = () => {
  const { snap, holdingPoints } = useCorridor();
  const [tab, setTab] = useState<'decisions' | 'audit'>('decisions');
  const [segFilter, setSegFilter] = useState('');
  const decisions = useMemo(() => snap.decisionRecords.filter(d => !segFilter || d.segmentId === segFilter), [snap.decisionRecords, segFilter]);
  const audit = useMemo(() => snap.audit.filter(a => !segFilter || (a.entity ?? '').includes(segFilter) || a.details.includes(segFilter)), [snap.audit, segFilter]);
  const timings = snap.decisionRecords.filter(d => d.reportToDecisionMs !== undefined);

  const exportDecisions = () =>
    downloadCsv(
      'decision-record.csv',
      ['ID', 'Time', 'Zone', 'Segment', 'Decision', 'Heavy', 'Rule', 'Road state', 'Risk', 'Risk index', 'IMD', 'Holding point', 'Diversion', 'Wait est. (min)', 'Window closing', 'CLOSE recommended', 'Trigger', 'Report', 'Report→decision (ms)'],
      decisions.map(d => [d.id, d.at, d.zoneId, d.segmentId, d.decision, d.heavyDecision, d.ruleId, d.inputs.roadState, d.inputs.riskLevel, d.inputs.riskIndex, d.inputs.imdWarning, d.holdingPointId, d.diversion, d.expectedWaitMinutes, d.windowClosing ? 'yes' : '', d.closeRecommended ? 'yes' : '', d.trigger, d.reportId, d.reportToDecisionMs])
    );
  const exportAudit = () =>
    downloadCsv('audit-log.csv', ['ID', 'Time', 'Actor', 'Role', 'Action', 'Entity', 'Before', 'After', 'Details'], audit.map(a => [a.id, a.at, a.actor, a.role, a.action, a.entity, a.before, a.after, a.details]));

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Records" />
      <PageBody>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <Tabs value={tab} onChange={setTab} items={[{ id: 'decisions', label: 'Decision record', count: snap.decisionRecords.length }, { id: 'audit', label: 'Audit log', count: snap.audit.length }]} />
          <div className="flex items-center gap-2">
            <select aria-label="Segment filter" className={`${inputClass} !w-44`} value={segFilter} onChange={e => setSegFilter(e.target.value)}>
              <option value="">All segments</option>
              {snap.segments.filter(s => !s.offCorridor).map(s => (
                <option key={s.id} value={s.id}>{s.id} {s.name}</option>
              ))}
            </select>
            <Button icon={<Download className="w-4 h-4" />} onClick={tab === 'decisions' ? exportDecisions : exportAudit}>CSV</Button>
          </div>
        </div>

        {tab === 'decisions' && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Pill tone="blue">Report → decision (SM3)</Pill>
              {timings.length === 0 ? (
                <Pill tone="grey">No measurement yet</Pill>
              ) : (
                [...new Map(timings.map(t => [t.reportId, t])).values()].map(t => (
                  <Pill key={t.reportId} tone="grey">{t.reportId} · {t.reportToDecisionMs} ms</Pill>
                ))
              )}
            </div>
            <Card className="overflow-hidden">
              {decisions.length === 0 ? (
                <Empty>No records</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-subtle border-b border-line">
                      <tr>
                        <Th>Time</Th>
                        <Th>Zone</Th>
                        <Th>Decision</Th>
                        <Th>Rule</Th>
                        <Th>Inputs</Th>
                        <Th>Holding / diversion</Th>
                        <Th>Wait</Th>
                        <Th>Trigger</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {decisions.map(d => (
                        <tr key={d.id}>
                          <Td className="whitespace-nowrap">
                            <div>{fmtDateTime(d.at)}</div>
                            <div className="text-[11px] font-mono text-ink-2">{d.id}</div>
                          </Td>
                          <Td className="font-mono">{d.zoneId}</Td>
                          <Td>
                            <div className="flex gap-1 flex-wrap">
                              <DecisionChip decision={d.decision} />
                              {d.heavyDecision && <DecisionChip decision={d.heavyDecision} />}
                              {d.closeRecommended && <DecisionChip decision="CLOSE" />}
                              {d.windowClosing && <Pill tone="yellow">Window closing</Pill>}
                            </div>
                          </Td>
                          <Td className="font-mono text-xs">{d.ruleId}</Td>
                          <Td>
                            <div className="flex gap-1 flex-wrap items-center">
                              <RoadStateBadge state={d.inputs.roadState} />
                              <RiskBadge level={d.inputs.riskLevel} />
                              <span className="text-xs font-mono text-ink-2">{d.inputs.riskIndex ?? '—'}</span>
                              {d.inputs.imdWarning !== 'NONE' && <Pill tone="grey">IMD {d.inputs.imdWarning}</Pill>}
                            </div>
                          </Td>
                          <Td>{d.holdingPointId ? holdingPoints[d.holdingPointId]?.shortName : d.diversion ?? '—'}</Td>
                          <Td className="font-mono whitespace-nowrap">{d.expectedWaitMinutes !== undefined ? `${fmtWait(d.expectedWaitMinutes)} est.` : '—'}</Td>
                          <Td className="text-xs text-ink-2">{d.trigger}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {tab === 'audit' && (
          <Card className="overflow-hidden">
            <CardHeader title="Append-only" />
            {audit.length === 0 ? (
              <Empty>No entries</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-subtle border-b border-line">
                    <tr>
                      <Th>Time</Th>
                      <Th>Actor</Th>
                      <Th>Action</Th>
                      <Th>Details</Th>
                      <Th>Before → after</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {audit.map(a => (
                      <tr key={a.id}>
                        <Td className="whitespace-nowrap">
                          <div>{fmtDateTime(a.at)}</div>
                          <div className="text-[11px] font-mono text-ink-2">{a.id}</div>
                        </Td>
                        <Td>
                          <div>{a.actor}</div>
                          <div className="text-[11px] text-ink-2">{a.role === 'system' ? 'System' : ROLE_LABEL[a.role]}</div>
                        </Td>
                        <Td className="font-medium whitespace-nowrap">{a.action}</Td>
                        <Td className="text-xs max-w-md break-words">{a.details}</Td>
                        <Td className="text-xs font-mono text-ink-2 max-w-[220px] break-words">{a.before || a.after ? `${(a.before ?? '').slice(0, 60)} → ${(a.after ?? '').slice(0, 60)}` : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </PageBody>
    </div>
  );
};
