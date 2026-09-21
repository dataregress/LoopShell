import { ArrowUp, Bot, ChevronDown, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useAdapter } from '@/adapters/AdapterProvider';
import { agentInfo } from '@/lib/agents';
import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';
import { useComposerStore } from '@/stores/composer';
import { selectIsOffline, useDockStore } from '@/stores/dock';
import { IconButton } from '@/ui/IconButton';
import { Menu, MenuContent, MenuItem, MenuPortal, MenuTrigger } from '@/ui/Menu';
import { Textarea } from '@/ui/Textarea';
import { usePanelContainer } from '@/ui/panel-container';

export interface ComposerProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onNewAsk: () => void;
  /** A task is running: the send button becomes stop. */
  working: boolean;
  /** Active agent for follow-ups; shows the context chip. */
  contextAgentId: string | null;
  /** Increment to move focus into the textarea (Active). */
  focusRequest: number;
}

/**
 * The Ask footer. Enter sends, Shift+Enter inserts a newline, Ctrl/⌘+Enter
 * also sends. Clicking in makes the panel Active (docs/ui-ux.md §3.3).
 */
export function Composer({ onSubmit, onCancel, onNewAsk, working, contextAgentId, focusRequest }: ComposerProps) {
  const adapter = useAdapter();
  const container = usePanelContainer();
  const draft = useComposerStore((s) => s.draft);
  const setDraft = useComposerStore((s) => s.setDraft);
  const offline = useDockStore(selectIsOffline);
  const active = useDockStore((s) => s.state.active);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusRequest > 0) {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [focusRequest]);

  const canSend = draft.trim().length > 0 && !offline;

  function send() {
    if (!canSend) return;
    onSubmit(draft);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (working) return;
      send();
    }
  }

  function activate() {
    if (!active) void adapter.dockActivate();
  }

  return (
    <div className="border-t border-border px-3 pt-2 pb-3" onPointerDown={activate}>
      {contextAgentId && (
        <div className="mb-1.5">
          <Menu modal={false}>
            <MenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1.5 rounded-chip bg-info/10 ps-2.5 pe-1.5 text-xs text-info hover:brightness-95"
                aria-label={t('Follow-up context: {agent}', { agent: agentInfo(contextAgentId).displayName })}
              >
                <Bot className="size-3.5" aria-hidden />
                {agentInfo(contextAgentId).displayName}
                <ChevronDown className="size-3" aria-hidden />
              </button>
            </MenuTrigger>
            <MenuPortal container={container ?? undefined}>
              <MenuContent align="start" side="top">
                <MenuItem onSelect={onNewAsk}>{t('Ask something new')}</MenuItem>
              </MenuContent>
            </MenuPortal>
          </Menu>
        </div>
      )}
      <div
        className={cn(
          'flex items-end gap-2 rounded-card border border-border bg-surface-raised ps-3 pe-1.5 py-1.5',
          'focus-within:border-focus',
          offline && 'opacity-70',
        )}
      >
        <Textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={activate}
          placeholder={t('Ask Loop…')}
          aria-label={t('Ask Loop')}
          disabled={offline}
          maxLength={4000}
          className="py-0.5"
        />
        {working ? (
          <IconButton label={t('Stop')} size="sm" onClick={onCancel} className="mb-0.5 text-fg">
            <Square className="size-3.5 fill-current" aria-hidden />
          </IconButton>
        ) : (
          <IconButton
            label={t('Send')}
            size="sm"
            onClick={send}
            disabled={!canSend}
            tooltip={false}
            className={cn('mb-0.5', canSend && 'bg-primary text-primary-fg hover:bg-primary hover:text-primary-fg hover:brightness-110')}
          >
            <ArrowUp className="size-4" aria-hidden />
          </IconButton>
        )}
      </div>
    </div>
  );
}
