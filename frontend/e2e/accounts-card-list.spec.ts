import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Credit card on the accounts list, for the same signed-in registration
 * the navigation spec uses. The registration Wallet is a checking account;
 * this spec adds another checking account through the UI only when that
 * Wallet is not offered as the account that pays the bill.
 */

const CRASH_TEXT = [/Something went wrong/i, /Algo deu errado/i]
const CHECKING_TYPE = /Checking|Conta Corrente|Conta à ordem/
const PAYMENT_ACCOUNT = /Account that pays the bill|Conta que paga a fatura/
const CREDIT_LIMIT = /^(Credit limit|Limite do cartão)$/
const ADD_ACCOUNT = /^(Add Account|Adicionar Conta)$/
const SAVE = /^(Save|Salvar)$/
const ACCOUNTS_HEADING = /^(Accounts|Contas)$/
const MANUAL_HEADING = /^(Manual Accounts|Contas Manuais)$/
const CARD_NAME = 'E2E Card'
const CHECKING_NAME = 'E2E Checking'

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

async function dismissTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip tour' })
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
  await expect(page.getByRole('heading', { name: 'Welcome to Securo' })).toBeVisible()
  await page.locator('#name').fill('E2E Admin')
  await page.locator('#email').fill(email)
  await fillPasswordPair(page, password)
  await page.getByRole('button', { name: 'Create Admin Account' }).click()
  await expectPath(page, '/')
}

async function logout(page: Page) {
  await page.locator('aside').getByRole('button', { name: 'Personal' }).click()
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await expectPath(page, '/login')
}

async function registerAccount(page: Page) {
  const password = 'e2e-password-1'
  const stamp = Date.now()

  await page.goto('/register')
  const gate = page.getByRole('heading', { name: /Welcome to Securo|Create account|Login/ })
  await expect(gate.first()).toBeVisible()

  if (await page.getByRole('heading', { name: 'Welcome to Securo' }).isVisible()) {
    await completeSetup(page, `e2e-admin-${stamp}@example.com`, password)
    await dismissTour(page)
    await logout(page)
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  }

  if (
    (await page.getByRole('heading', { name: 'Login' }).isVisible()) &&
    !(await page.getByRole('heading', { name: 'Create account' }).isVisible())
  ) {
    await page.getByRole('link', { name: 'Create account' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  await page.locator('#email').fill(`e2e-user-${stamp}@example.com`)
  await fillPasswordPair(page, password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expectPath(page, '/')
  await dismissTour(page)
  await expect(page.locator('aside nav').getByRole('link', { name: 'Accounts', exact: true })).toBeVisible()
}

async function openAccounts(page: Page) {
  await page.goto('/accounts')
  await expectPath(page, '/accounts')
  const title = page.locator('main').getByRole('heading', { level: 1 })
  await expect(title).toBeVisible()
  await expect(title).toHaveText(ACCOUNTS_HEADING)
  await expect(page.getByRole('heading', { name: MANUAL_HEADING })).toBeVisible()
  const body = (await page.locator('main').innerText()).trim()
  expect(body.length).toBeGreaterThan(0)
}

async function openAddAccount(page: Page) {
  await page.getByRole('button', { name: ADD_ACCOUNT }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: ADD_ACCOUNT })).toBeVisible()
  return dialog
}

async function saveDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: SAVE }).click()
  await expect(dialog).toBeHidden()
}

async function checkingLink(page: Page) {
  return page.locator('main').getByRole('link').filter({ hasText: CHECKING_TYPE }).first()
}

async function ensureCheckingAccount(page: Page): Promise<{ payerName: string; createdChecking: boolean }> {
  const existing = await checkingLink(page)
  if ((await existing.count()) > 0) {
    const payerName = (await existing.locator('p').first().innerText()).trim()
    expect(payerName.length).toBeGreaterThan(0)
    return { payerName, createdChecking: false }
  }

  const dialog = await openAddAccount(page)
  await dialog.getByRole('textbox').first().fill(CHECKING_NAME)
  await dialog.locator('select').first().selectOption('checking')
  await saveDialog(dialog)
  await expect(page.locator('main').getByRole('link', { name: CHECKING_NAME })).toBeVisible()
  return { payerName: CHECKING_NAME, createdChecking: true }
}

async function fillCreditLimitIfAsked(dialog: Locator): Promise<boolean> {
  const label = dialog.getByText(CREDIT_LIMIT)
  if ((await label.count()) === 0 || !(await label.first().isVisible())) return false
  const field = label.first().locator('..').getByRole('spinbutton')
  if ((await field.count()) === 0 || !(await field.isVisible())) return false
  await field.fill('5000')
  return true
}

async function createCreditCard(page: Page, payerName: string): Promise<boolean> {
  const dialog = await openAddAccount(page)
  await dialog.getByRole('textbox').first().fill(CARD_NAME)
  await dialog.locator('select').first().selectOption('credit_card')
  const askedForLimit = await fillCreditLimitIfAsked(dialog)
  const payment = dialog.getByRole('combobox', { name: PAYMENT_ACCOUNT })
  await expect(payment).toBeVisible()
  const option = payment.locator('option', { hasText: new RegExp(`^${payerName}$`) })
  await expect(option).toHaveCount(1)
  await payment.selectOption({ label: payerName })
  await saveDialog(dialog)
  return askedForLimit
}

test('credit card on the accounts list opens its page', async ({ page }) => {
  const pageErrors = trackPageErrors(page)

  await test.step('register the same way as the navigation spec', async () => {
    await registerAccount(page)
  })

  let payerName = ''
  let createdChecking = false
  let askedForLimit = false

  await test.step('point a credit card at a checking account', async () => {
    await page.locator('aside nav').getByRole('link', { name: 'Accounts', exact: true }).click()
    await openAccounts(page)
    const checking = await ensureCheckingAccount(page)
    payerName = checking.payerName
    createdChecking = checking.createdChecking
    askedForLimit = await createCreditCard(page, payerName)
  })

  await test.step('the card is on /accounts and the checking account has no used-limit copy', async () => {
    await openAccounts(page)
    for (const crash of CRASH_TEXT) {
      await expect(page.getByText(crash)).toHaveCount(0)
    }
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)

    const card = page.locator('main').getByRole('link', { name: CARD_NAME })
    await expect(card).toBeVisible()

    const checking = page.locator('main').getByRole('link').filter({ hasText: payerName }).filter({ hasText: CHECKING_TYPE })
    await expect(checking).toBeVisible()
    await expect(checking).not.toContainText('Limite usado')
    await expect(checking).not.toContainText('Limit used')

    const rows: string[] = []
    const links = page.locator('main').getByRole('link')
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      rows.push((await links.nth(i).innerText()).replace(/\s+/g, ' ').trim())
    }
    console.log(`E2E_CARD_FORM ${JSON.stringify({ payerName, createdChecking, askedForLimit })}`)
    console.log(`E2E_ACCOUNTS_LIST ${JSON.stringify(rows)}`)

    await card.click()
    await expectPath(page, /^\/accounts\/[0-9a-f-]{36}$/i)
    const detail = page.locator('main')
    await expect(detail.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(detail.getByRole('heading', { level: 1 })).toHaveText(CARD_NAME)
    expect((await detail.innerText()).trim().length).toBeGreaterThan(0)
    for (const crash of CRASH_TEXT) {
      await expect(page.getByText(crash)).toHaveCount(0)
    }
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(pageErrors, pageErrors.join('\n')).toEqual([])
  })
})
