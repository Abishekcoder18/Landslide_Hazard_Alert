import React, { useMemo, useState } from 'react';
import { Check, X, Upload, Crosshair, CheckCircle2, XCircle } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { AiTag, ReportStatusBadge, RouteBadge, Pill } from '../components/Badges';
import { Button, Card, CardHeader, Empty, Label, PageBody, Tabs, Td, Th, inputClass } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { api, PhotoInput } from '../api';
import { sortQueue } from '../domain/reportChecks';
import { SAMPLE_PHOTOS } from '../api/mock/seed';
import { HazardClass, Report, RoadState } from '../types';
import { fmtAgo, fmtTime, providerLabel } from '../lib/format';

const HAZARD_LABEL: Record<HazardClass, string> = {
  debris: 'Debris on road',
  crack: 'Crack',
  fallen_tree: 'Fallen tree',
  water: 'Water on road',
  clear: 'Clear',
  not_relevant: 'Not relevant'
};

type ReviewTab = 'queue' | 'manual' | 'flagged' | 'logged' | 'decided' | 'new';
type ReporterTab = 'new' | 'mine';

const Check2: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <span className={`inline-flex items-center gap-1 text-xs ${ok ? 'text-[#2F6B45]' : 'text-[#9B2C2C]'}`}>
    {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
    {children}
  </span>
);

const AiCell: React.FC<{ r: Report }> = ({ r }) =>
  r.ai ? (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <AiTag />
        <span className="font-medium">{HAZARD_LABEL[r.ai.hazardClass]}</span>
      </div>
      <div className="text-xs text-[#6B7280] font-mono">
        {r.ai.blockedShare}% blocked · {(r.ai.confidence * 100).toFixed(0)}%
      </div>
      {r.ai.simulated ? (
        <Pill tone="grey" className="!text-[11px]">Simulated</Pill>
      ) : (
        <Pill tone="grey" className="!text-[11px]">{providerLabel(r.ai.model)}</Pill>
      )}
    </div>
  ) : (
    <Pill tone="yellow">{r.aiError ?? 'No AI result'}</Pill>
  );

const ChecksCell: React.FC<{ r: Report }> = ({ r }) => (
  <div className="flex flex-col gap-0.5">
    <Check2 ok={r.checks.insideCorridor}>
      Corridor{r.checks.distanceToCorridorKm !== null ? ` · ${r.checks.distanceToCorridorKm} km` : ''}
    </Check2>
    <Check2 ok={r.checks.recent}>Age {r.checks.ageMinutes} min</Check2>
    {r.checks.duplicateOf && <span className="text-xs text-[#2A649C]">Group of {r.checks.duplicateOf}</span>}
    <span className="text-xs text-[#6B7280]">Reporter · {r.checks.reporterReportCount} prior</span>
  </div>
);

const ReportsTable: React.FC<{ reports: Report[]; actions?: boolean }> = ({ reports, actions }) => {
  const { act, now } = useApp();
  const [stateFor, setStateFor] = useState<Record<string, Exclude<RoadState, 'OPEN' | 'UNKNOWN'>>>({});
  if (reports.length === 0) return <Empty>No reports</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-[#FAF8F3] border-b border-[#E7E3DA]">
          <tr>
            <Th>Report</Th>
            <Th>Location</Th>
            <Th>Photo</Th>
            <Th>Photo check</Th>
            <Th>Checks</Th>
            <Th>Status</Th>
            {actions && <Th className="text-right">Officer</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E7E3DA]">
          {reports.map(r => {
            const open = r.status === 'unverified' || r.status === 'corroborated';
            const target = stateFor[r.id] ?? (r.ai && r.ai.blockedShare < 50 ? 'RESTRICTED_ONE_WAY' : 'BLOCKED');
            return (
              <tr key={r.id} className="hover:bg-[#FAF8F3]/60">
                <Td>
                  <div className="font-mono font-medium">{r.id}</div>
                  <div className="text-xs text-[#6B7280]">{fmtTime(r.createdAt)} · {fmtAgo(r.createdAt, now)}</div>
                  <div className="text-xs text-[#6B7280]">{r.reporterName}</div>
                </Td>
                <Td className="max-w-[220px]">
                  <div className="font-mono text-xs font-semibold">{r.segmentId}</div>
                  <div>{r.locationText}</div>
                  {r.note && <div className="text-xs text-[#6B7280] mt-1 break-words">“{r.note}”</div>}
                </Td>
                <Td>
                  {r.photoUrl ? (
                    <img src={r.photoUrl} alt={`Report ${r.id}`} className="w-20 h-14 object-cover rounded border border-[#E7E3DA] bg-[#FAF8F3]" />
                  ) : (
                    '—'
                  )}
                </Td>
                <Td><AiCell r={r} /></Td>
                <Td><ChecksCell r={r} /></Td>
                <Td>
                  <div className="flex flex-col gap-1 items-start">
                    <ReportStatusBadge status={r.status} />
                    <RouteBadge route={r.route} />
                    {r.decidedBy && <span className="text-[11px] text-[#6B7280]">{r.decidedBy} · {fmtTime(r.decidedAt)}</span>}
                  </div>
                </Td>
                {actions && (
                  <Td className="text-right">
                    {open && (r.route === 'officer_queue' || r.route === 'manual_review') ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <select
                          aria-label="New road state"
                          className="h-7 px-1.5 rounded-md border border-[#E7E3DA] text-xs bg-white"
                          value={target}
                          onChange={e => setStateFor(s => ({ ...s, [r.id]: e.target.value as typeof target }))}
                        >
                          <option value="BLOCKED">Blocked</option>
                          <option value="RESTRICTED_HEAVY">Restricted · heavy</option>
                          <option value="RESTRICTED_ONE_WAY">Restricted · one-way</option>
                        </select>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="primary" icon={<Check className="w-3.5 h-3.5" />} onClick={() => act(s => api.confirmReport(s, r.id, target), `${r.id} confirmed · ${r.segmentId} updated`)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => act(s => api.rejectReport(s, r.id), `${r.id} rejected`)}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-[#6B7280]">—</span>
                    )}
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const NewReportForm: React.FC = () => {
  const { act, snapshot } = useApp();
  const { snap, segments } = useCorridor();
  // Default: S-07 in sample data; on the real corridor the first segment that has approach zones.
  const [segmentId, setSegmentId] = useState(() =>
    segments['S-07'] ? 'S-07' : snap.zones[0]?.segmentId ?? Object.keys(segments)[0] ?? ''
  );
  const [locationText, setLocationText] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<PhotoInput | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const last = snapshot?.reports.find(r => r.id === lastId);

  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPhoto({ kind: 'upload', dataUrl, fileName: f.name });
      setPreview(dataUrl);
    };
    reader.readAsDataURL(f);
  };

  const useDeviceLocation = () => {
    navigator.geolocation?.getCurrentPosition(p => {
      setLat(p.coords.latitude.toFixed(5));
      setLon(p.coords.longitude.toFixed(5));
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return;
    setBusy(true);
    let id: string | null = null;
    await act(async s => {
      const r = await api.submitReport(s, {
        segmentId,
        locationText,
        note,
        lat: lat ? Number(lat) : null,
        lon: lon ? Number(lon) : null,
        photo
      });
      id = r.id;
    }, 'Report submitted');
    setLastId(id);
    setBusy(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <Card className="lg:col-span-7">
        <CardHeader title="New report" />
        <form onSubmit={submit} className="p-4 space-y-4">
          <div>
            <Label>Photo</Label>
            <div className="grid grid-cols-3 gap-2">
              {SAMPLE_PHOTOS.map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    setPhoto({ kind: 'sample', sampleId: p.id });
                    setPreview(p.url);
                  }}
                  className={`rounded-md border overflow-hidden text-left ${photo?.kind === 'sample' && photo.sampleId === p.id ? 'border-[#3780C8] ring-2 ring-[#3780C8]/20' : 'border-[#E7E3DA]'}`}
                >
                  <img src={p.url} alt={p.label} className="w-full h-20 object-cover bg-[#FAF8F3]" />
                  <div className="px-2 py-1 text-xs flex items-center justify-between">
                    <span>{p.label}</span>
                    <Pill tone="grey" className="!text-[10px] !px-1">Sample</Pill>
                  </div>
                </button>
              ))}
              <label className={`rounded-md border border-dashed flex flex-col items-center justify-center h-[108px] cursor-pointer text-xs text-[#6B7280] hover:bg-[#FAF8F3] ${photo?.kind === 'upload' ? 'border-[#3780C8] text-[#3780C8]' : 'border-[#E7E3DA]'}`}>
                <Upload className="w-4 h-4 mb-1" />
                {photo?.kind === 'upload' ? photo.fileName : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="seg">Segment</Label>
              <select id="seg" className={inputClass} value={segmentId} onChange={e => setSegmentId(e.target.value)}>
                {Object.values(segments).filter(s => !s.offCorridor).map(s => (
                  <option key={s.id} value={s.id}>{s.id} {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="loc">Location</Label>
              <input id="loc" className={inputClass} value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Landmark, km" required />
            </div>
            <div>
              <Label htmlFor="lat">Latitude</Label>
              <input id="lat" className={inputClass} value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" placeholder="25.112" />
            </div>
            <div>
              <Label htmlFor="lon">Longitude</Label>
              <div className="flex gap-2">
                <input id="lon" className={inputClass} value={lon} onChange={e => setLon(e.target.value)} inputMode="decimal" placeholder="92.943" />
                <Button type="button" onClick={useDeviceLocation} title="Use device location" icon={<Crosshair className="w-4 h-4" />} />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="note">Note</Label>
            <textarea id="note" className={`${inputClass} h-20 py-2`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={!photo || !locationText || busy}>
              Submit report
            </Button>
          </div>
        </form>
      </Card>

      <Card className="lg:col-span-5">
        <CardHeader title={last ? last.id : 'Result'} right={last ? <ReportStatusBadge status={last.status} /> : undefined} />
        {last ? (
          <div className="p-4 space-y-3 text-[13px]">
            {preview && <img src={preview} alt="Submitted" className="w-full h-40 object-cover rounded-md border border-[#E7E3DA]" />}
            <AiCell r={last} />
            <ChecksCell r={last} />
            <RouteBadge route={last.route} />
          </div>
        ) : (
          <Empty>—</Empty>
        )}
      </Card>
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const { can, session } = useApp();
  const { snap } = useCorridor();
  const reviewer = can('review_report');
  const [tab, setTab] = useState<ReviewTab | ReporterTab>(reviewer ? 'queue' : 'new');

  const open = (r: Report) => r.status === 'unverified' || r.status === 'corroborated';
  const groups = useMemo(
    () => ({
      queue: sortQueue(snap.reports.filter(r => r.route === 'officer_queue' && open(r))),
      manual: snap.reports.filter(r => r.route === 'manual_review' && open(r)),
      flagged: snap.reports.filter(r => r.route === 'flagged'),
      logged: snap.reports.filter(r => r.route === 'log_only'),
      decided: snap.reports.filter(r => (r.route === 'officer_queue' || r.route === 'manual_review') && !open(r)),
      mine: snap.reports.filter(r => r.reporterName === session?.name)
    }),
    [snap.reports, session?.name]
  );

  const items = reviewer
    ? [
        { id: 'queue' as const, label: 'Officer queue', count: groups.queue.length },
        { id: 'manual' as const, label: 'Manual review', count: groups.manual.length },
        { id: 'flagged' as const, label: 'Flagged', count: groups.flagged.length },
        { id: 'logged' as const, label: 'Logged', count: groups.logged.length },
        { id: 'decided' as const, label: 'Decided', count: groups.decided.length },
        { id: 'new' as const, label: 'New report' }
      ]
    : [
        { id: 'new' as const, label: 'New report' },
        { id: 'mine' as const, label: 'My reports', count: groups.mine.length }
      ];

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Reports" />
      <PageBody>
        <Tabs value={tab} onChange={setTab} items={items} />
        {tab === 'new' ? (
          <NewReportForm />
        ) : (
          <Card>
            <ReportsTable reports={groups[tab as keyof typeof groups]} actions={reviewer && (tab === 'queue' || tab === 'manual')} />
          </Card>
        )}
      </PageBody>
    </div>
  );
};
