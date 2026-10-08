import { beforeEach, describe, expect, it, vi } from 'vitest'
import { format, parseISO } from 'date-fns'
import { useLocation } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'

import { TooltipProvider } from '@/components/ui/tooltip'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { formatCurrency } from '@/lib/format'
import { currentMonth, monthRange, shiftMonth } from '@/lib/month-utils'
import DashboardPage from '@/pages/dashboard'
import { renderWithProviders, i18n } from '@/test/utils'
import type { DashboardSummary, OpenCreditCardBills } from '@/types'

const api = vi.hoisted(() => ({
  dashboard: {
    summary: vi.fn(),
    spendingByCategory: vi.fn(),
    balanceHistory: vi.fn(),
    projectedTransactions: vi.fn(),
    creditCardBills: vi.fn(),
  },
  transactions: { list: vi.fn(), calendar: vi.fn() },
  budgets: { comparison: vi.fn() },
  categories: { list: vi.fn() },
  categoryGroups: { list: vi.fn() },
  accounts: { list: vi.fn() },
  goals: { summary: vi.fn() },
  groups: { list: vi.fn() },
  payees: { list: vi.fn() },
  rules: { create: vi.fn() },
}))

const filter = vi.hoisted(() => ({ activeAccountIds: null as string[] | null }))

vi.mock('@/lib/api', () => api)

vi.mock('@/hooks/use-display-locale', () => ({
  useDisplayLocale: () => 'en-US',
  useDateLocale: () => 'en-US',
}))

vi.mock('@/hooks/use-privacy-mode', () => ({
  usePrivacyMode: () => ({ mask: (value: string) => value, privacyMode: false, MASK: '••••' }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { preferences: { currency_display: 'USD' } } }),
}))

vi.mock('@/contexts/collection-filter-context', () => ({
  useCollectionFilter: () => ({ activeAccountIds: filter.activeAccountIds, activeWalletIds: null }),
}))

const bills: OpenCreditCardBills = {
  items: [
    {
      account_id: 'card-a',
      account_name: 'Alpha',
      masked_number: '1234',
      institution_logo_url: 'https://bank.example/logo.png',
      due_date: '2026-10-15',
      close_date: '2026-10-05',
      status: 'closed',
      amount: 80,
      amount_primary: 100,
      currency: 'EUR',
    },
    {
      account_id: 'card-b',
      account_name: 'Beta',
      masked_number: null,
      institution_logo_url: null,
      due_date: '2026-11-20',
      close_date: '2026-11-18',
      status: 'open',
      amount: 40,
      amount_primary: 40,
      currency: 'USD',
    },
  ],
  total_primary: 140,
  accounts_count: 2,
  earliest_due_date: '2026-10-15',
}

const summary: DashboardSummary = {
  total_balance: { USD: 500 },
  total_balance_primary: 500,
  projected_balance: { USD: 500 },
  projected_balance_primary: 500,
  balance_date: '2026-10-08',
  monthly_income: 0,
  monthly_expenses: 0,
  monthly_income_primary: 0,
  monthly_expenses_primary: 0,
  accounts_count: 0,
  pending_categorization: 0,
  pending_categorization_amount: 0,
  assets_value: {},
  assets_value_primary: 0,
  primary_currency: 'USD',
  pending_shares_net: 0,
}

function DashboardHarness() {
  const { pathname } = useLocation()
  return (
    <>
      <TooltipProvider delayDuration={0}>
        <DashboardPage />
      </TooltipProvider>
      <div data-testid="path">{pathname}</div>
    </>
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  filter.activeAccountIds = null
  await i18n.changeLanguage('en')
  api.dashboard.summary.mockResolvedValue(summary)
  api.dashboard.spendingByCategory.mockResolvedValue([])
  api.dashboard.balanceHistory.mockResolvedValue({ current: [], previous: [] })
  api.dashboard.projectedTransactions.mockResolvedValue([])
  api.dashboard.creditCardBills.mockResolvedValue(bills)
  api.transactions.list.mockResolvedValue({ items: [], total: 0 })
  api.budgets.comparison.mockResolvedValue([])
  api.categories.list.mockResolvedValue([])
  api.categoryGroups.list.mockResolvedValue([])
  api.accounts.list.mockResolvedValue([])
  api.goals.summary.mockResolvedValue([])
  api.groups.list.mockResolvedValue([])
  api.payees.list.mockResolvedValue([])
})

describe('Dashboard open bills', () => {
  it('shows open bills in English with mask, due date, account currency and a link', async () => {
    const { user } = renderWithProviders(<DashboardHarness />)
    const region = await screen.findByRole('region', { name: 'Open bills' })

    expect(await within(region).findByText(formatCurrency(140, 'USD', 'en-US'))).toBeInTheDocument()
    expect(within(region).getByText(`2 cards · due ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`)).toBeInTheDocument()

    const alpha = within(region).getByRole('link', { name: /Alpha/ })
    expect(alpha).toHaveTextContent('•••• 1234')
    expect(alpha).toHaveTextContent(`due ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`)
    expect(alpha).toHaveTextContent(formatCurrency(80, 'EUR', 'en-US'))
    expect(alpha).toHaveAttribute('href', '/accounts/card-a')

    const beta = within(region).getByRole('link', { name: /Beta/ })
    expect(beta).not.toHaveTextContent('••••')
    expect(beta).toHaveTextContent(`due ${format(parseISO('2026-11-20'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`)
    expect(beta).toHaveTextContent(formatCurrency(40, 'USD', 'en-US'))
    expect(beta).toHaveAttribute('href', '/accounts/card-b')

    await user.click(alpha)
    expect(screen.getByTestId('path')).toHaveTextContent('/accounts/card-a')
  })

  it('shows the open bills copy in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    renderWithProviders(<DashboardHarness />)
    const region = await screen.findByRole('region', { name: 'Faturas em aberto' })

    expect(await within(region).findByText(`2 cartões · vence ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('pt-BR') })}`)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /Alpha/ })).toHaveTextContent(`vence ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('pt-BR') })}`)
  })

  it('hides the block when there are no open bills', async () => {
    api.dashboard.creditCardBills.mockResolvedValue({
      items: [],
      total_primary: 0,
      accounts_count: 0,
      earliest_due_date: null,
    })
    renderWithProviders(<DashboardHarness />)
    await screen.findByText(formatCurrency(500, 'USD', 'en-US'))
    expect(screen.queryByRole('region', { name: 'Open bills' })).not.toBeInTheDocument()
    expect(screen.queryByText('Open bills')).not.toBeInTheDocument()
  })

  it('shows neighbor-style skeletons while open bills load', async () => {
    api.dashboard.creditCardBills.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<DashboardHarness />)
    const region = await screen.findByRole('region', { name: 'Open bills' })
    expect(region.querySelectorAll('.h-9.w-40')).toHaveLength(1)
    expect(region.querySelectorAll('.h-12.w-full')).toHaveLength(4)
    expect(within(region).queryByText('Alpha')).not.toBeInTheDocument()
    expect(within(region).queryByRole('link')).not.toBeInTheDocument()
  })

  it('keeps open bills when the dashboard month changes', async () => {
    const { user } = renderWithProviders(<DashboardHarness />)
    await screen.findByRole('region', { name: 'Open bills' })
    expect(api.dashboard.creditCardBills).toHaveBeenCalledTimes(1)
    expect(api.dashboard.creditCardBills).toHaveBeenCalledWith()

    const nextFrom = monthRange(shiftMonth(currentMonth(), 1)).from
    await user.click(screen.getByRole('button', { name: '›' }))
    await waitFor(() => {
      expect(api.dashboard.spendingByCategory).toHaveBeenCalledWith(nextFrom, undefined)
    })

    expect(api.dashboard.creditCardBills).toHaveBeenCalledTimes(1)
    expect(api.dashboard.creditCardBills.mock.calls.every((call) => call.length === 0)).toBe(true)
    expect(screen.getByRole('link', { name: /Alpha/ })).toHaveTextContent(formatCurrency(80, 'EUR', 'en-US'))
    expect(screen.getByRole('link', { name: /Beta/ })).toBeInTheDocument()
  })

  it('recalculates open bill aggregates from the visible accounts', async () => {
    const { rerender } = renderWithProviders(<DashboardHarness />)
    const region = await screen.findByRole('region', { name: 'Open bills' })
    expect(await within(region).findByText(formatCurrency(140, 'USD', 'en-US'))).toBeInTheDocument()

    filter.activeAccountIds = ['card-b']
    rerender(<DashboardHarness />)

    const filtered = await screen.findByRole('region', { name: 'Open bills' })
    expect(within(filtered).queryByRole('link', { name: /Alpha/ })).not.toBeInTheDocument()
    expect(within(filtered).getByRole('link', { name: /Beta/ })).toHaveAttribute('href', '/accounts/card-b')
    expect(within(filtered).queryByText(formatCurrency(140, 'USD', 'en-US'))).not.toBeInTheDocument()
    expect(within(filtered).queryByText(formatCurrency(80, 'EUR', 'en-US'))).not.toBeInTheDocument()
    expect(within(filtered).getAllByText(formatCurrency(40, 'USD', 'en-US')).length).toBeGreaterThan(0)
    expect(within(filtered).getByText(`1 cards · due ${format(parseISO('2026-11-20'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`)).toBeInTheDocument()
  })
})
