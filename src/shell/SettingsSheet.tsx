import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '@contracts/schemas/settings';
import type { Settings } from '@contracts/schemas/settings';
import { useAdapter } from '@/adapters/AdapterProvider';
import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/toasts';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Dialog';
import { describeError } from '@/ui/ErrorCard';
import { ShortcutRecorder } from './ShortcutRecorder';

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Scroll to a section on open. */
  section?: 'about' | null;
  onSignOut: () => void;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="border-b border-border px-4 py-3 last:border-b-0">
      <h3 className="mb-2 text-xs text-fg-muted uppercase tracking-wide">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-0.5 text-sm text-fg">
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-fg-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-pill border transition-colors duration-[120ms]',
        checked ? 'border-primary bg-primary' : 'border-border bg-surface-sunken',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-0.5 size-3.5 rounded-pill bg-surface-raised shadow-pill transition-[inset-inline-start] duration-[120ms]',
          checked ? 'start-[18px]' : 'start-0.5',
        )}
      />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-7 items-stretch gap-0.5 rounded-control bg-surface-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[6px] px-2 text-xs font-medium',
            value === o.value ? 'bg-surface-raised text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Radix Dialog inside the panel body (docs/ui-ux.md §3.9). Saves on each change; Rust owns the file. */
export function SettingsSheet({ open, onOpenChange, section = null, onSignOut }: SettingsSheetProps) {
  const adapter = useAdapter();
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const monitors = useSettingsStore((s) => s.monitors);
  const setMonitors = useSettingsStore((s) => s.setMonitors);
  const session = useSessionStore((s) => s.session);
  const [shortcutError, setShortcutError] = useState<{ open?: string; pin?: string }>({});

  useEffect(() => {
    if (!open) return;
    void adapter.monitorsList().then(setMonitors).catch(() => setMonitors([]));
    if (section === 'about') {
      requestAnimationFrame(() => document.getElementById('settings-about')?.scrollIntoView({ block: 'start' }));
    }
  }, [open, section, adapter, setMonitors]);

  async function save(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const saved = await adapter.settingsSet(next);
      setSettings(saved);
      setShortcutError({});
    } catch (err) {
      setSettings(settings);
      const msg = describeError(err).message;
      if (patch.shortcutOpen) setShortcutError({ open: t('That shortcut is in use by another app.') });
      else if (patch.shortcutPin) setShortcutError({ pin: t('That shortcut is in use by another app.') });
      else toast(msg, { tone: 'danger' });
    }
  }

  async function copyDiagnostics() {
    const text = [
      `Loop Dock ${__APP_VERSION__} (${__BUILD_ID__})`,
      `adapter: ${adapter.kind}`,
      `user: ${session.upn ?? '—'} tenant: ${session.tenantId ?? '—'}`,
      `settings: ${JSON.stringify(settings)}`,
      `ua: ${navigator.userAgent}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(t('Copied'));
    } catch {
      toast(t('Could not copy'), { tone: 'danger' });
    }
  }

  const monitorOptions = monitors.length > 0 ? monitors : [{ name: t('Primary display'), primary: true, scaleFactor: 1 }];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('Settings')}>
      <Section title={t('Shortcut')}>
        <Row label={t('Open Loop')} hint={t('Opens Ask, focuses the composer, then hides.')}>
          <span />
        </Row>
        <ShortcutRecorder
          label={t('Open Loop shortcut')}
          value={settings.shortcutOpen}
          error={shortcutError.open}
          onChange={(s) => void save({ shortcutOpen: s })}
        />
        <Row label={t('Pin or unpin panel')}>
          <span />
        </Row>
        <ShortcutRecorder
          label={t('Pin shortcut')}
          value={settings.shortcutPin}
          error={shortcutError.pin}
          onChange={(s) => void save({ shortcutPin: s })}
        />
        {(settings.shortcutOpen !== DEFAULT_SETTINGS.shortcutOpen || settings.shortcutPin !== DEFAULT_SETTINGS.shortcutPin) && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => void save({ shortcutOpen: DEFAULT_SETTINGS.shortcutOpen, shortcutPin: DEFAULT_SETTINGS.shortcutPin })}
          >
            {t('Restore defaults')}
          </Button>
        )}
      </Section>

      <Section title={t('Pill')}>
        <Row label={t('Display')}>
          <select
            value={settings.display ?? ''}
            onChange={(e) => void save({ display: e.target.value || null })}
            className="h-7 max-w-44 rounded-control border border-border bg-surface-raised px-2 text-xs text-fg"
          >
            <option value="">{t('Primary display')}</option>
            {monitorOptions
              .filter((m) => !m.primary)
              .map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
          </select>
        </Row>
        <Row label={t('Edge')}>
          <Segmented
            label={t('Edge')}
            value={settings.edge}
            options={[
              { value: 'right', label: t('Right') },
              { value: 'left', label: t('Left') },
            ]}
            onChange={(edge) => void save({ edge })}
          />
        </Row>
        <Row label={t('Show pill')} hint={t('The tray icon and shortcut keep working.')}>
          <Toggle label={t('Show pill')} checked={settings.pillVisible} onChange={(v) => void save({ pillVisible: v })} />
        </Row>
      </Section>

      <Section title={t('Behaviour')}>
        <Row label={t('Start Loop at sign-in')}>
          <Toggle label={t('Start Loop at sign-in')} checked={settings.autostart} onChange={(v) => void save({ autostart: v })} />
        </Row>
        <Row label={t('Pin panel by default')}>
          <Toggle label={t('Pin panel by default')} checked={settings.pinByDefault} onChange={(v) => void save({ pinByDefault: v })} />
        </Row>
        <Row label={t('Exclude from screen sharing')} hint={t('The pill and panel stay out of captures.')}>
          <Toggle
            label={t('Exclude from screen sharing')}
            checked={settings.excludeFromCapture}
            onChange={(v) => void save({ excludeFromCapture: v })}
          />
        </Row>
      </Section>

      <Section title={t('Appearance')}>
        <Row label={t('Theme')}>
          <Segmented
            label={t('Theme')}
            value={settings.theme}
            options={[
              { value: 'system', label: t('System') },
              { value: 'light', label: t('Light') },
              { value: 'dark', label: t('Dark') },
            ]}
            onChange={(theme) => void save({ theme })}
          />
        </Row>
        <Row label={t('Motion')}>
          <Segmented
            label={t('Motion')}
            value={settings.motion}
            options={[
              { value: 'system', label: t('System') },
              { value: 'reduced', label: t('Reduced') },
            ]}
            onChange={(motion) => void save({ motion })}
          />
        </Row>
        <Row label={t('Translucent panel')} hint={t('Where the OS supports it.')}>
          <Toggle label={t('Translucent panel')} checked={settings.vibrancy} onChange={(v) => void save({ vibrancy: v })} />
        </Row>
      </Section>

      <Section title={t('Account')}>
        <div className="text-sm text-fg">{session.displayName ?? t('Not signed in')}</div>
        {session.upn && <div className="text-xs text-fg-muted">{session.upn}</div>}
        {session.tenantId && <div className="text-xs text-fg-subtle">{t('Tenant')}: {session.tenantId}</div>}
        {session.state === 'signed_in' && (
          <Button size="sm" className="self-start" onClick={onSignOut}>
            {t('Sign out')}
          </Button>
        )}
      </Section>

      <Section title={t('About')} id="settings-about">
        <div className="text-sm text-fg">Loop Dock {__APP_VERSION__}</div>
        <div className="text-xs text-fg-muted">
          {t('Build')} {__BUILD_ID__} · {adapter.kind === 'mock' ? t('Mock orchestrator') : t('Remote config: default')}
        </div>
        <Button size="sm" variant="ghost" className="self-start" onClick={() => void copyDiagnostics()}>
          {t('Copy diagnostics')}
        </Button>
      </Section>
    </Sheet>
  );
}
