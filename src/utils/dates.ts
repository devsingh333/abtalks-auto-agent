/**
 * ISO 8601 UTC date helper functions
 */
export function getUtcIsoString(date = new Date()): string {
  return date.toISOString();
}

export function isOlderThanMinutes(date: Date | string, minutes: number): boolean {
  const targetTime = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const cutoff = Date.now() - minutes * 60 * 1000;
  return targetTime <= cutoff;
}

export function getHoursSince(date: Date | string): number {
  const targetTime = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diffMs = Date.now() - targetTime;
  return diffMs / (1000 * 60 * 60);
}
