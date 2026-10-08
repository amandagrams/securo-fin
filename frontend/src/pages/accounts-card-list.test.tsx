/**
 * Cartão na lista de Contas (.checks/cartao-na-lista-de-contas.md, S1).
 *
 * A lista mostra limite usado, estado da fatura e parcelas futuras. Os
 * números vêm do payload e de upcoming-bills; o teste não calcula fatura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'

import { utilizationColor } from '@/lib/credit-utilization'
import { formatCurrency } from '@/lib/format'
import i18n from '@/lib/i18n'
import AccountsPage from '@/pages/accounts'
import { renderWithProviders } from '@/test/utils'
import type { Account, BankConnection, UpcomingBills } from '@/types'

const api = vi.hoisted(() => ({
  accounts: {
    list: vi.fn(),
    upcomingBills: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
  },
  connections: {
    list: vi.fn(),
    getProviders: vi.fn(),
    sync: vi.fn(),
    delete: vi.fn(),
  },
  currencies: { list: vi.fn() },
}))

const display = vi.hoisted(() => ({ locale: 'pt-BR' }))

vi.mock('@/lib/api', () => ({
  accounts: api.accounts,
  connections: api.connections,
  currencies: api.currencies,
}))

vi.mock('@/hooks/use-display-locale', () => ({
  useDisplayLocale: () => display.locale,
  useDateLocale: () => display.locale,
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

vi.mock('@/contexts/collection-filter-context', () => ({
  useCollectionFilter: () => ({ activeAccountIds: null }),
}))

function account(overrides: Partial<Account> & Pick<Account, 'id' | 'name' | 'type'>): Account {
  return {
    user_id: 'u1',
    connection_id: null,
    external_id: null,
    display_name: null,
    masked_number: null,
    institution_name: null,
    institution_logo_url: null,
    balance: 0,
    current_balance: 10,
    previous_balance: null,
    balance_primary: null,
    currency: 'BRL',
    credit_limit: null,
    available_credit: null,
    statement_close_day: null,
    payment_due_day: null,
    payment_account_id: null,
    next_close_date: null,
    next_due_date: null,
    minimum_payment: null,
    card_brand: null,
    card_level: null,
    shared_balance_group: null,
    is_closed: false,
    closed_at: null,
    ...overrides,
  }
}

function connection(): BankConnection {
  return {
    id: 'conn-1',
    user_id: 'u1',
    provider: 'pluggy',
    institution_name: 'Banco',
    display_name: null,
    logo_url: null,
    external_id: 'ext-1',
    status: 'active',
    settings: null,
    last_sync_at: null,
    created_at: '2026-01-01T00:00:00Z',
    institutions: [],
  }
}

function bills(total: number | null): UpcomingBills {
  return {
    cycles: [],
    future_committed_total: total,
    future_committed_total_primary: total,
  }
}

function usedPct(limit: number, available: number) {
  return ((limit - available) / limit) * 100
}

function barWidth(limit: number, available: number) {
  const pct = usedPct(limit, available)
  return `${Math.min(100, Math.max(0, pct))}%`
}

function compact(value: string | null | undefined) {
  return (value ?? '').replace(/\s/g, '')
}

function futureLine(total: number, currency = 'BRL') {
  return i18n.t('accounts.futureInstallments', {
    amount: formatCurrency(total, currency, display.locale),
  })
}

function limitLine(used: number, limit: number, currency = 'BRL') {
  return i18n.t('accounts.limitUsedOf', {
    used: formatCurrency(used, currency, display.locale),
    limit: formatCurrency(limit, currency, display.locale),
  })
}

function renderList(open: Account[], closed: Account[] = [], connections: BankConnection[] = []) {
  api.accounts.list.mockImplementation(async (includeClosed = false) => (includeClosed ? closed : open))
  api.connections.list.mockResolvedValue(connections)
  return renderWithProviders(<AccountsPage />)
}

function linkOf(name: RegExp) {
  return screen.getByRole('link', { name })
}

function nodeWithText(root: ParentNode, expected: string): HTMLElement {
  const found = [...root.querySelectorAll('p')].find((el) => el.textContent === expected)
  expect(found, expected).toBeTruthy()
  return found as HTMLElement
}

function barFill(link: HTMLElement): HTMLElement {
  const fill = within(link).getByRole('progressbar').firstElementChild
  if (!(fill instanceof HTMLElement)) throw new Error('missing limit fill')
  return fill
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0))
  vi.clearAllMocks()
  display.locale = 'pt-BR'
  await i18n.changeLanguage('pt-BR')
  api.accounts.list.mockResolvedValue([])
  api.accounts.upcomingBills.mockResolvedValue(bills(0))
  api.connections.list.mockResolvedValue([])
  api.connections.getProviders.mockResolvedValue([])
  api.currencies.list.mockResolvedValue([])
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

describe('cartão na lista de contas', () => {
  it('shows the used limit bar with pt-BR amounts on a manual card', async () => {
    const limit = 50000
    const available = 29128.52
    renderList([
      account({
        id: 'card-1',
        name: 'Nubank',
        type: 'credit_card',
        credit_limit: limit,
        available_credit: available,
      }),
    ])

    const link = await screen.findByRole('link', { name: /Nubank/ })
    expect(within(link).getByText('Limite usado')).toBeTruthy()
    const amounts = [...link.querySelectorAll('p')].find((node) => node.textContent === limitLine(limit - available, limit))
    expect(amounts?.textContent).toBe(limitLine(20871.48, limit))
    expect(compact(amounts?.textContent)).toBe(compact('R$ 20.871,48 de R$ 50.000,00'))

    const pct = usedPct(limit, available)
    const fill = barFill(link)
    expect(fill.style.width).toBe(barWidth(limit, available))
    expect(fill.classList.contains('bg-blue-500')).toBe(true)
    expect(fill.classList.contains(utilizationColor(pct))).toBe(true)
  })

  it('labels the used limit bar in English', async () => {
    await i18n.changeLanguage('en')
    renderList([
      account({
        id: 'card-1',
        name: 'Nubank',
        type: 'credit_card',
        credit_limit: 50000,
        available_credit: 29128.52,
      }),
    ])

    const link = await screen.findByRole('link', { name: /Nubank/ })
    expect(within(link).getByText('Limit used')).toBeTruthy()
  })

  it('colors the used limit bar with the account page bands', async () => {
    const bands = [
      { name: 'Band 20', limit: 100, available: 80, color: 'bg-emerald-500' },
      { name: 'Band 29.99', limit: 10000, available: 7001, color: 'bg-emerald-500' },
      { name: 'Band 30', limit: 100, available: 70, color: 'bg-blue-500' },
      { name: 'Band 69.99', limit: 10000, available: 3001, color: 'bg-blue-500' },
      { name: 'Band 70', limit: 100, available: 30, color: 'bg-amber-400' },
      { name: 'Band 89.99', limit: 10000, available: 1001, color: 'bg-amber-400' },
      { name: 'Band 90', limit: 100, available: 10, color: 'bg-rose-500' },
      { name: 'Band 100', limit: 100, available: 0, color: 'bg-rose-500' },
    ]
    renderList(bands.map((band, index) => account({
      id: `band-${index}`,
      name: band.name,
      type: 'credit_card',
      credit_limit: band.limit,
      available_credit: band.available,
    })))

    expect(await screen.findByRole('link', { name: /Band 20/ })).toBeTruthy()
    for (const band of bands) {
      const pct = usedPct(band.limit, band.available)
      const fill = barFill(linkOf(new RegExp(band.name)))
      expect(utilizationColor(pct)).toBe(band.color)
      expect(fill.classList.contains(band.color)).toBe(true)
      expect(fill.style.width).toBe(`${Math.min(100, Math.max(0, pct))}%`)
    }
  })

  it('hides the used limit bar when limit or available credit is missing', async () => {
    renderList([
      account({
        id: 'only-available',
        name: 'Só disponível',
        type: 'credit_card',
        credit_limit: null,
        available_credit: 100,
        current_balance: 11,
      }),
      account({
        id: 'only-limit',
        name: 'Só limite',
        type: 'credit_card',
        credit_limit: 5000,
        available_credit: null,
        current_balance: 42,
      }),
      account({
        id: 'neither',
        name: 'Nenhum',
        type: 'credit_card',
        credit_limit: null,
        available_credit: null,
        current_balance: 7,
      }),
      account({
        id: 'zero-limit',
        name: 'Limite zero',
        type: 'credit_card',
        credit_limit: 0,
        available_credit: 0,
        current_balance: 3,
      }),
    ])

    const availableOnly = await screen.findByRole('link', { name: /Só disponível/ })
    expect(within(availableOnly).queryByRole('progressbar')).toBeNull()
    expect(within(availableOnly).queryByText('Limite usado')).toBeNull()
    const availableRow = availableOnly.parentElement?.textContent ?? ''
    expect(availableRow).toContain('Limite disponível')
    expect(compact(availableRow)).toContain(compact(formatCurrency(100, 'BRL', 'pt-BR')))
    expect(compact(availableRow)).toContain(compact(formatCurrency(11, 'BRL', 'pt-BR')))

    const limitOnly = linkOf(/Só limite/)
    expect(within(limitOnly).queryByRole('progressbar')).toBeNull()
    expect(within(limitOnly).queryByText('Limite usado')).toBeNull()
    const limitRow = limitOnly.parentElement?.textContent ?? ''
    expect(limitRow).not.toContain('Limite disponível')
    expect(limitRow).not.toContain('Available credit')
    expect(compact(limitRow)).toContain(compact(formatCurrency(42, 'BRL', 'pt-BR')))

    const neither = linkOf(/Nenhum/)
    expect(within(neither).queryByRole('progressbar')).toBeNull()
    expect(compact(neither.parentElement?.textContent)).toContain(compact(formatCurrency(7, 'BRL', 'pt-BR')))

    const zero = linkOf(/Limite zero/)
    expect(within(zero).queryByRole('progressbar')).toBeNull()
    expect(within(zero).queryByText('Limite usado')).toBeNull()
  })

  it('shows the open bill line in pt-BR when the close date is today or later', async () => {
    renderList([
      account({
        id: 'future',
        name: 'Fecha futura',
        type: 'credit_card',
        statement_close_day: 15,
        payment_due_day: 22,
        next_close_date: '2026-10-15',
        next_due_date: '2026-10-22',
      }),
      account({
        id: 'today',
        name: 'Fecha hoje',
        type: 'credit_card',
        statement_close_day: 8,
        payment_due_day: 20,
        next_close_date: '2026-10-08',
        next_due_date: '2026-10-20',
      }),
    ])

    const future = await screen.findByRole('link', { name: /Fecha futura/ })
    expect(within(future).getByText('fatura aberta · fecha em 15 out · vence em 22 out').textContent).toBe('fatura aberta · fecha em 15 out · vence em 22 out')
    expect(within(future).getByText('Vence em 14 dias')).toBeTruthy()

    const today = linkOf(/Fecha hoje/)
    expect(within(today).getByText('fatura aberta · fecha em 08 out · vence em 20 out').textContent).toBe('fatura aberta · fecha em 08 out · vence em 20 out')
  })

  it('shows the open bill line in English when the close date is today or later', async () => {
    await i18n.changeLanguage('en')
    renderList([
      account({
        id: 'future',
        name: 'Closes later',
        type: 'credit_card',
        statement_close_day: 15,
        payment_due_day: 22,
        next_close_date: '2026-10-15',
        next_due_date: '2026-10-22',
      }),
      account({
        id: 'today',
        name: 'Closes today',
        type: 'credit_card',
        statement_close_day: 8,
        payment_due_day: 20,
        next_close_date: '2026-10-08',
        next_due_date: '2026-10-20',
      }),
    ])

    const future = await screen.findByRole('link', { name: /Closes later/ })
    expect(within(future).getByText('open bill · closes 15 Oct · due 22 Oct').textContent).toBe('open bill · closes 15 Oct · due 22 Oct')
    expect(within(future).getByText('Due in 14 days')).toBeTruthy()

    const today = linkOf(/Closes today/)
    expect(within(today).getByText('open bill · closes 08 Oct · due 20 Oct').textContent).toBe('open bill · closes 08 Oct · due 20 Oct')
  })

  it('shows the closed bill line in pt-BR when the close date is past', async () => {
    renderList([
      account({
        id: 'closed-bill',
        name: 'Fecha passada',
        type: 'credit_card',
        statement_close_day: 7,
        payment_due_day: 18,
        next_close_date: '2026-10-07',
        next_due_date: '2026-10-18',
      }),
    ])

    const link = await screen.findByRole('link', { name: /Fecha passada/ })
    const line = within(link).getByText('fatura fechada · vence em 18 out')
    expect(line.textContent).toBe('fatura fechada · vence em 18 out')
    expect(line.textContent).not.toContain('07 out')
    expect(within(link).getByText('Vence em 10 dias')).toBeTruthy()
  })

  it('shows the closed bill line in English when the close date is past', async () => {
    await i18n.changeLanguage('en')
    renderList([
      account({
        id: 'closed-bill',
        name: 'Already closed',
        type: 'credit_card',
        statement_close_day: 7,
        payment_due_day: 18,
        next_close_date: '2026-10-07',
        next_due_date: '2026-10-18',
      }),
    ])

    const link = await screen.findByRole('link', { name: /Already closed/ })
    const line = within(link).getByText('closed bill · due 18 Oct')
    expect(line.textContent).toBe('closed bill · due 18 Oct')
    expect(line.textContent).not.toContain('07 Oct')
    expect(within(link).getByText('Due in 10 days')).toBeTruthy()
  })

  it('hides the bill state line without cycle days or dates and keeps the due badge', async () => {
    const dated = {
      next_close_date: '2026-10-15',
      next_due_date: '2026-10-18',
    }
    renderList([
      account({
        id: 'no-close-day',
        name: 'Sem fechamento',
        type: 'credit_card',
        statement_close_day: null,
        payment_due_day: 18,
        ...dated,
      }),
      account({
        id: 'no-due-day',
        name: 'Sem vencimento',
        type: 'credit_card',
        statement_close_day: 15,
        payment_due_day: null,
        ...dated,
      }),
      account({
        id: 'no-close-date',
        name: 'Sem data de fecha',
        type: 'credit_card',
        statement_close_day: 15,
        payment_due_day: 18,
        next_close_date: null,
        next_due_date: '2026-10-18',
      }),
      account({
        id: 'no-due-date',
        name: 'Sem data de vence',
        type: 'credit_card',
        statement_close_day: 15,
        payment_due_day: 18,
        next_close_date: '2026-10-15',
        next_due_date: null,
      }),
    ])

    const missingCloseDay = await screen.findByRole('link', { name: /Sem fechamento/ })
    const missingDueDay = linkOf(/Sem vencimento/)
    for (const link of [missingCloseDay, missingDueDay, linkOf(/Sem data de fecha/), linkOf(/Sem data de vence/)]) {
      expect(within(link).queryByText(/fatura aberta|fatura fechada|listBillOpen|listBillClosed/)).toBeNull()
    }
    expect(within(missingCloseDay).getByText('Vence em 10 dias')).toBeTruthy()
    expect(within(missingDueDay).getByText('Vence em 10 dias')).toBeTruthy()
  })

  it('shows future installments in pt-BR', async () => {
    api.accounts.upcomingBills.mockResolvedValue(bills(12840.72))
    renderList([
      account({ id: 'card-1', name: 'Nubank', type: 'credit_card' }),
    ])

    const link = await screen.findByRole('link', { name: /Nubank/ })
    await waitFor(() => expect(nodeWithText(link, futureLine(12840.72))).toBeTruthy())
    const line = nodeWithText(link, futureLine(12840.72))
    expect(line.textContent).toBe(futureLine(12840.72))
    expect(compact(line.textContent)).toBe(compact('R$ 12.840,72 em parcelas futuras entram nas próximas faturas'))
  })

  it('shows future installments in English', async () => {
    await i18n.changeLanguage('en')
    display.locale = 'en-US'
    api.accounts.upcomingBills.mockResolvedValue(bills(12840.72))
    renderList([
      account({ id: 'card-1', name: 'Nubank', type: 'credit_card' }),
    ])

    const link = await screen.findByRole('link', { name: /Nubank/ })
    await waitFor(() => expect(nodeWithText(link, futureLine(12840.72))).toBeTruthy())
    const line = nodeWithText(link, futureLine(12840.72))
    expect(line.textContent).toBe(futureLine(12840.72))
    expect(compact(line.textContent)).toBe(compact('R$ 12,840.72 in future installments hit upcoming bills'))
  })

  it('hides future installments for zero null or loading without a skeleton', async () => {
    const card = account({
      id: 'card-1',
      name: 'Nubank',
      type: 'credit_card',
      credit_limit: 50000,
      available_credit: 29128.52,
    })
    for (const total of [0, null]) {
      api.accounts.upcomingBills.mockResolvedValue(bills(total))
      const view = renderList([card])
      const link = await screen.findByRole('link', { name: /Nubank/ })
      await waitFor(() => expect(view.queryClient.isFetching()).toBe(0))
      expect(within(link).queryByText(/parcelas futuras|future installments|futureInstallments/)).toBeNull()
      view.unmount()
    }

    api.accounts.upcomingBills.mockReturnValue(new Promise(() => {}))
    const pending = renderList([card])
    const link = await screen.findByRole('link', { name: /Nubank/ })
    await waitFor(() => expect(api.accounts.upcomingBills).toHaveBeenCalled())
    expect(within(link).getByRole('progressbar')).toBeTruthy()
    expect(within(link).queryByText(/parcelas futuras|future installments|futureInstallments/)).toBeNull()
    expect(link.querySelector('.animate-pulse')).toBeNull()
    pending.unmount()
  })

  it('shows limit bar bill state and future installments on manual and connected cards in that order', async () => {
    api.accounts.upcomingBills.mockResolvedValue(bills(12840.72))
    const facts = {
      type: 'credit_card' as const,
      credit_limit: 5000,
      available_credit: 4000,
      statement_close_day: 15,
      payment_due_day: 22,
      next_close_date: '2026-10-15',
      next_due_date: '2026-10-22',
    }
    renderList(
      [
        account({ id: 'manual-1', name: 'Manual', connection_id: null, ...facts }),
        account({ id: 'bank-1', name: 'Conectado', connection_id: 'conn-1', ...facts }),
      ],
      [],
      [connection()],
    )

    expect(await screen.findByRole('link', { name: /Manual/ })).toBeTruthy()
    await waitFor(() => {
      const lines = [...document.querySelectorAll('p')].filter((el) => (el.textContent ?? '').includes('em parcelas futuras entram nas próximas faturas'))
      expect(lines).toHaveLength(2)
    })
    for (const [name, id] of [['Manual', 'manual-1'], ['Conectado', 'bank-1']] as const) {
      const link = linkOf(new RegExp(name))
      expect(link).toHaveAttribute('href', `/accounts/${id}`)
      expect(within(link.parentElement as HTMLElement).getAllByRole('link')).toHaveLength(1)
      const bar = within(link).getByRole('progressbar')
      const state = within(link).getByText('fatura aberta · fecha em 15 out · vence em 22 out')
      const future = within(link).getByText(/em parcelas futuras entram nas próximas faturas/)
      expect(bar.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(state.compareDocumentPosition(future) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.queryByRole('link', { name: /ver fatura|view bill/i })).toBeNull()
  })

  it('hides card facts on other types and on closed cards', async () => {
    const bait = {
      credit_limit: 5000,
      available_credit: 1000,
      statement_close_day: 15,
      payment_due_day: 22,
      next_close_date: '2026-10-15',
      next_due_date: '2026-10-22',
    }
    const view = renderList(
      [
        account({ id: 'checking', name: 'Corrente', type: 'checking', ...bait }),
        account({ id: 'savings', name: 'Poupança', type: 'savings', ...bait }),
        account({ id: 'investment', name: 'Investimento', type: 'investment', ...bait }),
        account({ id: 'wallet', name: 'Carteira', type: 'wallet', ...bait }),
      ],
      [
        account({
          id: 'closed-card',
          name: 'Cartão encerrado',
          type: 'credit_card',
          is_closed: true,
          closed_at: '2026-09-01T00:00:00Z',
          ...bait,
        }),
      ],
    )

    expect(await screen.findByRole('link', { name: /Corrente/ })).toBeTruthy()
    expect(await screen.findByText('Cartão encerrado')).toBeTruthy()
    await waitFor(() => expect(view.queryClient.isFetching()).toBe(0))
    expect(api.accounts.upcomingBills).not.toHaveBeenCalled()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('Limite usado')).toBeNull()
    expect(screen.queryByText(/fatura aberta|fatura fechada/)).toBeNull()
    expect(screen.queryByText(/parcelas futuras/)).toBeNull()
  })

  it('does not show minimum payment brand or card level on the list', async () => {
    renderList([
      account({
        id: 'card-1',
        name: 'Nubank',
        type: 'credit_card',
        credit_limit: 5000,
        available_credit: 4000,
        minimum_payment: 150.5,
        card_brand: 'Visa Infinite X',
        card_level: 'Ultraviolet',
      }),
    ])

    expect(await screen.findByRole('link', { name: /Nubank/ })).toBeTruthy()
    expect(screen.queryByText('Visa Infinite X')).toBeNull()
    expect(screen.queryByText('Ultraviolet')).toBeNull()
    expect(screen.queryByText('150.5')).toBeNull()
    expect(compact(document.body.textContent)).not.toContain(compact(formatCurrency(150.5, 'BRL', 'pt-BR')))
  })
})
