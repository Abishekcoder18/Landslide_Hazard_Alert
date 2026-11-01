import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Role, Session, Snapshot } from '../types';
import { Action, can as canDo } from '../domain/permissions';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface AppContextValue {
  session: Session | null;
  snapshot: Snapshot | null;
  now: Date;
  apiMode: 'mock' | 'http';
  login: (userId: string, role: Role) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Runs an API command, refreshes the snapshot and reports the outcome. Returns true on success. */
  act: (fn: (s: Session) => Promise<unknown>, success?: string) => Promise<boolean>;
  can: (action: Action) => boolean;
  toasts: Toast[];
  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);
const SESSION_KEY = 'resilion.session';
const POLL_MS = 5000;

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(new Date());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), []);

  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      setSnapshot(await api.getSnapshot(s));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (!session) return;
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [session, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const login = useCallback(async (userId: string, role: Role) => {
    const s = await api.login(userId, role);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable */
    }
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    setSession(null);
    setSnapshot(null);
  }, []);

  const act = useCallback(
    async (fn: (s: Session) => Promise<unknown>, success?: string) => {
      const s = sessionRef.current;
      if (!s) return false;
      try {
        await fn(s);
        if (success) toast(success, 'success');
        return true;
      } catch (e) {
        toast((e as Error).message, 'error');
        return false;
      } finally {
        await refresh();
      }
    },
    [refresh, toast]
  );

  const can = useCallback((action: Action) => (session ? canDo(session.role, action) : false), [session]);

  const value = useMemo(
    () => ({ session, snapshot, now, apiMode: api.mode, login, logout, refresh, act, can, toasts, toast, dismissToast }),
    [session, snapshot, now, login, logout, refresh, act, can, toasts, toast, dismissToast]
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/** Snapshot is guaranteed inside the authenticated shell. */
export function useSnapshot() {
  const { snapshot } = useApp();
  if (!snapshot) throw new Error('Snapshot not loaded');
  return snapshot;
}
