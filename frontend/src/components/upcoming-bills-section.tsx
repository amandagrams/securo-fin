import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'

import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { accounts } from '@/lib/api'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { formatCurrency } from '@/lib/format'
import type { UpcomingBillCycle } from '@/types'

interface UpcomingBillsSectionProps {
  accountId: string
  accountType: string
  currency: string
  showPrimary: boolean
  primaryCurrency: string
  locale: string
}

/**
 * Future credit-card cycles that already have installments or charges.
 * The server owns the numbers. This only lists them, and it stays out of
 * the page while they are loading or there is nothing committed.
 */
export function UpcomingBillsSection({
  accountId,
  accountType,
  currency,
  showPrimary,
  primaryCurrency,
  locale,
}: UpcomingBillsSectionProps) {
  const { t, i18n } = useTranslation()
  const { mask } = usePrivacyMode()
  const isCreditCard = accountType === 'credit_card'
  const { data, isLoading } = useQuery({
    queryKey: ['accounts', accountId, 'upcoming-bills'],
    queryFn: () => accounts.upcomingBills(accountId),
    enabled: isCreditCard,
  })

  if (!isCreditCard || isLoading || !data) return null

  const nothingCommitted = data.cycles.every((cycle) => cycle.committed_total === 0)
    && (data.future_committed_total === 0 || data.future_committed_total == null)
  if (nothingCommitted) return null

  const displayCurrency = showPrimary ? primaryCurrency : currency
  const amountOf = (cycle: UpcomingBillCycle) => (
    showPrimary ? cycle.committed_total_primary : cycle.committed_total
  )
  const dateFnsLocale = resolveDateFnsLocale(i18n.language)
  const monthOf = (dueDate: string) => format(
    parseISO(`${dueDate}T00:00:00`),
    'MMM yyyy',
    { locale: dateFnsLocale },
  )

  return (
    <section
      aria-label={t('accounts.upcomingBills')}
      className="bg-card rounded-xl border border-border shadow-sm p-4 mb-6"
    >
      <h2 className="font-semibold text-foreground">{t('accounts.upcomingBills')}</h2>
      <p className="text-sm text-muted-foreground mt-1">{t('accounts.upcomingBillsEstimate')}</p>
      <ul className="mt-3 space-y-2">
        {data.cycles.map((cycle) => (
          <li key={cycle.due_date} className="flex items-baseline justify-between gap-3">
            <span className="text-sm capitalize text-muted-foreground">
              {monthOf(cycle.due_date)}
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {mask(formatCurrency(amountOf(cycle), displayCurrency, locale))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
