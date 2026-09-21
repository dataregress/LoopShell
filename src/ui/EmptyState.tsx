import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  message: string;
  action?: ReactNode;
}

/** One icon, one sentence, at most one action (docs/ui-ux.md §3.8). */
export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="text-fg-subtle [&>svg]:size-6">{icon}</span>
      <p className="text-base text-fg-muted">{message}</p>
      {action}
    </div>
  );
}
