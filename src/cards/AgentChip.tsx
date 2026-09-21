import { Bot } from 'lucide-react';
import { agentInfo } from '@/lib/agents';
import { t } from '@/lib/i18n';
import { Chip } from '@/ui/Chip';

export interface AgentChipProps {
  agentId: string;
  className?: string;
}

/** "Handled by ServiceNow agent". Unknown agents fall back to Lucide `bot`. */
export function AgentChip({ agentId, className }: AgentChipProps) {
  const info = agentInfo(agentId);
  return (
    <Chip
      tone="info"
      icon={<Bot className="size-3.5 shrink-0" aria-hidden />}
      aria-label={t('Handled by {agent}', { agent: info.displayName })}
      className={className}
    >
      {info.displayName}
    </Chip>
  );
}
