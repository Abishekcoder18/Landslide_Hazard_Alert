import React, { useEffect, useRef, useState } from 'react';
import { Segment, SafeHoldingPoint, ApproachZone, RiskLevel } from '../types';
import L from 'leaflet';
import { AlertTriangle } from 'lucide-react';
import { token } from '../lib/tokens';
import { Segmented } from './ui';

interface CorridorMapProps {
  segments: Record<string, Segment>;
  holdingPoints: Record<string, SafeHoldingPoint>;
  zones?: ApproachZone[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
  heightClass?: string;
}

const RISK_TOKEN: Record<RiskLevel, string> = { GREEN: 'risk-green', YELLOW: 'risk-yellow', ORANGE: 'risk-orange', RED: 'risk-red', NO_DATA: 'risk-none' };
const LEGEND: { level: RiskLevel; label: string }[] = [
  { level: 'GREEN', label: 'Green' },
  { level: 'YELLOW', label: 'Yellow' },
  { level: 'ORANGE', label: 'Orange' },
  { level: 'RED', label: 'Red' },
  { level: 'NO_DATA', label: 'No data' }
];
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const CorridorMap: React.FC<CorridorMapProps> = ({
  segments,
  holdingPoints,
  zones = [],
  selectedSegmentId,
  onSelectSegment,
  heightClass = 'h-[540px]'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.FeatureGroup | null>(null);
  const fittedKeyRef = useRef<string>('');
  // NH-27 only: diversion-road segments (offCorridor) are drawn grey and never risk-coloured (FR-09).
  const segList = Object.values(segments).filter(s => !s.offCorridor).sort((a, b) => a.startKm - b.startKm);
  const diversionRoads = Object.values(segments).filter(s => s.offCorridor);
  // Real corridor = 137 x ~1 km segments: segment labels only for the selected or blocked ones.
  const many = segList.length > 20;
  const kmFrom = segList.length ? Math.min(...segList.map(s => s.startKm)) : 0;
  const kmTo = segList.length ? Math.max(...segList.map(s => s.endKm)) : 0;
  const shortId = (id: string) => id.replace(/^.*-0*(?=\d)/, '');
  const [viewMode, setViewMode] = useState<'osm' | 'schematic'>('osm');
  const [tilesLoadedFailed, setTilesLoadedFailed] = useState<boolean>(false);
  const [zoomTick, setZoomTick] = useState(0);
  const lineColor = (seg: Segment) => token(seg.roadState === 'BLOCKED' ? 'risk-red' : RISK_TOKEN[seg.riskLevel]);

  const handleSegmentClick = (segId: string) => {
    if (onSelectSegment) onSelectSegment(segId);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, { center: [25.26, 93.04], zoom: 10, minZoom: 9, maxZoom: 15, zoomControl: false });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 });
        tileLayer.on('tileerror', () => setTilesLoadedFailed(true));
        tileLayer.addTo(map);
        layersGroupRef.current = L.featureGroup().addTo(map);
        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Map init error:', err);
        setViewMode('schematic');
      }
    }

    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    if (map && group) {
      group.clearLayers();
      const navy = token('nav');
      const ink = token('ink');
      const ink2 = token('ink-2');

      // Approach-zone geofences (FR-08): very light rings, under the road lines.
      zones.forEach(z => {
        L.circle(z.center, { radius: z.extentKm * 1000, color: token('primary'), weight: 1, opacity: 0.35, fillColor: token('primary'), fillOpacity: 0.03, dashArray: '3, 4', interactive: true })
          .bindTooltip(`<strong>${esc(z.id)}</strong> · ${esc(z.direction)}<br/>${z.extentKm} km before ${esc(z.segmentId)}`, { sticky: true, className: 'resilion-map-tooltip' })
          .addTo(group);
      });

      // Diversion roads (BR-03 candidates, not NH-27): dashed grey, not part of the corridor colouring.
      diversionRoads.forEach(seg => {
        L.polyline(seg.coordinates, { color: token('risk-none'), weight: 2.5, opacity: 0.75, dashArray: '5, 6' })
          .bindTooltip(`${esc(seg.id)} ${esc(seg.name)}<br/><span style="color:${ink2}">Diversion road (not NH-27)</span>`, { sticky: true, className: 'resilion-map-tooltip' })
          .addTo(group);
      });

      // White casing first, then the risk-coloured line (weight 5).
      segList.forEach(seg => {
        const isSelected = selectedSegmentId === seg.id;
        L.polyline(seg.coordinates, { color: '#FFFFFF', weight: isSelected ? 11 : 9, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
      });
      segList.forEach(seg => {
        const isSelected = selectedSegmentId === seg.id;
        const color = lineColor(seg);
        const isBlocked = seg.roadState === 'BLOCKED';
        const polyline = L.polyline(seg.coordinates, {
          color,
          weight: isSelected ? 7 : 5,
          opacity: 1,
          dashArray: seg.riskLevel === 'NO_DATA' ? '6, 6' : undefined,
          lineCap: 'round',
          lineJoin: 'round'
        });
        polyline.bindTooltip(`<strong style="color:${ink}">${esc(seg.id)} ${esc(seg.name)}</strong><br/><span style="color:${ink2}">${seg.roadState} · ${seg.riskLevel}</span>`, {
          sticky: true,
          className: 'resilion-map-tooltip'
        });
        polyline.on('click', () => handleSegmentClick(seg.id));
        polyline.addTo(group);

        if (!many || isSelected || isBlocked) {
          const markerIcon = L.divIcon({
            className: 'custom-segment-pin',
            html: `<div style="background:#FFFFFF;color:${ink};font:600 11px/1 'JetBrains Mono',monospace;padding:4px 6px;border-radius:6px;border:2px solid ${color};box-shadow:0 1px 3px rgba(16,24,40,.18);white-space:nowrap;transform:translate(-50%,-50%);display:inline-block">${esc(seg.id)}</div>`
          });
          const marker = L.marker(seg.center, { icon: markerIcon, zIndexOffset: isSelected ? 1000 : 0 });
          marker.on('click', () => handleSegmentClick(seg.id));
          marker.addTo(group);
        }
      });

      // Fit the view to the corridor geometry once per segment set (sample or real NH-27 data).
      const key = segList.map(s => s.id).join(',');
      if (key && fittedKeyRef.current !== key) {
        const pts = segList.flatMap(s => s.coordinates) as L.LatLngExpression[];
        if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], animate: false });
        fittedKeyRef.current = key;
      }

      // Safe holding points: navy pins with white labels. Each label takes the first free slot around its pin
      // (right / left, then shifted up or down) so neighbouring labels never cover each other; re-placed on zoom.
      const hps = Object.values(holdingPoints)
        .filter(hp => segments[hp.segmentId])
        .map(hp => ({ hp, pos: (hp.lat != null && hp.lon != null ? [hp.lat, hp.lon] : segments[hp.segmentId].center) as [number, number] }))
        .sort((a, b) => b.pos[0] - a.pos[0]);
      const pins = hps.map(({ pos }) => map.latLngToContainerPoint(pos));
      const placed: { x: number; y: number; w: number; h: number }[] = pins.map(p => ({ x: p.x - 7, y: p.y - 7, w: 14, h: 14 }));
      const hit = (a: { x: number; y: number; w: number; h: number }) =>
        placed.some(b => a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y);
      hps.forEach(({ hp, pos }, idx) => {
        const p = pins[idx];
        const w = Math.round(hp.shortName.length * 6.4 + 20);
        const h = 22;
        const slots: [number, number][] = [];
        for (const dy of [0, -26, 26, -52, 52]) slots.push([14, dy - h / 2], [-14 - w, dy - h / 2]);
        const [dx, dy] = slots.find(([sx, sy]) => !hit({ x: p.x + sx, y: p.y + sy, w, h })) ?? slots[0];
        placed.push({ x: p.x + dx, y: p.y + dy, w, h });
        const ex = dx > 0 ? dx : dx + w;
        const ey = dy + h / 2;
        const html = `<div style="position:relative;width:0;height:0">
          <svg style="position:absolute;overflow:visible;left:0;top:0" width="1" height="1"><line x1="0" y1="0" x2="${ex}" y2="${ey}" stroke="${navy}" stroke-width="2"/></svg>
          <div style="position:absolute;left:${dx}px;top:${dy}px;height:${h}px;box-sizing:border-box;background:${navy};color:#FFFFFF;font:600 11px/1 Inter,sans-serif;padding:0 8px;display:flex;align-items:center;border-radius:6px;border:1px solid #FFFFFF;box-shadow:0 2px 6px rgba(16,24,40,.25);white-space:nowrap">${esc(hp.shortName)}</div>
          <div style="position:absolute;left:-6px;top:-6px;width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:${navy};border:2px solid #FFFFFF;box-shadow:0 1px 3px rgba(16,24,40,.3)"></div>
        </div>`;
        const hpIcon = L.divIcon({ className: 'custom-hp-pin', iconSize: [0, 0], html });
        L.marker(pos, { icon: hpIcon, zIndexOffset: 500 })
          .bindPopup(
            `<div style="font-family:Inter,sans-serif;font-size:12px"><strong style="color:${ink}">${esc(hp.name)}</strong><br/><span style="color:${ink2}">${esc(hp.locationName)}</span><br/><span>Capacity: ${hp.capacityVehicles ?? '—'}${hp.capacityVehicles != null ? ' vehicles' : ''}</span>${hp.source ? `<br/><span style="color:${ink2}">${esc(hp.source)}</span>` : ''}</div>`
          )
          .addTo(group);
      });
    }
  }, [viewMode, segments, holdingPoints, zones, selectedSegmentId, zoomTick]);

  // Re-place holding-point labels after every zoom (pixel distances change).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bump = () => setZoomTick(t => t + 1);
    map.on('zoomend', bump);
    return () => {
      map.off('zoomend', bump);
    };
  }, []);

  // Leaflet needs a size refresh when the OSM view is shown again.
  useEffect(() => {
    if (viewMode === 'osm') setTimeout(() => mapInstanceRef.current?.invalidateSize(), 0);
  }, [viewMode]);

  return (
    <section className={`relative isolate flex flex-col rounded-card border border-line bg-surface shadow-card overflow-hidden ${heightClass}`}>
      {/* Header row: title · legend · view switch (no controls float over the map) */}
      <div className="px-4 h-12 border-b border-line flex items-center gap-3 shrink-0">
        <h2 className="text-[14px] font-semibold text-ink">NH-27 Corridor</h2>
        <span className="text-[11px] font-mono text-ink-3 tabular-nums">km {kmFrom}–{kmTo}</span>
        <div className="ml-auto flex items-center gap-2">
          {tilesLoadedFailed && viewMode === 'osm' && (
            <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-chip bg-dec-caution-bg border border-dec-caution-line text-dec-caution-fg text-[12px] font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Tiles loading fallback
              <button onClick={() => setViewMode('schematic')} className="underline font-semibold">
                Switch to schematic
              </button>
            </span>
          )}
          <Segmented
            label="Map view"
            value={viewMode}
            onChange={setViewMode}
            items={[
              { id: 'osm', label: 'OSM' },
              { id: 'schematic', label: 'Schematic' }
            ]}
          />
        </div>
      </div>
      <div className="px-4 h-9 border-b border-line bg-subtle flex items-center shrink-0 overflow-hidden">
        <div className="flex items-center gap-x-3.5 text-[12px] text-ink-2 whitespace-nowrap" aria-label="Legend">
          {LEGEND.map(l => (
            <span key={l.level} className="inline-flex items-center gap-1.5">
              <span className="w-4 h-[5px] rounded-full" style={{ background: `var(--color-${RISK_TOKEN[l.level]})` }} aria-hidden />
              {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-risk-none" aria-hidden />
            Diversion
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-nav border border-white shadow-sm" aria-hidden />
            Holding point
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border border-dashed border-primary" aria-hidden />
            Approach zone
          </span>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className={`absolute inset-0 z-0 ${viewMode !== 'osm' ? 'hidden' : ''}`} tabIndex={0} aria-label="Corridor map" />

        {viewMode === 'schematic' && (
          <div className="absolute inset-0 bg-subtle text-ink p-6 overflow-y-auto flex flex-col justify-center">
            <div className="max-w-3xl mx-auto w-full space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">Corridor schematic · NH-27 Dima Hasao</span>
                <span className="text-xs text-ink-3 font-mono">
                  km {kmFrom}–{kmTo} ({Math.round((kmTo - kmFrom) * 10) / 10} km)
                </span>
              </div>
              <div className="relative py-8 px-4 bg-surface rounded-card border border-line shadow-card">
                <div className={many ? 'grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-y-5 gap-x-1 pt-4' : 'flex items-center justify-between relative'}>
                  {!many && <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1.5 bg-line rounded-full z-0"></div>}
                  {segList.map(seg => {
                    const isSelected = selectedSegmentId === seg.id;
                    return (
                      <div
                        key={seg.id}
                        onClick={() => handleSegmentClick(seg.id)}
                        className="relative z-10 flex flex-col items-center group cursor-pointer"
                        title={`${seg.id} ${seg.name} (${seg.roadState}, ${seg.riskLevel})`}
                      >
                        {Object.values(holdingPoints)
                          .filter(h => h.segmentId === seg.id)
                          .map(h => (
                            <div key={h.id} className="absolute -top-6 text-[10px] font-semibold bg-nav text-white px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                              {h.shortName}
                            </div>
                          ))}
                        <div
                          className={`${many ? 'w-7 h-6 rounded text-[9px]' : 'w-6 h-6 rounded-full text-[10px]'} flex items-center justify-center font-semibold border-2 border-white transition-transform group-hover:scale-110 ${isSelected ? 'ring-2 ring-primary' : ''}`}
                          style={{ backgroundColor: `var(--color-${seg.roadState === 'BLOCKED' ? 'risk-red' : RISK_TOKEN[seg.riskLevel]})`, color: seg.riskLevel === 'YELLOW' && seg.roadState !== 'BLOCKED' ? 'var(--color-ink)' : '#FFFFFF' }}
                        >
                          {shortId(seg.id)}
                        </div>
                        {!many && <span className="mt-1 block text-[10px] font-medium text-ink">{seg.id}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
