import React, { useState } from 'react';
import { useDemo } from '../context/DemoContext';
import { X, Sliders, RotateCcw, AlertTriangle, CloudRain, Cpu } from 'lucide-react';

export const SettingsDrawer: React.FC = () => {
  const { 
    isSettingsOpen, 
    setIsSettingsOpen, 
    settings, 
    updateSettings, 
    aiOutageSimulated, 
    toggleAiOutage,
    toggleImdWarning,
    updateSegmentRainfall,
    segments,
    resetDemo
  } = useDemo();

  const [selectedSegId, setSelectedSegId] = useState<string>('S-07');
  const targetSeg = segments[selectedSegId] || segments['S-07'];
  const [rain24, setRain24] = useState<number>(targetSeg.inputs.rainfall24h);
  const [rain3d, setRain3d] = useState<number>(targetSeg.inputs.rainfall3d);
  const [rain7d, setRain7d] = useState<number>(targetSeg.inputs.rainfall7d);

  if (!isSettingsOpen) return null;

  const handleApplyRainfall = (e: React.FormEvent) => {
    e.preventDefault();
    updateSegmentRainfall(selectedSegId, Number(rain24), Number(rain3d), Number(rain7d));
  };

  const hasImd = Boolean(targetSeg.inputs.warnings && targetSeg.inputs.warnings.toLowerCase().includes('imd'));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 transition-opacity"
        onClick={() => setIsSettingsOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-[#E7E3DA] flex flex-col shadow-xl">
          
          {/* Header */}
          <div className="h-14 px-5 border-b border-[#E7E3DA] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#3780C8]" />
              <h2 className="text-sm font-semibold text-[#1F2933]">Settings</h2>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 rounded-md text-[#6B7280] hover:text-[#1F2933] hover:bg-[#FAF8F3]"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-5 space-y-6 overflow-y-auto flex-1 text-xs">
            
            {/* System Status Toggles */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Services
              </div>

              {/* AI Outage Toggle */}
              <div className="p-3 rounded-lg border border-[#E7E3DA] bg-[#FAF8F3] flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#1F2933]">AI classification service</div>
                  <div className="text-[11px] text-[#6B7280]">
                    {aiOutageSimulated ? 'Offline · Manual queue review' : 'Active · Computer vision triage'}
                  </div>
                </div>
                <button
                  onClick={toggleAiOutage}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    aiOutageSimulated 
                      ? 'bg-[#FBF1CC] text-[#7A5B00] border-[#F3E29F]' 
                      : 'bg-white text-[#1F2933] border-[#E7E3DA]'
                  }`}
                >
                  {aiOutageSimulated ? 'Offline' : 'Online'}
                </button>
              </div>

              {/* IMD Warning Toggle */}
              <div className="p-3 rounded-lg border border-[#E7E3DA] bg-[#FAF8F3] flex items-center justify-between">
                <div>
                  <div className="font-medium text-[#1F2933]">IMD rainfall alert flag</div>
                  <div className="text-[11px] text-[#6B7280]">
                    {hasImd ? 'Active on S-07 (Window closing)' : 'No alert active'}
                  </div>
                </div>
                <button
                  onClick={() => toggleImdWarning('S-07')}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    hasImd 
                      ? 'bg-[#FCE3D2] text-[#9A4A16] border-[#F6C6A7]' 
                      : 'bg-white text-[#1F2933] border-[#E7E3DA]'
                  }`}
                >
                  {hasImd ? 'Flagged' : 'Clear'}
                </button>
              </div>
            </div>

            {/* Rainfall Input Values */}
            <form onSubmit={handleApplyRainfall} className="space-y-3 border-t border-[#E7E3DA] pt-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                  Rainfall inputs
                </div>
                <select
                  value={selectedSegId}
                  onChange={e => {
                    const sid = e.target.value;
                    setSelectedSegId(sid);
                    const s = segments[sid];
                    if (s) {
                      setRain24(s.inputs.rainfall24h);
                      setRain3d(s.inputs.rainfall3d);
                      setRain7d(s.inputs.rainfall7d);
                    }
                  }}
                  className="px-2 py-0.5 border border-[#E7E3DA] rounded text-xs bg-white text-[#1F2933] font-mono"
                >
                  {Object.keys(segments).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-[#6B7280] block mb-1">24h (mm)</label>
                  <input
                    type="number"
                    value={rain24}
                    onChange={e => setRain24(Number(e.target.value))}
                    className="w-full px-2 py-1 border border-[#E7E3DA] rounded text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#6B7280] block mb-1">3d (mm)</label>
                  <input
                    type="number"
                    value={rain3d}
                    onChange={e => setRain3d(Number(e.target.value))}
                    className="w-full px-2 py-1 border border-[#E7E3DA] rounded text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#6B7280] block mb-1">7d (mm)</label>
                  <input
                    type="number"
                    value={rain7d}
                    onChange={e => setRain7d(Number(e.target.value))}
                    className="w-full px-2 py-1 border border-[#E7E3DA] rounded text-xs font-mono bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-1.5 rounded border border-[#3780C8] text-[#3780C8] hover:bg-[#3780C8]/10 font-medium text-xs transition-colors"
              >
                Apply rainfall values
              </button>
            </form>

            {/* Risk Weights Sliders */}
            <div className="space-y-4 border-t border-[#E7E3DA] pt-4">
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Model weights
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#1F2933]">Susceptibility weight</span>
                    <span className="font-mono text-[#6B7280]">{settings.gsiWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={settings.gsiWeight}
                    onChange={e => updateSettings({ gsiWeight: Number(e.target.value) })}
                    className="w-full accent-[#3780C8]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#1F2933]">Rainfall weight</span>
                    <span className="font-mono text-[#6B7280]">{settings.rainfallWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={settings.rainfallWeight}
                    onChange={e => updateSettings({ rainfallWeight: Number(e.target.value) })}
                    className="w-full accent-[#3780C8]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#1F2933]">Slope weight</span>
                    <span className="font-mono text-[#6B7280]">{settings.slopeWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    value={settings.slopeWeight}
                    onChange={e => updateSettings({ slopeWeight: Number(e.target.value) })}
                    className="w-full accent-[#3780C8]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#1F2933]">History weight</span>
                    <span className="font-mono text-[#6B7280]">{settings.historyWeight}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={settings.historyWeight}
                    onChange={e => updateSettings({ historyWeight: Number(e.target.value) })}
                    className="w-full accent-[#3780C8]"
                  />
                </div>
              </div>
            </div>

            {/* Restore initial state button */}
            <div className="border-t border-[#E7E3DA] pt-4">
              <button
                onClick={() => {
                  resetDemo();
                  setIsSettingsOpen(false);
                }}
                className="w-full py-2 rounded-lg border border-[#E7E3DA] text-[#6B7280] hover:text-[#9B2C2C] hover:bg-[#F8D7D7]/40 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore initial state</span>
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
