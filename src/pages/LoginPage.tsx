import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Role } from '../types';
import { ROLE_LABEL } from '../domain/permissions';
import { Button, Label, inputClass } from '../components/ui';
import { Logo } from '../components/Logo';

const ROLES: Role[] = ['officer', 'second_approver', 'road_engineer', 'patrol', 'public_reporter', 'admin'];

/** Simple corridor line: NH-27 with segments in risk colours, holding points and approach-zone rings. */
const CorridorArt: React.FC = () => {
  const path = 'M40 300 C 110 250, 120 170, 190 160 S 290 210, 330 140 S 400 60, 470 70';
  const stops: [number, number][] = [
    [190, 160],
    [330, 140]
  ];
  return (
    <svg viewBox="0 0 520 360" className="w-full max-w-[520px]" aria-hidden>
      {[...Array(6)].map((_, i) => (
        <path key={i} d={`M0 ${70 + i * 52} Q 260 ${40 + i * 52} 520 ${80 + i * 52}`} fill="none" stroke="#FFFFFF" strokeOpacity="0.05" strokeWidth="1" />
      ))}
      <circle cx="190" cy="160" r="34" fill="none" stroke="var(--color-nav-bar)" strokeOpacity="0.35" strokeDasharray="3 4" />
      <circle cx="330" cy="140" r="34" fill="none" stroke="var(--color-nav-bar)" strokeOpacity="0.35" strokeDasharray="3 4" />
      <path d={path} fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" strokeOpacity="0.95" />
      <path d={path} fill="none" stroke="var(--color-risk-green)" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray="100 0" />
      <path d={path} fill="none" stroke="var(--color-risk-yellow)" strokeWidth="6" pathLength={100} strokeDasharray="0 34 14 100" />
      <path d={path} fill="none" stroke="var(--color-risk-orange)" strokeWidth="6" pathLength={100} strokeDasharray="0 48 10 100" />
      <path d={path} fill="none" stroke="var(--color-risk-red)" strokeWidth="6" pathLength={100} strokeDasharray="0 58 9 100" />
      {stops.map(([x, y]) => (
        <g key={x}>
          <line x1={x} y1={y - 8} x2={x} y2={y - 26} stroke="#FFFFFF" strokeWidth="2" />
          <rect x={x - 9} y={y - 42} width="18" height="16" rx="4" fill="var(--color-primary)" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx={x} cy={y} r="5" fill="var(--color-nav)" stroke="#FFFFFF" strokeWidth="2.5" />
        </g>
      ))}
    </svg>
  );
};

export const LoginPage: React.FC = () => {
  const { login, toast, apiMode } = useApp();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>('officer');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(userId || ROLE_LABEL[role], role);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] bg-app">
      <div className="hidden lg:flex flex-col justify-between bg-nav p-10 xl:p-14 text-white">
        <div className="flex items-center gap-3">
          <Logo className="w-10 h-10" />
          <div className="leading-tight">
            <div className="font-semibold text-[18px] tracking-tight">RESILION 2.0</div>
            <div className="text-[12px] text-nav-label">NH-27 · Dima Hasao</div>
          </div>
        </div>
        <div className="flex justify-center">
          <CorridorArt />
        </div>
        <div className="flex items-center gap-4 text-[12px] text-nav-text">
          {[
            ['Green', 'risk-green'],
            ['Yellow', 'risk-yellow'],
            ['Orange', 'risk-orange'],
            ['Red', 'risk-red']
          ].map(([l, t]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className="w-4 h-[5px] rounded-full" style={{ background: `var(--color-${t})` }} />
              {l}
            </span>
          ))}
          <span className="ml-auto text-nav-label">Safe Passage Control</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-6 lg:hidden">
            <Logo className="w-9 h-9" />
            <div className="leading-tight">
              <div className="font-semibold text-lg tracking-tight text-ink">RESILION 2.0</div>
              <div className="text-xs text-ink-3">NH-27 · Dima Hasao</div>
            </div>
          </div>
          <form onSubmit={submit} className="bg-surface border border-line rounded-card shadow-card p-7 space-y-5">
            <div>
              <h1 className="text-[20px] font-semibold text-ink">Sign in</h1>
            </div>
            <div>
              <Label htmlFor="uid">User ID</Label>
              <input id="uid" className={inputClass} value={userId} onChange={e => setUserId(e.target.value)} autoComplete="username" placeholder={ROLE_LABEL[role]} />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select id="role" className={inputClass} value={role} onChange={e => setRole(e.target.value as Role)}>
                {ROLES.map(r => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="primary" className="w-full !h-10" disabled={busy}>
              Sign in
            </Button>
          </form>
          {apiMode === 'mock' && <div className="text-center text-[12px] text-ink-3 mt-3">Sample data</div>}
        </div>
      </div>
    </div>
  );
};
