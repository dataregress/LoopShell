import { Check, CheckCheck, Clock, Hourglass, Slash, X } from 'lucide-react';
import type { LedgerEventType } from '@contracts/schemas/ledger';
import { cn } from '@/lib/cn';

const GLYPH: Record<LedgerEventType, { Icon: typeof Check; cls: string; label: string }> = {
  proposed: { Icon: Clock, cls: 'text-fg-muted', label: 'Proposed' },
  confirmed: { Icon: Check, cls: 'text-info', label: 'Confirmed' },
  executed: { Icon: CheckCheck, cls: 'text-success', label: 'Executed' },
  failed: { Icon: X, cls: 'text-danger', label: 'Failed' },
  expired: { Icon: Hourglass, cls: 'text-fg-subtle', label: 'Expired' },
  cancelled: { Icon: Slash, cls: 'text-fg-subtle', label: 'Cancelled' },
};

export function StatusGlyph({ type, className }: { type: LedgerEventType; className?: string }) {
  const { Icon, cls, label } = GLYPH[type];
  return <Icon className={cn('size-4 shrink-0', cls, className)} aria-label={label} />;
}

export const STATUS_LABEL: Record<LedgerEventType, string> = Object.fromEntries(
  Object.entries(GLYPH).map(([k, v]) => [k, v.label]),
) as Record<LedgerEventType, string>;
