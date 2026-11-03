import React from 'react';
import { ImageOff, Inbox, LucideIcon } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <section className={cx('bg-surface rounded-card border border-line shadow-card', className)}>{children}</section>
);

export const CardHeader: React.FC<{ title: React.ReactNode; right?: React.ReactNode; className?: string }> = ({ title, right, className }) => (
  <div className={cx('px-4 h-12 shrink-0 border-b border-line flex items-center justify-between gap-3', className)}>
    <h2 className="text-[14px] font-semibold text-ink truncate">{title}</h2>
    {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
  </div>
);

/** 11 px uppercase section label. */
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('text-[11px] font-semibold uppercase tracking-[.05em] text-ink-3', className)}>{children}</div>
);

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: React.ReactNode }
> = ({ variant = 'secondary', size = 'md', icon, className, children, ...rest }) => {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-primary-ink text-white border-primary-ink hover:bg-primary-press hover:border-primary-press shadow-sm',
    secondary: 'bg-surface text-ink border-line hover:bg-subtle hover:border-risk-none-line shadow-sm',
    danger: 'bg-surface text-risk-red-fg border-risk-red-line hover:bg-risk-red-bg',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:text-ink hover:bg-subtle'
  };
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-ctl border font-medium transition-colors whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none',
        size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-9 px-3.5 text-[13px]',
        v[variant],
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
};

/** Segmented control (two to five options). */
export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; label?: string }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-ctl bg-subtle border border-line" role="group" aria-label={label}>
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          aria-pressed={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            'h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            value === it.id ? 'bg-surface text-primary-ink shadow-sm border border-line' : 'text-ink-2 hover:text-ink border border-transparent'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex items-center gap-1 border-b border-line" role="tablist">
      {items.map(it => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            '-mb-px h-10 px-3 text-[13px] font-medium border-b-2 transition-colors inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-t-md',
            value === it.id ? 'border-primary text-primary-ink' : 'border-transparent text-ink-2 hover:text-ink'
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cx('ml-1.5 px-1.5 min-w-5 h-5 rounded-full text-[11px] font-semibold tabular-nums inline-flex items-center justify-center', value === it.id ? 'bg-primary-tint text-primary-ink' : 'bg-subtle text-ink-3 border border-line')}>
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-[.05em] text-ink-3 mb-1">
    {children}
  </label>
);

export const inputClass =
  'w-full h-9 px-2.5 rounded-ctl border border-line bg-surface text-[13px] text-ink placeholder:text-muted shadow-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-focus disabled:bg-subtle disabled:text-ink-3';

type KpiTone = 'primary' | 'red' | 'orange' | 'neutral' | 'green';
const KPI_TONE: Record<KpiTone, { circle: string; accent?: string }> = {
  primary: { circle: 'bg-primary-tint text-primary-ink' },
  red: { circle: 'bg-risk-red-bg text-risk-red-fg', accent: 'bg-risk-red' },
  orange: { circle: 'bg-risk-orange-bg text-risk-orange-fg', accent: 'bg-risk-orange' },
  neutral: { circle: 'bg-risk-none-bg text-risk-none-fg' },
  green: { circle: 'bg-risk-green-bg text-risk-green-fg' }
};
export const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: LucideIcon; tone?: KpiTone; accent?: boolean }> = ({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'primary',
  accent = false
}) => (
  <div className="relative bg-surface rounded-card border border-line shadow-card px-4 py-3.5 flex items-center gap-3.5 overflow-hidden">
    {accent && KPI_TONE[tone].accent && <span className={cx('absolute left-0 inset-y-0 w-[3px]', KPI_TONE[tone].accent)} aria-hidden />}
    {Icon && (
      <span className={cx('w-10 h-10 rounded-full flex items-center justify-center shrink-0', KPI_TONE[tone].circle)}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
    )}
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-ink-2 truncate">{label}</div>
      <div className="text-[28px] leading-8 font-bold text-ink tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-ink-3 truncate">{sub}</div>}
    </div>
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode; icon?: LucideIcon }> = ({ children, icon: Icon = Inbox }) => (
  <div className="py-10 flex flex-col items-center gap-2 text-[13px] text-ink-3">
    <span className="w-10 h-10 rounded-full bg-subtle border border-line flex items-center justify-center">
      <Icon className="w-[18px] h-[18px] text-muted" />
    </span>
    {children}
  </div>
);

export const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
    <span className="text-ink-2">{label}</span>
    <span className="font-medium text-ink text-right tabular-nums">{children}</span>
  </div>
);

/** Table header row: put on <thead>. */
export const theadClass = 'bg-subtle border-b border-line';
export const trClass = 'hover:bg-subtle transition-colors';

export const Th: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cx('px-3.5 h-9 text-left text-[11px] font-semibold uppercase tracking-[.05em] text-ink-3 whitespace-nowrap', className)}>{children}</th>
);
export const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cx('px-3.5 py-2.5 align-top text-[13px] text-ink tabular-nums', className)}>{children}</td>
);

export const PageBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] w-full mx-auto">{children}</div>
);

/** Image with a neutral placeholder when the source cannot be loaded. */
export const Thumb: React.FC<{ src?: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (!src || failed)
    return (
      <div role="img" aria-label={alt} className={cx('flex items-center justify-center bg-subtle text-muted', className)}>
        <ImageOff className="w-5 h-5" />
      </div>
    );
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
};
