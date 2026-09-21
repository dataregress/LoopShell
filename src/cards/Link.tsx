import { ExternalLink } from 'lucide-react';
import type { LinkCard } from '@contracts/schemas/cards';
import { useAdapter } from '@/adapters/AdapterProvider';
import { AgentChip } from './AgentChip';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Deep link into the system of record. The whole card is the action. */
export function Link({ card }: { card: LinkCard }) {
  const adapter = useAdapter();
  return (
    <article aria-label={card.title} className="rounded-card border border-border bg-surface-raised">
      <button
        type="button"
        onClick={() => void adapter.openExternal(card.url)}
        title={card.url}
        className="flex w-full items-start gap-3 rounded-card p-4 text-start hover:bg-surface-sunken"
      >
        <ExternalLink className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg text-fg">{card.title}</span>
          <span className="block truncate text-xs text-fg-muted">{hostOf(card.url)}</span>
          {card.description && <span className="mt-1 block text-sm text-fg-muted">{card.description}</span>}
        </span>
        <AgentChip agentId={card.agentId} className="shrink-0" />
      </button>
    </article>
  );
}
