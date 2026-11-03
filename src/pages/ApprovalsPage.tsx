import React, { useEffect, useState } from 'react';
import { Check, X, Download, Lock, Megaphone, DoorOpen, OctagonX } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { ApprovalBadge, DecisionChip, Pill, RiskBadge, RoadStateBadge } from '../components/Badges';
import { Button, Card, CardHeader, Empty, PageBody, cx } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { api } from '../api';
import { canDecideApproval } from '../domain/permissions';
import { ALERT_LANGUAGES } from '../domain/alerts';
import { Alert, AlertLanguage, Approval, ClosureType } from '../types';
import { fmtCountdown, fmtDateTime, fmtTime, providerLabel } from '../lib/format';

const KIND: Record<Approval['kind'], { label: string; icon: React.ReactNode }> = {
  closure: { label: 'Closure', icon: <OctagonX className="w-4 h-4" /> },
  reopening: { label: 'Reopening', icon: <DoorOpen className="w-4 h-4" /> },
  alert: { label: 'Alert', icon: <Megaphone className="w-4 h-4" /> }
};

const CLOSURE: { id: ClosureType; label: string }[] = [
  { id: 'FULL', label: 'Full' },
  { id: 'HEAVY_ONLY', label: 'Heavy vehicles' },
  { id: 'ONE_WAY', label: 'One-way' }
];

/** Escalation countdown: amber under 3 min, red once escalated. */
const Countdown: React.FC<{ a: Approval; now: Date; prefix?: string }> = ({ a, now, prefix }) => {
  if (a.status === 'escalated') return <Pill tone="red" className="font-mono">{prefix ? 'Escalated' : fmtTime(a.escalatedAt)}</Pill>;
  const left = new Date(a.escalateAt).getTime() - now.getTime();
  return (
    <Pill tone={left < 180000 ? 'yellow' : 'grey'} className="font-mono tabular-nums">
      {prefix && <span className="font-sans">{prefix}</span>}
      {fmtCountdown(a.escalateAt, now)}
    </Pill>
  );
};

const Decide: React.FC<{ a: Approval; closureType?: ClosureType }> = ({ a, closureType }) => {
  const { session, act, now } = useApp();
  const allowed = session ? canDecideApproval(session.role, a.status) : false;
  if (a.status === 'approved' || a.status === 'rejected' || a.status === 'withdrawn') {
    return (
      <div className="text-[13px] text-ink-2">
        {a.decidedBy} · {fmtDateTime(a.decidedAt)}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-xs text-ink-2">
        {a.status === 'pending' ? (
          <Countdown a={a} now={now} prefix="Escalates in" />
        ) : (
          <span className="text-risk-red-fg font-medium">Escalated · second approver · {fmtTime(a.escalatedAt)}</span>
        )}
      </div>
      {allowed ? (
        <div className="flex gap-2">
          <Button variant="danger" icon={<X className="w-4 h-4" />} onClick={() => act(s => api.decideApproval(s, a.id, false), `${a.id} rejected`)}>
            Reject
          </Button>
          <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={() => act(s => api.decideApproval(s, a.id, true, closureType), `${a.id} approved`)}>
            Approve
          </Button>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <Lock className="w-3.5 h-3.5" /> {session?.role === 'second_approver' ? 'Available on escalation' : 'Officer only'}
        </span>
      )}
    </div>
  );
};

const ClosureDetail: React.FC<{ a: Approval }> = ({ a }) => {
  const { snap, segments, decisionByZone } = useCorridor();
  const [type, setType] = useState<ClosureType>(a.closureType ?? 'FULL');
  useEffect(() => setType(a.closureType ?? 'FULL'), [a.id, a.closureType]);
  const seg = segments[a.segmentId];
  const zones = snap.zones.filter(z => z.segmentId === a.segmentId);
  const open = a.status === 'pending' || a.status === 'escalated';
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <DecisionChip decision="CLOSE" />
        <span className="font-medium">{seg.id} {seg.name}</span>
        <RiskBadge level={seg.riskLevel} />
        <RoadStateBadge state={seg.roadState} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {zones.map(z => {
          const r = decisionByZone[z.id].result;
          return (
            <div key={z.id} className="rounded-md border border-line px-3 py-2 text-[13px] flex items-center justify-between">
              <span>
                <span className="font-mono mr-1.5">{z.id}</span>
                <span className="text-ink-2">{r.decision === 'HOLD' ? r.holdingPoint?.shortName ?? '—' : r.diversionCheck.routeCandidateName ?? ''}</span>
              </span>
              <DecisionChip decision={r.decision} />
            </div>
          );
        })}
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-1.5">Closure type</div>
        <div className="grid grid-cols-3 gap-2">
          {CLOSURE.map(c => (
            <button
              key={c.id}
              disabled={!open}
              onClick={() => setType(c.id)}
              className={cx('h-9 rounded-md border text-[13px] font-medium disabled:opacity-60', type === c.id ? 'border-primary bg-primary-tint text-primary-ink' : 'border-line hover:bg-subtle')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <Decide a={a} closureType={type} />
    </div>
  );
};

const ReopeningDetail: React.FC<{ a: Approval }> = ({ a }) => {
  const { segments } = useCorridor();
  const seg = segments[a.segmentId];
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <span className="font-medium">{seg.id} {seg.name}</span>
        <RoadStateBadge state={seg.roadState} />
        <span className="text-ink-2">→</span>
        <RoadStateBadge state={a.reopenTo === 'full' ? 'OPEN' : 'RESTRICTED_ONE_WAY'} />
      </div>
      <div className="text-[13px] text-ink-2 font-mono">{a.incidentId}</div>
      <Decide a={a} />
    </div>
  );
};

const AlertDetail: React.FC<{ a: Approval; alert: Alert }> = ({ a, alert }) => {
  const { can, act } = useApp();
  const [lang, setLang] = useState<AlertLanguage>('en');
  const [draft, setDraft] = useState('');
  const [showCap, setShowCap] = useState(false);
  const text = alert.texts.find(t => t.lang === lang)!;
  // Reset to the stored text after every save (a blocked edit is replaced by the template, BR-09).
  useEffect(() => setDraft(text.text), [text.text, text.source, text.validation.errors.join('|'), lang, alert.id]);
  const editable = alert.status === 'draft' && can('approve_alert') && lang !== 'dis';
  // A blocked text is replaced by the plain template, which is what is sent (BR-09).
  const llmTexts = alert.texts.filter(t => t.lang !== 'dis');
  const blockedCount = llmTexts.filter(t => t.blocked).length;
  const okCount = llmTexts.filter(t => t.blocked || t.validation.ok).length;

  const download = () => {
    if (!alert.capXml) return;
    const url = URL.createObjectURL(new Blob([alert.capXml], { type: 'application/xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `CAP-${alert.id}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <Pill tone="blue">{alert.fields.template}</Pill>
        <span className="font-medium">{alert.segmentId} {alert.fields.place}</span>
        {alert.fields.zones.map(z => (
          <span key={z.zoneId} className="inline-flex items-center gap-1 text-xs text-ink-2">
            {z.zoneId} <DecisionChip decision={z.decision} />
          </span>
        ))}
        <Pill tone={okCount === 4 ? 'green' : 'red'}>Validated {okCount}/4</Pill>
        {blockedCount > 0 && <Pill tone="red">Blocked {blockedCount}</Pill>}
      </div>

      <div className="flex gap-1 border-b border-line">
        {ALERT_LANGUAGES.map(l => {
          const t = alert.texts.find(x => x.lang === l.code)!;
          const bad = l.code !== 'dis' && (t.blocked || !t.validation.ok);
          return (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={cx('-mb-px h-9 px-3 text-[13px] font-medium border-b-2 inline-flex items-center gap-1.5', lang === l.code ? 'border-primary text-primary-ink' : 'border-transparent text-ink-2')}
            >
              {l.label}
              <span className={cx('w-1.5 h-1.5 rounded-full', l.code === 'dis' ? 'bg-risk-none' : bad ? 'bg-risk-red' : 'bg-risk-green')} />
            </button>
          );
        })}
      </div>

      {lang === 'dis' ? (
        <Pill tone="yellow">Native-speaker template pending</Pill>
      ) : (
        <div className="space-y-2">
          <textarea
            aria-label={`Alert text ${lang}`}
            className="w-full min-h-28 p-3 rounded-md border border-line text-[13px] leading-relaxed focus:outline-none focus:border-primary disabled:bg-subtle"
            value={draft}
            disabled={!editable}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Pill tone="grey">{text.source === 'llm' ? providerLabel(alert.writerModel) : text.source === 'officer_edit' ? 'Officer edit' : 'Template'}</Pill>
              {text.blocked ? (
                <Pill tone="red">Blocked · template used</Pill>
              ) : text.validation.ok ? (
                <Pill tone="green">Places ✓ Times ✓ Decision ✓</Pill>
              ) : (
                <Pill tone="red">Mismatch</Pill>
              )}
            </div>
            {editable && draft !== text.text && (
              <Button size="sm" variant="primary" onClick={() => act(s => api.editAlertText(s, alert.id, lang, draft))}>
                Validate & save
              </Button>
            )}
          </div>
          {text.validation.errors.length > 0 && (
            <ul className="text-xs text-risk-red-fg space-y-0.5">
              {text.validation.errors.map(e => (
                <li key={e}>· {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-line">
        <span className="text-xs text-ink-2">CAP 1.2 · {alert.zoneIds.join(', ')}</span>
        {alert.capXml ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCap(v => !v)}>{showCap ? 'Hide CAP' : 'View CAP'}</Button>
            <Button size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={download}>CAP XML</Button>
          </div>
        ) : (
          <span className="text-xs text-ink-2">After approval</span>
        )}
      </div>
      {showCap && alert.capXml && <pre className="text-[11px] font-mono bg-subtle border border-line rounded-md p-3 overflow-auto max-h-72">{alert.capXml}</pre>}

      <Decide a={a} />
    </div>
  );
};

export const ApprovalsPage: React.FC = () => {
  const { snap } = useCorridor();
  const { now } = useApp();
  const open = snap.approvals.filter(a => a.status === 'pending' || a.status === 'escalated');
  const closed = snap.approvals.filter(a => a.status === 'approved' || a.status === 'rejected' || a.status === 'withdrawn');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snap.approvals.find(a => a.id === selectedId) ?? open[0] ?? closed[0];

  const Item: React.FC<{ a: Approval }> = ({ a }) => (
    <button
      onClick={() => setSelectedId(a.id)}
      className={cx(
        'relative w-full text-left pl-5 pr-4 py-3 flex items-start gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
        selected?.id === a.id ? 'bg-primary-tint' : 'hover:bg-subtle'
      )}
    >
      {selected?.id === a.id && <span className="absolute left-0 inset-y-0 w-[3px] bg-primary" aria-hidden />}
      <span className={cx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', a.kind === 'closure' ? 'bg-risk-red-bg text-risk-red-fg' : a.kind === 'alert' ? 'bg-primary-tint text-primary-ink' : 'bg-risk-green-bg text-risk-green-fg')}>
        {KIND[a.kind].icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">{KIND[a.kind].label} · {a.segmentId}</span>
          <ApprovalBadge status={a.status} />
        </span>
        <span className="flex items-center justify-between gap-2 text-xs text-ink-2 mt-1">
          <span className="truncate">{a.reason}</span>
          {a.status === 'pending' ? (
            <Countdown a={a} now={now} />
          ) : (
            <span className="font-mono shrink-0 tabular-nums">{fmtTime(a.decidedAt ?? a.escalatedAt ?? a.createdAt)}</span>
          )}
        </span>
      </span>
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Approvals" />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <Card className="lg:col-span-4 overflow-hidden flex flex-col lg:max-h-[calc(100vh-140px)] lg:sticky lg:top-[80px]">
            <CardHeader title={`Open · ${open.length}`} />
            <div className="divide-y divide-line flex-1 min-h-0 overflow-y-auto">{open.length ? open.map(a => <Item key={a.id} a={a} />) : <Empty>No open approvals</Empty>}</div>
            <CardHeader title={`History · ${closed.length}`} className="border-t bg-subtle" />
            <div className="divide-y divide-line max-h-56 shrink-0 overflow-y-auto">{closed.map(a => <Item key={a.id} a={a} />)}</div>
          </Card>

          <Card className="lg:col-span-8 lg:sticky lg:top-[80px]">
            {selected ? (
              <>
                <CardHeader title={`${KIND[selected.kind].label} · ${selected.id}`} right={<ApprovalBadge status={selected.status} />} />
                {selected.kind === 'closure' && <ClosureDetail a={selected} />}
                {selected.kind === 'reopening' && <ReopeningDetail a={selected} />}
                {selected.kind === 'alert' && <AlertDetail a={selected} alert={snap.alerts.find(x => x.id === selected.alertId)!} />}
              </>
            ) : (
              <Empty>No approvals</Empty>
            )}
          </Card>
        </div>
      </PageBody>
    </div>
  );
};
