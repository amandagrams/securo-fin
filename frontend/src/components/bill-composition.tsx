import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'

import { closeDateForBill } from '@/lib/credit-card-cycle'

/**
 * Where a credit-card bill total comes from, and whether that bill is still
 * open. The page only places these; the numbers are the summary fields, never
 * a sum of the transaction list.
 */

export function BillComposition({
  purchases,
  refunds,
  formatAmount,
}: {
  purchases: number
  refunds: number
  formatAmount: (amount: number) => string
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-5 mb-6">
      <p className="text-sm font-medium text-foreground mb-3">
        {t('accounts.billCompositionTitle')}
      </p>
      <div className="space-y-1.5 text-sm">
        <p className="flex items-baseline justify-between gap-3">
          <span>{t('accounts.billPurchases')}</span>
          <span className="font-medium tabular-nums">{formatAmount(purchases)}</span>
        </p>
        {refunds > 0 && (
          <p className="flex items-baseline justify-between gap-3">
            <span>− {t('accounts.billRefunds')}</span>
            <span className="font-medium tabular-nums">{formatAmount(refunds)}</span>
          </p>
        )}
        <p className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
          <span>= {t('accounts.billTotalLine')}</span>
          <span className="font-semibold tabular-nums">{formatAmount(purchases - refunds)}</span>
        </p>
      </div>
    </div>
  )
}

export type BillCycleStatusVariant = 'open' | 'closed-due' | 'closed-was-due'

/** Open only on the in-progress cycle window; closed only when a bill anchors
 * it. A hand-edited range and a card with no close day get nothing — there is
 * no copy for a past cycle-math window that no bill anchors. */
// Not a component: the page calls this to decide whether to render one.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveBillCycleStatus(input: {
  statementCloseDay: number | null | undefined
  isInProgressCycle: boolean
  isCycleMathWindow: boolean
  activeBillDueDate: string | null
  filterTo: string
  dueDate: string | null
  today: string
}): { variant: BillCycleStatusVariant; closeDate: string; dueDate: string } | null {
  if (!input.statementCloseDay || !input.dueDate) return null
  if (input.activeBillDueDate) {
    return {
      variant: input.dueDate >= input.today ? 'closed-due' : 'closed-was-due',
      closeDate: closeDateForBill(input.activeBillDueDate, input.statementCloseDay),
      dueDate: input.dueDate,
    }
  }
  if (input.isInProgressCycle && input.isCycleMathWindow && input.filterTo) {
    return {
      variant: 'open',
      closeDate: format(addDays(parseISO(input.filterTo), 1), 'yyyy-MM-dd'),
      dueDate: input.dueDate,
    }
  }
  return null
}

function formatStatusDate(dateStr: string, dateLocale: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(dateLocale)
}

export function BillCycleStatus({
  variant,
  closeDate,
  dueDate,
  dateLocale,
}: {
  variant: BillCycleStatusVariant
  closeDate: string
  dueDate: string
  dateLocale: string
}) {
  const { t } = useTranslation()
  const close = formatStatusDate(closeDate, dateLocale)
  const due = formatStatusDate(dueDate, dateLocale)
  const key = variant === 'open'
    ? 'accounts.billOpen'
    : variant === 'closed-due'
      ? 'accounts.billClosedDue'
      : 'accounts.billClosedWasDue'
  return (
    <p className="text-sm text-muted-foreground">
      {t(key, { close, due })}
    </p>
  )
}

export function BillEstimateNotice() {
  const { t } = useTranslation()
  return (
    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
      {t('accounts.billEstimated')}
    </p>
  )
}
