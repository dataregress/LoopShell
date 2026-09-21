/**
 * Minimal string table. All user-facing text goes through `t()` so Arabic/RTL
 * is a translation task later, not a rewrite. Keys are the en-GB strings.
 */
const en: Record<string, string> = {};

export type TVars = Record<string, string | number>;

export function t(key: string, vars?: TVars): string {
  let out = en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

/** "3 need you" / "1 needs you" */
export function tNeedYou(count: number): string {
  return count === 1 ? t('1 needs you') : t('{n} need you', { n: count });
}
