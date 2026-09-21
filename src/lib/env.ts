/** True when running inside the Tauri webview (either window). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Which window this document is. `anchor.html` sets a body attribute. */
export function windowLabel(): 'anchor' | 'panel' {
  return document.documentElement.dataset.loopWindow === 'anchor' ? 'anchor' : 'panel';
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export const MOCK_BASE_URL = import.meta.env.VITE_MOCK_URL ?? 'http://localhost:8787';
