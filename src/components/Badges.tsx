import React from 'react';
import { DecisionType, RiskLevel, RoadState } from '../types';

export const AiTag: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[#EBF2FA] text-[#2A649C] border border-[#CDE1F4] ${className}`}>
    AI
  </span>
);

export const EstTag: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#FBF1CC] text-[#7A5B00] border border-[#F3E29F] ${className}`}>
    est.
  </span>
);

export const RiskBadge: React.FC<{ level: RiskLevel; size?: 'sm' | 'md' }> = ({ level, size = 'sm' }) => {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  switch (level) {
    case 'GREEN':
      return (
        <span className={`inline-flex items-center rounded-md font-medium border border-[#BDE3C9] bg-[#DFF1E5] text-[#2F6B45] ${pad}`}>
          Green
        </span>
      );
    case 'YELLOW':
      return (
        <span className={`inline-flex items-center rounded-md font-medium border border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00] ${pad}`}>
          Yellow
        </span>
      );
    case 'ORANGE':
      return (
        <span className={`inline-flex items-center rounded-md font-medium border border-[#F6C6A7] bg-[#FCE3D2] text-[#9A4A16] ${pad}`}>
          Orange
        </span>
      );
    case 'RED':
      return (
        <span className={`inline-flex items-center rounded-md font-semibold border border-[#EEAFAF] bg-[#F8D7D7] text-[#9B2C2C] ${pad}`}>
          Red
        </span>
      );
    case 'NO_DATA':
    default:
      return (
        <span className={`inline-flex items-center rounded-md font-medium border border-[#D5D5D5] bg-striped-gray text-[#4B5563] ${pad}`}>
          No data
        </span>
      );
  }
};

export const RoadStateBadge: React.FC<{ state: RoadState }> = ({ state }) => {
  switch (state) {
    case 'OPEN':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-[#BDE3C9] bg-[#DFF1E5] text-[#2F6B45]">
          OPEN
        </span>
      );
    case 'RESTRICTED_HEAVY':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00]">
          RESTRICTED
        </span>
      );
    case 'RESTRICTED_ONE_WAY':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-[#CDE1F4] bg-[#EBF2FA] text-[#2A649C]">
          RESTRICTED
        </span>
      );
    case 'BLOCKED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border border-[#EEAFAF] bg-[#F8D7D7] text-[#9B2C2C]">
          BLOCKED
        </span>
      );
    case 'UNKNOWN':
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-dashed border-[#D5D5D5] bg-[#ECECEC] text-[#4B5563]">
          UNKNOWN
        </span>
      );
  }
};

export const DecisionChip: React.FC<{ decision: DecisionType; size?: 'sm' | 'md' | 'lg' }> = ({ decision, size = 'md' }) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 font-semibold',
    md: 'text-xs px-2.5 py-1 font-bold',
    lg: 'text-sm px-3.5 py-1.5 font-bold tracking-wide'
  };

  switch (decision) {
    case 'GO':
      return (
        <span className={`inline-flex items-center rounded-md border border-[#BDE3C9] bg-[#DFF1E5] text-[#2F6B45] ${sizeClasses[size]}`}>
          GO
        </span>
      );
    case 'GO_CAUTION':
      return (
        <span className={`inline-flex items-center rounded-md border border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00] ${sizeClasses[size]}`}>
          GO · caution
        </span>
      );
    case 'HOLD':
      return (
        <span className={`inline-flex items-center rounded-md border border-[#F3E29F] bg-[#FBF1CC] text-[#7A5B00] ${sizeClasses[size]}`}>
          HOLD
        </span>
      );
    case 'DIVERT':
      return (
        <span className={`inline-flex items-center rounded-md border border-[#CDE1F4] bg-[#EBF2FA] text-[#2A649C] ${sizeClasses[size]}`}>
          DIVERT
        </span>
      );
    case 'CLOSE':
      return (
        <span className={`inline-flex items-center rounded-md border border-[#EEAFAF] bg-[#F8D7D7] text-[#9B2C2C] ${sizeClasses[size]}`}>
          CLOSE
        </span>
      );
  }
};
