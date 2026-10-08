/**
 * Próximas faturas (.checks/fatura-proximas-faturas.md, fatia S2).
 *
 * A seção lista o que o servidor já devolveu. Não calcula parcela, não
 * mostra skeleton próprio e não pede o endpoint fora de cartão de crédito.
 */
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { format, parseISO } from 'date-fns'

import { UpcomingBillsSection } from '@/components/upcoming-bills-section'
import i18n from '@/lib/i18n'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { formatCurrency } from '@/lib/format'
import { renderWithProviders } from '@/test/utils'
import type { UpcomingBillCycle, UpcomingBills } from '@/types'

const api = vi.hoisted(() => ({
  accounts: { upcomingBills: vi.fn() },
}))

vi.mock('@/lib/api', () => ({
  accounts: api.accounts,
}))

function cycle(due: string, total: number, primary = total): UpcomingBillCycle {
  return {
    due_date: due,
    close_date: due,
    committed_total: total,
    committed_total_primary: primary,
    currency: 'BRL',
  }
}

function payload(overrides: Partial<UpcomingBills> = {}): UpcomingBills {
  return {
    cycles: [cycle('2026-11-17', 149), cycle('2026-12-17', 99)],
    future_committed_total: 644,
    future_committed_total_primary: 644,
    ...overrides,
  }
}

function monthLabel(due: string, language: string) {
  return format(parseISO(`${due}T00:00:00`), 'MMM yyyy', {
    locale: resolveDateFnsLocale(language),
  })
}

function renderSection(props: Partial<ComponentProps<typeof UpcomingBillsSection>> = {}) {
  return renderWithProviders(
    <UpcomingBillsSection
      accountId="acc-1"
      accountType="credit_card"
      currency="BRL"
      showPrimary={false}
      primaryCurrency="BRL"
      locale="en-US"
      {...props}
    />,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  api.accounts.upcomingBills.mockResolvedValue(payload())
})

describe('próximas faturas', () => {
  it('lists each upcoming cycle with the bill month and the estimate note in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR')
    renderSection({ locale: 'pt-BR' })

    expect(await screen.findByRole('heading', { name: 'Próximas faturas' })).toBeTruthy()
    expect(screen.getByText('estimativa com as parcelas e lançamentos já conhecidos')).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(monthLabel('2026-11-17', 'pt-BR'))
    expect(items[0]).toHaveTextContent(formatCurrency(149, 'BRL', 'pt-BR'))
    expect(items[1]).toHaveTextContent(monthLabel('2026-12-17', 'pt-BR'))
    expect(items[1]).toHaveTextContent(formatCurrency(99, 'BRL', 'pt-BR'))
  })

  it('lists upcoming bills in English', async () => {
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Upcoming bills' })).toBeTruthy()
    expect(screen.getByText('estimate from known installments and charges')).toBeTruthy()
  })

  it('hides the section when every committed total is zero and the future total is zero or null', async () => {
    for (const future of [0, null]) {
      api.accounts.upcomingBills.mockResolvedValue(payload({
        cycles: [cycle('2026-11-17', 0), cycle('2026-12-17', 0)],
        future_committed_total: future,
        future_committed_total_primary: future,
      }))
      const view = renderSection()
      await waitFor(() => expect(api.accounts.upcomingBills).toHaveBeenCalled())
      await waitFor(() => expect(view.queryClient.isFetching()).toBe(0))
      expect(screen.queryByRole('heading', { name: 'Upcoming bills' })).toBeNull()
      view.unmount()
    }
  })

  it('shows the section when future commitments sit past the returned cycles', async () => {
    api.accounts.upcomingBills.mockResolvedValue(payload({
      cycles: [cycle('2026-11-17', 0)],
      future_committed_total: 99,
      future_committed_total_primary: 99,
    }))
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Upcoming bills' })).toBeTruthy()
    expect(screen.getByRole('listitem')).toHaveTextContent(monthLabel('2026-11-17', 'en'))
  })

  it('renders nothing and no skeleton while upcoming bills load', async () => {
    api.accounts.upcomingBills.mockReturnValue(new Promise(() => {}))
    const { container } = renderSection()

    await waitFor(() => expect(api.accounts.upcomingBills).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Upcoming bills' })).toBeNull()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('does not render or fetch upcoming bills for a non credit card', async () => {
    const view = renderSection({ accountType: 'checking' })

    await waitFor(() => expect(view.queryClient.isFetching()).toBe(0))
    expect(api.accounts.upcomingBills).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Upcoming bills' })).toBeNull()
  })

  it('shows account currency totals or primary totals with the currency selector', async () => {
    api.accounts.upcomingBills.mockResolvedValue({
      cycles: [{
        due_date: '2026-11-17',
        close_date: '2026-11-10',
        committed_total: 14,
        committed_total_primary: 77,
        currency: 'USD',
      }],
      future_committed_total: 14,
      future_committed_total_primary: 77,
    })
    const usd = formatCurrency(14, 'USD', 'en-US')
    const brl = formatCurrency(77, 'BRL', 'en-US')

    const accountCurrency = renderSection({
      currency: 'USD',
      showPrimary: false,
      primaryCurrency: 'BRL',
      locale: 'en-US',
    })
    expect((await screen.findAllByRole('listitem'))[0]).toHaveTextContent(usd)
    expect(screen.getByRole('listitem')).not.toHaveTextContent(brl)
    accountCurrency.unmount()

    renderSection({
      currency: 'USD',
      showPrimary: true,
      primaryCurrency: 'BRL',
      locale: 'en-US',
    })
    expect((await screen.findAllByRole('listitem'))[0]).toHaveTextContent(brl)
    expect(screen.getByRole('listitem')).not.toHaveTextContent(usd)
  })
})
