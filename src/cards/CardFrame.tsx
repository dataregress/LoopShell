import { useId } from 'react';
import type { ReactNode } from 'react';
import type { Tone } from '@contracts/schemas/common';
import { cn } from '@/lib/cn';
import { AgentChip } from './AgentChip';

export interface CardFrameProps {
  title: string;
  icon: ReactNode;
  agentId: string;
  tone?: Tone;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Id of the element that describes the body (for option groups). */
  describedBy?: string;
}

const TONE_RULE: Record<Tone, string> = {
  neutral: 'border-s-border',
  success: 'border-s-success',
  failure: 'border-s-danger',
};

/** Common card frame: raised surface, hairline, radius 12, padding 16, header row. */
export function CardFrame({ title, icon, agentId, tone, children, footer, className }: CardFrameProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'rounded-card border border-border bg-surface-raised p-4',
        tone && 'border-s-[3px]',
        tone && TONE_RULE[tone],
        className,
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-fg-muted [&>svg]:size-5" aria-hidden>
            {icon}
          </span>
          <h3 id={titleId} className="truncate text-lg text-fg">
            {title}
          </h3>
        </div>
        <AgentChip agentId={agentId} className="shrink-0" />
      </header>
      <div className="text-base text-fg">{children}</div>
      {footer && <footer className="mt-4 flex flex-wrap items-center gap-2">{footer}</footer>}
    </article>
  );
}
