/**
 * Saldo real e saldo previsto no calendário (.checks/saldo-da-conta-no-mes.md, S3).
 *
 * A vista mostra o real uma vez e, de hoje em diante, o previsto de cada dia.
 * A linha da fatura é tracejada e não abre transação.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'

import { TransactionCalendarView } from '@/components/transaction-calendar-view'
import i18n from '@/lib/i18n'
import { formatCurrency } from '@/lib/format'
import { renderWithProviders } from '@/test/utils'
import type { TransactionCalendarDay, TransactionCalendarItem, TransactionCalendarResponse } from '@/types'

vi.mock('@/hooks/use-timezone', () => ({
  useEffectiveTimezone: () => undefined,
}))

const TODAY = '2026-10-08'
const DUE = '2026-10-09'

function item(overrides: Partial<TransactionCalendarItem> & Pick<TransactionCalendarItem, 'description' | 'date' | 'amount'>): TransactionCalendarItem {
  return {
    kind: 'projected',
    id: null,
    recurring_id: null,
    amount_primary: overrides.amount,
    currency: 'BRL',
    type: 'debit',
    account_id: 'checking-1',
    account_name: 'Conta',
    category_id: null,
    category_name: null,
    category_icon: null,
    category_color: null,
    status: null,
    source: null,
    transfer_pair_id: null,
    is_transfer: false,
    is_ignored: false,
    exclude_from_pnl: false,
    ...overrides,
  }
}

function day(date: string, ending: number, items: TransactionCalendarItem[] = []): TransactionCalendarDay {
  return {
    date,
    in_month: true,
    ending_balance: ending,
    income: 0,
    expense: 0,
    transfer_net: 0,
    actual_income: 0,
    actual_expense: 0,
    actual_transfer_net: 0,
    projected_income: 0,
    projected_expense: items.reduce((sum, row) => sum + (row.type === 'debit' ? row.amount : 0), 0),
    projected_transfer_net: 0,
    actual_count: 0,
    projected_count: items.length,
    has_income: false,
    has_expense: false,
    has_transfer: false,
    items,
  }
}

function calendar(): TransactionCalendarResponse {
  return {
    month: '2026-10',
    currency: 'BRL',
    account_ids: ['checking-1'],
    actual_balance: 1000,
    days: [
      day('2026-10-07', 1000),
      day(TODAY, 1000),
      day(DUE, 750, [item({ description: 'Nubank', date: DUE, amount: 250 })]),
      day('2026-10-10', 750),
    ],
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0))
  window.localStorage.setItem('securo.transactionCalendar.density', 'detailed')
  window.localStorage.setItem('securo.transactionCalendar.metric', 'balance')
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('saldos do calendário', () => {
  it('shows actual and projected balances and does not open a bill line', async () => {
    const onOpenTransaction = vi.fn()
    for (const language of ['pt-BR', 'en'] as const) {
      cleanup()
      onOpenTransaction.mockClear()
      await i18n.changeLanguage(language)
      const displayLocale = language === 'en' ? 'en-US' : 'pt-BR'
      renderWithProviders(
        <TransactionCalendarView
          calendar={calendar()}
          isLoading={false}
          locale={displayLocale}
          dateLocale={displayLocale}
          mask={(value) => value}
          selectedDate={DUE}
          onSelectedDateChange={() => {}}
          onOpenTransaction={onOpenTransaction}
          userCurrency="BRL"
        />,
      )

      const actual = screen.getByTestId('actual-balance')
      expect(actual.textContent).toContain(i18n.t('transactions.calendarActualBalance'))
      expect(actual.textContent).toContain(formatCurrency(1000, 'BRL', displayLocale))

      const captions = screen.getAllByTestId('projected-balance').map((element) => element.textContent ?? '')
      const label = i18n.t('transactions.calendarProjectedBalance')
      expect(captions.every((text) => text.includes(label))).toBe(true)
      expect(captions.filter((text) => text.includes(formatCurrency(1000, 'BRL', displayLocale)))).toHaveLength(2)
      expect(captions.filter((text) => text.includes(formatCurrency(750, 'BRL', displayLocale)))).toHaveLength(6)

      const line = screen.getAllByTestId('projected-bill-line').find((element) => element.tagName === 'BUTTON')
      expect(line).toBeTruthy()
      expect(line!.className).toContain('border-dashed')
      expect(line!.textContent).toContain('Nubank')
      expect(line!.textContent).toContain(formatCurrency(250, 'BRL', displayLocale))
      fireEvent.click(line!)
      expect(onOpenTransaction).not.toHaveBeenCalled()
    }
  })
})
