import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'

import { CategoryIcon } from '@/components/category-icon'
import { MonthStepper } from '@/components/month-stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { dashboard } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { currentMonth, monthRange } from '@/lib/month-utils'
import type { CategoryFlowItem } from '@/types'

interface CategoryMonthFlowsProps {
  canWrite: boolean
  onCreateCategory: () => void
}

function flowHref(item: CategoryFlowItem, kind: 'debit' | 'credit', from: string, to: string) {
  const params = new URLSearchParams()
  if (item.category_id) params.set('category_id', item.category_id)
  else params.set('uncategorized', '1')
  params.set('from', from)
  params.set('to', to)
  params.set('type', kind)
  return `/transactions?${params.toString()}`
}

export function CategoryMonthFlows({ canWrite, onCreateCategory }: CategoryMonthFlowsProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const locale = useDisplayLocale()
  const currency = user?.preferences?.currency_display ?? 'USD'
  const [month, setMonth] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const { from, to } = monthRange(month)

  const { data, isPending } = useQuery({
    queryKey: ['dashboard', 'category-flows', from],
    queryFn: () => dashboard.categoryFlows(from),
  })

  const labelOf = (item: CategoryFlowItem) =>
    item.category_id ? item.category_name : t('categories.uncategorized')

  const visible = (items: CategoryFlowItem[]) => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return items
    return items.filter((item) => labelOf(item).toLocaleLowerCase().includes(query))
  }

  return (
    <div className="mb-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper
          value={month}
          onChange={setMonth}
          locale={i18n.language}
          prevLabel={t('categories.previousMonth')}
          nextLabel={t('categories.nextMonth')}
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('categories.flowSearch')}
          placeholder={t('categories.flowSearch')}
          className="h-8 w-full sm:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Link to="/rules" className="text-sm font-medium text-foreground hover:text-primary">
            {t('categories.automaticRules')}
          </Link>
          {canWrite && (
            <Button type="button" size="sm" className="h-8 gap-1.5" onClick={onCreateCategory}>
              <Plus size={13} />
              {t('categories.newCategoryAction')}
            </Button>
          )}
        </div>
      </div>

      <FlowSection
        title={t('categories.monthOutflows')}
        items={data?.outflows ?? []}
        kind="debit"
        from={from}
        to={to}
        loading={isPending}
        searching={search.trim().length > 0}
        visible={visible}
        labelOf={labelOf}
        emptyLabel={t('categories.noOutflows')}
        currency={currency}
        locale={locale}
        notFoundLabel={t('categories.noCategoryFound')}
      />
      <FlowSection
        title={t('categories.monthInflows')}
        items={data?.inflows ?? []}
        kind="credit"
        from={from}
        to={to}
        loading={isPending}
        searching={search.trim().length > 0}
        visible={visible}
        labelOf={labelOf}
        emptyLabel={t('categories.noInflows')}
        currency={currency}
        locale={locale}
        notFoundLabel={t('categories.noCategoryFound')}
      />
    </div>
  )
}

function FlowSection({
  title,
  items,
  kind,
  from,
  to,
  loading,
  searching,
  visible,
  labelOf,
  emptyLabel,
  notFoundLabel,
  currency,
  locale,
}: {
  title: string
  items: CategoryFlowItem[]
  kind: 'debit' | 'credit'
  from: string
  to: string
  loading: boolean
  searching: boolean
  visible: (items: CategoryFlowItem[]) => CategoryFlowItem[]
  labelOf: (item: CategoryFlowItem) => string
  emptyLabel: string
  notFoundLabel: string
  currency: string
  locale: string
}) {
  const rows = visible(items)
  return (
    <section aria-label={title} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 sm:px-5 py-8 text-center text-sm text-muted-foreground">
          {searching ? notFoundLabel : emptyLabel}
        </p>
      ) : (
        <div>
          {rows.map((item) => (
            <Link
              key={item.category_id ?? 'uncategorized'}
              to={flowHref(item, kind, from, to)}
              className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-border last:border-0 hover:bg-muted transition-colors"
            >
              <CategoryIcon icon={item.category_icon} color={item.category_color} size="md" />
              <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                {labelOf(item)}
              </span>
              <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                {formatCurrency(item.total, currency, locale)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
