import { Bell, History, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import type { Mode } from '@contracts/schemas/dock';
import { useAsk } from '@/hooks/useAsk';
import { useAttentionCount } from '@/hooks/useAttention';
import { t } from '@/lib/i18n';
import { Composer } from '@/shell/Composer';
import { QuickActions } from '@/shell/QuickActions';
import type { QuickAction } from '@/shell/QuickActions';
import { useAskStore } from '@/stores/ask';
import { selectIsOffline, useDockStore } from '@/stores/dock';
import { AskThread } from './components/AskThread';

export interface AskModeProps {
  onSwitchMode: (mode: Mode) => void;
  /** Journey to reopen (from Recent "Continue in Ask"). */
  continueJourneyId?: string | null;
  onContinued?: () => void;
}

/** The Ask footer (composer); rendered by the panel so it sits under the body. */
export function AskFooter({ composerFocusRequest }: { composerFocusRequest: number }) {
  const { thread, submit, cancel, newAsk } = useAsk();
  const hasJourney = thread.status !== 'idle' && thread.status !== 'submitting';
  return (
    <Composer
      onSubmit={(text) => void submit(text)}
      onCancel={() => void cancel()}
      onNewAsk={newAsk}
      working={thread.status === 'working' || thread.status === 'submitting'}
      contextAgentId={hasJourney ? thread.agentId : null}
      focusRequest={composerFocusRequest}
    />
  );
}

export function AskMode({ onSwitchMode, continueJourneyId = null, onContinued }: AskModeProps) {
  const { thread, decideInline, retry, newAsk, holdInline, restoreJourney } = useAsk();
  const pendingDecision = useAskStore((s) => s.pendingDecision);
  const lastJourney = useAskStore((s) => s.lastJourney);
  const offline = useDockStore(selectIsOffline);
  const attentionCount = useAttentionCount();

  // Proposals shown inline are held back from Attention while the panel is open.
  const pendingIds = thread.pendingAttentionIds;
  useEffect(() => {
    for (const id of pendingIds) holdInline(id);
  }, [pendingIds, holdInline]);

  // Reopen a journey from Recent.
  useEffect(() => {
    if (!continueJourneyId) return;
    void restoreJourney(continueJourneyId).finally(() => onContinued?.());
  }, [continueJourneyId, restoreJourney, onContinued]);

  if (thread.items.length === 0) {
    const actions: QuickAction[] = [];
    if (attentionCount > 0) {
      actions.push({
        id: 'attention',
        icon: <Bell />,
        label: attentionCount === 1 ? t('1 needs your attention') : t('{n} need your attention', { n: attentionCount }),
        onClick: () => onSwitchMode('attention'),
      });
    }
    if (lastJourney) {
      actions.push({
        id: 'continue',
        icon: <RotateCcw />,
        label: t('Continue: {ask}', { ask: lastJourney.ask }),
        onClick: () => void restoreJourney(lastJourney.journeyId),
      });
    }
    actions.push({ id: 'recent', icon: <History />, label: t('Recent'), onClick: () => onSwitchMode('recent') });
    return (
      <div className="flex h-full flex-col justify-end px-4 pb-4">
        <p className="text-base text-fg-muted">{t('What do you need?')}</p>
        <QuickActions actions={actions} />
      </div>
    );
  }

  return (
    <AskThread
      thread={thread}
      onDecide={(a, o, f) => void decideInline(a, o, f)}
      pendingDecision={pendingDecision}
      decisionsDisabled={offline}
      onRetry={retry}
      onNewAsk={newAsk}
    />
  );
}
