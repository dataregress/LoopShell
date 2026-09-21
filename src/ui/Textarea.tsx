import { forwardRef, useEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow between these line counts. */
  minRows?: number;
  maxRows?: number;
}

/** Auto-growing textarea (1-4 lines by default). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { minRows = 1, maxRows = 4, className, value, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = 20;
    const max = maxRows * line;
    const min = minRows * line;
    el.style.height = `${Math.max(min, Math.min(max, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, minRows, maxRows]);

  return (
    <textarea
      ref={(node) => {
        inner.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      rows={minRows}
      value={value}
      className={cn(
        'w-full resize-none bg-transparent text-base text-fg placeholder:text-fg-subtle',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
