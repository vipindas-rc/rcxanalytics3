import { expect, test, type Page } from '@playwright/test'
import type { Workspace } from '../../src/lib/model'

const now = '2026-09-13T00:00:00.000Z'
const question = 'Analyze Sales by region further and identify the most important supported patterns.'

function fixture(): Workspace {
  return {
    version: 3, revision: 1, projects: [{ id: 'project-analytics', name: 'Analytics' }],
    sessions: [{ id: 'session-first', title: 'Regional report', projectId: null, createdAt: now, updatedAt: now, messages: [
      { id: 'user-one', role: 'user', text: 'Show sales by region.', createdAt: now },
      { id: 'answer-one', role: 'assistant', text: 'Five synthetic regions.', createdAt: now, artifactIds: ['artifact-regions'] },
    ] }],
    datasets: [{ id: 'dataset-regions', title: 'Regional sales', seed: 42, createdAt: now, colors: {}, fields: [
      { id: 'region', name: 'Region', type: 'category', values: ['North', 'South', 'East', 'West', 'Central'] },
      { id: 'sales', name: 'Sales', type: 'number', unit: 'USD' },
    ], rows: [{ region: 'North', sales: 10 }, { region: 'South', sales: 20 }, { region: 'East', sales: 30 }, { region: 'West', sales: 40 }, { region: 'Central', sales: 50 }] }],
    artifacts: [{ id: 'artifact-regions', datasetId: 'dataset-regions', title: 'Sales by region', createdAt: now, renderer: 'echarts', summary: 'Five synthetic regions.', kpis: [], view: { chartType: 'bar', x: 'region', y: 'sales', aggregation: 'sum', filters: [] } }],
    savedCharts: [], dashboards: [{ id: 'dashboard-team', projectId: 'project-analytics', title: 'Team dashboard', revision: 1, widgets: [], filters: [], history: [] }],
    requests: [], preferences: {}, briefings: [],
  }
}

async function routes(page: Page, workspace: Workspace) {
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname
    if (path === '/api/workspace' && request.method() === 'GET') return route.fulfill({ json: workspace })
    if (path === '/api/briefings/ensure' && request.method() === 'POST') return route.fulfill({ json: [] })
    if (path === '/api/artifacts/artifact-regions/render' && request.method() === 'POST') return route.fulfill({ json: {
      artifactId: 'artifact-regions', renderer: 'echarts', rows: workspace.datasets[0].rows,
      capabilities: [{ renderer: 'echarts', supported: true }, { renderer: 'chartjs', supported: true }, { renderer: 'plotly', supported: true }],
      spec: { animation: false, xAxis: { type: 'category', data: ['North', 'South', 'East', 'West', 'Central'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [10, 20, 30, 40, 50] }] },
    } })
    return route.fulfill({ status: 501, json: { error: `Unmocked ${request.method()} ${path}` } })
  })
}

async function openReport(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 800 })
  await page.goto('/')
  if (width <= 850) await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await page.getByRole('button', { name: 'Regional report', exact: true }).click()
  await expect(page.getByTestId('chart-card')).toBeVisible()
}

test('Spotlight uses a stable one-line analytical title for long conversations', async ({ page }) => {
  const workspace = fixture()
  const originalTitle = 'Help me understand Service level, including the metric definition and the visible values.'
  workspace.sessions[0].title = originalTitle
  await routes(page, workspace)
  await page.goto('/')
  await page.getByRole('button', { name: 'Search conversations' }).click()

  const dialog = page.getByRole('dialog')
  const result = page.locator('button[aria-label^="Open conversation:"]').first()
  await expect(result).toHaveText('Sales by region')
  await expect(result).toHaveAttribute('title', originalTitle)
  await expect(result).toHaveAttribute('aria-label', `Open conversation: ${originalTitle}`)
  const initialDialog = await dialog.boundingBox()
  const initialResult = await result.boundingBox()
  expect(initialDialog).not.toBeNull()
  expect(initialDialog?.height).toBeLessThanOrEqual(380)
  expect(initialResult?.height).toBeLessThanOrEqual(44)

  await dialog.getByRole('textbox', { name: 'Search conversations' }).fill('no matching conversation')
  await expect(dialog.getByText('No conversations found.')).toBeVisible()
  const filteredDialog = await dialog.boundingBox()
  expect(filteredDialog?.y).toBeCloseTo(initialDialog!.y, 0)
})

test('adding a chart accepts the dashboard returned by the API and offers Open dashboard', async ({ page }) => {
  const workspace = fixture()
  await routes(page, workspace)
  let addCount = 0
  await page.route('**/api/dashboards/dashboard-team/widgets', async route => {
    addCount++
    const dashboard = workspace.dashboards[0]
    dashboard.widgets.push({ id: 'widget-added', artifactId: 'artifact-regions', title: 'Sales by region' })
    await route.fulfill({ status: 201, json: dashboard })
  })
  await openReport(page)
  await page.getByRole('button', { name: 'More chart actions' }).click()
  await page.getByRole('menuitem', { name: 'Add to dashboard' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Select Analytics' }).check()
  await dialog.getByRole('radio', { name: 'Select Team dashboard' }).check()
  await dialog.getByRole('button', { name: 'Add to dashboard' }).click()
  await expect(page.getByRole('button', { name: 'Open dashboard' })).toBeVisible()
  expect(addCount).toBe(1)
})

test('project and dashboard menus remove only their own chart placement', async ({ page }) => {
  const workspace = fixture()
  workspace.sessions[0].projectId = 'project-analytics'
  workspace.savedCharts.push({ id: 'saved-one', projectId: 'project-analytics', artifactId: 'artifact-regions', title: 'Sales by region' })
  workspace.dashboards[0].widgets.push({ id: 'widget-one', artifactId: 'artifact-regions', title: 'Sales by region' })
  await routes(page, workspace)
  await page.route('**/api/saved-charts/saved-one', async route => {
    expect(route.request().method()).toBe('DELETE')
    workspace.savedCharts = []
    await route.fulfill({ status: 204 })
  })
  await page.route('**/api/dashboards/dashboard-team', async route => {
    expect(route.request().method()).toBe('PATCH')
    const body = route.request().postDataJSON()
    expect(body.revision).toBe(1)
    expect(body.widgets).toEqual([])
    workspace.dashboards[0].widgets = body.widgets
    await route.fulfill({ json: workspace.dashboards[0] })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Analytics', exact: true }).click()
  await expect(page.locator('.project-collection > h3')).toHaveCount(0)
  await expect(page.getByText('Conversations in this project (1)')).toBeVisible()
  await expect(page.locator('.project-conversations').getByRole('button')).toBeHidden()
  await page.getByRole('button', { name: 'More chart actions' }).click()
  await page.getByRole('menuitem', { name: 'Remove from project', exact: true }).click()
  await expect(page.getByTestId('chart-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Team dashboard · 1 widgets' }).click()
  await page.getByRole('button', { name: 'More chart actions' }).click()
  await page.getByRole('menuitem', { name: 'Remove from dashboard', exact: true }).click()
  await expect(page.getByTestId('chart-card')).toHaveCount(0)
  expect(workspace.artifacts).toHaveLength(1)
  await page.getByRole('button', { name: 'Regional report', exact: true }).click()
  await expect(page.getByTestId('chart-card')).toBeVisible()
})

test('Advisor popover submits exactly once with the selected chart as context', async ({ page }) => {
  const workspace = fixture()
  await routes(page, workspace)
  let posted = 0; let contextArtifactId: string | undefined; let postedQuestion = ''
  await page.route('**/api/sessions', async route => {
    const session = { id: 'advisor-session', advisor: true, title: 'Advisor', projectId: null, createdAt: now, updatedAt: now, messages: [] }
    workspace.sessions.push(session)
    await route.fulfill({ status: 201, json: session })
  })
  await page.route('**/api/conversation', async route => {
    posted++
    const body = route.request().postDataJSON() as { contextArtifactId?: string; question: string }
    contextArtifactId = body.contextArtifactId; postedQuestion = body.question
    const pending = { id: 'request-advisor', sessionId: 'advisor-session', question: body.question, status: 'pending' as const, phase: 'Analyzing your question', userMessageId: 'advisor-user', createdAt: now }
    workspace.requests.push(pending)
    workspace.sessions.find(session => session.id === 'advisor-session')!.messages.push({ id: 'advisor-user', role: 'user', text: body.question, createdAt: now, requestId: pending.id })
    await route.fulfill({ status: 202, json: pending })
  })
  await openReport(page)
  await page.getByTestId('chart-card').hover()
  await page.getByRole('button', { name: 'Ask Advisor', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Analyze this further' }).click()
  await expect(page.getByRole('complementary', { name: 'Advisor conversation' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Analyzing your question')
  await expect(page.getByRole('status')).toHaveAccessibleName('Analyzing your question')
  await expect(page.getByRole('status').getByRole('img')).toHaveCount(0)
  await expect.poll(() => posted).toBe(1)
  expect(contextArtifactId).toBe('artifact-regions')
  expect(postedQuestion).toBe(question)
})

test('Advisor retry resends the failed turn with its original chart context', async ({ page }) => {
  const workspace = fixture()
  workspace.sessions.push({ id: 'advisor-session', advisor: true, title: 'Advisor', projectId: null, createdAt: now, updatedAt: now, messages: [{ id: 'advisor-user', role: 'user', text: question, createdAt: now, requestId: 'request-failed' }] })
  workspace.requests.push({ id: 'request-failed', sessionId: 'advisor-session', question, status: 'failed', phase: 'Understanding your request', error: 'Temporary failure', userMessageId: 'advisor-user', createdAt: now, contextArtifactId: 'artifact-regions' })
  await routes(page, workspace)
  let retryBody: Record<string, unknown> | null = null
  await page.route('**/api/conversation', async route => {
    retryBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 202, json: { id: 'request-retry', sessionId: 'advisor-session', question, status: 'failed', phase: 'Could not complete', error: 'Temporary failure', userMessageId: 'advisor-user', createdAt: now } })
  })
  await openReport(page)
  await page.getByTestId('chart-card').hover()
  await page.getByRole('button', { name: 'Ask Advisor', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Analyze this further' }).click()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect.poll(() => retryBody).not.toBeNull()
  expect(retryBody).toMatchObject({ sessionId: 'advisor-session', question, retryOf: 'request-failed', contextArtifactId: 'artifact-regions' })
})

for (const width of [375, 768, 1024, 1440]) {
  test(`Advisor panel and popover remain contained at ${width}px`, async ({ page }) => {
    const workspace = fixture()
    await routes(page, workspace)
    await page.route('**/api/sessions', async route => route.fulfill({ status: 201, json: { id: 'advisor-session', advisor: true, title: 'Advisor', projectId: null, createdAt: now, updatedAt: now, messages: [] } }))
    await page.route('**/api/conversation', async route => route.fulfill({ status: 202, json: { id: 'request-advisor', sessionId: 'advisor-session', question, status: 'pending', phase: 'Understanding your request', userMessageId: 'advisor-user', createdAt: now } }))
    await openReport(page, width)
    await page.getByTestId('chart-card').hover()
    await page.getByRole('button', { name: 'Ask Advisor', exact: true }).click()
    const menu = page.locator('.advisor-menu')
    await expect(menu).toBeVisible()
    const menuBounds = await menu.boundingBox()
    expect(menuBounds).not.toBeNull()
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0)
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width + 1)
    await page.getByRole('menuitem', { name: 'Analyze this further' }).click()
    const panel = page.getByRole('complementary', { name: 'Advisor conversation' })
    await expect(panel).toBeVisible()
    const panelBounds = await panel.boundingBox()
    expect(panelBounds).not.toBeNull()
    expect(panelBounds!.x).toBeGreaterThanOrEqual(0)
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(width + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  })
}

test('Advisor affordance is discoverable on a 768px touch viewport without hover', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 800 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  try {
    await routes(page, fixture())
    await page.goto('/')
    await page.getByRole('button', { name: 'Toggle sidebar' }).tap()
    await page.getByRole('button', { name: 'Regional report', exact: true }).tap()
    await expect(page.getByTestId('chart-card')).toBeVisible()
    const trigger = page.getByTestId('chart-card').locator('.advisor-trigger')
    await expect(trigger).toHaveCSS('opacity', '1')
    await expect(trigger.getByRole('button', { name: 'Ask Advisor' })).toBeVisible()
  } finally { await context.close() }
})

for (const width of [375, 1440]) {
  test(`composer send button shares the input row at ${width}px`, async ({ page }) => {
    await routes(page, fixture())
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const input = page.getByRole('combobox', { name: 'Ask an analytics question' })
    const send = page.getByRole('button', { name: 'Send analytics request' })
    const inputBox = await input.boundingBox()
    const sendBox = await send.boundingBox()
    expect(inputBox).not.toBeNull()
    expect(sendBox).not.toBeNull()
    expect(Math.abs(inputBox!.y + inputBox!.height / 2 - sendBox!.y - sendBox!.height / 2)).toBeLessThan(12)
    expect(sendBox!.x).toBeGreaterThanOrEqual(inputBox!.x + inputBox!.width)
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(width)
  })
}

test('text answer chart chip precedes follow-ups and submits its source message', async ({ page }) => {
  const workspace = fixture()
  workspace.sessions[0].messages.push({ id: 'answer-text', role: 'assistant', text: 'Sales are highest in Central.', createdAt: now, suggestions: ['Compare sales by region as a bar chart.', 'Show sales as a table.'] })
  await routes(page, workspace)
  let submitted: Record<string, unknown> | undefined
  await page.route('**/api/conversation', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ status: 202, json: { ...submitted, id: submitted!.requestId, status: 'pending', phase: 'planning', createdAt: now } })
  })
  await openReport(page)
  const answer = page.locator('.conversation-turn.assistant').last()
  const chip = answer.getByRole('button', { name: 'Show as chart', exact: true })
  await expect(chip).toBeVisible()
  expect(await answer.evaluate(element => element.querySelector('.text-answer-actions')!.getBoundingClientRect().bottom <= element.querySelector('.follow-ups')!.getBoundingClientRect().top)).toBe(true)
  await chip.click()
  await expect.poll(() => submitted?.selectedFollowUpFrom).toBe('answer-text')
  expect(submitted?.question).toBe('Compare sales by region as a bar chart.')
  expect((submitted?.sourceContext as { artifactId: string }).artifactId).toBe('artifact-regions')
})
