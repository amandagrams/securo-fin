import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'

import { useDisplayLocale } from '@/hooks/use-display-locale'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { accounts } from '@/lib/api'
import { utilizationColor } from '@/lib/credit-utilization'
import { localDateString } from '@/lib/date-utils'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { formatCurrency } from '@/lib/format'
import type { Account } from '@/types'

/**
 * Limit, bill state, and future installments on an accounts-list card.
 * Mounted only for an open credit card. The numbers come from the account
 * payload and from the existing upcoming-bills read; nothing here is summed.
 */
export function CreditCardListDetails({ account }: { account: Account }) {
  const { t, i18n } = useTranslation()
  const locale = useDisplayLocale()
  const { mask } = usePrivacyMode()
  const { data, isLoading } = useQuery({
    queryKey: ['accounts', account.id, 'upcoming-bills'],
    queryFn: () => accounts.upcomingBills(account.id),
  })

  const limit = account.credit_limit == null ? null : Number(account.credit_limit)
  const available = account.available_credit == null ? null : Number(account.available_credit)
  const showBar = limit != null && available != null && Number.isFinite(limit) && limit > 0 && Number.isFinite(available)
  const pct = showBar && limit != null && available != null ? ((limit - available) / limit) * 100 : null

  const cycleReady = account.statement_close_day != null
    && account.payment_due_day != null
    && account.next_close_date != null
    && account.next_due_date != null
  const language = i18n.resolvedLanguage ?? i18n.language
  const formatDay = (iso: string) => format(parseISO(`${iso}T00:00:00`), 'dd MMM', {
    locale: resolveDateFnsLocale(language),
  })

  const futureRaw = !isLoading && data ? data.future_committed_total : null
  const future = futureRaw == null ? null : Number(futureRaw)
  const showFuture = future != null && Number.isFinite(future) && future > 0

  return (
    <div className="mt-1 space-y-1">
      {showBar && pct != null && limit != null && available != null && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground">{t('accounts.limitUsed')}</p>
          <div
            role="progressbar"
            aria-label={t('accounts.limitUsed')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(0, pct))}
            className="h-1.5 rounded-full bg-muted/60 overflow-hidden"
          >
            <div
              className={`h-full rounded-full ${utilizationColor(pct)}`}
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
          <p className="text-[10px] tabular-nums text-muted-foreground">
            {t('accounts.limitUsedOf', {
              used: mask(formatCurrency(limit - available, account.currency, locale)),
              limit: mask(formatCurrency(limit, account.currency, locale)),
            })}
          </p>
        </div>
      )}
      {cycleReady && account.next_close_date != null && account.next_due_date != null && (
        <p className="text-[10px] text-muted-foreground">
          {account.next_close_date >= localDateString()
            ? t('accounts.listBillOpen', {
                close: formatDay(account.next_close_date),
                due: formatDay(account.next_due_date),
              })
            : t('accounts.listBillClosed', {
                due: formatDay(account.next_due_date),
              })}
        </p>
      )}
      {showFuture && future != null && (
        <p className="text-[10px] text-muted-foreground">
          {t('accounts.futureInstallments', {
            amount: mask(formatCurrency(future, account.currency, locale)),
          })}
        </p>
      )}
    </div>
  )
}
