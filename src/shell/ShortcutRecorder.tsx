import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';
import { Kbd } from '@/ui/Kbd';

export interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  error?: string | null;
  label: string;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS']);

/** Build "Ctrl+Alt+L" from a keydown. Requires at least one modifier and a non-modifier key. */
export function shortcutFromEvent(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  if (mods.length === 0) return null;
  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  if (key === ' ') key = 'Space';
  return [...mods, key].join('+');
}

/** Focus, press a chord, done. Esc cancels; Backspace restores the default. */
export function ShortcutRecorder({ value, onChange, error, label }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setRecording(true);
      }
      return;
    }
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }
    const chord = shortcutFromEvent(e);
    if (chord) {
      onChange(chord);
      setRecording(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        aria-label={label}
        aria-describedby={error ? `${label}-error` : undefined}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-control border px-3 text-sm',
          recording ? 'border-focus bg-surface-raised text-fg-muted' : 'border-border bg-surface-raised text-fg hover:bg-surface-sunken',
          error && 'border-danger',
        )}
      >
        <span>{recording ? t('Press the new shortcut…') : <Kbd>{value}</Kbd>}</span>
        <span className="text-xs text-fg-subtle">{recording ? t('Esc to cancel') : t('Change')}</span>
      </button>
      {error && (
        <p id={`${label}-error`} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
