import React, { useState } from 'react';
import { useDemo } from '../context/DemoContext';
import { TopBar } from '../components/TopBar';
import { AiTag } from '../components/Badges';
import { Camera, Check, X, UploadCloud, Loader2 } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { reports, confirmReport, rejectReport, submitFieldReport } = useDemo();
  const [activeTab, setActiveTab] = useState<'queue' | 'new'>('queue');

  // Form states
  const SAMPLE_DEBRIS_IMG = 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80';
  const [photoUrl, setPhotoUrl] = useState<string>(SAMPLE_DEBRIS_IMG);
  const [locationText, setLocationText] = useState<string>('Jatinga bend, S-07 km 168.4');
  const [segmentId, setSegmentId] = useState<string>('S-07');
  const [notes, setNotes] = useState<string>('Debris and mud slurry across carriageway.');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    setTimeout(async () => {
      await submitFieldReport({
        submitterRole: 'Patrol HP-03',
        locationText,
        segmentId,
        photoUrl,
        notes,
        aiClassification: {
          hazardClass: 'Debris on road',
          blockagePercent: 100,
          confidence: 0.91,
          suggestion: 'Road blocked ~100%'
        },
        checks: {
          insideCorridor: true,
          recent: true,
          duplicateGroup: 'DUP-S07-A'
        }
      });
      setSubmitting(false);
      setActiveTab('queue');
    }, 1500);
  };

  const statusBadge = (st: string) => {
    switch (st) {
      case 'confirmed':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium border border-[#BDE3C9] bg-[#DFF1E5] text-[#2F6B45]">
            Confirmed
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium border border-[#EEAFAF] bg-[#F8D7D7] text-[#9B2C2C]">
            Rejected
          </span>
        );
      case 'corroborated':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium border border-[#CDE1F4] bg-[#EBF2FA] text-[#2A649C]">
            Corroborated
          </span>
        );
      case 'unverified':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium border border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00]">
            Unverified
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Reports" />

      <div className="p-6 space-y-4 max-w-[1720px] w-full mx-auto">
        
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E7E3DA] pb-2 text-xs">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'queue'
                ? 'bg-[#3780C8] text-white'
                : 'text-[#6B7280] hover:text-[#1F2933]'
            }`}
          >
            Queue ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'new'
                ? 'bg-[#3780C8] text-white'
                : 'text-[#6B7280] hover:text-[#1F2933]'
            }`}
          >
            New report
          </button>
        </div>

        {/* Tab 1: Queue */}
        {activeTab === 'queue' && (
          <div className="bg-white rounded-lg border border-[#E7E3DA] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#1F2933]">
                <thead className="bg-[#FAF8F3] border-b border-[#E7E3DA] uppercase text-[11px] font-semibold text-[#6B7280]">
                  <tr>
                    <th className="px-4 py-3">Report</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Photo</th>
                    <th className="px-4 py-3">AI result</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Officer action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#E7E3DA]">
                  {reports.map(rep => {
                    const isPending = rep.status === 'unverified' || rep.status === 'corroborated';
                    return (
                      <tr key={rep.id} className="hover:bg-[#FAF8F3]/50">
                        {/* Report ID & time */}
                        <td className="px-4 py-3 align-top whitespace-nowrap font-mono text-[11px]">
                          <div className="font-semibold text-[#1F2933]">{rep.id}</div>
                          <div className="text-[#6B7280]">{rep.timestamp}</div>
                        </td>

                        {/* Location */}
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-[#1F2933]">{rep.locationText}</div>
                          <div className="text-[11px] text-[#6B7280]">{rep.submitterRole}</div>
                        </td>

                        {/* Photo */}
                        <td className="px-4 py-3 align-top">
                          {rep.photoUrl ? (
                            <div className="w-14 h-10 rounded border border-[#E7E3DA] overflow-hidden bg-[#FAF8F3]">
                              <img
                                src={rep.photoUrl}
                                alt="Evidence"
                                className="w-full h-full object-cover"
                                onError={e => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-[#6B7280]">—</span>
                          )}
                        </td>

                        {/* AI Result as compact chip */}
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-[#EBF2FA] border border-[#CDE1F4] text-[#2A649C] font-medium font-mono">
                            <span className="font-bold">AI</span>
                            <span>·</span>
                            <span>{rep.aiClassification.hazardClass.split(' ')[0]}</span>
                            <span>·</span>
                            <span>{(rep.aiClassification.confidence * 100).toFixed(0)}%</span>
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          {statusBadge(rep.status)}
                        </td>

                        {/* Officer Action column */}
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => confirmReport(rep.id)}
                                className="px-2.5 py-1 rounded bg-[#3780C8] hover:bg-[#2A649C] text-white font-medium text-xs transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => rejectReport(rep.id)}
                                className="px-2.5 py-1 rounded border border-[#E7E3DA] hover:bg-[#FAF8F3] text-[#6B7280] hover:text-[#9B2C2C] text-xs transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#6B7280]">
                              {rep.confirmedBy ? `by ${rep.confirmedBy}` : 'Completed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: New Report */}
        {activeTab === 'new' && (
          <div className="bg-white rounded-lg border border-[#E7E3DA] p-5 max-w-xl shadow-xs space-y-4">
            <h2 className="text-sm font-semibold text-[#1F2933]">
              Submit report
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#6B7280] mb-1">Photo evidence</label>
                {photoUrl ? (
                  <div className="relative rounded-lg overflow-hidden border border-[#E7E3DA] h-40 bg-[#FAF8F3]">
                    <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="absolute top-2 right-2 px-2 py-1 bg-white/90 rounded text-[11px] text-[#9B2C2C]"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setPhotoUrl(SAMPLE_DEBRIS_IMG)}
                    className="border border-dashed border-[#E7E3DA] rounded-lg p-6 text-center cursor-pointer hover:bg-[#FAF8F3]"
                  >
                    <UploadCloud className="w-6 h-6 text-[#6B7280] mx-auto mb-1" />
                    <span className="text-[#3780C8] font-medium">Click to attach photo</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#6B7280] mb-1">Segment</label>
                  <select
                    value={segmentId}
                    onChange={e => setSegmentId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#E7E3DA] rounded text-xs bg-white text-[#1F2933]"
                  >
                    <option value="S-07">S-07 Jatinga–Harangajao</option>
                    <option value="S-06">S-06 Mahur–Haflong Hill</option>
                    <option value="S-08">S-08 Harangajao–Dihangi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#6B7280] mb-1">Location</label>
                  <input
                    type="text"
                    value={locationText}
                    onChange={e => setLocationText(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#E7E3DA] rounded text-xs bg-white text-[#1F2933]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#6B7280] mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#E7E3DA] rounded text-xs bg-white text-[#1F2933]"
                ></textarea>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 rounded-lg bg-[#3780C8] hover:bg-[#2A649C] text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Classifying...</span>
                    </>
                  ) : (
                    <span>Submit field report</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
