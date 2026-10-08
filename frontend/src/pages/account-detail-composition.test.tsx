/**
 * Composição e status da fatura (.checks/fatura-composicao-e-status.md, S2-S3).
 *
 * O bloco lê bill_purchases / bill_refunds do summary. A lista de lançamentos
 * pode somar outra coisa: a tela não monta o Total a partir dela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import AccountDetailPage from '@/pages/account-detail'
import i18n from '@/lib/i18n'
import { renderWithProviders } from '@/test/utils'
import type { Transaction } from '@/types'

const api = vi.hoisted(() => ({
  accounts: {
    get: vi.fn(),
    bills: vi.fn(),
    summary: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    cards: vi.fn(),
  },
  transactions: { list: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  dashboard: { projectedTransactions: vi.fn() },
  categories: { list: vi.fn() },
  categoryGroups: { list: vi.fn() },
}))

const ui = vi.hoisted(() => ({ locale: 'en-US' }))

vi.mock('@/lib/api', () => ({
  accounts: api.accounts,
  transactions: api.transactions,
  dashboard: api.dashboard,
  categories: api.categories,
  categoryGroups: api.categoryGroups,
}))

vi.mock('@/hooks/use-display-locale', () => ({
  useDisplayLocale: () => ui.locale,
  useDateLocale: () => ui.locale,
}))

vi.mock('@/hooks/use-privacy-mode', () => ({
  usePrivacyMode: () => ({ mask: (value: string) => value, privacyMode: false, MASK: '***' }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { preferences: { currency_display: 'BRL' } } }),
}))

vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ canWrite: true }),
}))

const account = {
  id: 'acc-1',
  name: 'Card',
  type: 'credit_card',
  currency: 'BRL',
  balance: -120,
  masked_number: '1234',
  credit_limit: 5000,
  statement_close_day: 30,
  payment_due_day: 10,
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-999',
    user_id: 'u1',
    account_id: 'acc-1',
    category_id: null,
    category: null,
    external_id: null,
    description: 'COMPRA FORA DO SUMMARY',
    original_description: null,
    amount: 999,
    currency: 'BRL',
    date: '2026-09-01',
    type: 'debit',
    source: 'sync',
    status: 'posted',
    payee: null,
    payee_id: null,
    payee_name: null,
    notes: null,
    transfer_pair_id: null,
    amount_primary: null,
    fx_rate_used: null,
    fx_fallback: false,
    installment_number: null,
    total_installments: null,
    installment_total_amount: null,
    installment_purchase_date: null,
    installment_series_id: null,
    bill_id: null,
    effective_bill_date: null,
    recurring_transaction_id: null,
    card_number: null,
    splits: [],
    is_ignored: false,
    ...overrides,
  }
}

function mockSummary(overrides: Record<string, unknown> = {}) {
  api.accounts.summary.mockResolvedValue({
    monthly_income: 0,
    monthly_expenses: 0,
    projected_income: 0,
    projected_expenses: 0,
    bill_purchases: 0,
    bill_refunds: 0,
    bill_purchases_primary: null,
    bill_refunds_primary: null,
    ...overrides,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-09-08T12:00:00'))
  ui.locale = 'en-US'
  await i18n.changeLanguage('en')
  api.accounts.get.mockResolvedValue(account)
  api.accounts.cards.mockResolvedValue([])
  api.accounts.bills.mockResolvedValue([])
  api.accounts.list.mockResolvedValue([account])
  mockSummary()
  api.transactions.list.mockResolvedValue({ items: [], total: 0 })
  api.dashboard.projectedTransactions.mockResolvedValue([])
  api.categories.list.mockResolvedValue([])
  api.categoryGroups.list.mockResolvedValue([])
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

async function renderPage() {
  const rendered = renderWithProviders(<AccountDetailPage />, {
    route: '/accounts/acc-1',
    path: '/accounts/:id',
  })
  await waitFor(() => expect(api.transactions.list).toHaveBeenCalled())
  await screen.findByRole('heading', { name: 'Card' })
  return rendered
}

function compositionBlock() {
  return screen.getByText(i18n.t('accounts.billCompositionTitle')).parentElement!
}

function billTotalCardText() {
  const label = screen.getByText(i18n.t('accounts.cycleBillTotal'))
  return label.closest('div')?.textContent ?? ''
}

/** The cycle header. Matching on the month alone is ambiguous: the timeline
 *  bar for the same cycle carries the same text. */
function cycleHeader() {
  return screen
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-haspopup') === 'dialog' && /\d{4}|-/.test(b.textContent ?? ''))!
}

const pastBills = [
  { id: 'bill-apr', account_id: 'acc-1', external_id: 'a', due_date: '2026-04-10', total_amount: 10, currency: 'BRL', minimum_payment: null },
  { id: 'bill-may', account_id: 'acc-1', external_id: 'b', due_date: '2026-05-10', total_amount: 20, currency: 'BRL', minimum_payment: null },
]

describe('de onde vem esse valor', () => {
  it('shows purchases, refunds, and bill lines that match the bill total', async () => {
    mockSummary({ bill_purchases: 150, bill_refunds: 30, projected_expenses: 120 })
    api.transactions.list.mockResolvedValue({
      items: [makeTx({ amount: 999, description: 'NAO ENTRA NA COMPOSICAO' })],
      total: 1,
    })
    await renderPage()

    const block = compositionBlock().textContent ?? ''
    expect(block).toContain('Where this amount comes from')
    expect(block).toContain('Purchases')
    expect(block).toContain('R$150.00')
    expect(block).toContain('− Refunds')
    expect(block).toContain('R$30.00')
    expect(block).toContain('= Bill')
    expect(block).toContain('R$120.00')
    expect(block).not.toContain('999')
    expect(billTotalCardText()).toContain('R$120.00')
  })

  it('hides the refunds line when bill refunds are zero', async () => {
    mockSummary({ bill_purchases: 80, bill_refunds: 0, projected_expenses: 80 })
    await renderPage()

    const block = compositionBlock().textContent ?? ''
    expect(block).not.toContain('Refunds')
    expect(block).toContain('Purchases')
    expect(block).toContain('= Bill')
    const amounts = block.match(/R\$80\.00/g) ?? []
    expect(amounts).toHaveLength(2)
    expect(billTotalCardText()).toContain('R$80.00')
  })

  it('keeps the composition block at zero for an empty bill in pt-BR', async () => {
    ui.locale = 'pt-BR'
    await i18n.changeLanguage('pt-BR')
    mockSummary({ bill_purchases: 0, bill_refunds: 0, projected_expenses: 0 })
    await renderPage()

    const block = (compositionBlock().textContent ?? '').replace(/\u00a0/g, ' ')
    expect(block).toContain('De onde vem esse valor')
    expect(block).toContain('Compras')
    expect(block).toContain('Fatura')
    expect(block).not.toContain('Estornos')
    expect(block.match(/R\$ 0,00/g)).toHaveLength(2)
  })

  it('follows the currency toggle and keeps the bill line equal to the shown total', async () => {
    api.accounts.get.mockResolvedValue({ ...account, currency: 'USD' })
    mockSummary({
      bill_purchases: 10,
      bill_refunds: 4,
      bill_purchases_primary: 50,
      bill_refunds_primary: 20,
      projected_expenses: 6,
      projected_expenses_primary: 30,
    })
    const { user } = await renderPage()

    const accountCurrency = compositionBlock().textContent ?? ''
    expect(accountCurrency).toContain('$10.00')
    expect(accountCurrency).toContain('$4.00')
    expect(accountCurrency).toContain('$6.00')
    expect(accountCurrency).not.toContain('R$50.00')
    expect(billTotalCardText()).toContain('$6.00')

    await user.click(screen.getByRole('button', { name: 'BRL' }))

    const primary = compositionBlock().textContent ?? ''
    expect(primary).toContain('R$50.00')
    expect(primary).toContain('R$20.00')
    expect(primary).toContain('R$30.00')
    expect(primary).not.toContain('$10.00')
    expect(billTotalCardText()).toContain('R$30.00')
  })

  it('hides the composition block on a non credit card account', async () => {
    api.accounts.get.mockResolvedValue({ ...account, type: 'checking', currency: 'BRL' })
    mockSummary({ bill_purchases: 150, bill_refunds: 30, projected_expenses: 120 })
    await renderPage()

    await screen.findByText(i18n.t('accounts.currentBalance'))
    expect(screen.queryByText('Where this amount comes from')).toBeNull()
    expect(screen.queryByText('De onde vem esse valor')).toBeNull()
  })
})

describe('estado da fatura e valor estimado', () => {
  it('shows the open bill status beside the selector on the in-progress cycle', async () => {
    api.accounts.bills.mockResolvedValue(pastBills)
    await renderPage()

    const sentence = 'Open bill · closes 9/30/2026 · due 10/10/2026'
    expect(screen.getByText(sentence)).toBeTruthy()
    expect(cycleHeader().parentElement?.parentElement?.textContent).toContain(sentence)
    const closeLabel = screen.getByText(i18n.t('accounts.statementCloseDay'))
    expect(closeLabel.parentElement?.textContent).toContain('9/30/2026')
  })

  it('shows closed bill status with due or was due from the anchoring bill', async () => {
    api.accounts.bills.mockResolvedValue([
      { id: 'bill-may', account_id: 'acc-1', external_id: 'b', due_date: '2026-05-10', total_amount: 20, currency: 'BRL', minimum_payment: null },
      { id: 'bill-oct', account_id: 'acc-1', external_id: 'c', due_date: '2026-10-10', total_amount: 40, currency: 'BRL', minimum_payment: null },
    ])
    const { user } = await renderPage()

    expect(screen.getByText('Closed bill · closed 9/30/2026 · due 10/10/2026')).toBeTruthy()

    await user.click(await screen.findByTitle('Previous cycle'))

    expect(await screen.findByText('Closed bill · closed 4/30/2026 · was due 5/10/2026')).toBeTruthy()
  })

  it('shows no bill status without a close day or on a hand-edited window', async () => {
    api.accounts.get.mockResolvedValue({ ...account, statement_close_day: null })
    api.accounts.bills.mockResolvedValue(pastBills)
    const withoutCloseDay = await renderPage()

    expect(screen.queryByText(/Open bill|Closed bill/)).toBeNull()
    withoutCloseDay.unmount()

    api.accounts.get.mockResolvedValue(account)
    const { user } = await renderPage()
    expect(screen.getByText('Open bill · closes 9/30/2026 · due 10/10/2026')).toBeTruthy()

    await user.click(cycleHeader())
    await user.click(await screen.findByRole('button', { name: '9/29/2026' }))
    await user.click(await screen.findByRole('button', { name: '15' }))

    await waitFor(() => {
      expect(screen.queryByText(/Open bill|Closed bill/)).toBeNull()
    })
  })

  it('shows the estimated notice below the total on the in-progress cycle', async () => {
    api.accounts.bills.mockResolvedValue(pastBills)
    mockSummary({ bill_purchases: 120, bill_refunds: 0, projected_expenses: 120 })
    await renderPage()

    const estimate = "Estimated — the bank hasn't closed this bill yet; we add up the charges it has sent"
    const card = billTotalCardText()
    expect(card.indexOf(estimate)).toBeGreaterThan(card.indexOf('R$120.00'))
  })

  it('hides the estimated notice when a bill anchors the cycle', async () => {
    api.accounts.bills.mockResolvedValue([
      { id: 'bill-oct', account_id: 'acc-1', external_id: 'c', due_date: '2026-10-10', total_amount: 40, currency: 'BRL', minimum_payment: null },
    ])
    await renderPage()

    expect(screen.getByText(/Closed bill/)).toBeTruthy()
    expect(screen.queryByText(/Estimated — the bank hasn't closed this bill yet/)).toBeNull()
  })
})
