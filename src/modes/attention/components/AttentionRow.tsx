import { CheckSquare, KeyRound, List, MessageSquare } from 'lucide-react';
import type { AttentionItem, AttentionKind } from '@contracts/schemas/attention';
import { agentInfo } from '@/lib/agents';
import { cn } from '@/lib/cn';
import { formatFullDateTime, formatTtl } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { useNow } from '@/hooks/useNow';

const KIND_ICON: Record<AttentionKind, typeof CheckSquare> = {
  confirm: CheckSquare,
  choose: List,
  provide: MessageSquare,
  auth: KeyRound,
};

export interface AttentionRowProps {
  item: AttentionItem;
  selected?: boolean;
  onOpen: (id: string) => void;
  tabIndex?: number;
  ref?: (el: HTMLButtonElement | null) => void;
}

/** 56 px row: kind icon · title · "requester · agent · platform" · TTL. */
export function AttentionRow({ item, selected = false, onOpen, tabIndex = -1, ref }: AttentionRowProps) {
  const now = useNow(1000);
  const Icon = KIND_ICON[item.kind];
  const ttl = formatTtl(item.expiresAt, now);
  const agent = agentInfo(item.agentId);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      onClick={() => onOpen(item.attentionId)}
      className={cn(
        'flex h-14 w-full items-center gap-3 px-4 text-start hairline-b transition-colors duration-[120ms]',
        'hover:bg-surface-sunken focus-visible:bg-surface-sunken',
        selected && 'bg-surface-sunken',
        ttl.expired && 'opacity-70',
      )}
    >
      <Icon className="size-4 shrink-0 text-fg-muted" aria-label={item.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-fg">{item.title}</span>
        <span className="block truncate text-sm text-fg-muted">
          {item.requester.displayName} · {agent.displayName} · {item.platform}
        </span>
      </span>
      {ttl.expired ? (
        <span className="rounded-chip bg-surface-sunken px-2 text-xs text-fg-muted">{t('Expired')}</span>
      ) : (
        <time
          dateTime={item.expiresAt}
          title={formatFullDateTime(item.expiresAt)}
          className={cn('shrink-0 text-xs tabular', ttl.urgent ? 'text-warning' : 'text-fg-subtle')}
        >
          {ttl.label}
        </time>
      )}
    </button>
  );
}
