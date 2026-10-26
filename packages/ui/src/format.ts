export function formatAge(iso: string, now: number = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return 'unknown';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function shortSha(sha: string | null, length = 8): string {
  if (sha === null) return 'worktree';
  return sha.slice(0, length);
}

export function scopeLabel(
  scope: { baseSha: string; headSha: string | null } | null | undefined,
): string {
  if (scope === null || scope === undefined) return 'no rounds';
  return `${shortSha(scope.baseSha)} → ${shortSha(scope.headSha)}`;
}

export function clampText(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
