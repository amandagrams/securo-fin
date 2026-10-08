import { existsSync, readFileSync } from 'node:fs'

import { expect, test, type Locator, type Page } from '@playwright/test'

const E2E_USER_FILE = '/tmp/securo-e2e-user.json'

/**
 * Wave 1 screens together, for a signed-in user who is not an admin.
 *
 * Registration follows the same path as navigation.spec.ts. The copy
 * assertions accept English and Brazilian Portuguese because the UI
 * language is a preference, not a fixed locale of this spec.
 *
 * Upcoming bills stay optional: with no committed charge the section is
 * absent, and that is the intended screen, not a failure.
 */

const CRASH_TEXT = [/Something went wrong/i, /Algo deu errado/i]

const copy = {
  outflows: /^(Outflows by category|Saídas por categoria)$/,
  inflows: /^(Inflows by category|Entradas por categoria)$/,
  automaticRules: /^(Automatic rules|Regras automáticas)$/,
  rulesHeading: /^(Rules|Regras)$/,
  categoriesTitle: /^(Categories|Categorias)$/,
  catalogToggle: /^(Expand all|Collapse all|Expandir tudo|Recolher tudo)$/,
  accounts: /^(Accounts|Contas)$/,
  manualAccounts: /^(Manual Accounts|Contas Manuais)$/,
  categories: /^(Categories|Categorias)$/,
  transactions: /^(Transactions|Transações)$/,
  addAccount: /^(Add Account|Adicionar Conta)$/,
  save: /^(Save|Salvar)$/,
  checking: /Checking|Conta Corrente/,
  creditCard: /Credit Card|Cartão de Crédito/,
  paymentAccount: /^(Account that pays the bill|Conta que paga a fatura)$/,
  composition: /^(Where this amount comes from|De onde vem esse valor)$/,
  utilization: /^(Utilization|Utilização)$/,
  actualBalance: /Actual balance|Saldo real/,
  filters: /^(Filters|Filtros)$/,
  accountFilter: /^(Account|Conta)$/,
  skipTour: /^(Skip tour|Pular tour)$/,
  tooManyAttempts: /Too many attempts|Muitas tentativas/,
  welcome: /^(Welcome to Securo|Bem-vindo ao Securo)$/,
  createAccount: /^(Create account|Criar conta)$/,
  login: /^(Login|Entrar)$/,
  createAdmin: /^(Create Admin Account|Criar conta de administrador)$/,
  logout: /^(Logout|Sair)$/,
}

function trackPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  return errors
}

async function expectPath(page: Page, path: string | RegExp) {
  await expect(page).toHaveURL((url) =>
    typeof path === 'string' ? url.pathname === path : path.test(url.pathname),
  )
}

async function expectNoCrash(page: Page, pageErrors: string[]) {
  for (const crash of CRASH_TEXT) {
    await expect(page.getByText(crash)).toHaveCount(0)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.locator('aside nav')).toBeVisible()
  const mainText = (await page.locator('main').innerText()).trim()
  expect(mainText.length).toBeGreaterThan(0)
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
}

async function clickNav(page: Page, label: RegExp) {
  const link = page.locator('aside nav').getByRole('link', { name: label })
  await expect(link).toBeVisible()
  await link.click()
}

async function goDashboard(page: Page) {
  const menuDashboard = page.locator('aside nav').getByRole('link', { name: /^(Dashboard|Painel)$/ })
  if (await menuDashboard.count()) {
    await menuDashboard.click()
    return
  }
  const logo = page.locator('aside').getByRole('link', { name: 'Securo', exact: true })
  await expect(logo).toBeVisible()
  await logo.click()
}

async function dismissTour(page: Page) {
  const skip = page.getByRole('button', { name: copy.skipTour })
  try {
    await skip.waitFor({ state: 'visible', timeout: 8_000 })
  } catch {
    return
  }
  await skip.click()
  await expect(skip).toBeHidden()
}

async function fillPasswordPair(page: Page, password: string) {
  await page.locator('#password').fill(password)
  await page.locator('#confirmPassword').fill(password)
}

async function completeSetup(page: Page, email: string, password: string) {
  await expect(page.getByRole('heading', { name: copy.welcome })).toBeVisible()
  await page.locator('#name').fill('E2E Admin')
  await page.locator('#email').fill(email)
  await fillPasswordPair(page, password)
  await page.getByRole('button', { name: copy.createAdmin }).click()
  await expectPath(page, '/')
}

async function logout(page: Page) {
  await page.locator('aside').getByRole('button', { name: /^(Personal|Pessoal)$/ }).click()
  await page.getByRole('menuitem', { name: copy.logout }).click()
  await expectPath(page, '/login')
}

async function registerAccount(page: Page) {
  const password = 'e2e-password-1'
  const stamp = Date.now()

  await page.goto('/register')
  const gate = page.getByRole('heading', { name: /Welcome to Securo|Bem-vindo ao Securo|Create account|Criar conta|Login|Entrar/ })
  await expect(gate.first()).toBeVisible()

  if (await page.getByRole('heading', { name: copy.welcome }).isVisible()) {
    await completeSetup(page, `e2e-admin-${stamp}@example.com`, password)
    await dismissTour(page)
    await logout(page)
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: copy.createAccount })).toBeVisible()
  }

  if (
    (await page.getByRole('heading', { name: copy.login }).isVisible()) &&
    !(await page.getByRole('heading', { name: copy.createAccount }).isVisible())
  ) {
    await page.getByRole('link', { name: copy.createAccount }).click()
  }

  await expect(page.getByRole('heading', { name: copy.createAccount })).toBeVisible()
  await page.locator('#email').fill(`e2e-user-${stamp}@example.com`)
  await fillPasswordPair(page, password)
  await page.getByRole('button', { name: copy.createAccount }).click()

  const rateLimited = page.getByText(copy.tooManyAttempts)
  const entered = page
    .waitForURL((url) => url.pathname === '/', { timeout: 20_000 })
    .then(() => 'in' as const)
    .catch(() => 'failed' as const)
  const limited = rateLimited
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => 'limited' as const)
    .catch(() => 'failed' as const)
  const outcome = await Promise.race([entered, limited])
  if (outcome === 'limited') {
    // Register is capped at 3 requests per hour per IP. The navigation spec
    // already created a non-admin user; sign in as that user instead.
    await loginSavedUser(page, password)
  } else if (outcome !== 'in') {
    throw new Error('Registration did not reach the dashboard')
  }

  await dismissTour(page)
  await expect(page.locator('aside nav').getByRole('link', { name: copy.accounts })).toBeVisible()
}

async function loginSavedUser(page: Page, fallbackPassword: string) {
  if (!existsSync(E2E_USER_FILE)) {
    throw new Error('Registration was rate limited and no saved non-admin user is available')
  }
  const saved = JSON.parse(readFileSync(E2E_USER_FILE, 'utf8')) as { email: string; password: string }
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: copy.login })).toBeVisible()
  await page.locator('#email').fill(saved.email)
  await page.locator('#password').fill(saved.password || fallbackPassword)
  await page.getByRole('button', { name: copy.login }).click()
  await expectPath(page, '/')
}

async function accountRow(page: Page, accountName: string): Promise<Locator> {
  const link = page.locator('main').getByRole('link').filter({ hasText: accountName }).first()
  await expect(link).toBeVisible()
  return link.locator('xpath=ancestor::div[contains(@class,"group")][1]')
}

async function createCheckingAccount(page: Page, name: string) {
  await page.getByRole('button', { name: copy.addAccount }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: copy.addAccount })).toBeVisible()
  await dialog.locator('select').first().selectOption('checking')
  await dialog.getByRole('textbox').first().fill(name)
  await dialog.getByRole('button', { name: copy.save }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('main').getByRole('link').filter({ hasText: name })).toBeVisible()
}

async function checkingAccount(page: Page): Promise<{ name: string; id: string }> {
  await expect(page.getByRole('heading', { name: copy.manualAccounts })).toBeVisible()
  const link = page.locator('main').getByRole('link').filter({ hasText: copy.checking }).first()
  if ((await link.count()) === 0) {
    await createCheckingAccount(page, 'E2E Checking')
  }
  const ready = page.locator('main').getByRole('link').filter({ hasText: copy.checking }).first()
  await expect(ready).toBeVisible()
  const href = await ready.getAttribute('href')
  const id = href?.split('/').pop() ?? ''
  expect(id).toMatch(/[0-9a-f-]{36}/i)
  const name = (await ready.locator('p').first().innerText()).trim()
  return { name, id }
}

async function createCreditCard(page: Page, paymentName: string) {
  await page.getByRole('button', { name: copy.addAccount }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: copy.addAccount })).toBeVisible()
  await dialog.locator('select').first().selectOption('credit_card')
  await dialog.getByRole('textbox').first().fill('E2E Card')

  const payment = dialog.locator('#payment-account')
  await expect(payment).toBeVisible()
  await expect(payment).toHaveAttribute('aria-label', copy.paymentAccount)
  const option = payment.locator('option', { hasText: paymentName })
  await expect(option).toHaveCount(1)
  await payment.selectOption({ label: paymentName })

  const spins = dialog.getByRole('spinbutton')
  await spins.nth(1).fill('5000')
  await spins.nth(2).fill('10')
  await spins.nth(3).fill('17')

  await dialog.getByRole('button', { name: copy.save }).click()
  await expect(dialog).toBeHidden()
}

test('wave 1 screens stay usable together for a non-admin user', async ({ page }) => {
  const pageErrors = trackPageErrors(page)

  await test.step('register a non-admin account', async () => {
    await registerAccount(page)
    await expectNoCrash(page, pageErrors)
  })

  await test.step('categories show month flows above the catalog and link to rules', async () => {
    await clickNav(page, copy.categories)
    await expectPath(page, '/categories')
    const title = page.locator('main').getByRole('heading', { level: 1 })
    await expect(title).toHaveText(copy.categoriesTitle)

    const outflows = page.getByRole('region', { name: copy.outflows })
    const inflows = page.getByRole('region', { name: copy.inflows })
    await expect(outflows).toBeVisible()
    await expect(inflows).toBeVisible()
    await expect(outflows.locator('[data-slot="skeleton"]')).toHaveCount(0)
    await expect(inflows.locator('[data-slot="skeleton"]')).toHaveCount(0)
    await expect(page.locator('main').getByText(/\(\d+\)/).first()).toBeVisible()

    const catalogToggle = page.getByRole('button', { name: copy.catalogToggle })
    await expect(catalogToggle).toBeVisible()
    const outflowsBox = await outflows.boundingBox()
    const inflowsBox = await inflows.boundingBox()
    const catalogBox = await catalogToggle.boundingBox()
    expect(outflowsBox).not.toBeNull()
    expect(inflowsBox).not.toBeNull()
    expect(catalogBox).not.toBeNull()
    expect(outflowsBox!.y).toBeLessThan(inflowsBox!.y)
    expect(inflowsBox!.y).toBeLessThan(catalogBox!.y)

    await page.getByRole('link', { name: copy.automaticRules }).click()
    await expectPath(page, '/rules')
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(copy.rulesHeading)
    await expectNoCrash(page, pageErrors)
  })

  await test.step('dashboard loads; open bills are optional without a card', async () => {
    await goDashboard(page)
    await expectPath(page, '/')
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoCrash(page, pageErrors)
  })

  let checking: { name: string; id: string } = { name: '', id: '' }

  await test.step('credit card detail stays on screen and shows a zero composition', async () => {
    await clickNav(page, copy.accounts)
    await expectPath(page, '/accounts')
    checking = await checkingAccount(page)
    await createCreditCard(page, checking.name)

    const cardLink = page.locator('main').getByRole('link').filter({ hasText: 'E2E Card' }).first()
    await expect(cardLink).toBeVisible()
    await cardLink.click()
    await expectPath(page, /^\/accounts\/[0-9a-f-]{36}$/i)
    const heading = page.locator('main').getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
    await expect(heading).toHaveText('E2E Card')

    const composition = page.getByText(copy.composition)
    await expect(composition).toBeVisible()
    const compositionCard = composition.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await expect(compositionCard).toContainText(/0[.,]00/)

    // No committed installment or charge: "Upcoming bills" / "Próximas faturas"
    // may be absent. That is the product behavior, so this step does not
    // require the section.

    await expectNoCrash(page, pageErrors)
  })

  await test.step('accounts list keeps the card row and hides the limit bar on checking', async () => {
    await clickNav(page, copy.accounts)
    await expectPath(page, '/accounts')
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText(copy.accounts)

    const cardRow = await accountRow(page, 'E2E Card')
    await expect(cardRow).toBeVisible()
    await expect(cardRow).toContainText(copy.creditCard)

    const checkingRow = await accountRow(page, checking.name)
    await expect(checkingRow).toBeVisible()
    await expect(checkingRow).toContainText(copy.checking)
    await expect(checkingRow.getByText(copy.utilization)).toHaveCount(0)
    await expect(checkingRow.locator('div.h-2')).toHaveCount(0)

    await expectNoCrash(page, pageErrors)
  })

  await test.step('calendar shows the actual balance for the checking account', async () => {
    await page.goto('/transactions?view=calendar')
    await expectPath(page, '/transactions')
    await expect(page).toHaveURL(/view=calendar/)
    await page.getByRole('button', { name: copy.filters }).click()
    await page.getByRole('menuitem', { name: copy.accountFilter }).click()
    await page.getByRole('menuitem', { name: new RegExp(checking.name) }).click()
    await expect(page).toHaveURL(new RegExp(`account_id=${checking.id}`))
    await expect(page.getByTestId('actual-balance')).toContainText(copy.actualBalance)
    await expectNoCrash(page, pageErrors)
  })

  await test.step('menu round trip keeps the sidebar and raises no pageerror', async () => {
    const stops: { label: RegExp | 'dashboard'; path: string }[] = [
      { label: 'dashboard', path: '/' },
      { label: copy.accounts, path: '/accounts' },
      { label: copy.categories, path: '/categories' },
      { label: copy.transactions, path: '/transactions' },
      { label: 'dashboard', path: '/' },
    ]
    for (const stop of stops) {
      if (stop.label === 'dashboard') await goDashboard(page)
      else await clickNav(page, stop.label)
      await expectPath(page, stop.path)
      await expect(page.locator('aside nav')).toBeVisible()
      await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoCrash(page, pageErrors)
    }
  })
})
