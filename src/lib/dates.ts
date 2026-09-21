import { t } from './i18n';

const LOCALE = 'en-GB';

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** "Today", "Yesterday", "Mon 15 Sep", or "15 Sep 2025" for other years. */
export function formatDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return t('Today');
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return t('Yesterday');
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Key for grouping rows by calendar day. */
export function dayKey(iso: string): string {
  return startOfDay(new Date(iso)).toISOString();
}

/** Recent row time: HH:MM today, otherwise a short date. */
export function formatRowTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return formatClock(iso);
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short' });
}

export interface Ttl {
  label: string;
  /** Under one hour. */
  urgent: boolean;
  expired: boolean;
  msLeft: number;
}

/** "2 h", "14:59" under one hour, "Expired". */
export function formatTtl(expiresAt: string, now = Date.now()): Ttl {
  const msLeft = Date.parse(expiresAt) - now;
  if (msLeft <= 0) return { label: t('Expired'), urgent: false, expired: true, msLeft };
  const totalSec = Math.floor(msLeft / 1000);
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return { label: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, urgent: true, expired: false, msLeft };
  }
  const h = Math.floor(totalSec / 3600);
  if (h < 48) return { label: t('{n} h', { n: h }), urgent: false, expired: false, msLeft };
  return { label: t('{n} d', { n: Math.floor(h / 24) }), urgent: false, expired: false, msLeft };
}

/** "Paused until 14:32" */
export function formatUntil(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
