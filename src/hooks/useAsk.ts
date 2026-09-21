import { useCallback } from 'react';
import type { IpcError } from '@contracts/schemas/ipc';
import { useAdapter } from '@/adapters/AdapterProvider';
import { newId, nowIso } from '@/lib/ids';
import { t } from '@/lib/i18n';
import { useAskStore } from '@/stores/ask';
import { useComposerStore } from '@/stores/composer';
import { useDockStore } from '@/stores/dock';
import { toast } from '@/stores/toasts';
import { describeError } from '@/ui/ErrorCard';
import { useDecide } from './useDecide';

/** Composer and card actions for the Ask thread. */
export function useAsk() {
  const adapter = useAdapter();
  const dispatch = useAskStore((s) => s.dispatch);
  const setPendingDecision = useAskStore((s) => s.setPendingDecision);
  const thread = useAskStore((s) => s.thread);
  const clearDraft = useComposerStore((s) => s.clear);
  const holdInline = useDockStore((s) => s.holdInline);
  const releaseInline = useDockStore((s) => s.releaseInline);
  const decide = useDecide();

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const clientRequestId = newId();
      dispatch({ type: 'submit', text: trimmed, clientRequestId, at: nowIso() });
      clearDraft();
      try {
        const result = await adapter.askSubmit({
          text: trimmed,
          journeyId: thread.status === 'waiting' || thread.status === 'working' ? (thread.journeyId ?? undefined) : undefined,
          clientRequestId,
        });
        dispatch({ type: 'accepted', clientRequestId, journeyId: result.journeyId, taskId: result.taskId });
        void adapter.telemetryEvent('ask_submitted', { journeyId: result.journeyId });
      } catch (err) {
        dispatch({ type: 'submit_failed', clientRequestId, message: describeError(err as IpcError).message });
      }
    },
    [adapter, dispatch, clearDraft, thread.status, thread.journeyId],
  );

  const cancel = useCallback(async () => {
    if (!thread.taskId) return;
    try {
      await adapter.askCancel(thread.taskId);
    } finally {
      dispatch({ type: 'cancelled' });
    }
  }, [adapter, dispatch, thread.taskId]);

  const decideInline = useCallback(
    async (attentionId: string, optionId: string, freeText?: string) => {
      setPendingDecision({ attentionId, optionId });
      try {
        await decide.mutateAsync({ attentionId, optionId, freeText });
        dispatch({ type: 'decided', attentionId, optionId });
        releaseInline(attentionId);
      } catch (err) {
        const e = err as Partial<IpcError>;
        toast(e?.code === 'conflict' ? t('Already decided elsewhere') : describeError(err).message, { tone: 'danger' });
      } finally {
        setPendingDecision(null);
      }
    },
    [decide, dispatch, releaseInline, setPendingDecision],
  );

  const retry = useCallback(() => {
    if (thread.lastAskText) void submit(thread.lastAskText);
  }, [submit, thread.lastAskText]);

  const newAsk = useCallback(() => {
    for (const id of thread.pendingAttentionIds) releaseInline(id);
    dispatch({ type: 'new_ask' });
  }, [dispatch, releaseInline, thread.pendingAttentionIds]);

  /** Reopen a journey (from Recent or the "Continue:" quick action). */
  const restoreJourney = useCallback(
    async (journeyId: string) => {
      try {
        const journey = await adapter.journeyGet(journeyId);
        dispatch({ type: 'restore', journey, newId });
      } catch (err) {
        toast(describeError(err).message, { tone: 'danger' });
      }
    },
    [adapter, dispatch],
  );

  return { thread, submit, cancel, decideInline, retry, newAsk, holdInline, restoreJourney };
}
