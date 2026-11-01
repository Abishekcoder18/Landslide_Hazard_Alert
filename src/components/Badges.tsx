import React from 'react';
import { ApprovalStatus, DecisionType, IncidentState, ReportRoute, ReportStatus, RiskLevel, RoadState } from '../types';
import { cx } from './ui';

const TONE = {
  green: 'border-[#BDE3C9] bg-[#DFF1E5] text-[#2F6B45]',
  yellow: 'border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00]',
  orange: 'border-[#F6C6A7] bg-[#FCE3D2] text-[#9A4A16]',
  red: 'border-[#EEAFAF] bg-[#F8D7D7] text-[#9B2C2C]',
  blue: 'border-[#CDE1F4] bg-[#EBF2FA] text-[#2A649C]',
  grey: 'border-[#E7E3DA] bg-[#F3F1EC] text-[#4B5563]'
} as const;
type Tone = keyof typeof TONE;

export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; className?: string; title?: string }> = ({ tone, children, className, title }) => (
  <span title={title} className={cx('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
    {children}
  </span>
);

export const AiTag: React.FC = () => <Pill tone="blue" className="!px-1.5 !text-[11px] font-semibold">AI</Pill>;
export const EstTag: React.FC<{ className?: string }> = ({ className }) => <Pill tone="yellow" className={cx('!px-1.5 !text-[11px]', className)}>estimate</Pill>;
export const SampleTag: React.FC = () => <Pill tone="grey" className="!text-[11px]">Sample data</Pill>;

const RISK: Record<RiskLevel, { tone: Tone; label: string }> = {
  GREEN: { tone: 'green', label: 'Green' },
  YELLOW: { tone: 'yellow', label: 'Yellow' },
  ORANGE: { tone: 'orange', label: 'Orange' },
  RED: { tone: 'red', label: 'Red' },
  NO_DATA: { tone: 'grey', label: 'No data' }
};
/** NFR-07: never colour alone — always text. */
export const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => (
  <Pill tone={RISK[level].tone} className={level === 'NO_DATA' ? 'bg-striped-gray' : undefined}>{RISK[level].label}</Pill>
);

const STATE: Record<RoadState, { tone: Tone; label: string }> = {
  OPEN: { tone: 'green', label: 'Open' },
  RESTRICTED_HEAVY: { tone: 'yellow', label: 'Restricted · heavy' },
  RESTRICTED_ONE_WAY: { tone: 'blue', label: 'Restricted · one-way' },
  BLOCKED: { tone: 'red', label: 'Blocked' },
  UNKNOWN: { tone: 'grey', label: 'Unknown' }
};
export const RoadStateBadge: React.FC<{ state: RoadState }> = ({ state }) => <Pill tone={STATE[state].tone}>{STATE[state].label}</Pill>;

const DECISION: Record<DecisionType | 'CLOSE', { tone: Tone; label: string }> = {
  GO: { tone: 'green', label: 'GO' },
  GO_CAUTION: { tone: 'yellow', label: 'GO · caution' },
  HOLD: { tone: 'orange', label: 'HOLD' },
  DIVERT: { tone: 'blue', label: 'DIVERT' },
  CLOSE: { tone: 'red', label: 'CLOSE' }
};
export const DecisionChip: React.FC<{ decision: DecisionType | 'CLOSE'; size?: 'sm' | 'lg' }> = ({ decision, size = 'sm' }) => (
  <Pill tone={DECISION[decision].tone} className={size === 'lg' ? '!text-sm !px-3 !py-1 font-bold tracking-wide' : 'font-semibold'}>
    {DECISION[decision].label}
  </Pill>
);

const REPORT_STATUS: Record<ReportStatus, { tone: Tone; label: string }> = {
  unverified: { tone: 'yellow', label: 'Unverified' },
  corroborated: { tone: 'blue', label: 'Corroborated' },
  confirmed: { tone: 'green', label: 'Officer-confirmed' },
  rejected: { tone: 'grey', label: 'Rejected' }
};
export const ReportStatusBadge: React.FC<{ status: ReportStatus }> = ({ status }) => <Pill tone={REPORT_STATUS[status].tone}>{REPORT_STATUS[status].label}</Pill>;

const ROUTE: Record<ReportRoute, { tone: Tone; label: string }> = {
  officer_queue: { tone: 'blue', label: 'Officer queue' },
  manual_review: { tone: 'yellow', label: 'Manual review' },
  flagged: { tone: 'red', label: 'Flagged' },
  log_only: { tone: 'grey', label: 'Logged' }
};
export const RouteBadge: React.FC<{ route: ReportRoute }> = ({ route }) => <Pill tone={ROUTE[route].tone}>{ROUTE[route].label}</Pill>;

const APPROVAL: Record<ApprovalStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'yellow', label: 'Pending' },
  escalated: { tone: 'red', label: 'Escalated' },
  approved: { tone: 'green', label: 'Approved' },
  rejected: { tone: 'grey', label: 'Rejected' }
};
export const ApprovalBadge: React.FC<{ status: ApprovalStatus }> = ({ status }) => <Pill tone={APPROVAL[status].tone}>{APPROVAL[status].label}</Pill>;

export const INCIDENT_STATES: { key: IncidentState; label: string }[] = [
  { key: 'reported', label: 'Reported' },
  { key: 'verified', label: 'Verified' },
  { key: 'closed', label: 'Closed' },
  { key: 'clearance_in_progress', label: 'Clearance' },
  { key: 'reopened_one_way', label: 'Reopened · one-way' },
  { key: 'reopened_full', label: 'Reopened · full' }
];
export const IncidentBadge: React.FC<{ state: IncidentState }> = ({ state }) => {
  const tone: Tone = state === 'reopened_full' ? 'green' : state === 'reopened_one_way' ? 'blue' : state === 'clearance_in_progress' ? 'yellow' : 'red';
  return <Pill tone={tone}>{INCIDENT_STATES.find(s => s.key === state)!.label}</Pill>;
};
