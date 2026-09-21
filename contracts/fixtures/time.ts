/** Time helpers for fixtures. Fixtures are relative to load time so TTLs read naturally. */
export const NOW = Date.now();

export function minutesAgo(n: number): string {
  return new Date(NOW - n * 60_000).toISOString();
}

export function minutesFromNow(n: number): string {
  return new Date(NOW + n * 60_000).toISOString();
}

export function hoursAgo(n: number): string {
  return minutesAgo(n * 60);
}

export function daysAgo(n: number, atHour = 10, atMinute = 15): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(atHour, atMinute, 0, 0);
  return d.toISOString();
}
