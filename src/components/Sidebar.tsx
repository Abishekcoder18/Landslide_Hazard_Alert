import React from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, Shield } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { NAV } from '../navigation';
import { ROLE_LABEL } from '../domain/permissions';
import { cx } from './ui';

export const Sidebar: React.FC = () => {
  const { session, snapshot, logout, apiMode } = useApp();
  if (!session) return null;
  const openApprovals = snapshot?.approvals.filter(a => a.status === 'pending' || a.status === 'escalated').length ?? 0;
  const queue = snapshot?.reports.filter(r => (r.route === 'officer_queue' || r.route === 'manual_review') && (r.status === 'unverified' || r.status === 'corroborated')).length ?? 0;
  const badges: Record<string, number> = { '/approvals': openApprovals, '/reports': session.role === 'officer' || session.role === 'second_approver' ? queue : 0 };

  return (
    <aside className="w-16 md:w-60 shrink-0 bg-white border-r border-[#E7E3DA] flex flex-col h-screen sticky top-0 z-40">
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#E7E3DA]">
        <div className="w-7 h-7 rounded-md bg-[#3780C8] flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="hidden md:block leading-tight">
          <div className="font-semibold text-[15px] tracking-tight text-[#1F2933]">RESILION 2.0</div>
          <div className="text-[11px] text-[#6B7280]">NH-27 · Dima Hasao</div>
        </div>
      </div>

      <nav className="p-2 space-y-0.5 flex-1" aria-label="Main navigation">
        {NAV.filter(n => n.allowed(session.role)).map(item => {
          const Icon = item.icon;
          const badge = badges[item.path] ?? 0;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              className={({ isActive }) =>
                cx(
                  'flex items-center justify-between px-3 h-9 rounded-md text-[13px] font-medium transition-colors',
                  isActive ? 'bg-[#3780C8]/10 text-[#3780C8]' : 'text-[#1F2933] hover:bg-[#FAF8F3]'
                )
              }
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
              </span>
              {badge > 0 && (
                <span className="hidden md:flex min-w-5 h-5 px-1 rounded-full bg-[#3780C8] text-white text-[11px] font-semibold items-center justify-center">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E7E3DA] space-y-2">
        <div className="hidden md:block px-1">
          <div className="text-[13px] font-medium text-[#1F2933] truncate">{session.name}</div>
          <div className="text-[11px] text-[#6B7280]">{ROLE_LABEL[session.role]}</div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="w-full flex items-center gap-2.5 px-2 h-8 rounded-md text-[13px] text-[#6B7280] hover:text-[#1F2933] hover:bg-[#FAF8F3]"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Sign out</span>
        </button>
        {apiMode === 'mock' && (
          <div className="hidden md:block text-[11px] text-[#6B7280] px-2 py-1 rounded bg-[#FAF8F3] border border-[#E7E3DA]">Sample data</div>
        )}
      </div>
    </aside>
  );
};
