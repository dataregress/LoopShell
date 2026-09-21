import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'attention';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-sunken text-fg-muted',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  attention: 'bg-attention/10 text-attention',
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
}

/** Static label chip (agent, platform, status). */
export function Chip({ tone = 'neutral', icon, children, className, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 rounded-chip px-2 text-xs whitespace-nowrap',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  children: ReactNode;
}

/** Toggleable chip for Recent filters. Space toggles (native button). */
export function FilterChip({ selected, children, className, type = 'button', ...rest }: FilterChipProps) {
  return (
    <button
      type={type}
      role="checkbox"
      aria-checked={selected}
      className={cn(
        'inline-flex h-7 items-center rounded-chip border px-2.5 text-xs whitespace-nowrap transition-colors duration-[120ms]',
        selected
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border bg-surface-raised text-fg-muted hover:bg-surface-sunken hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
