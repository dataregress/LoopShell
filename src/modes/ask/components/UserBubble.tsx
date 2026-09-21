import { formatClock, formatFullDateTime } from '@/lib/dates';

/** Right-aligned ask bubble, max 80 % width. */
export function UserBubble({ text, at }: { text: string; at: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-card rounded-ee-sm bg-surface-sunken px-3 py-2 text-base text-fg">
        <p className="whitespace-pre-wrap">{text}</p>
        <time dateTime={at} title={formatFullDateTime(at)} className="mt-0.5 block text-end text-xs text-fg-subtle tabular">
          {formatClock(at)}
        </time>
      </div>
    </div>
  );
}
