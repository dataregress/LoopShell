import { Bot } from 'lucide-react';
import { agentInfo } from '@/lib/agents';
import { t } from '@/lib/i18n';

/** "Handed to ServiceNow agent": handoff is always visible (invariant 2). */
export function HandoffChip({ agentId }: { agentId: string }) {
  const info = agentInfo(agentId);
  return (
    <div className="flex justify-start">
      <span className="inline-flex h-6 items-center gap-1.5 rounded-chip bg-info/10 px-2.5 text-xs text-info">
        <Bot className="size-3.5" aria-hidden />
        {t('Handed to {agent}', { agent: info.displayName })}
      </span>
    </div>
  );
}
