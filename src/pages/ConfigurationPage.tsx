import React, { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { Pill, RiskBadge, SampleTag } from '../components/Badges';
import { Button, Card, CardHeader, PageBody, Tabs, Td, Th, inputClass } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useCorridor } from '../state/selectors';
import { api } from '../api';
import { checkHoldingPointEligibility } from '../domain/decisionEngine';
import { ApproachZone, Config, ImdWarning, Segment, SegmentInputs, Susceptibility } from '../types';

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string }> = ({ label, value, onChange, step = 1, unit }) => (
  <label className="block">
    <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-1">{label}</span>
    <span className="flex items-center gap-1.5">
      <input type="number" step={step} className={inputClass} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(Number(e.target.value))} />
      {unit && <span className="text-xs text-ink-2 w-10 shrink-0">{unit}</span>}
    </span>
  </label>
);

const ConfigForm: React.FC = () => {
  const { act } = useApp();
  const { snap } = useCorridor();
  const [c, setC] = useState<Config>(snap.config);
  useEffect(() => setC(snap.config), [snap.config]);
  const dirty = JSON.stringify(c) !== JSON.stringify(snap.config);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setC(prev => ({ ...prev, [k]: v }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <Card>
        <CardHeader title="Risk Index" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumField label="Susceptibility" value={c.weights.susceptibility} onChange={v => set('weights', { ...c.weights, susceptibility: v })} />
            <NumField label="Rainfall" value={c.weights.rainfall} onChange={v => set('weights', { ...c.weights, rainfall: v })} />
            <NumField label="Slope" value={c.weights.slope} onChange={v => set('weights', { ...c.weights, slope: v })} />
            <NumField label="History" value={c.weights.history} onChange={v => set('weights', { ...c.weights, history: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Yellow ≥" value={c.thresholds.yellow} onChange={v => set('thresholds', { ...c.thresholds, yellow: v })} />
            <NumField label="Orange ≥" value={c.thresholds.orange} onChange={v => set('thresholds', { ...c.thresholds, orange: v })} />
            <NumField label="Red ≥" value={c.thresholds.red} onChange={v => set('thresholds', { ...c.thresholds, red: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Validity" unit="h" value={c.validityHours} onChange={v => set('validityHours', v)} />
            <NumField label="Stale input after" unit="h" value={c.staleInputHours} onChange={v => set('staleInputHours', v)} />
          </div>
          {snap.corridor?.source === 'postgis' && c.scenarioDate && (
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-1">Rainfall date</span>
              <span className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="Rainfall date"
                  className={`${inputClass} !w-44`}
                  min="2010-01-07"
                  max={new Date().toISOString().slice(0, 10)}
                  value={c.scenarioDate === 'live' ? '' : c.scenarioDate}
                  onChange={e => e.target.value && set('scenarioDate', e.target.value)}
                />
                <label className="flex items-center gap-1 text-[13px]">
                  <input
                    type="checkbox"
                    aria-label="Live rainfall"
                    checked={c.scenarioDate === 'live'}
                    onChange={e => set('scenarioDate', e.target.checked ? 'live' : '2025-12-31')}
                  />
                  Live
                </label>
                <Pill tone="grey">
                  {c.scenarioDate === 'live' ? 'Open-Meteo live' : c.scenarioDate > '2025-12-31' ? 'Open-Meteo archive' : 'IMD gridded 0.25°'}
                </Pill>
              </span>
            </label>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Reports and approvals" />
        <div className="p-4 grid grid-cols-2 gap-3">
          <NumField label="Duplicate window" unit="min" value={c.duplicateWindowMinutes} onChange={v => set('duplicateWindowMinutes', v)} />
          <NumField label="Duplicate distance" unit="km" step={0.1} value={c.duplicateDistanceKm} onChange={v => set('duplicateDistanceKm', v)} />
          <NumField label="Report max age" unit="min" value={c.reportMaxAgeMinutes} onChange={v => set('reportMaxAgeMinutes', v)} />
          <NumField label="Corridor buffer" unit="km" step={0.1} value={c.corridorBufferKm} onChange={v => set('corridorBufferKm', v)} />
          <NumField label="AI confidence threshold" step={0.05} value={c.aiConfidenceThreshold} onChange={v => set('aiConfidenceThreshold', v)} />
          <NumField label="Escalation after" unit="min" value={c.escalationMinutes} onChange={v => set('escalationMinutes', v)} />
          <NumField label="Approach zone extent" unit="km" step={0.1} value={c.approachZoneExtentKm} onChange={v => set('approachZoneExtentKm', v)} />
          <NumField label="Retention" unit="days" value={c.retentionDays} onChange={v => set('retentionDays', v)} />
          <label className="col-span-2 flex items-center justify-between rounded-md border border-line px-3 h-10 text-[13px]">
            <span className="font-medium">AI photo check service</span>
            <span className="flex items-center gap-2">
              <Pill tone={c.aiServiceOnline ? 'green' : 'yellow'}>{c.aiServiceOnline ? 'Online' : 'Offline · manual review'}</Pill>
              <input type="checkbox" checked={c.aiServiceOnline} onChange={e => set('aiServiceOnline', e.target.checked)} />
            </span>
          </label>
        </div>
      </Card>

      <div className="xl:col-span-2 flex justify-end gap-2">
        <Button disabled={!dirty} onClick={() => setC(snap.config)}>Discard</Button>
        <Button variant="primary" disabled={!dirty} icon={<Save className="w-4 h-4" />} onClick={() => act(s => api.updateConfig(s, c), 'Configuration saved')}>
          Save configuration
        </Button>
      </div>
    </div>
  );
};

const ZoneRow: React.FC<{ z: ApproachZone }> = ({ z }) => {
  const { act } = useApp();
  const { snap } = useCorridor();
  const [extent, setExtent] = useState(z.extentKm);
  const [fallback, setFallback] = useState<string[]>(z.fallbackHoldingPointIds ?? []);
  useEffect(() => {
    setExtent(z.extentKm);
    setFallback(z.fallbackHoldingPointIds ?? []);
  }, [z.extentKm, z.fallbackHoldingPointIds]);
  const dirty = extent !== z.extentKm || JSON.stringify(fallback) !== JSON.stringify(z.fallbackHoldingPointIds ?? []);
  const options = snap.holdingPoints.filter(h => h.id !== z.nearestHoldingPointId);
  return (
    <tr>
      <Td className="font-mono">{z.id}</Td>
      <Td>{z.direction}</Td>
      <Td className="font-mono">{z.segmentId}</Td>
      <Td>
        <input type="number" step={0.1} aria-label={`${z.id} extent`} className={`${inputClass} !w-20 !h-8`} value={extent} onChange={e => setExtent(Number(e.target.value))} />
      </Td>
      <Td>{snap.holdingPoints.find(h => h.id === z.nearestHoldingPointId)?.shortName}</Td>
      <Td>
        <div className="flex flex-wrap gap-2">
          {options.map(h => (
            <label key={h.id} className="inline-flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={fallback.includes(h.id)}
                onChange={e => setFallback(f => (e.target.checked ? [...f, h.id] : f.filter(x => x !== h.id)))}
              />
              {h.shortName}
            </label>
          ))}
        </div>
      </Td>
      <Td className="text-right">
        <Button size="sm" disabled={!dirty} onClick={() => act(s => api.updateZone(s, z.id, { extentKm: extent, fallbackHoldingPointIds: fallback }), `${z.id} saved`)}>
          Save
        </Button>
      </Td>
    </tr>
  );
};

const SUSC: Susceptibility[] = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];
const IMD: ImdWarning[] = ['NONE', 'YELLOW', 'ORANGE', 'RED'];

const InputRow: React.FC<{ seg: Segment }> = ({ seg }) => {
  const { act } = useApp();
  const [v, setV] = useState<SegmentInputs>(seg.inputs);
  useEffect(() => setV(seg.inputs), [seg.inputs]);
  const keys: (keyof SegmentInputs)[] = ['susceptibility', 'slopeDeg', 'rainfall24h', 'rainfall3d', 'rainfall7d', 'pastIncidents', 'imdWarning', 'gsiBulletin'];
  const changed = keys.filter(k => v[k] !== seg.inputs[k]);
  const dirty = changed.length > 0;
  // Send only the edited fields, so e.g. an IMD warning change keeps the model score and real data.
  const patch = Object.fromEntries(changed.map(k => [k, v[k]])) as Partial<SegmentInputs>;
  const num = (k: 'slopeDeg' | 'rainfall24h' | 'rainfall3d' | 'rainfall7d' | 'pastIncidents') => (
    <input
      aria-label={`${seg.id} ${k}`}
      className={`${inputClass} !w-16 !h-8 !px-1.5`}
      value={v[k] ?? ''}
      placeholder="—"
      onChange={e => setV({ ...v, [k]: e.target.value === '' ? null : Number(e.target.value) })}
    />
  );
  return (
    <tr>
      <Td className="whitespace-nowrap">
        <span className="font-mono mr-1">{seg.id}</span>
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5">
          <select aria-label={`${seg.id} susceptibility`} className={`${inputClass} !h-8 !w-28`} value={v.susceptibility ?? ''} onChange={e => setV({ ...v, susceptibility: (e.target.value || null) as Susceptibility | null })}>
            <option value="">—</option>
            {SUSC.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {typeof seg.inputs.susceptibilityScore === 'number' && (
            <span className="font-mono text-xs text-ink-2" title={seg.inputs.modelVersion}>{seg.inputs.susceptibilityScore.toFixed(2)}</span>
          )}
        </span>
      </Td>
      <Td>{num('slopeDeg')}</Td>
      <Td>{num('rainfall24h')}</Td>
      <Td>{num('rainfall3d')}</Td>
      <Td>{num('rainfall7d')}</Td>
      <Td>{num('pastIncidents')}</Td>
      <Td>
        <select aria-label={`${seg.id} IMD`} className={`${inputClass} !h-8 !w-24`} value={v.imdWarning} onChange={e => setV({ ...v, imdWarning: e.target.value as ImdWarning })}>
          {IMD.map(s => <option key={s} value={s}>{s === 'NONE' ? 'None' : s}</option>)}
        </select>
      </Td>
      <Td><input type="checkbox" aria-label={`${seg.id} GSI bulletin`} checked={v.gsiBulletin} onChange={e => setV({ ...v, gsiBulletin: e.target.checked })} /></Td>
      <Td>
        <span className="inline-flex items-center gap-1.5">
          <RiskBadge level={seg.riskLevel} />
          <span className="font-mono text-xs text-ink-2">{seg.riskIndex ?? '—'}</span>
        </span>
      </Td>
      <Td className="text-right">
        <Button size="sm" disabled={!dirty} onClick={() => act(s => api.updateSegmentInputs(s, seg.id, patch), `${seg.id} recomputed`)}>
          Save
        </Button>
      </Td>
    </tr>
  );
};

export const ConfigurationPage: React.FC = () => {
  const { act } = useApp();
  const { snap, segments } = useCorridor();
  const [tab, setTab] = useState<'parameters' | 'zones' | 'holding' | 'inputs'>('parameters');

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Configuration" />
      <PageBody>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'parameters', label: 'Parameters' },
            { id: 'zones', label: 'Approach zones', count: snap.zones.length },
            { id: 'holding', label: 'Holding points', count: snap.holdingPoints.length },
            { id: 'inputs', label: 'Segment inputs', count: snap.segments.filter(s => !s.offCorridor).length }
          ]}
        />

        {tab === 'parameters' && <ConfigForm />}

        {tab === 'zones' && (
          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-subtle border-b border-line">
                <tr><Th>Zone</Th><Th>Direction</Th><Th>Segment</Th><Th>Extent km</Th><Th>Nearest point</Th><Th>Fallback points</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-line">{snap.zones.map(z => <ZoneRow key={z.id} z={z} />)}</tbody>
            </table>
          </Card>
        )}

        {tab === 'holding' && (
          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-subtle border-b border-line">
                <tr><Th>Point</Th><Th>Own segment</Th><Th>Capacity</Th><Th>Facilities</Th><Th>Eligibility</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snap.holdingPoints.map(h => {
                  const e = checkHoldingPointEligibility(h, segments);
                  return (
                    <tr key={h.id}>
                      <Td>
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-ink-2">{h.locationName}{h.source ? ` · ${h.source}` : ''}</div>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{h.segmentId}</span>
                          <RiskBadge level={segments[h.segmentId].riskLevel} />
                        </span>
                      </Td>
                      <Td className="font-mono">{h.capacityVehicles ?? '—'}</Td>
                      <Td className="text-xs">{h.facilities.join(' · ')}</Td>
                      <Td>
                        <div className="flex gap-1 flex-wrap">
                          <Pill tone={e.isEligible ? 'green' : 'red'}>{e.isEligible ? 'Eligible' : 'Not eligible'}</Pill>
                          {h.provisional && <Pill tone="grey">Pending verification</Pill>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'inputs' && (
          <Card className="overflow-x-auto">
            <CardHeader
              title="Segment inputs"
              right={snap.segments.some(s => s.inputs.sample) ? <SampleTag /> : <Pill tone="grey">PostGIS · {snap.segments[0]?.inputs.sources?.rainfall ?? `rainfall ${snap.config.scenarioDate}`}</Pill>}
            />
            <table className="w-full">
              <thead className="bg-subtle border-b border-line">
                <tr><Th>Segment</Th><Th>Susceptibility</Th><Th>Slope °</Th><Th>24h mm</Th><Th>3d mm</Th><Th>7d mm</Th><Th>Incidents</Th><Th>IMD</Th><Th>GSI</Th><Th>Risk</Th><Th /></tr>
              </thead>
              <tbody className="divide-y divide-line">{snap.segments.filter(s => !s.offCorridor).map(s => <InputRow key={s.id} seg={segments[s.id]} />)}</tbody>
            </table>
          </Card>
        )}

        <div className="flex justify-end">
          {snap.corridor?.source === 'postgis' ? (
            <Button variant="danger" icon={<RotateCcw className="w-4 h-4" />} onClick={() => act(s => api.resetSampleData(s), 'Corridor data reloaded')}>
              Reload corridor data
            </Button>
          ) : (
            <Button variant="danger" icon={<RotateCcw className="w-4 h-4" />} onClick={() => act(s => api.resetSampleData(s), 'Sample data reset')}>
              Reset sample data
            </Button>
          )}
        </div>
      </PageBody>
    </div>
  );
};
