/**
 * Marcar transação como recorrente (.checks/marcar-transacao-recorrente.md).
 *
 * The checkbox is offered on create and on edit, including a synced charge.
 * Saving calls POST /transactions/{id}/make-recurring once; the list badge is
 * the one the page already draws when recurring_transaction_id is set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

import { TransactionDialog } from '@/components/transaction-dialog'
import TransactionsPage from '@/pages/transactions'
import i18n from '@/lib/i18n'
import { renderWithProviders } from '@/test/utils'
import type { Account, Transaction } from '@/types'

const api = vi.hoisted(() => ({
  transactions: {
    list: vi.fn(),
    calendar: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    makeRecurring: vi.fn(),
    unlinkRecurring: vi.fn(),
    toggleIgnore: vi.fn(),
    transferPair: vi.fn(),
    createTransfer: vi.fn(),
    attachments: { list: vi.fn(), upload: vi.fn(), downloadUrl: vi.fn() },
  },
  categories: { list: vi.fn(), listIncludingHidden: vi.fn() },
  categoryGroups: { list: vi.fn(), listIncludingHidden: vi.fn() },
  accounts: { list: vi.fn() },
  recurring: { list: vi.fn(), create: vi.fn() },
  payees: { list: vi.fn() },
  admin: { accountingMode: vi.fn(), numberFormat: vi.fn(), dateFormat: vi.fn() },
  groups: { list: vi.fn(), get: vi.fn(), create: vi.fn(), members: { create: vi.fn() } },
  rules: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
  reconciliation: { suggestions: vi.fn() },
  currencies: { list: vi.fn() },
  settings: { attachments: vi.fn() },
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/lib/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { preferences: { currency_display: 'BRL' } } }),
}))
vi.mock('@/contexts/workspace-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/workspace-context')>()
  return {
    ...actual,
    useWorkspace: () => ({
      current: null,
      workspaces: [],
      isLoading: false,
      switchWorkspace: async () => {},
      refresh: async () => {},
      role: 'owner' as const,
      canManage: true,
      canWrite: true,
      enabledModules: [],
      hasModule: () => false,
    }),
  }
})
vi.mock('@/contexts/collection-filter-context', () => ({
  useCollectionFilter: () => ({
    collections: [],
    activeCollectionId: null,
    activeCollection: null,
    setActiveCollectionId: () => {},
    activeAccountIds: null,
    activeWalletIds: null,
  }),
}))

const ACCOUNTS = [
  { id: 'acc-checking', name: 'Checking', type: 'checking', currency: 'BRL' },
  { id: 'acc-savings', name: 'Savings', type: 'savings', currency: 'BRL' },
  { id: 'acc-card', name: 'Card', type: 'credit_card', currency: 'BRL', connection_id: 'conn-1' },
] as unknown as Account[]

function pageOf(items: Transaction[]) {
  return {
    items,
    total: items.length,
    summary: { income: 0, expense: 0, net: 0, excluded: 0, currency: 'BRL' },
  }
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    user_id: 'u1',
    account_id: 'acc-checking',
    category_id: null,
    category: null,
    external_id: null,
    description: 'Streaming',
    original_description: null,
    amount: 49.9,
    currency: 'BRL',
    date: '2026-10-07',
    type: 'debit',
    source: 'manual',
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

function renderPage() {
  return renderWithProviders(<TransactionsPage />)
}

function renderDialog(
  transaction: Transaction | null,
  onSave = vi.fn(),
) {
  return renderWithProviders(
    <TransactionDialog
      open
      onClose={vi.fn()}
      transaction={transaction}
      categories={[]}
      categoryGroups={[]}
      accounts={ACCOUNTS}
      onSave={onSave}
      loading={false}
      error={null}
      isSynced={transaction?.source === 'sync'}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.transactions.list.mockResolvedValue(pageOf([]))
  api.transactions.calendar.mockResolvedValue({ days: [] })
  api.transactions.create.mockResolvedValue(makeTx({ id: 'tx-new' }))
  api.transactions.update.mockImplementation(async (id: string) => makeTx({ id }))
  api.transactions.makeRecurring.mockResolvedValue(makeTx({ recurring_transaction_id: 'rec-1' }))
  api.transactions.attachments.list.mockResolvedValue([])
  api.transactions.transferPair.mockResolvedValue(null)
  api.categories.list.mockResolvedValue([])
  api.categories.listIncludingHidden.mockResolvedValue([])
  api.categoryGroups.list.mockResolvedValue([])
  api.categoryGroups.listIncludingHidden.mockResolvedValue([])
  api.accounts.list.mockResolvedValue(ACCOUNTS)
  api.recurring.list.mockResolvedValue([])
  api.payees.list.mockResolvedValue([])
  api.admin.accountingMode.mockResolvedValue({ mode: 'cash' })
  api.admin.numberFormat.mockResolvedValue({ format: 'auto' })
  api.admin.dateFormat.mockResolvedValue({ format: 'auto' })
  api.groups.list.mockResolvedValue([])
  api.rules.list.mockResolvedValue([])
  api.reconciliation.suggestions.mockResolvedValue([])
  api.currencies.list.mockResolvedValue([{ code: 'BRL', symbol: 'R$', name: 'Real', flag: '' }])
  api.settings.attachments.mockResolvedValue({
    allowed_extensions: ['pdf'],
    max_file_size_mb: 10,
    max_attachments_per_transaction: 10,
  })
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

async function openRow(user: UserEvent, description: string) {
  await user.click(await screen.findByText(description))
  return screen.findByRole('dialog')
}

async function closeDialog(user: UserEvent, cancel: string) {
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: cancel }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('mark a transaction recurring', () => {
  it('shows an unchecked Make recurring checkbox and no Recurring badge', async () => {
    const rows = [
      makeTx({ id: 'chk-m', description: 'Checking manual', account_id: 'acc-checking', source: 'manual' }),
      makeTx({ id: 'chk-s', description: 'Checking sync', account_id: 'acc-checking', source: 'sync' }),
      makeTx({ id: 'sav-m', description: 'Savings manual', account_id: 'acc-savings', source: 'manual' }),
      makeTx({ id: 'sav-s', description: 'Savings sync', account_id: 'acc-savings', source: 'sync' }),
      makeTx({ id: 'card-m', description: 'Card manual', account_id: 'acc-card', source: 'manual' }),
      makeTx({ id: 'card-s', description: 'Card sync', account_id: 'acc-card', source: 'sync' }),
    ]
    api.transactions.list.mockResolvedValue(pageOf(rows))
    const { user, queryClient } = renderPage()
    await screen.findByText('Checking manual')
    await waitFor(() => expect(queryClient.getQueryData(['accounts'])).toEqual(ACCOUNTS))

    expect(screen.queryByText('Recurring')).not.toBeInTheDocument()
    expect(screen.queryByText('Recorrente')).not.toBeInTheDocument()

    const copies = [
      { checkbox: 'Make recurring', add: 'Add Transaction', cancel: 'Cancel' },
      { checkbox: 'Tornar recorrente', add: 'Adicionar Transação', cancel: 'Cancelar' },
    ]
    for (const copy of copies) {
      await i18n.changeLanguage(copy.checkbox === 'Make recurring' ? 'en' : 'pt-BR')
      await user.click(screen.getByRole('button', { name: new RegExp(copy.add) }))
      const createDialog = await screen.findByRole('dialog')
      const createBox = within(createDialog).getByRole('checkbox', { name: copy.checkbox })
      expect(createBox).not.toBeChecked()
      await closeDialog(user, copy.cancel)

      for (const row of rows) {
        const dialog = await openRow(user, row.description)
        const box = within(dialog).getByRole('checkbox', { name: copy.checkbox })
        expect(box).not.toBeChecked()
        await closeDialog(user, copy.cancel)
      }
    }
  })

  it('links a synced credit card charge and shows the Recurring badge', async () => {
    const charge = makeTx({
      id: 'card-charge',
      description: 'Streaming Plus',
      account_id: 'acc-card',
      source: 'sync',
      status: 'posted',
      amount: 49.9,
      date: '2026-10-07',
      bill_id: 'bill-1',
    })
    let items = [charge]
    api.transactions.list.mockImplementation(async () => pageOf(items))
    api.transactions.update.mockImplementation(async () => charge)
    api.transactions.makeRecurring.mockImplementation(async () => {
      items = [{ ...charge, recurring_transaction_id: 'rec-1' }]
      return items[0]
    })

    const { user } = renderPage()
    const dialog = await openRow(user, 'Streaming Plus')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Make recurring' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.transactions.makeRecurring).toHaveBeenCalledWith('card-charge', { frequency: 'monthly' })
    expect(await screen.findByText('Recurring')).toBeInTheDocument()

    const again = await openRow(user, 'Streaming Plus')
    expect(within(again).getByText('This transaction is linked to a recurring bill.')).toBeInTheDocument()
    expect(within(again).getByRole('button', { name: 'Unlink' })).toBeInTheDocument()
  })

  it('creates a manual transaction already linked and shows the Recurring badge', async () => {
    let items: Transaction[] = []
    api.transactions.list.mockImplementation(async () => pageOf(items))
    api.transactions.create.mockImplementation(async () => makeTx({
      id: 'tx-new',
      description: 'Manual rent',
      source: 'manual',
    }))
    api.transactions.makeRecurring.mockImplementation(async () => {
      items = [makeTx({
        id: 'tx-new',
        description: 'Manual rent',
        source: 'manual',
        recurring_transaction_id: 'rec-1',
      })]
      return items[0]
    })

    const { user, queryClient } = renderPage()
    await screen.findByText('No transactions found')
    await waitFor(() => expect(queryClient.getQueryData(['accounts'])).toEqual(ACCOUNTS))
    await user.click(screen.getByRole('button', { name: /Add Transaction/ }))
    const dialog = await screen.findByRole('dialog')
    const textboxes = within(dialog).getAllByRole('textbox')
    await user.type(textboxes[0], 'Manual rent')
    const amount = textboxes.find((el) => el.getAttribute('inputmode') === 'decimal')
    expect(amount).toBeTruthy()
    await user.type(amount!, '49.90')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Make recurring' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.transactions.makeRecurring).toHaveBeenCalledWith(
      'tx-new',
      { frequency: 'monthly' },
    ))
    expect(api.recurring.create).not.toHaveBeenCalled()
    const created = (await screen.findByText('Manual rent')).closest('tr')
    expect(created).toBeTruthy()
    expect(within(created as HTMLElement).getByText('Recurring')).toBeInTheDocument()
    expect(items[0].recurring_transaction_id).toBe('rec-1')
  })

  it('shows frequency day of month and optional end date when make recurring is checked', async () => {
    const onSave = vi.fn()
    const { user } = renderDialog(makeTx({ description: 'Streaming', source: 'manual' }), onSave)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Make recurring' }))

    const frequency = within(dialog).getAllByRole('combobox').find((element) =>
      [...(element as HTMLSelectElement).options].some((option) => option.value === 'semiannual'),
    ) as HTMLSelectElement
    expect(frequency).toBeTruthy()
    expect(frequency.value).toBe('monthly')
    expect([...frequency.options].map((option) => [option.value, option.text])).toEqual([
      ['monthly', 'Monthly'],
      ['quarterly', 'Quarterly'],
      ['semiannual', 'Semiannual'],
      ['weekly', 'Weekly'],
      ['biweekly', 'Biweekly'],
      ['yearly', 'Yearly'],
    ])
    expect(within(dialog).getByText('Frequency')).toBeInTheDocument()
    expect(within(dialog).getByText('Day of month')).toBeInTheDocument()
    expect(within(dialog).getAllByText('End date (optional)').length).toBeGreaterThan(0)

    for (const value of ['quarterly', 'semiannual', 'yearly']) {
      await user.selectOptions(frequency, value)
      expect(within(dialog).getByText('Day of month')).toBeInTheDocument()
    }
    for (const value of ['weekly', 'biweekly']) {
      await user.selectOptions(frequency, value)
      expect(within(dialog).queryByText('Day of month')).not.toBeInTheDocument()
    }

    await i18n.changeLanguage('pt-BR')
    expect([...frequency.options].map((option) => option.text)).toEqual([
      'Mensal',
      'Trimestral',
      'A cada 6 meses',
      'Semanal',
      'A cada 2 semanas',
      'Anual',
    ])
    expect(within(dialog).getByText('Frequência')).toBeInTheDocument()
    expect(within(dialog).queryByText('Dia do mês')).not.toBeInTheDocument()
    expect(within(dialog).getAllByText('Data de fim (opcional)').length).toBeGreaterThan(0)
    for (const value of ['monthly', 'quarterly', 'semiannual', 'yearly']) {
      await user.selectOptions(frequency, value)
      expect(within(dialog).getByText('Dia do mês')).toBeInTheDocument()
    }
    await user.selectOptions(frequency, 'weekly')
    expect(within(dialog).queryByText('Dia do mês')).not.toBeInTheDocument()

    await i18n.changeLanguage('en')
    await user.selectOptions(frequency, 'monthly')
    const day = within(dialog).getByRole('spinbutton')
    await user.type(day, '15')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.anything(),
      { frequency: 'monthly', day_of_month: 15 },
      undefined,
      undefined,
      'save',
    )

    await user.selectOptions(frequency, 'weekly')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.anything(),
      { frequency: 'weekly' },
      undefined,
      undefined,
      'save',
    )
  })

  it('hides Make recurring when the transaction is already linked', async () => {
    renderDialog(makeTx({ recurring_transaction_id: 'rec-1', description: 'Already linked' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('checkbox', { name: 'Make recurring' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('This transaction is linked to a recurring bill.')).toBeInTheDocument()
  })

  it('hides Make recurring on a transfer', async () => {
    renderDialog(makeTx({ transfer_pair_id: 'pair-1', description: 'To savings' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('checkbox', { name: 'Make recurring' })).not.toBeInTheDocument()
  })

  it('hides Make recurring on an installment', async () => {
    const cases = [
      makeTx({ installment_number: 3, description: 'Parcel number' }),
      makeTx({ installment_series_id: 'series-1', description: 'Parcel series' }),
    ]
    for (const tx of cases) {
      const view = renderDialog(tx)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByRole('checkbox', { name: 'Make recurring' })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('shows the 400 detail in a toast and no Recurring badge', async () => {
    const charge = makeTx({ id: 'plain', description: 'Plain charge' })
    api.transactions.list.mockResolvedValue(pageOf([charge]))
    api.transactions.update.mockResolvedValue(charge)
    api.transactions.makeRecurring.mockRejectedValue({
      response: {
        status: 400,
        data: { detail: 'Transaction is already linked to a recurring bill' },
      },
    })

    const { user } = renderPage()
    const dialog = await openRow(user, 'Plain charge')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Make recurring' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Transaction is already linked to a recurring bill',
    ))
    expect(screen.queryByText('Recurring')).not.toBeInTheDocument()
  })
})
