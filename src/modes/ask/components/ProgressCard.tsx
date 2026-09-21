import { agentInfo } from '@/lib/agents';
import { t } from '@/lib/i18n';
import { CardSkeleton } from '@/ui/Skeleton';

/** Skeleton card with "Working… · ServiceNow agent". Replaced in place by cards. */
export function ProgressCard({ agentId }: { agentId: string | null }) {
  const label = agentId ? `${t('Working…')} · ${agentInfo(agentId).displayName}` : t('Working…');
  return <CardSkeleton label={label} />;
}
