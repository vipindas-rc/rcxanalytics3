import { expect, test, type Page } from '@playwright/test'

/**
 * Browser-only native parity checks.
 *
 * This suite intentionally runs against the configured Supervisor gateway, but
 * blocks every non-GET Analytics request before it reaches the host. The
 * checks cover navigation, layout, focus, and overlays only; they must never
 * create a session, submit a question, or mutate the workspace.
 */
async function installReadOnlyGuard(page: Page) {
  const blocked: string[] = []
  await page.route('**/analytics-api/**', async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      await route.continue()
      return
    }
    blocked.push(`${request.method()} ${pathname}`)
    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Read-only browser audit: mutation blocked.' }),
    })
  })
  return blocked
}

function pathPattern(pathname: string) {
  return new RegExp(`${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\?.*)?$`)
}

function expectOnlyReadOnlySafeMutations(blocked: readonly string[]) {
  const unexpected = blocked.filter(entry => {
    const [method, pathname] = entry.split(' ', 2)
    const isBriefingPreparation = method === 'POST' && pathname.endsWith('/briefings/ensure')
    const isArtifactRender = method === 'POST' && /\/artifacts\/[^/]+\/render$/.test(pathname)
    return !isBriefingPreparation && !isArtifactRender
  })
  expect(unexpected).toEqual([])
  expect(blocked.filter(entry => /\/conversations?(?:\/|$)/i.test(entry))).toEqual([])
}

async function expectSupervisorThemeTokensAndIcons(page: Page) {
  const shell = page.locator('main').first()
  await expect(shell).toBeVisible()
  const computed = await shell.evaluate(element => {
    const styles = getComputedStyle(element)
    const icon = document.querySelector<HTMLElement>(
      'nav[aria-label="Primary navigation"] span[style*="mask-image"]',
    )
    const iconStyles = icon ? getComputedStyle(icon) : null
    return {
      neutralB1: styles.getPropertyValue('--sui-colors-neutral-b1').trim(),
      primary: styles.getPropertyValue('--sui-colors-primary-f').trim(),
      iconWidth: iconStyles?.width ?? '',
      iconHeight: iconStyles?.height ?? '',
      iconForeground: iconStyles?.backgroundColor ?? '',
    }
  })
  expect(computed.neutralB1).not.toEqual('')
  expect(computed.primary).not.toEqual('')
  expect(computed.iconWidth).not.toEqual('0px')
  expect(computed.iconHeight).not.toEqual('0px')
  expect(computed.iconForeground).not.toMatch(/^rgba?\(0,\s*0,\s*0,\s*0\)$/)
}

test.describe('native Analytics read-only browser parity', () => {
  test('reaches every top-level destination through its canonical native route', async ({ page }) => {
    const blocked = await installReadOnlyGuard(page)
    const destinations = [
      ['/analytics/saved', 'Saved charts'],
      ['/analytics/dashboards', 'Dashboards'],
      ['/analytics/briefing', 'AI suggestions'],
    ] as const

    for (const [pathname, heading] of destinations) {
      await page.goto(pathname, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(pathPattern(pathname))
      await expect(page.locator('.analytics-app')).toBeVisible()
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
      const sidebarControl = pathname === '/analytics/briefing' ? 'AI suggestions' : heading
      await expect(page.locator('.workspace-sidebar').getByRole('button', { name: sidebarControl, exact: true })).toBeVisible()
      await expect(page.locator('iframe[title="Analytics"]')).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(1)
    }

    // Briefing preparation and chart rendering are expected browser-side POSTs;
    // both are fulfilled locally with 405 above. Conversation/model requests
    // must never be attempted by this navigation-only check.
    expectOnlyReadOnlySafeMutations(blocked)
  })

  test('keeps search dialog keyboard-accessible without submitting a request', async ({ page }) => {
    const blocked = await installReadOnlyGuard(page)
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' })

    const searchButton = page.getByRole('button', { name: 'Search conversations', exact: true })
    await expect(searchButton).toBeVisible()
    await searchButton.click()

    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('textbox', { name: 'Search conversations' }),
    })
    await expect(dialog).toBeVisible()
    const input = dialog.getByRole('textbox', { name: 'Search conversations' })
    await expect(input).toBeFocused()
    await input.fill('read-only-no-match')
    await expect(dialog.getByText('No conversations found.', { exact: true })).toBeVisible()
    await input.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: /Browse questions/i }).click()
    const catalogDialog = page.getByRole('dialog').filter({
      hasText: 'Browse analytics questions',
    })
    await expect(catalogDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(catalogDialog).toHaveCount(0)

    expectOnlyReadOnlySafeMutations(blocked)
  })

  for (const width of [375, 768, 1440]) {
    test(`contains the native shell and overlays at ${width}px`, async ({ page }) => {
      const blocked = await installReadOnlyGuard(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/analytics/saved', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.analytics-app')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Saved charts', exact: true })).toBeVisible()

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(1)

      if (width <= 850) {
        const toggle = page.getByRole('button', { name: 'Toggle sidebar', exact: true })
        await expect(toggle).toBeVisible()
        await toggle.click()
        await expect(page.getByRole('button', { name: 'Search conversations', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
      }

      expectOnlyReadOnlySafeMutations(blocked)
    })
  }

  test('unmounts native Analytics cleanly and does not leak shell styles or legacy modules', async ({ page }) => {
    const blocked = await installReadOnlyGuard(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible({ timeout: 15_000 })
    await expectSupervisorThemeTokensAndIcons(page)
    const supervisorStyleBefore = await page.evaluate(() => {
      const appBar = document.querySelector<HTMLElement>('header[data-name="App bar"]')
      const body = getComputedStyle(document.body)
      const bar = appBar ? getComputedStyle(appBar) : null
      return {
        bodyFont: body.fontFamily,
        bodyBackground: body.backgroundColor,
        barFont: bar?.fontFamily,
        barBackground: bar?.backgroundColor,
        barBorder: bar?.borderBottomColor,
      }
    })
    const legacyRequests: string[] = []
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname
      if (/\/proto(?:\/|\.|$)/i.test(pathname)) legacyRequests.push(pathname)
    })

    await page.goto('/analytics', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.analytics-app')).toBeVisible()
    await expect(page.locator('iframe[title="Analytics"]')).toHaveCount(0)
    await expect(page.locator('[data-name="Agent table"], [data-name="Interaction table"]')).toHaveCount(0)
    const analyticsLegacyRequests = [...legacyRequests]

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.analytics-app, .analytics-portal')).toHaveCount(0)
    await expect(page.locator('iframe[title="Analytics"]')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Open Agent', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-name="Agent table"], [data-name="Interaction table"]')).toHaveCount(1)
    await expectSupervisorThemeTokensAndIcons(page)
    const supervisorStyleAfter = await page.evaluate(() => {
      const appBar = document.querySelector<HTMLElement>('header[data-name="App bar"]')
      const body = getComputedStyle(document.body)
      const bar = appBar ? getComputedStyle(appBar) : null
      return {
        bodyFont: body.fontFamily,
        bodyBackground: body.backgroundColor,
        barFont: bar?.fontFamily,
        barBackground: bar?.backgroundColor,
        barBorder: bar?.borderBottomColor,
      }
    })
    expect(supervisorStyleAfter).toEqual(supervisorStyleBefore)

    // The Analytics route is the only route visited before the Supervisor
    // root. It must not load vendored proto modules as a phantom child tree.
    expect(analyticsLegacyRequests).toEqual([])
    expectOnlyReadOnlySafeMutations(blocked)
  })
})