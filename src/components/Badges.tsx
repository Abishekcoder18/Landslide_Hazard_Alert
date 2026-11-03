import React from 'react';
import { ApprovalStatus, DecisionType, IncidentState, ReportRoute, ReportStatus, RiskLevel, RoadState } from '../types';
import { cx } from './ui';

/** Tinted chips (status / info). Risk chips use the risk tokens; decisions are solid; road state is outline. */
const TONE = {
  green: 'border-risk-green-line bg-risk-green-bg text-risk-green-fg',
  yellow: 'border-risk-yellow-line bg-risk-yellow-bg text-risk-yellow-fg',
  orange: 'border-risk-orange-line bg-risk-orange-bg text-risk-orange-fg',
  red: 'border-risk-red-line bg-risk-red-bg text-risk-red-fg',
  blue: 'border-info-line bg-info-bg text-info-fg',
  grey: 'border-risk-none-line bg-risk-none-bg text-risk-none-fg'
} as const;
type Tone = keyof typeof TONE;

const CHIP = 'inline-flex items-center gap-1 rounded-chip border px-2 h-[22px] text-[12px] font-medium whitespace-nowrap leading-none';

export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; className?: string; title?: string }> = ({ tone, children, className, title }) => (
  <span title={title} className={cx(CHIP, TONE[tone], className)}>
    {children}
  </span>
);

export const AiTag: React.FC = () => <Pill tone="blue" className="!px-1.5 !text-[11px] font-semibold">AI</Pill>;
export const EstTag: React.FC<{ className?: string }> = ({ className }) => <Pill tone="yellow" className={cx('!px-1.5 !h-5 !text-[11px]', className)}>estimate</Pill>;
export const SampleTag: React.FC = () => <Pill tone="grey" className="!text-[11px]">Sample data</Pill>;

export const RISK_LINE: Record<RiskLevel, string> = {
  GREEN: 'var(--color-risk-green)',
  YELLOW: 'var(--color-risk-yellow)',
  ORANGE: 'var(--color-risk-orange)',
  RED: 'var(--color-risk-red)',
  NO_DATA: 'var(--color-risk-none)'
};
/** Tailwind bg class for a risk colour bar. */
export const RISK_BAR: Record<RiskLevel, string> = {
  GREEN: 'bg-risk-green',
  YELLOW: 'bg-risk-yellow',
  ORANGE: 'bg-risk-orange',
  RED: 'bg-risk-red',
  NO_DATA: 'bg-striped-none'
};

const RISK: Record<RiskLevel, { tone: Tone; label: string }> = {
  GREEN: { tone: 'green', label: 'Green' },
  YELLOW: { tone: 'yellow', label: 'Yellow' },
  ORANGE: { tone: 'orange', label: 'Orange' },
  RED: { tone: 'red', label: 'Red' },
  NO_DATA: { tone: 'grey', label: 'No data' }
};
/** NFR-07: never colour alone — always text. */
export const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => (
  <Pill tone={RISK[level].tone} className={cx('font-semibold', level === 'NO_DATA' && 'bg-striped-none')}>
    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: RISK_LINE[level] }} aria-hidden />
    {RISK[level].label}
  </Pill>
);

/** Road state: outline chips so they never read as risk chips. */
const STATE: Record<RoadState, { cls: string; label: string }> = {
  OPEN: { cls: 'border-risk-green/60 text-risk-green-fg', label: 'Open' },
  RESTRICTED_HEAVY: { cls: 'border-risk-yellow/70 text-risk-yellow-fg', label: 'Restricted · heavy' },
  RESTRICTED_ONE_WAY: { cls: 'border-dec-divert/50 text-info-fg', label: 'Restricted · one-way' },
  BLOCKED: { cls: 'border-risk-red/70 text-risk-red-fg', label: 'Blocked' },
  UNKNOWN: { cls: 'border-risk-none/50 text-risk-none-fg', label: 'Unknown' }
};
export const RoadStateBadge: React.FC<{ state: RoadState }> = ({ state }) => (
  <span className={cx(CHIP, 'bg-surface', STATE[state].cls)}>{STATE[state].label}</span>
);

export const DECISION_BAR: Record<DecisionType | 'CLOSE', string> = {
  GO: 'bg-dec-go-accent',
  GO_CAUTION: 'bg-dec-caution-line',
  HOLD: 'bg-dec-hold',
  DIVERT: 'bg-dec-divert',
  CLOSE: 'bg-dec-close'
};
const DECISION: Record<DecisionType | 'CLOSE', { cls: string; label: string }> = {
  GO: { cls: 'bg-dec-go border-dec-go text-white', label: 'GO' },
  GO_CAUTION: { cls: 'bg-dec-caution-bg border-dec-caution-line text-dec-caution-fg', label: 'GO · caution' },
  HOLD: { cls: 'bg-dec-hold border-dec-hold text-white', label: 'HOLD' },
  DIVERT: { cls: 'bg-dec-divert border-dec-divert text-white', label: 'DIVERT' },
  CLOSE: { cls: 'bg-dec-close border-dec-close text-white', label: 'CLOSE' }
};
export const DecisionChip: React.FC<{ decision: DecisionType | 'CLOSE'; size?: 'sm' | 'lg' }> = ({ decision, size = 'sm' }) => (
  <span className={cx(CHIP, 'font-semibold tracking-[.02em]', size === 'lg' && '!h-7 !px-3 !text-[13px] font-bold', DECISION[decision].cls)}>
    {DECISION[decision].label}
  </span>
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
  rejected: { tone: 'grey', label: 'Rejected' },
  withdrawn: { tone: 'grey', label: 'Withdrawn' }
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
