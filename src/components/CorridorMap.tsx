import React, { useEffect, useRef, useState } from 'react';
import { Segment, SafeHoldingPoint, ApproachZone } from '../types';
import L from 'leaflet';
import { Map, Layers, Navigation, AlertTriangle } from 'lucide-react';

interface CorridorMapProps {
  segments: Record<string, Segment>;
  holdingPoints: Record<string, SafeHoldingPoint>;
  zones?: ApproachZone[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
  heightClass?: string;
}

const MAP_LINE_COLORS: Record<string, string> = {
  GREEN: '#4CAF7A',
  YELLOW: '#E0B33A',
  ORANGE: '#E8894A',
  RED: '#D45555',
  NO_DATA: '#9CA3AF'
};

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

  const handleSegmentClick = (segId: string) => {
    if (onSelectSegment) {
      onSelectSegment(segId);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, {
          center: [25.26, 93.04],
          zoom: 10,
          minZoom: 9,
          maxZoom: 15,
          zoomControl: false
        });

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 18
        });

        tileLayer.on('tileerror', () => {
          setTilesLoadedFailed(true);
        });

        tileLayer.addTo(map);

        const layersGroup = L.featureGroup().addTo(map);
        layersGroupRef.current = layersGroup;
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

      // Diversion roads (BR-03 candidates, not NH-27): thin grey, not part of the corridor colouring.
      diversionRoads.forEach(seg => {
        L.polyline(seg.coordinates, { color: '#9CA3AF', weight: 3, opacity: 0.7, dashArray: '4, 6' })
          .bindTooltip(`<div style="font-family: Inter, sans-serif; font-size: 12px;">${seg.id} ${seg.name}<br/><span>Diversion road (not NH-27)</span></div>`,
            { sticky: true, className: 'resilion-map-tooltip' })
          .addTo(group);
      });

      // Render road segments
      segList.forEach(seg => {
        const isSelected = selectedSegmentId === seg.id;
        const color = MAP_LINE_COLORS[seg.riskLevel] || '#9CA3AF';
        const isBlocked = seg.roadState === 'BLOCKED';

        const polyline = L.polyline(seg.coordinates, {
          color: isBlocked ? '#D45555' : color,
          weight: isSelected ? 8 : 6,
          opacity: 0.95,
          dashArray: seg.riskLevel === 'NO_DATA' ? '6, 6' : undefined,
          lineCap: 'round',
          lineJoin: 'round'
        });

        polyline.bindTooltip(
          `<div style="font-family: Inter, sans-serif; font-size: 12px; line-height: 1.3;">
            <strong style="color: #1F2933;">${seg.id} ${seg.name}</strong><br/>
            <span>${seg.roadState} · ${seg.riskLevel}</span>
          </div>`,
          { sticky: true, className: 'resilion-map-tooltip' }
        );

        polyline.on('click', () => {
          handleSegmentClick(seg.id);
        });

        polyline.addTo(group);

        // Marker at segment center
        const markerIcon = L.divIcon({
          className: 'custom-segment-pin',
          html: `<div style="
            background-color: ${isBlocked ? '#D45555' : color};
            color: white;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
            white-space: nowrap;
            transform: translate(-50%, -50%);
          ">
            ${seg.id}
          </div>`
        });

        if (!many || isSelected || isBlocked) {
          const marker = L.marker(seg.center, { icon: markerIcon });
          marker.on('click', () => handleSegmentClick(seg.id));
          marker.addTo(group);
        }
      });

      // Render Safe Holding Points
      Object.values(holdingPoints).forEach(hp => {
        const hostSeg = segments[hp.segmentId];
        if (!hostSeg) return;

        const hpIcon = L.divIcon({
          className: 'custom-hp-pin',
          html: `<div style="
            background-color: #3780C8;
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 6px;
            border: 1px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15);
            white-space: nowrap;
            transform: translate(-50%, -100%);
          ">
            ${hp.shortName}
          </div>`
        });

        const hpMarker = L.marker(hp.lat != null && hp.lon != null ? [hp.lat, hp.lon] : hostSeg.center, { icon: hpIcon });
        hpMarker.bindPopup(
          `<div style="font-family: Inter, sans-serif; font-size: 12px;">
            <strong style="color: #1F2933;">${hp.name}</strong><br/>
            <span style="color: #6B7280;">${hp.locationName}</span><br/>
            <span>Capacity: ${hp.capacityVehicles ?? '—'}${hp.capacityVehicles != null ? ' vehicles' : ''}</span>${hp.source ? `<br/><span style="color: #6B7280;">${hp.source}</span>` : ''}
          </div>`
        );
        hpMarker.addTo(group);
      });

      // Approach-zone geofences (FR-08)
      zones.forEach(z => {
        const circle = L.circle(z.center, {
          radius: z.extentKm * 1000,
          color: '#3780C8',
          weight: 1,
          opacity: 0.8,
          fillColor: '#3780C8',
          fillOpacity: 0.06,
          dashArray: '4, 4'
        });
        circle.bindTooltip(
          `<div style="font-family: Inter, sans-serif; font-size: 12px;"><strong>${z.id}</strong> · ${z.direction}<br/>${z.extentKm} km before ${z.segmentId}</div>`,
          { sticky: true, className: 'resilion-map-tooltip' }
        );
        circle.addTo(group);
      });

      // Fit the view to the corridor geometry once per segment set (sample or real NH-27 data).
      const key = segList.map(s => s.id).join(',');
      if (key && fittedKeyRef.current !== key) {
        const pts = segList.flatMap(s => s.coordinates) as L.LatLngExpression[];
        if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
        fittedKeyRef.current = key;
      }
    }
  }, [viewMode, segments, holdingPoints, zones, selectedSegmentId]);

  return (
    <div className={`relative rounded-lg border border-[#E7E3DA] overflow-hidden bg-white ${heightClass}`}>
      
      {/* Top Map Toolbar */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-white/95 px-3 py-1.5 rounded-lg border border-[#E7E3DA] shadow-xs text-xs font-medium text-[#1F2933]">
        <Navigation className="w-3.5 h-3.5 text-[#3780C8]" />
        <span>NH-27 Corridor</span>
      </div>

      {/* View Mode Switcher */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1 bg-white/95 p-1 rounded-lg border border-[#E7E3DA] shadow-xs text-xs">
        <button
          onClick={() => setViewMode('osm')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === 'osm' 
              ? 'bg-[#3780C8] text-white' 
              : 'text-[#6B7280] hover:bg-[#FAF8F3]'
          }`}
        >
          OSM
        </button>
        <button
          onClick={() => setViewMode('schematic')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === 'schematic' 
              ? 'bg-[#3780C8] text-white' 
              : 'text-[#6B7280] hover:bg-[#FAF8F3]'
          }`}
        >
          Schematic
        </button>
      </div>

      {/* Tiles Load Warning Banner */}
      {tilesLoadedFailed && viewMode === 'osm' && (
        <div className="absolute bottom-10 left-3 z-[1000] bg-[#FBF1CC] border border-[#F3E29F] text-[#7A5B00] text-xs px-3 py-1.5 rounded-md flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Tiles loading fallback</span>
          <button
            onClick={() => setViewMode('schematic')}
            className="underline font-semibold ml-1"
          >
            Switch to schematic
          </button>
        </div>
      )}

      {/* Map Container */}
      <div 
        ref={mapContainerRef} 
        className={`w-full h-full z-0 ${viewMode !== 'osm' ? 'hidden' : ''}`} 
        tabIndex={0} 
      />

      {/* Stylized Schematic Line */}
      {viewMode === 'schematic' && (
        <div className="w-full h-full bg-[#FAF8F3] text-[#1F2933] p-6 overflow-y-auto flex flex-col justify-center z-10 relative">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-2">
              <span className="text-sm font-semibold text-[#1F2933]">
                Corridor schematic · NH-27 Dima Hasao
              </span>
              <span className="text-xs text-[#6B7280] font-mono">
                km {kmFrom}–{kmTo} ({Math.round((kmTo - kmFrom) * 10) / 10} km)
              </span>
            </div>

            <div className="relative py-8 px-4 bg-white rounded-lg border border-[#E7E3DA]">
              <div className={many ? 'grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-y-5 gap-x-1 pt-4' : 'flex items-center justify-between relative'}>
                {!many && <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1.5 bg-[#E7E3DA] rounded-full z-0"></div>}

                {segList.map(seg => {
                  const color = MAP_LINE_COLORS[seg.riskLevel] || '#9CA3AF';
                  const isBlocked = seg.roadState === 'BLOCKED';
                  const isSelected = selectedSegmentId === seg.id;

                  return (
                    <div
                      key={seg.id}
                      onClick={() => handleSegmentClick(seg.id)}
                      className="relative z-10 flex flex-col items-center group cursor-pointer"
                      title={`${seg.id} ${seg.name} (${seg.roadState}, ${seg.riskLevel})`}
                    >
                      {Object.values(holdingPoints).filter(h => h.segmentId === seg.id).map(h => (
                        <div key={h.id} className="absolute -top-6 text-[10px] font-medium bg-[#3780C8] text-white px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap">
                          {h.shortName}
                        </div>
                      ))}

                      <div
                        className={`${many ? 'w-7 h-6 rounded text-[9px]' : 'w-6 h-6 rounded-full text-[10px]'} flex items-center justify-center font-semibold border-2 transition-transform group-hover:scale-110 ${
                          isSelected ? 'ring-2 ring-[#3780C8]' : ''
                        }`}
                        style={{
                          backgroundColor: isBlocked ? '#D45555' : color,
                          borderColor: '#FFFFFF',
                          color: '#FFFFFF'
                        }}
                      >
                        {shortId(seg.id)}
                      </div>

                      {!many && (
                        <div className="mt-1 text-center">
                          <span className="block text-[10px] font-medium text-[#1F2933]">
                            {seg.id}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 text-xs text-[#6B7280]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF7A]"></span>
                <span>Green</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E0B33A]"></span>
                <span>Yellow</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E8894A]"></span>
                <span>Orange</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#D45555]"></span>
                <span>Red/Blocked</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]"></span>
                <span>No data</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Floating Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] hidden sm:flex items-center gap-3 bg-white/95 px-3 py-1.5 rounded-md border border-[#E7E3DA] text-xs text-[#6B7280]">
        <span className="font-medium text-[#1F2933]">Risk</span>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#4CAF7A]"></span>
          <span>Green</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#E0B33A]"></span>
          <span>Yellow</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#E8894A]"></span>
          <span>Orange</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#D45555]"></span>
          <span>Red</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#9CA3AF]"></span>
          <span>No data</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border border-dashed border-[#3780C8]"></span>
          <span>Approach zone</span>
        </div>
      </div>

    </div>
  );
};
