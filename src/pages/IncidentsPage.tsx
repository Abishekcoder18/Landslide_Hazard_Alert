import React, { useEffect, useState } from 'react';
import { Plus, X, HardHat, Clock } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { DecisionChip, EstTag, INCIDENT_STATES, IncidentBadge, Pill, RoadStateBadge, ReportStatusBadge } from '../components/Badges';
import { Button, Card, CardHeader, Empty, Label, PageBody, cx, inputClass } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { api } from '../api';
import { Incident } from '../types';
import { fmtClock, fmtDateTime, fmtTime, fmtWait, fromLocalInput, toLocalInput } from '../lib/format';

const Timeline: React.FC<{ state: Incident['state'] }> = ({ state }) => {
  const order = INCIDENT_STATES.map(s => s.key);
  const idx = order.indexOf(state);
  return (
    <ol className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
      {INCIDENT_STATES.map((s, i) => (
        <li
          key={s.key}
          className={cx(
            'min-h-12 py-1.5 rounded-ctl border px-2 flex flex-col justify-center text-xs',
            i === idx ? 'border-primary bg-primary-tint text-primary-ink font-semibold' : i < idx ? 'border-risk-green-line bg-risk-green-bg text-risk-green-fg' : 'border-line bg-subtle text-ink-2'
          )}
        >
          <span className="font-mono text-[10px]">{i + 1}</span>
          <span className="leading-tight">{s.label}</span>
        </li>
      ))}
    </ol>
  );
};

const IncidentDetail: React.FC<{ inc: Incident }> = ({ inc }) => {
  const { can, act } = useApp();
  const { snap, segments, decisionByZone } = useCorridor();
  const seg = segments[inc.segmentId];
  const edit = can('update_clearance');
  const [estimate, setEstimate] = useState(toLocalInput(inc.reopeningEstimate));
  const [crew, setCrew] = useState({ unitName: '', leader: '', contact: '' });
  const [equip, setEquip] = useState('');
  useEffect(() => setEstimate(toLocalInput(inc.reopeningEstimate)), [inc.id, inc.reopeningEstimate]);

  const zones = snap.zones.filter(z => z.segmentId === inc.segmentId);
  const reopeningPending = snap.approvals.some(a => a.kind === 'reopening' && a.incidentId === inc.id && (a.status === 'pending' || a.status === 'escalated'));
  const canReopen = ['closed', 'clearance_in_progress', 'reopened_one_way'].includes(inc.state);
  const reports = snap.reports.filter(r => inc.reportIds.includes(r.id));

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <span className="font-medium">{seg.id} {seg.name}</span>
        <RoadStateBadge state={seg.roadState} />
        {inc.closureType && <Pill tone="red">Closure · {inc.closureType.replace('_', ' ').toLowerCase()}</Pill>}
        <span className="text-xs text-ink-2">Opened {fmtDateTime(inc.openedAt)}</span>
      </div>

      <Timeline state={inc.state} />

      {edit && (
        <div className="flex flex-wrap gap-2">
          {inc.state === 'closed' && (
            <Button onClick={() => act(s => api.updateIncident(s, inc.id, { state: 'clearance_in_progress' }), 'Clearance in progress')}>Start clearance</Button>
          )}
          {canReopen && inc.state !== 'reopened_one_way' && (
            <Button disabled={reopeningPending} onClick={() => act(s => api.requestReopening(s, inc.id, 'one_way'), 'One-way reopening sent for approval')}>Request one-way reopening</Button>
          )}
          {canReopen && (
            <Button variant="primary" disabled={reopeningPending} onClick={() => act(s => api.requestReopening(s, inc.id, 'full'), 'Full reopening sent for approval')}>Request full reopening</Button>
          )}
          {reopeningPending && <Pill tone="yellow">Reopening awaiting approval</Pill>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-card border border-line p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-[13px] font-semibold"><Clock className="w-4 h-4 text-ink-2" /> Reopening</div>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-lg font-semibold tabular-nums">{inc.reopeningEstimate ? fmtClock(inc.reopeningEstimate) : '—'}</span>
            {inc.reopeningEstimate && <EstTag />}
          </div>
          {edit && inc.state !== 'reopened_full' && (
            <div className="flex gap-2">
              <input type="datetime-local" aria-label="Reopening estimate" className={inputClass} value={estimate} onChange={e => setEstimate(e.target.value)} />
              <Button variant="primary" disabled={!estimate} onClick={() => act(s => api.updateIncident(s, inc.id, { reopeningEstimate: fromLocalInput(estimate) }), 'Estimate saved')}>Save</Button>
              {inc.reopeningEstimate && <Button onClick={() => act(s => api.updateIncident(s, inc.id, { reopeningEstimate: null }))}>Clear</Button>}
            </div>
          )}
          <div className="divide-y divide-line border-t border-line">
            {zones.map(z => {
              const r = decisionByZone[z.id].result;
              return (
                <div key={z.id} className="flex items-center justify-between py-1.5 text-[13px]">
                  <span><span className="font-mono">{z.id}</span> <span className="text-ink-2">{z.direction}</span></span>
                  <span className="flex items-center gap-1.5">
                    <DecisionChip decision={r.decision} />
                    {r.expectedWaitMinutes !== undefined && (
                      <>
                        <span className="font-mono">{fmtWait(r.expectedWaitMinutes)}</span>
                        <EstTag />
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-card border border-line p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-[13px] font-semibold"><HardHat className="w-4 h-4 text-ink-2" /> Crew</div>
          {inc.crew ? (
            <div className="text-[13px] space-y-0.5">
              <div className="font-medium">{inc.crew.unitName}</div>
              <div className="text-ink-2">{inc.crew.leader} · {inc.crew.contact}</div>
              <div className="text-xs text-ink-2">Dispatched {fmtTime(inc.crew.dispatchedAt)}</div>
            </div>
          ) : (
            <div className="text-[13px] text-ink-2">Not assigned</div>
          )}
          {edit && inc.state !== 'reopened_full' && (
            <form
              className="grid grid-cols-1 gap-2"
              onSubmit={e => {
                e.preventDefault();
                act(s => api.updateIncident(s, inc.id, { crew: { ...crew, dispatchedAt: new Date().toISOString() } }), 'Crew assigned').then(ok => ok && setCrew({ unitName: '', leader: '', contact: '' }));
              }}
            >
              <input className={inputClass} placeholder="Unit" value={crew.unitName} onChange={e => setCrew({ ...crew, unitName: e.target.value })} required />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="Leader" value={crew.leader} onChange={e => setCrew({ ...crew, leader: e.target.value })} required />
                <input className={inputClass} placeholder="Contact" value={crew.contact} onChange={e => setCrew({ ...crew, contact: e.target.value })} required />
              </div>
              <Button type="submit">{inc.crew ? 'Reassign crew' : 'Assign crew'}</Button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-card border border-line p-3 space-y-2">
        <Label>Equipment</Label>
        <div className="flex flex-wrap gap-1.5">
          {inc.equipment.length === 0 && <span className="text-[13px] text-ink-2">None</span>}
          {inc.equipment.map(eq => (
            <span key={eq} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line bg-subtle text-xs">
              {eq}
              {edit && (
                <button aria-label={`Remove ${eq}`} onClick={() => act(s => api.updateIncident(s, inc.id, { equipment: inc.equipment.filter(x => x !== eq) }))}>
                  <X className="w-3 h-3 text-ink-2" />
                </button>
              )}
            </span>
          ))}
        </div>
        {edit && (
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (!equip.trim()) return;
              act(s => api.updateIncident(s, inc.id, { equipment: [...inc.equipment, equip.trim()] })).then(ok => ok && setEquip(''));
            }}
          >
            <input className={inputClass} placeholder="Excavator, loader…" value={equip} onChange={e => setEquip(e.target.value)} />
            <Button type="submit" icon={<Plus className="w-4 h-4" />}>Add</Button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Reports</Label>
          <div className="rounded-card border border-line divide-y divide-line">
            {reports.length === 0 && <div className="px-3 py-2 text-[13px] text-ink-2">None</div>}
            {reports.map(r => (
              <div key={r.id} className="px-3 py-2 flex items-center justify-between text-[13px]">
                <span className="font-mono">{r.id}</span>
                <ReportStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Label>Log</Label>
          <ol className="rounded-card border border-line divide-y divide-line max-h-60 overflow-y-auto">
            {[...inc.log].reverse().map((l, i) => (
              <li key={i} className="px-3 py-2 text-[13px]">
                <div>{l.text}</div>
                <div className="text-[11px] text-ink-2">{fmtTime(l.at)} · {l.by}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export const IncidentsPage: React.FC = () => {
  const { snap } = useCorridor();
  const sorted = [...snap.incidents].sort((a, b) => Number(a.state === 'reopened_full') - Number(b.state === 'reopened_full'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sorted.find(i => i.id === selectedId) ?? sorted[0];
  const openCount = sorted.filter(i => i.state !== 'reopened_full').length;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Incidents" />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <Card className="lg:col-span-4 overflow-hidden">
            <CardHeader title={`Incidents · ${openCount} open`} />
            <div className="divide-y divide-line">
              {sorted.length === 0 && <Empty>No incidents</Empty>}
              {sorted.map(i => (
                <button key={i.id} onClick={() => setSelectedId(i.id)} className={cx('w-full text-left px-4 py-2.5', selected?.id === i.id ? 'bg-primary-tint' : 'hover:bg-subtle')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-medium">{i.id}</span>
                    <IncidentBadge state={i.state} />
                  </div>
                  <div className="text-xs text-ink-2 mt-0.5">{i.segmentId} · {fmtDateTime(i.openedAt)}</div>
                </button>
              ))}
            </div>
          </Card>
          <Card className="lg:col-span-8">
            {selected ? (
              <>
                <CardHeader title={selected.id} right={<IncidentBadge state={selected.state} />} />
                <IncidentDetail inc={selected} />
              </>
            ) : (
              <Empty>No incidents</Empty>
            )}
          </Card>
        </div>
      </PageBody>
    </div>
  );
};
