export const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export const fmtClock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';

export const fmtWait = (min?: number) =>
  min === undefined ? '—' : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

export function fmtAgo(iso: string, now: Date): string {
  const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export function fmtCountdown(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtRemaining(iso: string, now: Date): string {
  const m = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (m <= 0) return 'expired';
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Local datetime-input value (yyyy-MM-ddTHH:mm) <-> ISO. */
export function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** AI provider shown to users: the free local model ("local:<model>") is never presented as Claude. */
export const providerLabel = (model?: string) => (model?.startsWith('local:') ? 'Local model' : model?.startsWith('claude') ? 'Claude' : 'Language model');
