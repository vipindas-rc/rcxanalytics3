/**
 * Read-only navigation baseline for the currently running Supervisor host.
 *
 * It never starts a server, invokes Analytics mutations, or calls a model. A
 * cold run uses a new browser context; a warm run primes the same context then
 * navigates again. The current iframe is measured separately from its host
 * document; native Analytics is measured in the host document.
 *
 * Example:
 *   PLAYWRIGHT_BASE_URL=https://<running-host> node scripts/native-analytics-perf-baseline.mjs
 */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const baseURL = option('--base-url') ?? process.env.PLAYWRIGHT_BASE_URL
const runCount = Number(option('--runs') ?? 5)
const outputDirectory = option('--output') ?? 'output/native-analytics-baseline'

if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL or --base-url must identify an already-running Supervisor host.')
if (!Number.isInteger(runCount) || runCount < 1) throw new Error('--runs must be a positive integer.')

const compactError = value => value.replace(/\s+/g, ' ').slice(0, 500)
const performanceSnapshot = () => {
  const navigation = performance.getEntriesByType('navigation')[0]
  const resources = performance.getEntriesByType('resource')
  const total = property => resources.reduce((sum, entry) => sum + (entry[property] || 0), 0)
  return {
    url: location.href,
    title: document.title,
    navigation: navigation && {
      responseStart: navigation.responseStart,
      domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
      loadEventEnd: navigation.loadEventEnd,
      duration: navigation.duration,
      transferSize: navigation.transferSize,
      encodedBodySize: navigation.encodedBodySize,
      decodedBodySize: navigation.decodedBodySize,
    },
    resources: {
      count: resources.length,
      transferSize: total('transferSize'),
      encodedBodySize: total('encodedBodySize'),
      decodedBodySize: total('decodedBodySize'),
    },
    iframeCount: document.querySelectorAll('iframe').length,
    visibleText: document.body?.innerText.replace(/\s+/g, ' ').slice(0, 300) ?? '',
  }
}

const browser = await chromium.launch({
  executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  headless: true,
})
const reports = []

async function capture(route, cache, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(`pageerror: ${compactError(error.message)}`))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${compactError(message.text())}`)
  })

  try {
    if (cache === 'warm') {
      await page.goto(new URL(route, baseURL).href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForTimeout(1_500)
    }

    const startedAt = Date.now()
    const response = await page.goto(new URL(route, baseURL).href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(1_500)
    const host = await page.evaluate(performanceSnapshot)
    let analyticsFrame

    if (route === '/analytics') {
      const iframe = page.locator('iframe[title="Analytics"]')
      if (await iframe.count()) {
        const frame = page.frameLocator('iframe[title="Analytics"]')
        try {
          await frame.locator('body').waitFor({ state: 'attached', timeout: 15_000 })
          analyticsFrame = { mode: 'iframe', performance: await frame.locator('body').evaluate(performanceSnapshot) }
        } catch (error) {
          analyticsFrame = { mode: 'iframe', error: compactError(error instanceof Error ? error.message : String(error)) }
        }
      } else {
        try {
          await page.locator('.analytics-app').waitFor({ state: 'visible', timeout: 15_000 })
          await page.locator('.analytics-app .composer').first().waitFor({ state: 'visible', timeout: 15_000 })
          analyticsFrame = { mode: 'native', performance: await page.evaluate(performanceSnapshot) }
        } catch (error) {
          analyticsFrame = { mode: 'native', error: compactError(error instanceof Error ? error.message : String(error)) }
        }
      }
    }

    return {
      route,
      cache,
      run,
      status: response?.status(),
      elapsedMs: Date.now() - startedAt,
      url: page.url(),
      host,
      analyticsFrame,
      errors: [...new Set(errors)],
    }
  } finally {
    await context.close()
  }
}

try {
  for (const route of ['/analytics', '/']) {
    for (const cache of ['cold', 'warm']) {
      for (let run = 1; run <= runCount; run++) reports.push(await capture(route, cache, run))
    }
  }

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, 'current-navigation-perf.raw.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    baseURL,
    runCount,
    viewport: { width: 1440, height: 900 },
    cacheMethod: {
      cold: 'new browser context per measured navigation',
      warm: 'one unmeasured priming navigation then a measured navigation in the same browser context',
    },
    reports,
  }, null, 2))

  const screenshotContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const screenshotPage = await screenshotContext.newPage()
    await screenshotPage.goto(new URL('/analytics', baseURL).href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await screenshotPage.waitForTimeout(2_000)
    await screenshotPage.screenshot({ path: path.join(outputDirectory, 'current-analytics.png'), fullPage: true })
  } finally {
    await screenshotContext.close()
  }
} finally {
  await browser.close()
}

console.log(`Wrote ${reports.length} read-only navigation samples to ${outputDirectory}.`)