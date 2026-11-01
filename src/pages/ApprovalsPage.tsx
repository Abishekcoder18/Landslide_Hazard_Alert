import React, { useState, useEffect } from 'react';
import { useDemo } from '../context/DemoContext';
import { TopBar } from '../components/TopBar';
import { DecisionChip } from '../components/Badges';
import { Check, X, Clock, Download, Code2, CheckCircle2 } from 'lucide-react';

export const ApprovalsPage: React.FC = () => {
  const { approval, approveClosure, rejectClosure } = useDemo();

  const [closureType, setClosureType] = useState<'FULL' | 'HEAVY_ONLY' | 'ONE_WAY'>(approval.closureType || 'FULL');
  const [activeLang, setActiveLang] = useState<'en' | 'hi' | 'as' | 'bn' | 'dimasa'>('en');
  const [showCapModal, setShowCapModal] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(approval.escalationTimeRemainingSec || 580);

  useEffect(() => {
    if (approval.status !== 'pending') return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [approval.status]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownloadCap = () => {
    const element = document.createElement('a');
    const file = new Blob([approval.capXml], { type: 'application/xml' });
    element.href = URL.createObjectURL(file);
    element.download = `CAP-ALERT-NH27-S07.xml`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const langLabels = {
    en: 'English',
    hi: 'Hindi',
    as: 'Assamese',
    bn: 'Bengali',
    dimasa: 'Dimasa'
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Approvals" />

      <div className="p-6 space-y-4 max-w-[1720px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (5 cols): Closure Card */}
          <div className="lg:col-span-5 bg-white rounded-lg border border-[#E7E3DA] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-3">
              <div className="flex items-center gap-2">
                <DecisionChip decision="CLOSE" size="sm" />
                <span className="font-semibold text-xs text-[#1F2933]">
                  Closure order
                </span>
              </div>

              {approval.status === 'pending' ? (
                <div className="flex items-center gap-1.5 text-xs text-[#7A5B00] bg-[#FBF1CC] px-2 py-0.5 rounded font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTimer(secondsRemaining)}</span>
                </div>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#DFF1E5] text-[#2F6B45]">
                  Approved
                </span>
              )}
            </div>

            {/* Target sector info */}
            <div className="text-xs space-y-1">
              <div className="font-semibold text-[#1F2933]">
                Sector S-07 Jatinga–Harangajao (km 166–178)
              </div>
              <div className="text-[#6B7280]">
                Holding at Haflong (north) and Silchar (south).
              </div>
            </div>

            {/* Closure type selector */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block">
                Modality
              </label>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setClosureType('FULL')}
                  className={`py-2 px-1 rounded-md border text-center font-medium transition-colors ${
                    closureType === 'FULL'
                      ? 'border-[#EEAFAF] bg-[#F8D7D7] text-[#9B2C2C] font-semibold'
                      : 'border-[#E7E3DA] bg-white text-[#1F2933] hover:bg-[#FAF8F3]'
                  }`}
                >
                  Full
                </button>
                <button
                  type="button"
                  onClick={() => setClosureType('HEAVY_ONLY')}
                  className={`py-2 px-1 rounded-md border text-center font-medium transition-colors ${
                    closureType === 'HEAVY_ONLY'
                      ? 'border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00] font-semibold'
                      : 'border-[#E7E3DA] bg-white text-[#1F2933] hover:bg-[#FAF8F3]'
                  }`}
                >
                  Heavy only
                </button>
                <button
                  type="button"
                  onClick={() => setClosureType('ONE_WAY')}
                  className={`py-2 px-1 rounded-md border text-center font-medium transition-colors ${
                    closureType === 'ONE_WAY'
                      ? 'border-[#CDE1F4] bg-[#EBF2FA] text-[#2A649C] font-semibold'
                      : 'border-[#E7E3DA] bg-white text-[#1F2933] hover:bg-[#FAF8F3]'
                  }`}
                >
                  One-way
                </button>
              </div>
            </div>

            {/* Approve / Reject buttons */}
            <div className="pt-2 flex items-center gap-2">
              {approval.status === 'pending' ? (
                <>
                  <button
                    onClick={() => approveClosure(closureType)}
                    className="flex-1 py-2 rounded-lg bg-[#3780C8] hover:bg-[#2A649C] text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={rejectClosure}
                    className="px-3 py-2 rounded-lg border border-[#E7E3DA] text-[#6B7280] hover:text-[#9B2C2C] text-xs transition-colors"
                  >
                    Reject
                  </button>
                </>
              ) : (
                <div className="w-full text-xs text-[#2F6B45] bg-[#DFF1E5] p-2.5 rounded-lg border border-[#BDE3C9] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Order approved ({approval.closureType})</span>
                </div>
              )}
            </div>

          </div>

          {/* Right Column (7 cols): Multilingual Alert Preview */}
          <div className="lg:col-span-7 bg-white rounded-lg border border-[#E7E3DA] p-5 shadow-xs space-y-4">
            
            <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-2">
              <span className="font-semibold text-xs text-[#1F2933]">Alert broadcast</span>
              <button
                onClick={() => setShowCapModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#3780C8] text-[#3780C8] hover:bg-[#3780C8]/10 text-xs font-medium transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Export CAP</span>
              </button>
            </div>

            {/* Language tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs pb-1 scrollbar-none">
              {(['en', 'hi', 'as', 'bn', 'dimasa'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setActiveLang(l)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    activeLang === l
                      ? 'bg-[#3780C8] text-white'
                      : 'bg-[#FAF8F3] text-[#6B7280] hover:text-[#1F2933]'
                  }`}
                >
                  {langLabels[l]}
                </button>
              ))}
            </div>

            {/* Draft content */}
            <div className="p-3.5 rounded-lg bg-[#FAF8F3] border border-[#E7E3DA] text-xs text-[#1F2933] leading-relaxed font-medium">
              {approval.drafts[activeLang]}
            </div>

            {/* Small validation row */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E7E3DA] text-xs text-[#6B7280]">
              <span className="font-medium text-[#1F2933]">Validation</span>
              <div className="flex items-center gap-3">
                <span className="text-[#2F6B45] font-medium">Places ✓</span>
                <span className="text-[#2F6B45] font-medium">Times ✓</span>
                <span className="text-[#2F6B45] font-medium">Decision ✓</span>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* CAP XML Modal */}
      {showCapModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl border border-[#E7E3DA] overflow-hidden">
            <div className="h-12 px-4 border-b border-[#E7E3DA] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1F2933]">Common Alerting Protocol (CAP XML)</span>
              <button
                onClick={() => setShowCapModal(false)}
                className="p-1 rounded text-[#6B7280] hover:text-[#1F2933]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-[#FAF8F3] font-mono text-[11px] text-[#1F2933]">
              <pre className="whitespace-pre-wrap">{approval.capXml}</pre>
            </div>

            <div className="p-3 border-t border-[#E7E3DA] flex justify-end gap-2">
              <button
                onClick={handleDownloadCap}
                className="px-3 py-1.5 rounded bg-[#3780C8] hover:bg-[#2A649C] text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download XML</span>
              </button>
              <button
                onClick={() => setShowCapModal(false)}
                className="px-3 py-1.5 rounded border border-[#E7E3DA] text-[#6B7280] text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
