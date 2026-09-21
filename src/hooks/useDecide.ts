import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import type { AttentionItem } from '@contracts/schemas/attention';
import type { IpcError } from '@contracts/schemas/ipc';
import { useAdapter } from '@/adapters/AdapterProvider';
import { newId, nowIso } from '@/lib/ids';
import { selectUserId, useSessionStore } from '@/stores/session';
import { keys } from './queryKeys';

export interface DecideVars {
  attentionId: string;
  optionId: string;
  freeText?: string;
}

/**
 * Relay a decision. The idempotency key is created once per attention item
 * and reused on retry until the decision is accepted (docs/ui-ux.md §3.5).
 */
export function useDecide() {
  const adapter = useAdapter();
  const qc = useQueryClient();
  const userId = useSessionStore(selectUserId);
  const keysByItem = useRef(new Map<string, string>());

  return useMutation({
    mutationFn: async (vars: DecideVars) => {
      const idempotencyKey = keysByItem.current.get(vars.attentionId) ?? newId();
      keysByItem.current.set(vars.attentionId, idempotencyKey);
      const result = await adapter.attentionDecide({
        attentionId: vars.attentionId,
        decision: vars.optionId,
        freeText: vars.freeText,
        decidedAt: nowIso(),
        idempotencyKey,
      });
      return result;
    },
    onSuccess: (_result, vars) => {
      keysByItem.current.delete(vars.attentionId);
      qc.setQueryData<AttentionItem[]>(keys.attention(userId), (items) =>
        items?.filter((i) => i.attentionId !== vars.attentionId),
      );
    },
    onError: (err: IpcError | unknown, vars) => {
      const e = err as Partial<IpcError>;
      if (e?.code === 'conflict') {
        keysByItem.current.delete(vars.attentionId);
        void qc.invalidateQueries({ queryKey: keys.attention(userId) });
      }
    },
  });
}
