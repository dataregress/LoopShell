import { AlertTriangle, Check, Info, X } from 'lucide-react';
import type { Evidence } from '@contracts/schemas/common';
import { cn } from '@/lib/cn';

const ICON = {
  passed: { Icon: Check, cls: 'text-success' },
  warning: { Icon: AlertTriangle, cls: 'text-warning' },
  failed: { Icon: X, cls: 'text-danger' },
  info: { Icon: Info, cls: 'text-info' },
} as const;

export interface EvidenceListProps {
  items: Evidence[];
  id?: string;
  className?: string;
}

/** Bordered list of what the agent checked. */
export function EvidenceList({ items, id, className }: EvidenceListProps) {
  if (items.length === 0) return null;
  return (
    <ul id={id} className={cn('divide-y divide-border rounded-control border border-border', className)}>
      {items.map((e, i) => {
        const { Icon, cls } = ICON[e.status];
        return (
          <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
            <Icon className={cn('mt-0.5 size-4 shrink-0', cls)} aria-label={e.status} />
            <div className="min-w-0">
              <div className="text-fg">{e.label}</div>
              {e.detail && <div className="text-fg-muted">{e.detail}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
