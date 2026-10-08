/** Limit-bar bands shared by the account page and the accounts list.
 *  `pct` is a 0–100 ratio and may fall outside that range: green below 30,
 *  blue from 30, amber from 70, rose from 90. */
export function utilizationColor(pct: number): string {
  if (pct >= 90) return 'bg-rose-500'
  if (pct >= 70) return 'bg-amber-400'
  if (pct >= 30) return 'bg-blue-500'
  return 'bg-emerald-500'
}
