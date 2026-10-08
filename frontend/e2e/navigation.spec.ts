import { expect, test, type Page } from '@playwright/test'

/**
 * Navigation of the screens that already exist on main, for a signed-in
 * user who is not an admin and does not have the agents module.
 *
 * Personal workspaces do not get `invoices` (catalog default is off;
 * only a business workspace opts in). Agents stay off unless
 * AGENTS_ENABLED is set. This spec does not turn either of those on.
 *
 * OAuth callback URLs (`/oauth/callback`, `/enable-banking`) and the
 * public share link (`/i/:token`) are not menu destinations.
 */

const CRASH_TEXT = [/Something went wrong/i, /Algo deu errado/i]

const NAV_ROUTES: { label: string; path: string; heading: RegExp }[] = [
  { label: 'Transactions', path: '/transactions', heading: /^Transactions$/ },
  { label: 'Accounts', path: '/accounts', heading: /^Accounts$/ },
  { label: 'Import', path: '/import', heading: /^Bank statement$/ },
  { label: 'Reports', path: '/reports', heading: /^Net Worth$/ },
  { label: 'Assets', path: '/assets', heading: /^Assets$/ },
  { label: 'Budgets', path: '/budgets', heading: /.+/ },
  { label: 'Goals', path: '/goals', heading: /^Goals$/ },
  { label: 'Recurring', path: '/recurring', heading: /^Recurring Transactions$/ },
  { label: 'Categories', path: '/categories', heading: /^Categories$/ },
  { label: 'Payees', path: '/payees', heading: /^Payees$/ },
  { label: 'Groups', path: '/groups', heading: /^Groups$/ },
  { label: 'Rules', path: '/rules', heading: /^Rules$/ },
]

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

async function expectScreen(page: Page, path: string | RegExp, heading: RegExp, pageErrors: string[]) {
  await expectPath(page, path)
  const title = page.locator('main').getByRole('heading', { level: 1 })
  await expect(title).toBeVisible()
  await expect(title).toHaveText(heading)
  for (const crash of CRASH_TEXT) {
    await expect(page.getByText(crash)).toHaveCount(0)
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.locator('aside nav')).toBeVisible()
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
}

async function clickNav(page: Page, label: string) {
  const link = page.locator('aside nav').getByRole('link', { name: label, exact: true })
  await expect(link).toBeVisible()
  await link.click()
}

async function goDashboard(page: Page) {
  // The dashboard has no sidebar item. The logo is the menu entry.
  const logo = page.locator('aside').getByRole('link', { name: 'Securo', exact: true })
  await expect(logo).toBeVisible()
  await logo.click()
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

async function openOrCreateCheckingAccount(page: Page, pageErrors: string[]) {
  await clickNav(page, 'Accounts')
  await expectScreen(page, '/accounts', /^Accounts$/, pageErrors)

  const checkingLink = page.locator('main').getByRole('link').filter({ hasText: 'Checking' })
  if ((await checkingLink.count()) === 0) {
    await page.getByRole('button', { name: 'Add Account' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Add Account' })).toBeVisible()
    await dialog.getByRole('textbox').first().fill('E2E Checking')
    await dialog.locator('select').first().selectOption('checking')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
  }

  const accountLink = page.locator('main').getByRole('link').filter({ hasText: 'Checking' }).first()
  await expect(accountLink).toBeVisible()
  await accountLink.click()
  await expectScreen(page, /^\/accounts\/[0-9a-f-]{36}$/i, /.+/, pageErrors)
  await expect(page.locator('main').getByRole('heading', { level: 1 })).not.toHaveText(/not found/i)
}

async function openOrCreateGroup(page: Page, pageErrors: string[]) {
  await clickNav(page, 'Groups')
  await expectScreen(page, '/groups', /^Groups$/, pageErrors)

  const empty = page.getByText('No groups yet')
  const row = page.locator('main ul li')
  await expect(empty.or(row.first())).toBeVisible()
  if (await empty.isVisible()) {
    await page.getByRole('button', { name: 'Add group' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox').first().fill('E2E Group')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('E2E Group', { exact: true })).toBeVisible()
  }

  await page.locator('main ul li').first().click()
  await expectScreen(page, /^\/groups\/[0-9a-f-]{36}$/i, /.+/, pageErrors)
}

test('authenticated navigation covers existing non-admin screens', async ({ page }) => {
  const pageErrors = trackPageErrors(page)

  await test.step('register a non-admin account', async () => {
    await registerAccount(page)
    await expectScreen(page, '/', /.+/, pageErrors)
  })

  await test.step('dashboard → accounts → dashboard → transactions', async () => {
    await clickNav(page, 'Accounts')
    await expectScreen(page, '/accounts', /^Accounts$/, pageErrors)
    await goDashboard(page)
    await expectScreen(page, '/', /.+/, pageErrors)
    await clickNav(page, 'Transactions')
    await expectScreen(page, '/transactions', /^Transactions$/, pageErrors)
    await expect(page.locator('aside nav')).toBeVisible()
  })

  for (const route of NAV_ROUTES) {
    await test.step(`menu → ${route.path}`, async () => {
      await clickNav(page, route.label)
      await expectScreen(page, route.path, route.heading, pageErrors)
    })
  }

  await test.step('account detail from the list', async () => {
    await openOrCreateCheckingAccount(page, pageErrors)
  })

  await test.step('group detail from the list', async () => {
    await openOrCreateGroup(page, pageErrors)
  })

  await test.step('collections from the accounts page', async () => {
    await clickNav(page, 'Accounts')
    await expectScreen(page, '/accounts', /^Accounts$/, pageErrors)
    await page.getByRole('button', { name: 'Collections' }).click()
    await expectScreen(page, '/collections', /^Collections$/, pageErrors)
  })

  await test.step('workspace settings from the account menu', async () => {
    await page.locator('aside').getByRole('button', { name: 'Personal' }).click()
    await expect(page.getByRole('menuitem', { name: 'Administration' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'AI Agents' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Workspace settings' }).click()
    await expectScreen(page, '/workspace/settings', /^Personal$/, pageErrors)
  })

  await test.step('invoices stay out of the menu on a personal workspace', async () => {
    await expect(page.locator('aside nav').getByRole('link', { name: 'Invoices', exact: true })).toHaveCount(0)
  })
})
