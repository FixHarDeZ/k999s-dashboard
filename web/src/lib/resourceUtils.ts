/** Parse CPU string ("100m" → 100 millicores, "1.5" → 1500, "—" → null) */
export function parseMillicores(s: string): number | null {
  if (!s || s === '—') return null
  if (s.endsWith('m')) {
    const v = parseFloat(s)
    return isNaN(v) ? null : v
  }
  const v = parseFloat(s)
  return isNaN(v) ? null : v * 1000
}

/** Parse memory string to MiB ("128Mi" → 128, "1Gi" → 1024, "1024Ki" → 1, "—" → null) */
export function parseMiB(s: string): number | null {
  if (!s || s === '—') return null
  if (s.endsWith('Ki')) return parseFloat(s) / 1024
  if (s.endsWith('Mi')) return parseFloat(s)
  if (s.endsWith('Gi')) return parseFloat(s) * 1024
  if (s.endsWith('Ti')) return parseFloat(s) * 1024 * 1024
  const v = parseFloat(s)
  return isNaN(v) ? null : v / (1024 * 1024)
}

/**
 * Compute usage/total as a percentage string.
 * Returns "—" if either value is unavailable or total is zero.
 */
export function pct(usage: string, total: string, parser: (s: string) => number | null): string {
  const u = parser(usage)
  const t = parser(total)
  if (u === null || t === null || t === 0) return '—'
  return Math.round((u / t) * 100) + '%'
}
