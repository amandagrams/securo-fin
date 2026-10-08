/**
 * Fatura do cartão por cartão (.checks/fatura-por-cartao.md, S1-S3).
 *
 * Cada lançamento da fatura aberta mostra o cartão que o fez, a fatura se
 * parte por cartão com subtotais que somam o Total da fatura, e a quebra só
 * aparece quando há mais de um balde. As asserções vêm dos critérios da
 * task, nunca do que a página por acaso renderiza.
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
    updateCard: vi.fn(),
  },
  transactions: { list: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  dashboard: { projectedTransactions: vi.fn() },
  categories: { list: vi.fn() },
  categoryGroups: { list: vi.fn() },
}))

const ui = vi.hoisted(() => ({ locale: 'en-US', mobile: false }))

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

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => ui.mobile,
}))

vi.mock('@/hooks/use-privacy-mode', () => ({
  usePrivacyMode: () => ({ mask: (value: string) => value, privacyMode: false, MASK: '***' }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { preferences: { currency_display: 'BRL' } } }),
}))

const workspace = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ canWrite: workspace.canWrite }),
}))

const account = {
  id: 'acc-1',
  name: 'Card',
  type: 'credit_card',
  currency: 'BRL',
  balance: -280,
  masked_number: '1234',
  credit_limit: 5000,
  statement_close_day: 30,
  payment_due_day: 10,
}

let txSeq = 0

function makeTx(overrides: Partial<Transaction>): Transaction {
  txSeq += 1
  return {
    id: `tx-${txSeq}`,
    user_id: 'u1',
    account_id: 'acc-1',
    category_id: null,
    category: null,
    external_id: null,
    description: `TX ${txSeq}`,
    original_description: null,
    amount: 10,
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

/** A fatura do critério 6: subtotais 100.00 / 30.00 / 5.00, Total 135.00. */
function criterion6Bill(): Transaction[] {
  return [
    makeTx({ description: 'MERCADO TITULAR', amount: 100, type: 'debit', card_number: '1234' }),
    makeTx({ description: 'RESTAURANTE DEP', amount: 40, type: 'debit', card_number: '0597' }),
    makeTx({ description: 'ESTORNO LOJA', amount: 10, type: 'credit', card_number: '0597' }),
    makeTx({ description: 'COMPRA IGNORADA', amount: 25, type: 'debit', card_number: '0597', is_ignored: true }),
    makeTx({ description: 'PAGAMENTO FATURA', amount: 80, type: 'credit', transfer_pair_id: 'pair-1' }),
    makeTx({ description: 'COMPRA PENDENTE', amount: 5, type: 'debit', status: 'pending' }),
  ]
}

function mockSummary(overrides: Record<string, unknown> = {}) {
  api.accounts.summary.mockResolvedValue({
    monthly_income: 0,
    monthly_expenses: 0,
    projected_income: 0,
    projected_expenses: 135,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-09-08T12:00:00'))
  ui.locale = 'en-US'
  ui.mobile = false
  txSeq = 0
  workspace.canWrite = true
  api.accounts.get.mockResolvedValue(account)
  api.accounts.cards.mockResolvedValue([])
  api.accounts.updateCard.mockResolvedValue({ card_number: '0597', name: 'Amanda' })
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
  return rendered
}

function groupHeaders() {
  return screen.getAllByTestId('card-group').map((el) => el.textContent ?? '')
}

/** O card de stat "Total da fatura", localizado pelo seu label traduzido. */
function billTotalCard() {
  const label = screen.getByText(i18n.t('accounts.cycleBillTotal'))
  return label.closest('div')?.textContent ?? ''
}

describe('identidade do cartão nas linhas', () => {
  it('shows the card mask on desktop bill rows', async () => {
    api.transactions.list.mockResolvedValue({
      items: [makeTx({ description: 'RESTAURANTE DEP', card_number: '0597' })],
      total: 1,
    })
    await renderPage()

    await screen.findByText('RESTAURANTE DEP')
    expect(screen.getByText('•••• 0597')).toBeTruthy()
  })

  it('shows the card mask on mobile bill rows', async () => {
    ui.mobile = true
    api.transactions.list.mockResolvedValue({
      items: [makeTx({ description: 'RESTAURANTE DEP', card_number: '0597' })],
      total: 1,
    })
    await renderPage()

    await screen.findByText('RESTAURANTE DEP')
    expect(screen.getByText('•••• 0597')).toBeTruthy()
  })

  it('renders no mask when card_number is null', async () => {
    api.transactions.list.mockResolvedValue({
      items: [makeTx({ description: 'SEM METADATA', card_number: null })],
      total: 1,
    })
    await renderPage()

    await screen.findByText('SEM METADATA')
    expect(screen.queryByText(/••••/)).toBeNull()
  })

  it('non credit card account shows no mask and no groups', async () => {
    api.accounts.get.mockResolvedValue({ ...account, type: 'checking', balance: 1000 })
    api.transactions.list.mockResolvedValue({
      items: [
        makeTx({ description: 'COMPRA A', card_number: '0597' }),
        makeTx({ description: 'COMPRA B', card_number: '1234' }),
      ],
      total: 2,
    })
    await renderPage()

    await screen.findByText('COMPRA A')
    expect(screen.queryByText(/••••/)).toBeNull()
    expect(screen.queryAllByTestId('card-group')).toEqual([])
  })
})

describe('fatura por cartão', () => {
  it('groups the bill by card with subtotals that sum to the bill total in pt-BR', async () => {
    ui.locale = 'pt-BR'
    await i18n.changeLanguage('pt-BR')
    api.transactions.list.mockResolvedValue({ items: criterion6Bill(), total: 6 })
    await renderPage()

    await screen.findByText('MERCADO TITULAR')
    const headers = groupHeaders()
    expect(headers).toHaveLength(3)
    expect(headers[0]).toContain('•••• 1234')
    expect(headers[0]).toMatch(/100,00/)
    expect(headers[1]).toContain('•••• 0597')
    expect(headers[1]).toMatch(/30,00/)
    expect(headers[2]).toContain('Sem cartão')
    expect(headers[2]).toMatch(/5,00/)
    // A soma 135.00 é o Total da fatura mostrado na tela (projected_expenses).
    expect(billTotalCard()).toMatch(/135,00/)
  })

  it('titles the no-card group in English', async () => {
    api.transactions.list.mockResolvedValue({ items: criterion6Bill(), total: 6 })
    await renderPage()

    await screen.findByText('MERCADO TITULAR')
    const headers = groupHeaders()
    expect(headers[2]).toContain('No card')
  })

  it('keeps ignored and paired rows in the list but out of the subtotals', async () => {
    ui.locale = 'pt-BR'
    await i18n.changeLanguage('pt-BR')
    api.transactions.list.mockResolvedValue({ items: criterion6Bill(), total: 6 })
    await renderPage()

    // Seguem na lista…
    await screen.findByText('COMPRA IGNORADA')
    expect(screen.getByText('PAGAMENTO FATURA')).toBeTruthy()
    // …no grupo do seu card_number ou em Sem cartão…
    const groups = screen.getAllByTestId('card-group')
    const rowsAfter = (header: HTMLElement) => {
      const texts: string[] = []
      let el = header.nextElementSibling
      while (el && el.getAttribute('data-testid') !== 'card-group') {
        texts.push(el.textContent ?? '')
        el = el.nextElementSibling
      }
      return texts.join(' ')
    }
    expect(rowsAfter(groups[1])).toContain('COMPRA IGNORADA')
    expect(rowsAfter(groups[2])).toContain('PAGAMENTO FATURA')
    // …e fora dos subtotais.
    expect(groups[1].textContent).toMatch(/30,00/)
    expect(groups[2].textContent).toMatch(/5,00/)
  })

  it('orders groups with the account card first then lexicographic then no card', async () => {
    api.transactions.list.mockResolvedValue({
      items: [
        makeTx({ description: 'MAIS NOVA', amount: 1, card_number: '1234', date: '2026-09-10' }),
        makeTx({ description: 'MAIS ANTIGA', amount: 2, card_number: '1234', date: '2026-09-01' }),
        makeTx({ amount: 3, card_number: '0597' }),
        makeTx({ amount: 4, card_number: '0444' }),
        makeTx({ amount: 5, card_number: null }),
      ],
      total: 5,
    })
    await renderPage()

    await waitFor(() => expect(screen.getAllByTestId('card-group')).toHaveLength(4))
    const headers = groupHeaders()
    expect(headers[0]).toContain('•••• 1234')
    expect(headers[1]).toContain('•••• 0444')
    expect(headers[2]).toContain('•••• 0597')
    expect(headers[3]).toContain('No card')
    // Critério 7: dentro do grupo, a ordem relativa é a da lista da fatura
    // (mais recente primeiro no grupo da conta).
    const table = document.querySelector('tbody')?.textContent ?? ''
    expect(table.indexOf('MAIS NOVA')).toBeLessThan(table.indexOf('MAIS ANTIGA'))
  })

  it('starts at lexicographic order when masked_number is null', async () => {
    api.accounts.get.mockResolvedValue({ ...account, masked_number: null })
    api.transactions.list.mockResolvedValue({
      items: [
        makeTx({ amount: 1, card_number: '1234' }),
        makeTx({ amount: 2, card_number: '0597' }),
        makeTx({ amount: 3, card_number: '0444' }),
      ],
      total: 3,
    })
    await renderPage()

    await waitFor(() => expect(screen.getAllByTestId('card-group')).toHaveLength(3))
    const headers = groupHeaders()
    expect(headers[0]).toContain('•••• 0444')
    expect(headers[1]).toContain('•••• 0597')
    expect(headers[2]).toContain('•••• 1234')
  })

  it('renders a flat list when the bill has zero or one bucket', async () => {
    // Um único card_number: sem quebra.
    api.transactions.list.mockResolvedValue({
      items: [
        makeTx({ description: 'COMPRA A', card_number: '0597' }),
        makeTx({ description: 'COMPRA B', card_number: '0597' }),
      ],
      total: 2,
    })
    const first = await renderPage()
    await screen.findByText('COMPRA A')
    expect(screen.queryAllByTestId('card-group')).toEqual([])
    first.unmount()

    // Só lançamentos sem cartão: também sem quebra.
    api.transactions.list.mockResolvedValue({
      items: [
        makeTx({ description: 'COMPRA C', card_number: null }),
        makeTx({ description: 'COMPRA D', card_number: null }),
      ],
      total: 2,
    })
    await renderPage()
    await screen.findByText('COMPRA C')
    expect(screen.queryAllByTestId('card-group')).toEqual([])
  })

  it('keeps the existing empty state copy in both languages', async () => {
    ui.locale = 'pt-BR'
    await i18n.changeLanguage('pt-BR')
    const first = await renderPage()
    await screen.findByText('Nenhuma transação para esta conta')
    first.unmount()

    ui.locale = 'en-US'
    await i18n.changeLanguage('en')
    await renderPage()
    await screen.findByText('No transactions for this account')
  })

  it("does not leak another bill's rows into the visible bill's groups", async () => {
    const bills = [
      { id: 'bill-apr', account_id: 'acc-1', external_id: 'a', due_date: '2026-04-10', total_amount: 125, currency: 'BRL', minimum_payment: null },
      { id: 'bill-may', account_id: 'acc-1', external_id: 'b', due_date: '2026-05-10', total_amount: 280, currency: 'BRL', minimum_payment: null },
    ]
    api.accounts.bills.mockResolvedValue(bills)
    api.transactions.list.mockImplementation(async (args: { bill_id?: string }) => {
      if (args.bill_id === 'bill-may') {
        return {
          items: [
            makeTx({ description: 'GASTO FATURA A', amount: 40, card_number: '0597' }),
            makeTx({ description: 'GASTO TITULAR A', amount: 60, card_number: '1234' }),
          ],
          total: 2,
        }
      }
      return { items: [], total: 0 }
    })

    const { user } = await renderPage()

    // Fatura A (bill-may) mostra os grupos dela…
    await user.click(await screen.findByTitle(i18n.t('accounts.previousCycle')))
    await screen.findByText('GASTO FATURA A')
    expect(screen.getAllByTestId('card-group').length).toBeGreaterThan(0)

    // …e a fatura B (bill-apr) não herda lançamento nem grupo.
    await user.click(screen.getByTitle(i18n.t('accounts.previousCycle')))
    await waitFor(() => expect(screen.queryByText('GASTO FATURA A')).toBeNull())
    expect(screen.queryAllByTestId('card-group')).toEqual([])
    expect(screen.queryByText('•••• 0597')).toBeNull()
  })

  it('shows the five skeletons and no groups while loading', async () => {
    api.transactions.list.mockImplementation(() => new Promise(() => {}))
    renderWithProviders(<AccountDetailPage />, {
      route: '/accounts/acc-1',
      path: '/accounts/:id',
    })

    await waitFor(() => {
      const skeletons = [...document.querySelectorAll('[data-slot="skeleton"]')]
        .filter((el) => el.classList.contains('h-10'))
      expect(skeletons).toHaveLength(5)
    })
    expect(screen.queryAllByTestId('card-group')).toEqual([])
  })

  it('subtotals cover rows beyond the 500 row page limit', async () => {
    mockSummary({ projected_expenses: 501 })
    const page1 = Array.from({ length: 500 }, () =>
      makeTx({ amount: 1, card_number: '1234' }),
    )
    const page2 = [makeTx({ amount: 1, card_number: '0597' })]
    api.transactions.list.mockImplementation(async (args: { page?: number }) =>
      args.page === 2 ? { items: page2, total: 501 } : { items: page1, total: 501 },
    )
    await renderPage()

    await waitFor(() => expect(screen.getAllByTestId('card-group')).toHaveLength(2))
    const headers = groupHeaders()
    expect(headers[0]).toContain('•••• 1234')
    expect(headers[0]).toMatch(/500\.00/)
    expect(headers[1]).toContain('•••• 0597')
    expect(headers[1]).toMatch(/1\.00/)
    expect(billTotalCard()).toMatch(/501\.00/)
  }, 30000)

  it('subtotals follow the foreign currency toggle and still sum to the shown total', async () => {
    api.accounts.get.mockResolvedValue({ ...account, currency: 'USD' })
    mockSummary({ projected_expenses: 15, projected_expenses_primary: 75 })
    api.transactions.list.mockResolvedValue({
      items: [
        makeTx({ amount: 10, currency: 'USD', amount_primary: 50, card_number: '1234' }),
        makeTx({ amount: 5, currency: 'USD', amount_primary: 25, card_number: '0597' }),
      ],
      total: 2,
    })
    const { user } = await renderPage()

    // Seletor na moeda da conta: subtotais em USD somando o Total (15).
    await waitFor(() => expect(screen.getAllByTestId('card-group')).toHaveLength(2))
    let headers = groupHeaders()
    expect(headers[0]).toMatch(/10\.00/)
    expect(headers[1]).toMatch(/5\.00/)
    expect(billTotalCard()).toMatch(/15\.00/)

    // Seletor na primária: subtotais em BRL cuja soma é o Total mostrado (75).
    await user.click(screen.getByRole('button', { name: 'BRL' }))
    await waitFor(() => {
      headers = groupHeaders()
      expect(headers[0]).toMatch(/50\.00/)
    })
    expect(headers[1]).toMatch(/25\.00/)
    expect(billTotalCard()).toMatch(/75\.00/)
  })
})

describe('nome do cartão', () => {
  async function openCcSettings(user: ReturnType<typeof renderWithProviders>['user']) {
    await user.click(await screen.findByTitle('Edit'))
    await screen.findByRole('dialog')
  }

  it('shows the card name in the group title but not on the rows', async () => {
    api.accounts.cards.mockResolvedValue([
      { card_number: '1234', name: null },
      { card_number: '0597', name: 'Amanda' },
    ])
    api.transactions.list.mockResolvedValue({ items: criterion6Bill(), total: 6 })
    await renderPage()

    await screen.findByText('MERCADO TITULAR')
    const headers = groupHeaders()
    expect(headers[1]).toContain('Amanda')
    expect(headers[1]).toContain('•••• 0597')
    expect(screen.getByText('RESTAURANTE DEP').closest('tr')?.textContent).toContain('•••• 0597')
    expect(screen.getByText('RESTAURANTE DEP').closest('tr')?.textContent).not.toContain('Amanda')
  })

  it('falls back to the mask when the card has no name', async () => {
    api.accounts.cards.mockResolvedValue([
      { card_number: '1234', name: null },
      { card_number: '0597', name: null },
    ])
    api.transactions.list.mockResolvedValue({ items: criterion6Bill(), total: 6 })
    await renderPage()

    await screen.findByText('MERCADO TITULAR')
    const headers = groupHeaders()
    expect(headers[1]).toContain('•••• 0597')
    expect(headers[1]).not.toContain('Amanda')
  })

  it('hides the name fields without write permission', async () => {
    workspace.canWrite = false
    api.accounts.cards.mockResolvedValue([{ card_number: '0597', name: 'Amanda' }])
    await renderPage()

    await screen.findByText('Transactions')
    expect(screen.queryByTestId('card-name-input')).toBeNull()
    expect(screen.queryByTitle('Edit')).toBeNull()
  })

  it('shows no name fields while the card list loads', async () => {
    let resolveCards!: (value: { card_number: string; name: string | null }[]) => void
    api.accounts.cards.mockImplementation(
      () => new Promise((resolve) => { resolveCards = resolve }),
    )
    const { user } = await renderPage()
    await openCcSettings(user)

    expect(screen.queryByTestId('card-name-input')).toBeNull()
    resolveCards([{ card_number: '0597', name: null }])
    await waitFor(() => expect(screen.getByTestId('card-name-input')).toBeTruthy())
  })

  it('says no card was seen yet when the account has none', async () => {
    api.accounts.cards.mockResolvedValue([])
    const { user } = await renderPage()
    await openCcSettings(user)

    await screen.findByText('No card has been seen on this account yet.')
    expect(screen.queryByTestId('card-name-input')).toBeNull()
  })
})