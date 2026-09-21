/**
 * Tiny logger. In the dock, the Tauri adapter can forward these to
 * tauri-plugin-log; in the browser they go to the console. Never log card
 * bodies or free-text replies above debug (docs/shell-architecture.md §7).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

let sink: (level: Level, message: string, data?: Record<string, unknown>) => void = (level, message, data) => {
  const line = `[loop] ${message}`;
  if (data) console[level](line, data);
  else console[level](line);
};

export function setLogSink(next: typeof sink): void {
  sink = next;
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => sink('debug', m, d),
  info: (m: string, d?: Record<string, unknown>) => sink('info', m, d),
  warn: (m: string, d?: Record<string, unknown>) => sink('warn', m, d),
  error: (m: string, d?: Record<string, unknown>) => sink('error', m, d),
};
