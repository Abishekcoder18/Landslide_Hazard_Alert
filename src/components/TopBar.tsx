import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CloudRain, Database } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { fmtDay } from '../lib/format';
import { cx } from './ui';

const Chip: React.FC<{ icon: React.ReactNode; children: React.ReactNode; title?: string }> = ({ icon, children, title }) => (
  <span title={title} className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-chip border border-line bg-subtle text-[12px] font-medium text-ink-2 whitespace-nowrap">
    {icon}
    {children}
  </span>
);

export const TopBar: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => {
  const { now, snapshot, can } = useApp();
  const navigate = useNavigate();
  const open = snapshot?.approvals.filter(a => a.status === 'pending' || a.status === 'escalated').length ?? 0;
  const escalated = snapshot?.approvals.some(a => a.status === 'escalated') ?? false;
  const real = snapshot?.corridor?.source === 'postgis';
  const day = snapshot?.config.scenarioDate ?? snapshot?.corridor?.scenarioDate;
  const rain = !real || !day ? null : day === 'live' ? 'Open-Meteo · live' : day > '2025-12-31' ? `Open-Meteo · ${fmtDay(day)}` : `IMD · ${fmtDay(day)}`;

  return (
    <header className="h-14 px-4 lg:px-6 bg-surface border-b border-line flex items-center justify-between gap-4 shrink-0 sticky top-0 z-30">
      <h1 className="text-[20px] font-semibold text-ink tracking-tight truncate">{title}</h1>
      <div className="flex items-center gap-2 text-xs">
        {right}
        <Chip icon={<Database className={cx('w-3.5 h-3.5', real ? 'text-risk-green' : 'text-muted')} />} title="Data source">
          {real ? 'PostGIS' : 'Sample data'}
        </Chip>
        {rain && <Chip icon={<CloudRain className="w-3.5 h-3.5 text-primary" />} title="Rainfall date">{rain}</Chip>}
        <span className="text-ink-2 font-medium hidden sm:inline tabular-nums px-2 whitespace-nowrap">
          {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {can('approve_closure') && (
          <button
            onClick={() => navigate('/approvals')}
            className="relative w-9 h-9 rounded-ctl border border-line bg-surface flex items-center justify-center text-ink-2 hover:text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label={`${open} open approvals`}
            title={`${open} open approvals`}
          >
            <Bell className="w-4 h-4" />
            {open > 0 && (
              <span className={cx('absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-white text-[11px] font-bold tabular-nums flex items-center justify-center ring-2 ring-surface', escalated ? 'bg-dec-close' : 'bg-primary-ink')}>
                {open}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
};
