import React from 'react';

/** RESILION mark: a hill-road line inside a shield-shaped tile (brand blue). */
export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
    <path d="M7 22.5 L12.5 13 L16 18 L19.5 11 L25 22.5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx="19.5" cy="11" r="1.8" fill="#FFFFFF" />
  </svg>
);
