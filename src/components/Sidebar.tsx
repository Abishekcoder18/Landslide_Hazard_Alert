import React from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { NAV } from '../navigation';
import { ROLE_LABEL } from '../domain/permissions';
import { cx } from './ui';
import { Logo } from './Logo';

export const Sidebar: React.FC = () => {
  const { session, snapshot, logout } = useApp();
  if (!session) return null;
  const openApprovals = snapshot?.approvals.filter(a => a.status === 'pending' || a.status === 'escalated').length ?? 0;
  const queue = snapshot?.reports.filter(r => (r.route === 'officer_queue' || r.route === 'manual_review') && (r.status === 'unverified' || r.status === 'corroborated')).length ?? 0;
  const badges: Record<string, number> = { '/approvals': openApprovals, '/reports': session.role === 'officer' || session.role === 'second_approver' ? queue : 0 };
  const initials = session.name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <aside className="w-16 lg:w-60 shrink-0 bg-nav flex flex-col h-screen sticky top-0 z-40" aria-label="Sidebar">
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-white/[.07]">
        <Logo className="w-8 h-8 shrink-0" />
        <div className="hidden lg:block leading-tight min-w-0">
          <div className="font-semibold text-[15px] tracking-tight text-white">RESILION 2.0</div>
          <div className="text-[11px] text-nav-label">NH-27 · Dima Hasao</div>
        </div>
      </div>

      <div className="hidden lg:block px-5 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-[.05em] text-nav-label">Workspace</div>
      <nav className="px-2 pt-3 lg:pt-0 space-y-0.5 flex-1" aria-label="Main navigation">
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
                  'relative flex items-center justify-center lg:justify-between px-3 h-10 rounded-ctl text-[13px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  isActive ? 'bg-nav-active text-white' : 'text-nav-text hover:bg-nav-hover hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-nav-bar" aria-hidden />}
                  <span className="flex items-center gap-3">
                    <Icon className={cx('w-[18px] h-[18px] shrink-0', isActive ? 'text-nav-bar' : 'text-nav-label')} />
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                  {badge > 0 && (
                    <span className="absolute top-0.5 right-0.5 lg:static min-w-4 h-4 lg:min-w-5 lg:h-5 px-1 lg:px-1.5 rounded-full bg-primary-ink text-white text-[10px] lg:text-[11px] font-semibold tabular-nums flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/[.07] space-y-1">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <span className="w-8 h-8 rounded-full bg-nav-active border border-white/10 text-white text-[12px] font-semibold flex items-center justify-center shrink-0" aria-hidden>
            {initials}
          </span>
          <div className="hidden lg:block min-w-0">
            <div className="text-[13px] font-medium text-white truncate">{session.name}</div>
            <div className="text-[11px] text-nav-label truncate">{ROLE_LABEL[session.role]}</div>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-3 h-9 rounded-ctl text-[13px] text-nav-text hover:text-white hover:bg-nav-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden lg:inline">Sign out</span>
        </button>
      </div>
    </aside>
  );
};
