import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useApp } from '../state/AppContext';

export const TopBar: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => {
  const { now, snapshot, can } = useApp();
  const navigate = useNavigate();
  const open = snapshot?.approvals.filter(a => a.status === 'pending' || a.status === 'escalated').length ?? 0;
  const escalated = snapshot?.approvals.some(a => a.status === 'escalated') ?? false;

  return (
    <header className="h-14 px-4 md:px-6 bg-white border-b border-[#E7E3DA] flex items-center justify-between shrink-0 sticky top-0 z-30">
      <h1 className="text-lg font-semibold text-[#1F2933] tracking-tight">{title}</h1>
      <div className="flex items-center gap-3 text-xs">
        {right}
        <span className="text-[#6B7280] font-medium hidden sm:inline tabular-nums">
          {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {can('approve_closure') && (
          <button
            onClick={() => navigate('/approvals')}
            className="relative p-1.5 rounded-md hover:bg-[#FAF8F3] text-[#6B7280] hover:text-[#1F2933]"
            aria-label={`${open} open approvals`}
            title={`${open} open approvals`}
          >
            <Bell className="w-4 h-4" />
            {open > 0 && (
              <span className={`absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${escalated ? 'bg-[#D45555]' : 'bg-[#3780C8]'}`}>
                {open}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};
