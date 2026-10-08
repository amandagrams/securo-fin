import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useCollectionFilter } from '@/contexts/collection-filter-context'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { formatAccountMask } from '@/lib/account-utils'
import { dashboard } from '@/lib/api'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { formatCurrency } from '@/lib/format'
import type { OpenCreditCardBill } from '@/types'

function formatDue(iso: string, language: string): string {
  return format(parseISO(iso), 'dd MMM', { locale: resolveDateFnsLocale(language) })
}

/**
 * Open credit-card bills. The month selector does not apply: the list is the
 * state of today, and a collection filter only hides rows already returned.
 */
export function OpenBillsCard({ primaryCurrency }: { primaryCurrency: string }) {
  const { t, i18n } = useTranslation()
  const locale = useDisplayLocale()
  const { mask } = usePrivacyMode()
  const { activeAccountIds } = useCollectionFilter()
  const language = i18n.resolvedLanguage ?? i18n.language

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'credit-card-bills'],
    queryFn: () => dashboard.creditCardBills(),
  })

  const visible = useMemo(() => {
    const items = data?.items ?? []
    if (activeAccountIds === null) return items
    return items.filter((item) => activeAccountIds.includes(item.account_id))
  }, [data, activeAccountIds])

  if (isLoading) {
    return (
      <section
        aria-label={t('dashboard.openBills')}
        className="bg-card rounded-xl border border-border shadow-sm mb-5"
      >
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">{t('dashboard.openBills')}</p>
          <Skeleton className="h-9 w-40 mt-2" />
        </div>
        <div className="space-y-3 p-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </section>
    )
  }

  if (visible.length === 0) return null

  const totalPrimary = visible.reduce((sum, item) => sum + Number(item.amount_primary), 0)
  const earliest = visible.reduce<string>(
    (min, item) => (item.due_date < min ? item.due_date : min),
    visible[0].due_date,
  )

  return (
    <section
      aria-label={t('dashboard.openBills')}
      className="bg-card rounded-xl border border-border shadow-sm mb-5"
    >
      <div className="px-5 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">{t('dashboard.openBills')}</p>
        <p className="text-3xl font-bold tabular-nums text-foreground mt-1">
          {mask(formatCurrency(totalPrimary, primaryCurrency, locale))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('dashboard.openBillsSubtitle', {
            count: visible.length,
            date: formatDue(earliest, language),
          })}
        </p>
      </div>
      <div className="divide-y divide-border">
        {visible.map((item) => (
          <OpenBillRow key={item.account_id} item={item} language={language} locale={locale} mask={mask} />
        ))}
      </div>
    </section>
  )
}

function OpenBillRow({
  item,
  language,
  locale,
  mask,
}: {
  item: OpenCreditCardBill
  language: string
  locale: string
  mask: (value: string) => string
}) {
  const { t } = useTranslation()
  const cardMask = formatAccountMask(item)
  return (
    <Link
      to={`/accounts/${item.account_id}`}
      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{item.account_name}</span>
          {cardMask && (
            <span className="text-xs text-muted-foreground shrink-0">{cardMask}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('dashboard.openBillsDue', { date: formatDue(item.due_date, language) })}
        </p>
      </div>
      <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
        {mask(formatCurrency(Number(item.amount), item.currency, locale))}
      </span>
    </Link>
  )
}
