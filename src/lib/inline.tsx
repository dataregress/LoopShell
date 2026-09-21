import type { ReactNode } from 'react';

/**
 * Cards support **bold** and `inline code` only (docs/ui-ux.md §3.7).
 * Anything else is rendered as plain text.
 */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const token = m[0];
    if (token.startsWith('**')) {
      out.push(<strong key={key++} className="font-semibold text-fg">{token.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code key={key++} className="rounded-sm bg-surface-sunken px-1 font-mono text-[0.92em] text-fg">
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = idx + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
