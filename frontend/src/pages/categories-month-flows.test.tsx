/**
 * Categorias do mês (.checks/categorias-do-mes.md, S2).
 *
 * The month above the catalog shows posted outflows and inflows, and the
 * rules control is the way into /rules. Assertions come from the task.
 */
import { createContext } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocation } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'

import CategoriesPage from '@/pages/categories'
import i18n from '@/lib/i18n'
import { renderWithProviders } from '@/test/utils'
import type { CategoryFlows } from '@/types'

const api = vi.hoisted(() => ({
  categories: {
    listIncludingHidden: vi.fn(),
    usage: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    ruleUsage: vi.fn(),
  },
  categoryGroups: {
    listIncludingHidden: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  dashboard: {
    categoryFlows: vi.fn(),
  },
}))

const workspace = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/lib/api', () => ({
  categories: api.categories,
  categoryGroups: api.categoryGroups,
  dashboard: api.dashboard,
}))

vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ canWrite: workspace.canWrite }),
  WorkspaceContext: createContext({ canWrite: true }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { preferences: { currency_display: 'BRL' } } }),
}))

vi.mock('@/hooks/use-display-locale', () => ({
  useDisplayLocale: () => 'pt-BR',
  useDateLocale: () => 'pt-BR',
}))

const FOOD = {
  category_id: 'food',
  category_name: 'Alimentação',
  category_icon: 'utensils',
  category_color: '#F59E0B',
  total: 140,
  percentage: 93.33,
}

const UNCATEGORIZED = {
  category_id: null,
  category_name: 'Sem categoria',
  category_icon: 'circle-help',
  category_color: '#6B7280',
  total: 10,
  percentage: 6.67,
}

const SALARY = {
  category_id: 'salary',
  category_name: 'Salário',
  category_icon: 'briefcase',
  category_color: '#22C55E',
  total: 80,
  percentage: 100,
}

const OCTOBER: CategoryFlows = {
  outflows: [FOOD, UNCATEGORIZED],
  inflows: [SALARY],
}

const NOVEMBER: CategoryFlows = {
  outflows: [{
    category_id: 'rent',
    category_name: 'Aluguel',
    category_icon: 'house',
    category_color: '#111827',
    total: 50,
    percentage: 100,
  }],
  inflows: [],
}

const EMPTY: CategoryFlows = { outflows: [], inflows: [] }

const GROUP = {
  id: 'g1',
  name: 'Essenciais',
  icon: 'folder',
  color: '#111827',
  is_hidden: false,
  is_system: false,
  categories: [{
    id: 'food',
    user_id: 'user-1',
    name: 'Alimentação',
    icon: 'utensils',
    color: '#F59E0B',
    group_id: 'g1',
    is_system: false,
    is_hidden: false,
    treat_as_transfer: false,
    is_ignored: false,
  }],
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage() {
  return renderWithProviders(
    <>
      <CategoriesPage />
      <LocationProbe />
    </>,
  )
}

function region(name: string) {
  return screen.getByRole('region', { name })
}

beforeEach(async () => {
  vi.clearAllMocks()
  workspace.canWrite = true
  await i18n.changeLanguage('en')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0))
  api.categories.listIncludingHidden.mockResolvedValue(GROUP.categories)
  api.categoryGroups.listIncludingHidden.mockResolvedValue([GROUP])
  api.dashboard.categoryFlows.mockResolvedValue(OCTOBER)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('category month flows', () => {
  it('shows october outflows and inflows above the catalog', async () => {
    await i18n.changeLanguage('pt-BR')
    renderPage()

    const outflows = await screen.findByRole('region', { name: 'Saídas por categoria' })
    expect(await within(outflows).findByText(/R\$\s*140,00/)).toBeInTheDocument()
    const inflows = screen.getByRole('region', { name: 'Entradas por categoria' })
    const catalog = await screen.findByText('Essenciais')

    const outflowText = outflows.textContent ?? ''
    expect(outflowText.indexOf('Alimentação')).toBeGreaterThanOrEqual(0)
    expect(outflowText.indexOf('Alimentação')).toBeLessThan(outflowText.indexOf('Sem categoria'))
    expect(outflowText).toMatch(/R\$\s*140,00/)
    expect(outflowText).toMatch(/R\$\s*10,00/)
    expect(inflows.textContent).toMatch(/Salário/)
    expect(inflows.textContent).toMatch(/R\$\s*80,00/)
    expect(outflows.compareDocumentPosition(inflows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(inflows.compareDocumentPosition(catalog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await i18n.changeLanguage('en')
    const englishOutflows = await screen.findByRole('region', { name: 'Outflows by category' })
    expect(englishOutflows.textContent).toMatch(/Uncategorized/)
    expect(englishOutflows.textContent).toMatch(/R\$\s*140,00/)
    expect((await screen.findByRole('region', { name: 'Inflows by category' })).textContent).toMatch(/R\$\s*80,00/)
    expect(screen.getByText('Essenciais')).toBeInTheDocument()
  })

  it('starts at the current month and steps forward and back', async () => {
    await i18n.changeLanguage('pt-BR')
    const now = new Date()
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    api.dashboard.categoryFlows.mockImplementation(async (month: string) => (
      month === '2026-11-01' ? NOVEMBER : OCTOBER
    ))
    const { user } = renderPage()

    await screen.findByText(/R\$\s*140,00/)
    expect(api.dashboard.categoryFlows).toHaveBeenCalledWith(`${current}-01`)
    expect(screen.getByRole('button', { name: /outubro de 2026/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await screen.findByText('Aluguel')
    expect(screen.queryByText(/R\$\s*140,00/)).not.toBeInTheDocument()
    expect(screen.getByText(/R\$\s*50,00/)).toBeInTheDocument()
    expect(api.dashboard.categoryFlows).toHaveBeenCalledWith('2026-11-01')

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await screen.findByText(/R\$\s*140,00/)
    expect(screen.queryByText('Aluguel')).not.toBeInTheDocument()
    expect(region('Saídas por categoria').textContent).toMatch(/Alimentação/)
  })

  it('filters flows by category name without the empty-month copy', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = renderPage()
    const search = await screen.findByRole('searchbox', { name: 'Buscar categorias' })

    await user.type(search, 'ali')
    const outflows = region('Saídas por categoria')
    const inflows = region('Entradas por categoria')
    expect(within(outflows).getByText('Alimentação')).toBeInTheDocument()
    expect(within(outflows).queryByText('Sem categoria')).not.toBeInTheDocument()
    expect(within(inflows).queryByText('Salário')).not.toBeInTheDocument()

    await user.clear(search)
    expect(within(region('Saídas por categoria')).getByText('Alimentação')).toBeInTheDocument()
    expect(within(region('Saídas por categoria')).getByText('Sem categoria')).toBeInTheDocument()
    expect(within(region('Entradas por categoria')).getByText('Salário')).toBeInTheDocument()
    expect(within(region('Saídas por categoria')).getByText(/R\$\s*140,00/)).toBeInTheDocument()

    await user.type(search, 'zzz')
    expect(within(region('Saídas por categoria')).getByText('Nenhuma categoria encontrada')).toBeInTheDocument()
    expect(within(region('Entradas por categoria')).getByText('Nenhuma categoria encontrada')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma saída neste mês')).not.toBeInTheDocument()
    expect(screen.queryByText('Nenhuma entrada neste mês')).not.toBeInTheDocument()

    await i18n.changeLanguage('en')
    expect(await screen.findAllByText('No category found')).toHaveLength(2)
    expect(screen.queryByText('No outflows this month')).not.toBeInTheDocument()
    expect(screen.queryByText('No inflows this month')).not.toBeInTheDocument()
  })

  it('keeps both sections with the empty-month copy', async () => {
    api.dashboard.categoryFlows.mockResolvedValue(EMPTY)
    await i18n.changeLanguage('pt-BR')
    renderPage()

    expect(await screen.findByRole('region', { name: 'Saídas por categoria' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Entradas por categoria' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhuma saída neste mês')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma entrada neste mês')).toBeInTheDocument()

    await i18n.changeLanguage('en')
    expect(await screen.findByRole('region', { name: 'Outflows by category' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Inflows by category' })).toBeInTheDocument()
    expect(screen.getByText('No outflows this month')).toBeInTheDocument()
    expect(screen.getByText('No inflows this month')).toBeInTheDocument()
  })

  it('shows skeletons and drops the previous month while the next month loads', async () => {
    await i18n.changeLanguage('pt-BR')
    let release: (value: CategoryFlows) => void = () => {}
    const pending = new Promise<CategoryFlows>((resolve) => {
      release = resolve
    })
    api.dashboard.categoryFlows.mockImplementation((month: string) => (
      month === '2026-11-01' ? pending : Promise.resolve(OCTOBER)
    ))
    const { user } = renderPage()

    await screen.findByText(/R\$\s*140,00/)
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))

    await waitFor(() => {
      expect(screen.queryByText(/R\$\s*140,00/)).not.toBeInTheDocument()
    })
    expect(region('Saídas por categoria').querySelector('[data-slot="skeleton"]')).toBeTruthy()
    expect(region('Entradas por categoria').querySelector('[data-slot="skeleton"]')).toBeTruthy()
    expect(screen.queryByText('Nenhuma saída neste mês')).not.toBeInTheDocument()
    expect(screen.queryByText('Nenhuma entrada neste mês')).not.toBeInTheDocument()

    release(NOVEMBER)
    await screen.findByText('Aluguel')
  })

  it('links a flow row to the transactions of that category and month', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = renderPage()
    await screen.findByRole('link', { name: /Alimentação/ })

    await user.click(screen.getByRole('link', { name: /Alimentação/ }))
    expect(flowParams()).toMatchObject({
      category_id: 'food',
      from: '2026-10-01',
      to: '2026-10-31',
      type: 'debit',
    })
    expect(flowParams().uncategorized).toBeNull()

    await user.click(screen.getByRole('link', { name: /Sem categoria/ }))
    expect(flowParams()).toMatchObject({
      category_id: null,
      uncategorized: '1',
      from: '2026-10-01',
      to: '2026-10-31',
      type: 'debit',
    })

    await user.click(screen.getByRole('link', { name: /Salário/ }))
    expect(flowParams()).toMatchObject({
      category_id: 'salary',
      uncategorized: null,
      from: '2026-10-01',
      to: '2026-10-31',
      type: 'credit',
    })
  })

  it('links automatic rules to /rules with or without write access', async () => {
    await i18n.changeLanguage('pt-BR')
    const first = renderPage()
    const rules = await screen.findByRole('link', { name: 'Regras automáticas' })
    expect(rules).toHaveAttribute('href', '/rules')
    first.unmount()

    workspace.canWrite = false
    renderPage()
    expect(await screen.findByRole('link', { name: 'Regras automáticas' })).toHaveAttribute('href', '/rules')

    await i18n.changeLanguage('en')
    expect(await screen.findByRole('link', { name: 'Automatic rules' })).toHaveAttribute('href', '/rules')
  })

  it('opens the existing category dialog and hides the button without write access', async () => {
    await i18n.changeLanguage('pt-BR')
    const first = renderPage()

    await first.user.click(await screen.findByRole('button', { name: 'Nova categoria' }))
    expect(await screen.findByText('Nova Categoria')).toBeInTheDocument()
    first.unmount()

    workspace.canWrite = false
    renderPage()
    await screen.findByRole('region', { name: 'Saídas por categoria' })
    expect(screen.queryByRole('button', { name: 'Nova categoria' })).not.toBeInTheDocument()
  })
})

function flowParams(): Record<string, string | null> {
  const href = screen.getByTestId('location').textContent ?? ''
  const url = new URL(href, 'http://localhost')
  expect(url.pathname).toBe('/transactions')
  return {
    category_id: url.searchParams.get('category_id'),
    uncategorized: url.searchParams.get('uncategorized'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    type: url.searchParams.get('type'),
  }
}
