import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import type { IpcError } from '@contracts/schemas/ipc';
import { useAdapter } from '@/adapters/AdapterProvider';
import { useDecide } from '@/hooks/useDecide';
import { useVisibleAttention } from '@/hooks/useAttention';
import { agentInfo } from '@/lib/agents';
import { t } from '@/lib/i18n';
import { useAttentionStore } from '@/stores/attention';
import { selectIsOffline, useDockStore } from '@/stores/dock';
import { toast } from '@/stores/toasts';
import { describeError } from '@/ui/ErrorCard';
import { useMotionPresets } from '@/ui/motion';
import { AttentionDetail } from './components/AttentionDetail';
import { AttentionList } from './components/AttentionList';
import { DecisionBar } from './components/DecisionBar';

const EVIDENCE_ID = 'attention-evidence';

export function useAttentionSelection() {
  const selectedId = useAttentionStore((s) => s.selectedId);
  const select = useAttentionStore((s) => s.select);
  const { open, expired } = useVisibleAttention();
  const selected = [...open, ...expired].find((i) => i.attentionId === selectedId) ?? null;
  return { selected, select };
}

/** Body: list → detail in place. */
export function AttentionMode({ focusRequest }: { focusRequest: number }) {
  const m = useMotionPresets();
  const { open, expired, isLoading, error, refetch } = useVisibleAttention();
  const { selected, select } = useAttentionSelection();
  const popId = useDockStore((s) => s.popAttentionId);
  const setPopId = useDockStore((s) => s.setPopAttentionId);

  // An item arriving while hidden opens the panel with that item selected.
  useEffect(() => {
    if (popId) {
      select(popId);
      setPopId(null);
    }
  }, [popId, select, setPopId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Backspace' && selected && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        select(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, select]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {selected ? (
        <motion.div key={selected.attentionId} variants={m.fade} initial="hidden" animate="visible" exit="exit" className="h-full">
          <AttentionDetail item={selected} evidenceId={EVIDENCE_ID} />
        </motion.div>
      ) : (
        <motion.div key="list" variants={m.fade} initial="hidden" animate="visible" exit="exit" className="h-full">
          <AttentionList
            open={open}
            expired={expired}
            isLoading={isLoading}
            error={error}
            onRetry={refetch}
            onOpen={select}
            focusRequest={focusRequest}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Footer: the decision bar when an item is open. */
export function AttentionFooter() {
  const adapter = useAdapter();
  const { selected, select } = useAttentionSelection();
  const offline = useDockStore(selectIsOffline);
  const decide = useDecide();
  const clearNote = useAttentionStore((s) => s.clearNote);
  const [pending, setPending] = useState<string | null>(null);

  const onDecide = useCallback(
    async (optionId: string, note?: string) => {
      if (!selected) return;
      if (selected.kind === 'auth') {
        setPending(optionId);
        try {
          await adapter.authSignIn();
        } finally {
          setPending(null);
        }
        return;
      }
      setPending(optionId);
      try {
        await decide.mutateAsync({ attentionId: selected.attentionId, optionId, freeText: note });
        clearNote(selected.attentionId);
        const label = selected.options.find((o) => o.optionId === optionId)?.label ?? t('Rejected');
        toast(
          optionId === 'reject'
            ? t('Rejected · {agent} notified', { agent: agentInfo(selected.agentId).displayName })
            : t('{label} · {agent} is executing', { label, agent: agentInfo(selected.agentId).displayName }),
          { tone: 'success' },
        );
        select(null);
      } catch (err) {
        const e = err as Partial<IpcError>;
        toast(e?.code === 'conflict' ? t('Already decided elsewhere') : describeError(err).message, { tone: 'danger' });
      } finally {
        setPending(null);
      }
    },
    [adapter, selected, decide, clearNote, select],
  );

  if (!selected) return null;
  return (
    <DecisionBar
      item={selected}
      onDecide={(o, n) => void onDecide(o, n)}
      pendingOptionId={pending}
      disabled={offline}
      evidenceId={EVIDENCE_ID}
    />
  );
}
