import React, { useState } from 'react';
import { useDemo } from '../context/DemoContext';
import { TopBar } from '../components/TopBar';
import { EstTag } from '../components/Badges';
import { Incident } from '../types';
import { Wrench, CheckCircle2, Clock, Download, HardHat } from 'lucide-react';

export const IncidentsPage: React.FC = () => {
  const { 
    incident, 
    advanceIncidentStatus, 
    assignCrewToIncident, 
    updateReopeningEstimate, 
    auditLogs 
  } = useDemo();

  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [estimateInput, setEstimateInput] = useState<string>(incident.reopeningEstimate || '4:00 PM');

  const incidentStatuses: { key: Incident['status']; label: string }[] = [
    { key: 'reported', label: 'Reported' },
    { key: 'verified', label: 'Verified' },
    { key: 'closed', label: 'Closed' },
    { key: 'clearance_in_progress', label: 'Clearance' },
    { key: 'reopened_oneway', label: 'One-way' },
    { key: 'reopened_full', label: 'Full' }
  ];

  const currentIdx = incidentStatuses.findIndex(s => s.key === incident.status);

  const handleQuickCrewAssign = () => {
    assignCrewToIncident({
      unitName: 'NHAI Unit 4 (Haflong)',
      leader: 'Er. R. Barman',
      contact: '+91-94350-XXXXX',
      equipment: ['CAT Wheel Loader (x1)', 'JCB 3DX (x2)', 'Dump Trucks (x4)'],
      dispatchedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Timestamp', 'Actor Role', 'Action', 'Segment ID', 'Rule Used', 'Before State', 'After State', 'Details'];
    const rows = auditLogs.map(l => [
      l.id,
      l.timestamp,
      `"${l.actorRole}"`,
      `"${l.action}"`,
      `"${l.segmentId || ''}"`,
      `"${l.ruleUsed || ''}"`,
      `"${l.beforeState || ''}"`,
      `"${l.afterState || ''}"`,
      `"${l.details.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `INCIDENT-HISTORY-${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="Incidents" />

      <div className="p-6 space-y-4 max-w-[1720px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (4 cols): Incident List */}
          <div className="lg:col-span-4 bg-white rounded-lg border border-[#E7E3DA] p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-[#6B7280] border-b border-[#E7E3DA] pb-2">
              <span>Active incidents</span>
              <span>1</span>
            </div>

            <div className="p-3 rounded-lg border border-[#3780C8] bg-[#3780C8]/5 space-y-1.5 cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#3780C8]">{incident.id}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F8D7D7] text-[#9B2C2C] border border-[#EEAFAF]">
                  {incident.status}
                </span>
              </div>
              <div className="font-medium text-xs text-[#1F2933]">
                {incident.title}
              </div>
              <div className="text-[11px] text-[#6B7280]">
                Sector S-07 · Reported {incident.reportedAt}
              </div>
            </div>
          </div>

          {/* Right Column (8 cols): Selected Incident Details */}
          <div className="lg:col-span-8 bg-white rounded-lg border border-[#E7E3DA] p-5 shadow-xs space-y-5">
            
            {/* Header row */}
            <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-[#3780C8]">{incident.id}</span>
                  <h2 className="text-sm font-semibold text-[#1F2933]">{incident.title}</h2>
                </div>
                <div className="text-xs text-[#6B7280] mt-0.5">
                  Sector {incident.segmentId} (km 166–178)
                </div>
              </div>

              {/* Sub-tabs: Overview vs History */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    activeTab === 'overview'
                      ? 'bg-[#3780C8] text-white'
                      : 'text-[#6B7280] hover:text-[#1F2933]'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    activeTab === 'history'
                      ? 'bg-[#3780C8] text-white'
                      : 'text-[#6B7280] hover:text-[#1F2933]'
                  }`}
                >
                  History ({auditLogs.length})
                </button>
              </div>
            </div>

            {/* Tab 1: Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                
                {/* Horizontal status timeline */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block">
                    Status timeline
                  </span>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
                    {incidentStatuses.map((st, idx) => {
                      const isCurrent = incident.status === st.key;
                      const isPast = idx < currentIdx;

                      return (
                        <button
                          key={st.key}
                          onClick={() => advanceIncidentStatus(st.key, estimateInput)}
                          className={`p-2 rounded-md border text-center font-medium transition-colors ${
                            isCurrent
                              ? 'border-[#3780C8] bg-[#3780C8]/10 text-[#3780C8] font-semibold'
                              : isPast
                              ? 'border-[#BDE3C9] bg-[#DFF1E5] text-[#2F6B45]'
                              : 'border-[#E7E3DA] bg-[#FAF8F3] text-[#6B7280] hover:bg-white'
                          }`}
                        >
                          <div className="text-[10px] font-mono">{idx + 1}</div>
                          <div className="truncate">{st.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Reopening estimate field labelled "est." */}
                <div className="p-3.5 rounded-lg border border-[#E7E3DA] bg-[#FAF8F3] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#1F2933]">Reopening estimate</span>
                    <EstTag />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={estimateInput}
                      onChange={e => setEstimateInput(e.target.value)}
                      className="px-2.5 py-1.5 border border-[#E7E3DA] rounded bg-white text-xs font-mono text-[#1F2933]"
                      placeholder="e.g. 4:00 PM"
                    />
                    <button
                      onClick={() => updateReopeningEstimate(estimateInput)}
                      className="px-3 py-1.5 rounded bg-[#3780C8] hover:bg-[#2A649C] text-white text-xs font-medium transition-colors"
                    >
                      Update
                    </button>
                  </div>
                </div>

                {/* Crew assignment */}
                <div className="p-3.5 rounded-lg border border-[#E7E3DA] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#1F2933] flex items-center gap-1.5">
                      <HardHat className="w-3.5 h-3.5 text-[#3780C8]" />
                      Clearance crew
                    </span>

                    {!incident.crewAssigned && (
                      <button
                        onClick={handleQuickCrewAssign}
                        className="px-2.5 py-1 rounded border border-[#3780C8] text-[#3780C8] hover:bg-[#3780C8]/10 text-xs font-medium transition-colors"
                      >
                        Assign crew
                      </button>
                    )}
                  </div>

                  {incident.crewAssigned ? (
                    <div className="space-y-1 text-[#6B7280]">
                      <div className="text-[#1F2933] font-semibold">{incident.crewAssigned.unitName}</div>
                      <div>Leader: {incident.crewAssigned.leader} · Contact: {incident.crewAssigned.contact}</div>
                      <div className="text-[11px] pt-1">
                        Equipment: {incident.crewAssigned.equipment.join(', ')}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[#6B7280] italic">No crew assigned yet.</span>
                  )}
                </div>

              </div>
            )}

            {/* Tab 2: History (Audit Log) */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#6B7280]">Audit records</span>
                  <button
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#E7E3DA] text-[#6B7280] hover:text-[#1F2933] text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>

                <div className="rounded-lg border border-[#E7E3DA] overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#1F2933]">
                    <thead className="bg-[#FAF8F3] border-b border-[#E7E3DA] text-[11px] font-semibold text-[#6B7280]">
                      <tr>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Actor</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Sector</th>
                        <th className="px-3 py-2">Rule</th>
                        <th className="px-3 py-2">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E3DA]">
                      {auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-[#FAF8F3]/50">
                          <td className="px-3 py-2 font-mono text-[11px] text-[#6B7280] whitespace-nowrap">
                            {log.timestamp}
                          </td>
                          <td className="px-3 py-2 text-[#1F2933] font-medium whitespace-nowrap">
                            {log.actorRole}
                          </td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {log.action}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[#6B7280] whitespace-nowrap">
                            {log.segmentId || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[#6B7280] whitespace-nowrap">
                            {log.ruleUsed || '—'}
                          </td>
                          <td className="px-3 py-2 text-[#6B7280] text-[11px] max-w-xs">
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
};
