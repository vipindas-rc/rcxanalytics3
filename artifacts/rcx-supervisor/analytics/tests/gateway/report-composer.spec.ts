import { expect, test, type Page } from '@playwright/test'
import { findReport } from '../../src/lib/reportCatalog'

const emptyWorkspace = {
  version: 3,
  revision: 1,
  sessions: [],
  projects: [],
  datasets: [],
  artifacts: [],
  savedCharts: [],
  dashboards: [],
  requests: [],
  preferences: {},
  briefings: [],
}

const workspaceWithSessions = {
  ...emptyWorkspace,
  sessions: [
    {
      id: 'session-one',
      title: 'Session One',
      projectId: null,
      createdAt: '2026-09-12T09:00:00.000Z',
      updatedAt: '2026-09-12T09:00:00.000Z',
      messages: [],
    },
    {
      id: 'session-two',
      title: 'Session Two',
      projectId: null,
      createdAt: '2026-09-12T09:00:00.000Z',
      updatedAt: '2026-09-12T09:00:00.000Z',
      messages: [],
    },
  ],
}

const contactCenterReport = findReport('contact-center-activity-overview')
if (!contactCenterReport) throw new Error('The Contact Center Activity Overview catalog fixture is missing.')

const contactCenterReportContext = {
  reportId: contactCenterReport.id,
  reportVersion: contactCenterReport.version,
  title: contactCenterReport.title,
  type: contactCenterReport.type,
  availability: contactCenterReport.availability,
  sourceUrl: contactCenterReport.sourceUrl,
  selectedContentIds: ['queue-abandonment-rate'],
  presentationPreference: 'chart' as const,
}

const cancelledReportRequest = {
  id: 'cancelled-report-request',
  sessionId: 'session-one',
  question: 'Compare queue abandonment.',
  status: 'cancelled' as const,
  phase: 'cancelled',
  error: 'Request cancelled.',
  userMessageId: 'cancelled-report-user',
  createdAt: '2026-09-12T09:00:00.000Z',
  reportContext: contactCenterReportContext,
}

const workspaceWithCancelledReport = {
  ...workspaceWithSessions,
  sessions: workspaceWithSessions.sessions.map(session => session.id === 'session-one'
    ? {
        ...session,
        messages: [{
          id: 'cancelled-report-user',
          role: 'user' as const,
          text: cancelledReportRequest.question,
          createdAt: cancelledReportRequest.createdAt,
          requestId: cancelledReportRequest.id,
        }],
      }
    : session),
  requests: [cancelledReportRequest],
}

const cancelledAdvisorRequest = {
  ...cancelledReportRequest,
  id: 'cancelled-advisor-report-request',
  sessionId: 'advisor-session',
}

const workspaceWithCancelledAdvisorReport = {
  ...workspaceWithSessions,
  sessions: [
    ...workspaceWithSessions.sessions,
    {
      id: 'advisor-session',
      title: 'Advisor report investigation',
      advisor: true,
      projectId: null,
      createdAt: '2026-09-12T09:00:00.000Z',
      updatedAt: '2026-09-12T09:00:00.000Z',
      messages: [{
        id: 'cancelled-advisor-report-user',
        role: 'user' as const,
        text: cancelledAdvisorRequest.question,
        createdAt: cancelledAdvisorRequest.createdAt,
        requestId: cancelledAdvisorRequest.id,
      }],
    },
  ],
  requests: [cancelledAdvisorRequest],
}

async function installAnalyticsFixture(page: Page, workspace = emptyWorkspace, onConversation?: (payload: Record<string, unknown>) => void) {
  await page.route('**/analytics-api/**', async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'GET' && pathname.endsWith('/workspace')) {
      await route.fulfill({ json: workspace })
      return
    }
    if (request.method() === 'POST' && pathname.endsWith('/conversation')) {
      const payload = request.postDataJSON() as Record<string, unknown>
      onConversation?.(payload)
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'request-history',
          sessionId: payload.sessionId ?? 'session-one',
          requestId: payload.requestId ?? 'request-history',
          question: payload.question ?? '',
          status: 'pending',
          phase: 'queued',
          userMessageId: 'history-user',
          createdAt: '2026-09-12T09:00:00.000Z',
        }),
      })
      return
    }
    await route.fulfill({
      status: request.method() === 'GET' ? 404 : 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Native composer browser test fixture does not allow this request.' }),
    })
  })
}

async function openComposer(page: Page) {
  await installAnalyticsFixture(page)
  await page.goto('/analytics')
  return page.getByRole('combobox', { name: 'Ask an analytics question' })
}

test('native composer keeps slash selection out of the draft URL and opens the chooser', async ({ page }) => {
  const composer = await openComposer(page)
  await composer.fill('/contact center')
  await expect(page.getByRole('listbox', { name: 'Reports' })).toBeVisible()
  await expect(page).toHaveURL(/analytics\.composer\.chooser=palette/)
  expect(new URL(page.url()).searchParams.toString()).not.toContain('contact+center')

  await page.getByRole('option', { name: /Contact Center Activity Overview.*dashboard/i }).click()
  await expect(page.getByRole('region', { name: 'Contact Center Activity Overview contents' })).toBeVisible()
  await expect(page).toHaveURL(/analytics\.composer\.report=contact-center-activity-overview/)
  await expect(page).toHaveURL(/analytics\.composer\.chooser=contents/)
  await expect(composer).toHaveValue('')
})

test('native composer ignores Enter while an IME composition is active', async ({ page }) => {
  const composer = await openComposer(page)
  await composer.fill('/agent activity')
  await expect(page.getByRole('listbox', { name: 'Reports' })).toBeVisible()

  await composer.dispatchEvent('compositionstart')
  await composer.press('Enter')
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(0)
  await expect(page.getByRole('listbox', { name: 'Reports' })).toBeVisible()

  await composer.dispatchEvent('compositionend')
  await composer.press('Escape')
  await expect(page.getByRole('listbox', { name: 'Reports' })).toHaveCount(0)
  await expect(page).toHaveURL(/analytics\.composer\.chooser=closed/)
})

test('native chooser keeps multi-select and presentation changes addressable', async ({ page }) => {
  const composer = await openComposer(page)
  await composer.fill('/contact center')
  await page.getByRole('option', { name: /Contact Center Activity Overview.*dashboard/i }).click()
  const chooser = page.getByRole('region', { name: 'Contact Center Activity Overview contents' })
  await expect(chooser).toBeVisible()

  const firstContent = chooser.getByRole('checkbox', { name: 'Queue abandonment rate' })
  await firstContent.uncheck()
  await chooser.getByRole('checkbox', { name: 'Handled versus abandoned interactions' }).check()
  await chooser.getByRole('radio', { name: 'Chart' }).check()

  await expect(page).toHaveURL(/analytics\.composer\.contents=handled-vs-abandoned/)
  await expect(page).toHaveURL(/analytics\.composer\.presentation=chart/)
  await expect(firstContent).not.toBeChecked()
})

test('native composer drafts remain scoped to their session after refresh', async ({ page }) => {
  await installAnalyticsFixture(page, workspaceWithSessions)

  await page.goto('/analytics/conversations/session-one')
  const composer = page.getByRole('combobox', { name: 'Ask an analytics question' })
  await composer.fill('Draft for session one')
  await expect(page).not.toHaveURL(/Draft%20for%20session%20one/i)

  await page.goto('/analytics/conversations/session-two')
  await expect(composer).toHaveValue('')
  await composer.fill('Draft for session two')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Ask an analytics question' })).toHaveValue('Draft for session two')

  await page.goto('/analytics/conversations/session-one')
  await expect(page.getByRole('combobox', { name: 'Ask an analytics question' })).toHaveValue('Draft for session one')
})

test('native composer restores report context across session history without leaking it to the empty session', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await installAnalyticsFixture(page, workspaceWithSessions, payload => { submitted = payload })

  await page.goto('/analytics/conversations/session-one')
  const composer = page.getByRole('combobox', { name: 'Ask an analytics question' })
  await composer.fill('/contact center')
  await page.getByRole('option', { name: /Contact Center Activity Overview.*dashboard/i }).click()
  await expect(page.getByLabel('Selected report: Contact Center Activity Overview')).toBeVisible()

  await page.getByRole('button', { name: 'Session Two', exact: true }).click()
  await expect(page).toHaveURL(/\/analytics\/conversations\/session-two(?:\?|$)/)
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(/\/analytics\/conversations\/session-one(?:\?|$)/)
  await expect(page.getByLabel('Selected report: Contact Center Activity Overview')).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/analytics\/conversations\/session-two(?:\?|$)/)
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(0)

  await page.goBack()
  await expect(page.getByLabel('Selected report: Contact Center Activity Overview')).toBeVisible()
  await composer.press('Enter')
  await expect.poll(() => submitted).toMatchObject({
    sessionId: 'session-one',
    reportId: 'contact-center-activity-overview',
  })
})

test('same-conversation history clears a removed report before submitting', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await installAnalyticsFixture(page, workspaceWithSessions, payload => { submitted = payload })
  await page.goto('/analytics/conversations/session-one')
  const composer = page.getByRole('combobox', { name: 'Ask an analytics question' })
  await composer.fill('/contact center')
  await page.getByRole('option', { name: /Contact Center Activity Overview.*dashboard/i }).click()
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(1)
  await page.goBack()
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(0)
  await page.goForward()
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(1)
  await page.goBack()
  await expect(page.getByLabel(/Selected report:/)).toHaveCount(0)
  await composer.fill('Show the overall trend')
  await composer.press('Enter')
  await expect.poll(() => submitted?.sessionId).toBe('session-one')
  expect(submitted?.reportId).toBeUndefined()
  expect(submitted?.sourceContext).toBeUndefined()
})

test('persisted cancelled report conversation shows Retry and resends its report context', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await installAnalyticsFixture(page, workspaceWithCancelledReport, payload => { submitted = payload })

  await page.goto('/analytics/conversations/session-one')
  await expect(page.getByRole('alert')).toContainText('Request cancelled.')
  await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect.poll(() => submitted).toMatchObject({
    sessionId: 'session-one',
    retryOf: 'cancelled-report-request',
    reportId: 'contact-center-activity-overview',
    reportVersion: contactCenterReport.version,
  })
})

test('Advisor report-only cancellation retries with the persisted report source', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await installAnalyticsFixture(page, workspaceWithCancelledAdvisorReport, payload => { submitted = payload })

  await page.goto('/analytics?analyticsDialog=advisor&analyticsAdvisorReport=contact-center-activity-overview')
  const advisor = page.getByRole('complementary', { name: 'Advisor conversation' })
  await expect(advisor).toBeVisible()
  await expect(advisor.getByRole('alert')).toContainText('Request cancelled.')
  await advisor.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect.poll(() => submitted).toMatchObject({
    sessionId: 'advisor-session',
    retryOf: 'cancelled-advisor-report-request',
    reportId: 'contact-center-activity-overview',
    reportVersion: contactCenterReport.version,
  })
})