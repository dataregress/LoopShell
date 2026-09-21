import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also the tooltip. */
  label: string;
  children: ReactNode;
  active?: boolean;
  size?: 'sm' | 'md';
  tooltip?: boolean;
}

export function IconButton({
  label,
  children,
  active = false,
  size = 'md',
  tooltip = true,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control text-fg-muted transition-colors duration-[120ms]',
        'hover:bg-surface-sunken hover:text-fg disabled:opacity-50 disabled:hover:bg-transparent',
        active && 'bg-surface-sunken text-primary',
        size === 'sm' ? 'size-7' : 'size-8',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
