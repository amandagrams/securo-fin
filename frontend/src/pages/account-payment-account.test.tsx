/**
 * Conta que paga a fatura (.checks/saldo-da-conta-no-mes.md, S3).
 *
 * Criar um cartão exige uma checking, listada pelo nome. No cartão que já
 * existe o mesmo seletor grava o PATCH e pode voltar a ficar vazio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'

import AccountDetailPage from '@/pages/account-detail'
import AccountsPage from '@/pages/accounts'
import i18n from '@/lib/i18n'
import { renderWithProviders } from '@/test/utils'
import type { Account } from '@/types'

const api = vi.hoisted(() => ({
  accounts: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    close: vi.fn(),
    bills: vi.fn(),
    summary: vi.fn(),
    cards: vi.fn(),
    updateCard: vi.fn(),
  },
  connections: {
    list: vi.fn(),
    getProviders: vi.fn(),
    sync: vi.fn(),
    delete: vi.fn(),
  },
  currencies: { list: vi.fn() },
  transactions: { list: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  dashboard: { projectedTransactions: vi.fn() },
  categories: { list: vi.fn() },
  categoryGroups: { list: vi.fn() },
}))

vi.mock('@/lib/api', () => ({
  accounts: api.accounts,
  connections: api.connections,
  currencies: api.currencies,
  transactions: api.transactions,
  dashboard: api.dashboard,
  categories: api.categories,
  categoryGroups: api.categoryGroups,
}))

vi.mock('@/hooks/use-display-locale', () => ({
  useDisplayLocale: () => 'pt-BR',
  useDateLocale: () => 'pt-BR',
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
    current_balance: 0,
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

const conta = account({ id: 'checking-1', name: 'Conta', type: 'checking', current_balance: 1000 })
const outra = account({ id: 'checking-2', name: 'Outra', type: 'checking' })
const savings = account({ id: 'savings-1', name: 'Poupança', type: 'savings', current_balance: 5000 })
const closed = account({ id: 'checking-closed', name: 'Fechada', type: 'checking', is_closed: true })

const card = account({
  id: 'card-1',
  name: 'Nubank',
  type: 'credit_card',
  statement_close_day: 20,
  payment_due_day: 28,
  credit_limit: 5000,
})

beforeEach(() => {
  vi.clearAllMocks()
  api.accounts.list.mockImplementation(async (includeClosed = false) =>
    includeClosed ? [closed] : [conta, outra, savings],
  )
  api.accounts.create.mockResolvedValue({ ...card, payment_account_id: conta.id })
  api.accounts.get.mockResolvedValue(card)
  api.accounts.cards.mockResolvedValue([])
  api.accounts.bills.mockResolvedValue([])
  api.accounts.summary.mockResolvedValue({
    monthly_income: 0,
    monthly_expenses: 0,
    projected_income: 0,
    projected_expenses: 0,
  })
  api.accounts.update.mockImplementation(async (_id: string, payload: Partial<Account>) => {
    const next = { ...card, ...payload }
    api.accounts.get.mockResolvedValue(next)
    return next
  })
  api.connections.list.mockResolvedValue([])
  api.connections.getProviders.mockResolvedValue([])
  api.currencies.list.mockResolvedValue([{ code: 'BRL', symbol: 'R$', name: 'Real', flag: '' }])
  api.transactions.list.mockResolvedValue({ items: [], total: 0 })
  api.dashboard.projectedTransactions.mockResolvedValue([])
  api.categories.list.mockResolvedValue([])
  api.categoryGroups.list.mockResolvedValue([])
})

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

function paymentSelect() {
  return screen.getByRole('combobox', { name: i18n.t('accounts.paymentAccount') }) as HTMLSelectElement
}

function optionLabels(select: HTMLSelectElement) {
  return [...select.options].map((option) => option.textContent ?? '')
}

describe('conta que paga a fatura', () => {
  it('create card dialog requires the checking account that pays the bill', async () => {
    for (const language of ['pt-BR', 'en'] as const) {
      cleanup()
      api.accounts.create.mockClear()
      await i18n.changeLanguage(language)
      const { user } = renderWithProviders(<AccountsPage />)
      await user.click(screen.getAllByRole('button', { name: i18n.t('accounts.addManual') })[0])

      const typeSelect = screen.getAllByRole('combobox').find((element) =>
        [...(element as HTMLSelectElement).options].some((option) => option.value === 'credit_card'),
      ) as HTMLSelectElement
      await user.selectOptions(typeSelect, 'credit_card')
      await user.type(screen.getByRole('textbox'), 'Nubank')

      const payer = paymentSelect()
      expect(screen.getByText(i18n.t('accounts.paymentAccount'))).toBeTruthy()
      expect(optionLabels(payer)).toEqual(expect.arrayContaining(['Conta', 'Outra']))
      expect(optionLabels(payer)).not.toEqual(expect.arrayContaining(['Poupança', 'Fechada']))

      await user.click(screen.getByRole('button', { name: i18n.t('common.save') }))
      expect(api.accounts.create).not.toHaveBeenCalled()

      await user.selectOptions(payer, conta.id)
      await user.click(screen.getByRole('button', { name: i18n.t('common.save') }))
      await waitFor(() => expect(api.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nubank',
          type: 'credit_card',
          payment_account_id: conta.id,
        }),
      ))
    }
  })

  it('card settings selector patches the payment account and can be cleared', async () => {
    const { user } = renderWithProviders(<AccountDetailPage />, {
      route: '/accounts/card-1',
      path: '/accounts/:id',
    })
    await screen.findByTitle(i18n.t('common.edit'))
    await user.click(screen.getByTitle(i18n.t('common.edit')))
    const payer = paymentSelect()
    expect(optionLabels(payer)).toEqual(expect.arrayContaining(['Conta', 'Outra']))
    expect(optionLabels(payer)).not.toEqual(expect.arrayContaining(['Poupança']))
    expect(payer.value).toBe('')

    await user.selectOptions(payer, conta.id)
    await user.click(screen.getByRole('button', { name: i18n.t('common.save') }))
    await waitFor(() => expect(api.accounts.update).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({ payment_account_id: conta.id }),
    ))

    await user.click(screen.getByTitle(i18n.t('common.edit')))
    await waitFor(() => expect(paymentSelect().value).toBe(conta.id))
    const again = paymentSelect()
    await user.selectOptions(again, '')
    await user.click(screen.getByRole('button', { name: i18n.t('common.save') }))
    await waitFor(() => expect(api.accounts.update).toHaveBeenLastCalledWith(
      'card-1',
      expect.objectContaining({ payment_account_id: null }),
    ))
  })
})
