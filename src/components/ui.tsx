import React from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <section className={cx('bg-white rounded-lg border border-[#E7E3DA]', className)}>{children}</section>
);

export const CardHeader: React.FC<{ title: React.ReactNode; right?: React.ReactNode; className?: string }> = ({ title, right, className }) => (
  <div className={cx('px-4 h-11 border-b border-[#E7E3DA] flex items-center justify-between gap-3', className)}>
    <h2 className="text-[13px] font-semibold text-[#1F2933] truncate">{title}</h2>
    {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
  </div>
);

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: React.ReactNode }
> = ({ variant = 'secondary', size = 'md', icon, className, children, ...rest }) => {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-[#3780C8] text-white border-[#3780C8] hover:bg-[#2A649C]',
    secondary: 'bg-white text-[#1F2933] border-[#E7E3DA] hover:bg-[#FAF8F3]',
    danger: 'bg-white text-[#9B2C2C] border-[#EEAFAF] hover:bg-[#F8D7D7]',
    ghost: 'bg-transparent text-[#6B7280] border-transparent hover:text-[#1F2933] hover:bg-[#FAF8F3]'
  };
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
        v[variant],
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
};

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="flex items-center gap-1 border-b border-[#E7E3DA]" role="tablist">
      {items.map(it => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            '-mb-px h-9 px-3 text-[13px] font-medium border-b-2 transition-colors',
            value === it.id ? 'border-[#3780C8] text-[#3780C8]' : 'border-transparent text-[#6B7280] hover:text-[#1F2933]'
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="ml-1.5 text-[11px] font-mono text-[#6B7280]">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">
    {children}
  </label>
);

export const inputClass =
  'w-full h-9 px-2.5 rounded-md border border-[#E7E3DA] bg-white text-[13px] text-[#1F2933] focus:outline-none focus:border-[#3780C8] focus:ring-2 focus:ring-[#3780C8]/15';

export const Kpi: React.FC<{ label: string; value: React.ReactNode; tone?: 'default' | 'alert' }> = ({ label, value, tone = 'default' }) => (
  <div className="bg-white rounded-lg border border-[#E7E3DA] px-4 py-3">
    <div className="text-[11px] font-medium text-[#6B7280]">{label}</div>
    <div className={cx('text-xl font-semibold mt-0.5 tabular-nums', tone === 'alert' ? 'text-[#9B2C2C]' : 'text-[#1F2933]')}>{value}</div>
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="py-10 text-center text-[13px] text-[#6B7280]">{children}</div>
);

export const Row: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
    <span className="text-[#6B7280]">{label}</span>
    <span className="font-medium text-[#1F2933] text-right">{children}</span>
  </div>
);

export const Th: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={cx('px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] whitespace-nowrap', className)}>{children}</th>
);
export const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cx('px-3 py-2.5 align-top text-[13px] text-[#1F2933]', className)}>{children}</td>
);

export const PageBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-4 md:p-6 space-y-4 max-w-[1600px] w-full mx-auto">{children}</div>
);
