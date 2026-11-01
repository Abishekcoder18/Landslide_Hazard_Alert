import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  ApproachZone,
  AuditLogEntry,
  ClosureApproval,
  DemoRole,
  FieldReport,
  Incident,
  IncidentCrew,
  SafeHoldingPoint,
  Segment
} from '../types';
import {
  INITIAL_APPROACH_ZONES,
  INITIAL_APPROVAL,
  INITIAL_AUDIT_LOGS,
  INITIAL_HOLDING_POINTS,
  INITIAL_INCIDENT,
  INITIAL_REPORTS,
  INITIAL_SEGMENTS,
  STORY_STEPS
} from '../data/mockData';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface DemoSettings {
  gsiWeight: number; // 0-100
  rainfallWeight: number; // 0-100
  slopeWeight: number; // 0-100
  historyWeight: number; // 0-100
  approachZoneExtentKm: number; // e.g. 2.0 km
  duplicateWindowMinutes: number; // 15 mins
  aiConfidenceThreshold: number; // 0.85
  escalationTimeoutMinutes: number; // 10 mins
}

interface DemoContextType {
  currentStep: number;
  currentRole: DemoRole;
  segments: Record<string, Segment>;
  holdingPoints: Record<string, SafeHoldingPoint>;
  approachZones: ApproachZone[];
  reports: FieldReport[];
  incident: Incident;
  approval: ClosureApproval;
  auditLogs: AuditLogEntry[];
  toasts: Toast[];
  aiOutageSimulated: boolean;
  settings: DemoSettings;
  pendingApprovalsCount: number;
  setRole: (role: DemoRole) => void;
  goToStep: (stepNumber: number, navigateFn?: (path: string) => void) => void;
  nextStep: (navigateFn?: (path: string) => void) => void;
  prevStep: (navigateFn?: (path: string) => void) => void;
  resetDemo: () => void;
  confirmReport: (reportId: string) => void;
  rejectReport: (reportId: string) => void;
  submitFieldReport: (report: Omit<FieldReport, 'id' | 'timestamp' | 'status'>) => Promise<FieldReport>;
  approveClosure: (closureType: 'FULL' | 'HEAVY_ONLY' | 'ONE_WAY') => void;
  rejectClosure: () => void;
  advanceIncidentStatus: (nextStatus: Incident['status'], newEstimate?: string) => void;
  assignCrewToIncident: (crew: IncidentCrew) => void;
  updateReopeningEstimate: (newTime: string) => void;
  toggleAiOutage: () => void;
  toggleImdWarning: (segmentId?: string) => void;
  updateSegmentRainfall: (segmentId: string, rainfall24h: number, rainfall3d: number, rainfall7d: number) => void;
  updateSettings: (newSettings: Partial<DemoSettings>) => void;
  addToast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

const DEFAULT_SETTINGS: DemoSettings = {
  gsiWeight: 35,
  rainfallWeight: 30,
  slopeWeight: 20,
  historyWeight: 15,
  approachZoneExtentKm: 2.5,
  duplicateWindowMinutes: 15,
  aiConfidenceThreshold: 0.85,
  escalationTimeoutMinutes: 10
};

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export const DemoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [currentRole, setCurrentRole] = useState<DemoRole>('control_officer');
  const [segments, setSegments] = useState<Record<string, Segment>>(INITIAL_SEGMENTS);
  const [holdingPoints, setHoldingPoints] = useState<Record<string, SafeHoldingPoint>>(INITIAL_HOLDING_POINTS);
  const [approachZones] = useState<ApproachZone[]>(INITIAL_APPROACH_ZONES);
  const [reports, setReports] = useState<FieldReport[]>(INITIAL_REPORTS);
  const [incident, setIncident] = useState<Incident>(INITIAL_INCIDENT);
  const [approval, setApproval] = useState<ClosureApproval>(INITIAL_APPROVAL);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aiOutageSimulated, setAiOutageSimulated] = useState<boolean>(false);
  const [settings, setSettings] = useState<DemoSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addAuditEntry = (entry: {
    actorRole: string;
    action: string;
    segmentId?: string;
    ruleUsed?: string;
    beforeState?: string;
    afterState?: string;
    details: string;
  }) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newEntry: AuditLogEntry = {
      id: `AUD-${Date.now().toString().slice(-4)}`,
      timestamp: timeStr,
      actorRole: entry.actorRole,
      action: entry.action,
      segmentId: entry.segmentId,
      ruleUsed: entry.ruleUsed,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
      details: entry.details,
      verified: true
    };
    setAuditLogs(prev => [newEntry, ...prev]);
  };

  // Helper to apply state changes matching each step
  const applyStepState = (targetStep: number) => {
    if (targetStep === 1) {
      setSegments(INITIAL_SEGMENTS);
      setReports(INITIAL_REPORTS);
      setIncident(INITIAL_INCIDENT);
      setApproval(INITIAL_APPROVAL);
      setCurrentRole('control_officer');
    } else if (targetStep === 2) {
      setSegments(prev => ({
        ...prev,
        'S-07': {
          ...prev['S-07'],
          riskLevel: 'ORANGE',
          roadState: 'OPEN',
          reasons: [
            'Rainfall surge: 142 mm in 3 days',
            'Disang shale sheared slope (34°)',
            'Pre-failure movement detected by patrol'
          ],
          windowClosing: true,
          inputs: {
            ...prev['S-07'].inputs,
            rainfall24h: 88,
            rainfall3d: 142,
            rainfall7d: 215,
            warnings: 'IMD Orange Alert: Extremely heavy precipitation band'
          }
        }
      }));
      addToast('Rainfall alert: S-07 elevated to Orange risk', 'warning');
      addAuditEntry({
        actorRole: 'IMD Feed & Model',
        action: 'Risk Re-classification',
        segmentId: 'S-07',
        ruleUsed: 'R-ORANGE-HOLD',
        beforeState: 'YELLOW',
        afterState: 'ORANGE (Window closing)',
        details: 'Threshold crossed (>140 mm 3d rain on 34° slope). Window closing active for control console.'
      });
    } else if (targetStep === 3) {
      setCurrentRole('control_officer');
      addToast('Passage engine: AZ-07N & AZ-07S switched to HOLD before entry', 'info');
    } else if (targetStep === 4) {
      setCurrentRole('patrol');
    } else if (targetStep === 5) {
      setSegments(prev => ({
        ...prev,
        'S-07': {
          ...prev['S-07'],
          riskLevel: 'RED',
          roadState: 'BLOCKED',
          reasons: [
            'Active debris at km 168.4',
            'Road blocked ~100% verified by Patrol HP-03',
            'Officer confirmed closure'
          ],
          windowClosing: false
        }
      }));
      setReports(prev =>
        prev.map(r =>
          r.id === 'REP-2026-104'
            ? { ...r, status: 'confirmed', confirmedBy: 'Officer (HQ)', confirmedAt: '09:44 AM' }
            : r
        )
      );
      setIncident(prev => ({
        ...prev,
        status: 'verified',
        verifiedAt: '09:44 AM',
        notes: [...prev.notes, '09:44 AM: Officer confirmed field report REP-2026-104. S-07 status updated to BLOCKED.']
      }));
      setCurrentRole('control_officer');
      addToast('Segment S-07 BLOCKED by officer confirmation; 2 approach zones re-evaluated', 'error');
      addAuditEntry({
        actorRole: 'Officer',
        action: 'Report Confirmation & State Transition',
        segmentId: 'S-07',
        ruleUsed: 'R-BLOCKED-RED-HOLD',
        beforeState: 'OPEN (ORANGE)',
        afterState: 'BLOCKED (RED)',
        details: 'Officer confirmed REP-2026-104. S-07 locked down. Approach zones AZ-07N and AZ-07S re-evaluated to HOLD at Haflong / Silchar.'
      });
    } else if (targetStep === 6) {
      setCurrentRole('control_officer');
    } else if (targetStep === 7) {
      setCurrentRole('control_officer');
    } else if (targetStep === 8) {
      setCurrentRole('traveller');
    } else if (targetStep === 9) {
      setCurrentRole('road_engineer');
    } else if (targetStep === 10) {
      setCurrentRole('admin');
    }
  };

  const goToStep = (stepNumber: number, navigateFn?: (path: string) => void) => {
    if (stepNumber < 1 || stepNumber > 10) return;
    setCurrentStep(stepNumber);
    applyStepState(stepNumber);
    const targetRoute = STORY_STEPS.find(s => s.step === stepNumber)?.route;
    if (navigateFn && targetRoute) {
      navigateFn(targetRoute);
    }
  };

  const nextStep = (navigateFn?: (path: string) => void) => {
    if (currentStep < 10) {
      goToStep(currentStep + 1, navigateFn);
    }
  };

  const prevStep = (navigateFn?: (path: string) => void) => {
    if (currentStep > 1) {
      goToStep(currentStep - 1, navigateFn);
    }
  };

  const resetDemo = () => {
    setCurrentStep(1);
    setCurrentRole('control_officer');
    setSegments(INITIAL_SEGMENTS);
    setHoldingPoints(INITIAL_HOLDING_POINTS);
    setReports(INITIAL_REPORTS);
    setIncident(INITIAL_INCIDENT);
    setApproval(INITIAL_APPROVAL);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setAiOutageSimulated(false);
    setSettings(DEFAULT_SETTINGS);
    addToast('Restored initial state', 'info');
  };

  const toggleImdWarning = (segmentId: string = 'S-07') => {
    setSegments(prev => {
      const currentSeg = prev[segmentId];
      if (!currentSeg) return prev;
      const isCurrentlyActive = Boolean(currentSeg.inputs.warnings && currentSeg.inputs.warnings.toLowerCase().includes('imd'));
      const newWarnings = isCurrentlyActive ? 'None active' : 'IMD Scenario Warning: Intense precipitation band approaching Dima Hasao';
      const windowClosing = currentSeg.riskLevel === 'YELLOW' && !isCurrentlyActive;

      return {
        ...prev,
        [segmentId]: {
          ...currentSeg,
          windowClosing,
          inputs: {
            ...currentSeg.inputs,
            warnings: newWarnings
          }
        }
      };
    });
    addToast('IMD weather warning flag toggled', 'info');
  };

  const updateSegmentRainfall = (segmentId: string, rainfall24h: number, rainfall3d: number, rainfall7d: number) => {
    setSegments(prev => {
      const currentSeg = prev[segmentId];
      if (!currentSeg) return prev;

      // Adjust risk level if 3-day rainfall crosses thresholds
      let newRisk = currentSeg.riskLevel;
      if (currentSeg.roadState !== 'BLOCKED') {
        if (rainfall3d > 140) newRisk = 'ORANGE';
        else if (rainfall3d > 60) newRisk = 'YELLOW';
        else newRisk = 'GREEN';
      }

      return {
        ...prev,
        [segmentId]: {
          ...currentSeg,
          riskLevel: newRisk,
          inputs: {
            ...currentSeg.inputs,
            rainfall24h,
            rainfall3d,
            rainfall7d
          }
        }
      };
    });
    addToast(`Rainfall data updated for ${segmentId}`, 'success');
  };

  const confirmReport = (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    setReports(prev =>
      prev.map(r =>
        r.id === reportId
          ? {
              ...r,
              status: 'confirmed',
              confirmedBy: 'Control-room Officer (HQ)',
              confirmedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          : r
      )
    );

    // If report is for S-07 with blockage, block S-07
    if (report.segmentId === 'S-07' || report.aiClassification.blockagePercent > 50) {
      const segId = report.segmentId || 'S-07';
      const beforeState = segments[segId] ? `${segments[segId].roadState} (${segments[segId].riskLevel})` : 'OPEN';
      
      setSegments(prev => ({
        ...prev,
        [segId]: {
          ...prev[segId],
          roadState: 'BLOCKED',
          riskLevel: 'RED',
          reasons: [
            `Landslide & debris confirmed by officer via ${reportId}`,
            'Corridor sealed for clearance operations',
            'High GSI susceptibility (Disang shale 34°)'
          ],
          windowClosing: false
        }
      }));

      setIncident(prev => ({
        ...prev,
        status: 'verified',
        verifiedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        notes: [
          ...prev.notes,
          `Officer confirmed field report ${reportId}. Road state transitioned to BLOCKED.`
        ]
      }));

      addToast(`Segment ${segId} BLOCKED by officer confirmation; 2 approach zones re-evaluated`, 'error');
      addAuditEntry({
        actorRole: 'Control-room Officer',
        action: 'Officer Report Confirmation',
        segmentId: segId,
        ruleUsed: 'R-BLOCKED-RED-HOLD',
        beforeState,
        afterState: 'BLOCKED (RED)',
        details: `Confirmed ${report.aiClassification.hazardClass} reported at ${report.locationText}. Safe passage engine locked approach zones AZ-07N & AZ-07S.`
      });
    } else {
      addToast(`Report ${reportId} confirmed by officer`, 'success');
      addAuditEntry({
        actorRole: 'Control-room Officer',
        action: 'Report Confirmation',
        segmentId: report.segmentId,
        ruleUsed: 'PATROL-INSPECT-ACK',
        details: `Report ${reportId} verified and logged.`
      });
    }
  };

  const rejectReport = (reportId: string) => {
    setReports(prev =>
      prev.map(r => (r.id === reportId ? { ...r, status: 'rejected' } : r))
    );
    addToast(`Report ${reportId} marked as rejected by officer`, 'warning');
    addAuditEntry({
      actorRole: 'Control-room Officer',
      action: 'Report Rejection',
      details: `Report ${reportId} rejected after review. AI classification discarded.`
    });
  };

  const submitFieldReport = async (reportData: Omit<FieldReport, 'id' | 'timestamp' | 'status'>): Promise<FieldReport> => {
    const id = `REP-${Date.now().toString().slice(-4)}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newReport: FieldReport = {
      ...reportData,
      id,
      timestamp,
      status: 'unverified'
    };

    setReports(prev => [newReport, ...prev]);
    addToast(`Field report ${id} uploaded. Awaiting officer confirmation in queue.`, 'info');
    addAuditEntry({
      actorRole: reportData.submitterRole,
      action: 'Field Report Submission',
      segmentId: reportData.segmentId,
      details: `New patrol report submitted at ${reportData.locationText}. AI suggests ${reportData.aiClassification.hazardClass}.`
    });

    return newReport;
  };

  const approveClosure = (closureType: 'FULL' | 'HEAVY_ONLY' | 'ONE_WAY') => {
    setApproval(prev => ({
      ...prev,
      closureType,
      status: 'approved',
      approvedBy: 'Control-room Officer (Duty Supt.)',
      approvedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    addToast(`Closure order approved (${closureType}). Multilingual alerts dispatched & CAP exported.`, 'success');
    addAuditEntry({
      actorRole: 'Control-room Officer',
      action: 'Closure & Alert Order Approval',
      segmentId: 'S-07',
      ruleUsed: 'CAP-PUBLIC-ALERT-DISPATCH',
      beforeState: 'PENDING_APPROVAL',
      afterState: `ORDER_APPROVED_${closureType}`,
      details: `Approved ${closureType} closure. Verified alerts published in English, Hindi, Assamese, Bengali & Dimasa.`
    });
  };

  const rejectClosure = () => {
    setApproval(prev => ({ ...prev, status: 'rejected' }));
    addToast('Closure proposal rejected by officer', 'warning');
    addAuditEntry({
      actorRole: 'Control-room Officer',
      action: 'Closure Order Rejection',
      segmentId: 'S-07',
      details: 'Officer declined automated closure proposal.'
    });
  };

  const advanceIncidentStatus = (nextStatus: Incident['status'], newEstimate?: string) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    setIncident(prev => ({
      ...prev,
      status: nextStatus,
      reopeningEstimate: newEstimate || prev.reopeningEstimate,
      closedAt: (nextStatus === 'closed' && !prev.closedAt) ? timeStr : prev.closedAt,
      actualReopenedAt: (nextStatus === 'reopened_full' && !prev.actualReopenedAt) ? timeStr : prev.actualReopenedAt,
      notes: [...prev.notes, `${timeStr}: Status advanced to ${nextStatus}.`]
    }));

    // Update road state corresponding to incident phase
    if (nextStatus === 'reopened_oneway') {
      setSegments(prev => ({
        ...prev,
        'S-07': {
          ...prev['S-07'],
          roadState: 'RESTRICTED_ONE_WAY',
          riskLevel: 'YELLOW',
          reasons: [
            'Single lane cleared by heavy machinery',
            'Alternating convoy managed by highway police',
            'Debris removal continuing on mountain shoulder'
          ]
        }
      }));
      addToast('S-07 reopened for alternating single-lane convoy (RESTRICTED ONE-WAY)', 'warning');
      addAuditEntry({
        actorRole: 'Road Engineer',
        action: 'Partial Corridor Reopening',
        segmentId: 'S-07',
        ruleUsed: 'R-RESTRICT-ONEWAY',
        beforeState: 'BLOCKED',
        afterState: 'RESTRICTED_ONE_WAY (YELLOW)',
        details: 'Excavation crew cleared lane 1. Pilot convoy operational under police control.'
      });
    } else if (nextStatus === 'reopened_full') {
      setSegments(prev => ({
        ...prev,
        'S-07': {
          ...prev['S-07'],
          roadState: 'OPEN',
          riskLevel: 'YELLOW',
          reasons: [
            'Both carriageways cleared of debris',
            'Slope drainage trench re-established',
            'Rainfall abating — watch advisory active'
          ]
        }
      }));
      addToast('S-07 FULLY REOPENED. Approach zone decisions returned to GO with caution.', 'success');
      addAuditEntry({
        actorRole: 'Road Engineer & Officer',
        action: 'Full Corridor Reopening',
        segmentId: 'S-07',
        ruleUsed: 'R-YELLOW-CAUTION',
        beforeState: 'RESTRICTED_ONE_WAY',
        afterState: 'OPEN (YELLOW)',
        details: 'Debris completely cleared. Pavement pressure-washed. Safe passage decisions returned to GO with caution.'
      });
    } else {
      addToast(`Incident status updated: ${nextStatus.replace(/_/g, ' ')}`, 'info');
    }
  };

  const assignCrewToIncident = (crew: IncidentCrew) => {
    setIncident(prev => ({
      ...prev,
      crewAssigned: crew,
      status: prev.status === 'reported' || prev.status === 'verified' ? 'clearance_in_progress' : prev.status,
      notes: [
        ...prev.notes,
        `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${crew.unitName} dispatched with heavy machinery.`
      ]
    }));
    addToast(`Crew ${crew.unitName} assigned to clearance operations`, 'success');
    addAuditEntry({
      actorRole: 'Road Engineer',
      action: 'Machinery & Crew Deployment',
      segmentId: 'S-07',
      details: `Dispatched ${crew.unitName} under ${crew.leader} with ${crew.equipment.join(', ')}.`
    });
  };

  const updateReopeningEstimate = (newTime: string) => {
    setIncident(prev => ({
      ...prev,
      reopeningEstimate: newTime,
      notes: [
        ...prev.notes,
        `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: Reopening estimate updated to ${newTime} (Estimate).`
      ]
    }));
    addToast(`Reopening estimate updated to ${newTime} (Estimate)`, 'info');
    addAuditEntry({
      actorRole: 'Road Engineer',
      action: 'Estimate Revision',
      segmentId: 'S-07',
      details: `Expected clearance time revised to ${newTime}. Displayed to public with (Estimate) tag.`
    });
  };

  const toggleAiOutage = () => {
    setAiOutageSimulated(prev => !prev);
    addToast(
      !aiOutageSimulated 
        ? 'AI outage simulated: Computer vision suggestions bypassed; fallback to manual patrol inspection' 
        : 'AI classification services restored online',
      !aiOutageSimulated ? 'warning' : 'info'
    );
  };

  const updateSettings = (newSettings: Partial<DemoSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    addToast('Configuration parameters updated for calibration', 'success');
  };

  const pendingApprovalsCount = approval.status === 'pending' ? 1 : 0;

  return (
    <DemoContext.Provider
      value={{
        currentStep,
        currentRole,
        segments,
        holdingPoints,
        approachZones,
        reports,
        incident,
        approval,
        auditLogs,
        toasts,
        aiOutageSimulated,
        settings,
        pendingApprovalsCount,
        setRole: setCurrentRole,
        goToStep,
        nextStep,
        prevStep,
        resetDemo,
        confirmReport,
        rejectReport,
        submitFieldReport,
        approveClosure,
        rejectClosure,
        advanceIncidentStatus,
        assignCrewToIncident,
        updateReopeningEstimate,
        toggleAiOutage,
        toggleImdWarning,
        updateSegmentRainfall,
        updateSettings,
        addToast,
        dismissToast,
        isSettingsOpen,
        setIsSettingsOpen
      }}
    >
      {children}
    </DemoContext.Provider>
  );
};

export const useDemo = () => {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
};
