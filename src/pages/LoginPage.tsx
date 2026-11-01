import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Role } from '../types';
import { ROLE_LABEL } from '../domain/permissions';
import { Button, Label, inputClass } from '../components/ui';

const ROLES: Role[] = ['officer', 'second_approver', 'road_engineer', 'patrol', 'public_reporter', 'admin'];

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
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F3] p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <div className="w-9 h-9 rounded-md bg-[#3780C8] flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-lg tracking-tight text-[#1F2933]">RESILION 2.0</div>
            <div className="text-xs text-[#6B7280]">NH-27 · Dima Hasao</div>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white border border-[#E7E3DA] rounded-lg p-6 space-y-4">
          <h1 className="text-base font-semibold text-[#1F2933]">Sign in</h1>
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
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            Sign in
          </Button>
        </form>
        {apiMode === 'mock' && <div className="text-center text-[11px] text-[#6B7280] mt-3">Sample data</div>}
      </div>
    </div>
  );
};
