import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { DecisionOption } from '@contracts/schemas/common';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';

export interface OptionGroupProps {
  options: DecisionOption[];
  onSelect: (optionId: string) => void;
  /** Option rendered as primary; defaults to the one marked `recommended`. */
  primaryOptionId?: string;
  disabled?: boolean;
  pendingOptionId?: string | null;
  describedBy?: string;
  label: string;
  layout?: 'stack' | 'row';
  /** Show descriptions under labels (choice cards). */
  showDescriptions?: boolean;
}

/**
 * `role="group"` of option buttons. Arrow keys move between options, Enter
 * selects the focused one, Ctrl/⌘+Enter selects the primary (docs/ui-ux.md §6.1).
 */
export function OptionGroup({
  options,
  onSelect,
  primaryOptionId,
  disabled = false,
  pendingOptionId = null,
  describedBy,
  label,
  layout = 'stack',
  showDescriptions = false,
}: OptionGroupProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const primary = primaryOptionId ?? options.find((o) => o.recommended)?.optionId ?? options[0]?.optionId;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (primary && !disabled) onSelect(primary);
      return;
    }
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? index + 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? index - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    const target = refs.current[(next + options.length) % options.length];
    target?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className={cn('flex gap-2', layout === 'stack' ? 'flex-col' : 'flex-row flex-wrap')}
    >
      {options.map((o, i) => {
        const isPrimary = o.optionId === primary;
        return (
          <Button
            key={o.optionId}
            ref={(el) => {
              refs.current[i] = el;
            }}
            variant={isPrimary ? 'primary' : 'secondary'}
            block={layout === 'stack'}
            disabled={disabled}
            loading={pendingOptionId === o.optionId}
            onClick={() => onSelect(o.optionId)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(showDescriptions && 'h-auto flex-col items-start gap-0.5 py-2 text-start')}
          >
            <span>{o.label}</span>
            {showDescriptions && o.description && (
              <span className={cn('text-xs font-normal', isPrimary ? 'text-primary-fg/80' : 'text-fg-muted')}>
                {o.description}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
