import { expect, test, type Page } from '@playwright/test'
import type { Workspace } from '../../src/lib/model'

const today = '2026-09-12T09:00:00.000Z'

export function emptyWorkspace(): Workspace {
  return {
    version: 3, revision: 1, sessions: [], projects: [{ id: 'project-analytics', name: 'Analytics' }],
    datasets: [], artifacts: [], savedCharts: [], dashboards: [], requests: [], preferences: {}, briefings: [],
  }
}

export function workspaceWithConversation(): Workspace {
  const workspace = emptyWorkspace()
  workspace.sessions.push({
    id: 'session-first', title: 'Weekly performance', projectId: null,
    createdAt: today, updatedAt: today,
    messages: [
      { id: 'message-user', role: 'user', text: 'How did the five regions perform?', createdAt: today },
      { id: 'message-assistant', role: 'assistant', text: 'All five regions are represented in this synthetic report.', createdAt: today, artifactIds: ['artifact-regions'] },
    ],
  })
  workspace.datasets.push({
    id: 'dataset-regions', title: 'Regional performance', seed: 42, createdAt: today, colors: {},
    fields: [
      { id: 'region', name: 'Region', type: 'category', values: ['North', 'South', 'East', 'West', 'Central'] },
      { id: 'sales', name: 'Sales', type: 'number', unit: 'USD', min: 10, max: 50 },
    ],
    rows: [
      { region: 'North', sales: 10 }, { region: 'South', sales: 20 },
      { region: 'East', sales: 30 }, { region: 'West', sales: 40 }, { region: 'Central', sales: 50 },
    ],
  })
  workspace.artifacts.push({
    id: 'artifact-regions', title: 'Sales by region', datasetId: 'dataset-regions',
    view: { chartType: 'bar', x: 'region', y: 'sales', aggregation: 'sum', filters: [] },
    renderer: 'echarts', createdAt: today, summary: 'Five regions sum to $150.',
    kpis: [{ label: 'Total sales', value: 150, unit: 'USD' }],
  })
  return workspace
}

export function workspaceWithDashboard(): Workspace {
  const workspace = workspaceWithConversation()
  workspace.dashboards.push({
    id: 'dashboard-team', projectId: 'project-analytics', title: 'Team dashboard', revision: 1, filters: [], history: [],
    widgets: [
      { id: 'widget-one', artifactId: 'artifact-regions', title: 'Regional sales' },
      { id: 'widget-two', artifactId: 'artifact-regions', title: 'Regional trend' },
      { id: 'widget-three', artifactId: 'artifact-regions', title: 'Regional comparison' },
    ],
  })
  return workspace
}

export async function mockWorkspace(page: Page, workspace: Workspace) {
  const unexpected: string[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/workspace' && request.method() === 'GET') {
      await route.fulfill({ json: workspace })
      return
    }
    if (path === '/api/briefings/ensure' && request.method() === 'POST') {
      workspace.briefings = [{ id: 'briefing-morning', scenario: 'morning', title: 'Morning supervisor briefing', reportingWindow: 'Previous completed operating day', comparisonWindow: 'Compared with the preceding five operating days', summary: [], createdAt: today, widgets: [] }]
      await route.fulfill({ json: workspace.briefings })
      return
    }
    if (path === '/api/artifacts/artifact-regions/render' && request.method() === 'POST') {
      const renderer = (request.postDataJSON() as { renderer: string }).renderer
      if (renderer === 'echarts') {
        await route.fulfill({ json: {
          artifactId: 'artifact-regions', renderer, rows: workspace.datasets[0].rows,
          capabilities: [
            { renderer: 'echarts', supported: true }, { renderer: 'chartjs', supported: true },
            { renderer: 'plotly', supported: true },
          ],
          spec: {
            animation: false, grid: { containLabel: true },
            xAxis: { type: 'category', data: ['North', 'South', 'East', 'West', 'Central'] },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', name: 'Sales', data: [10, 20, 30, 40, 50] }],
          },
        } })
        return
      }
      if (renderer === 'chartjs') {
        await new Promise(resolve => setTimeout(resolve, 600))
        await route.fulfill({ json: {
          artifactId: 'artifact-regions', renderer, rows: workspace.datasets[0].rows,
          capabilities: [
            { renderer: 'echarts', supported: true }, { renderer: 'chartjs', supported: true },
            { renderer: 'plotly', supported: true },
          ],
          spec: {
            type: 'bar', data: {
              labels: ['North', 'South', 'East', 'West', 'Central'],
              datasets: [{ label: 'Sales', data: [10, 20, 30, 40, 50] }],
            },
            options: { responsive: true, maintainAspectRatio: false },
          },
        } })
        return
      }
    }
    unexpected.push(`${request.method()} ${path}`)
    await route.fulfill({ status: 501, json: { error: `Unmocked test request: ${path}` } })
  })
  return unexpected
}

export async function openHistoricalConversation(page: Page, width = 1440) {
  if (width <= 850) await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await page.getByRole('button', { name: 'Weekly performance', exact: true }).click()
}

test('welcome starter fills the composer without sending a request', async ({ page }) => {
  const unexpected = await mockWorkspace(page, emptyWorkspace())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What would you like to understand?' })).toBeVisible()
  await page.getByRole('button', { name: /Queue abandonment/i }).click()
  await expect(page.getByRole('combobox', { name: 'Ask an analytics question' })).not.toBeEmpty()
  expect(unexpected).toEqual([])
})

test('slash report picker scopes a question without submitting it', async ({ page }) => {
  const unexpected = await mockWorkspace(page, emptyWorkspace())
  await page.goto('/')
  const composer = page.getByRole('combobox', { name: 'Ask an analytics question' })
  await composer.fill('/agent activity overview')
  await expect(page.getByRole('listbox', { name: 'Reports' })).toBeVisible()
  await page.getByRole('option', { name: /Agent Activity Overview.*dashboard/i }).click()
  await expect(page.getByLabel('Selected report: Agent Activity Overview')).toBeVisible()
  await expect(composer).toHaveValue('')
  await composer.fill('How many agents are AI agents?')
  expect(unexpected).toEqual([])
})

test('a selected dashboard exposes source-backed contents before sending a request', async ({ page }) => {
  await mockWorkspace(page, emptyWorkspace())
  let submitted: any
  await page.route('**/api/sessions', async route => await route.fulfill({ status: 201, json: { id: 'selected-session', title: 'New analytics chat', projectId: null, createdAt: today, updatedAt: today, messages: [] } }))
  await page.route('**/api/conversation', async route => { submitted = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { id: 'selected-request', sessionId: 'selected-session', question: submitted.question, status: 'pending', phase: 'initializing', userMessageId: 'user', createdAt: today } }) })
  await page.goto('/')
  const composer = page.getByRole('combobox', { name: 'Ask an analytics question' })
  await composer.pressSequentially('/contact center')
  await page.getByRole('option', { name: /Contact Center Activity Overview.*dashboard/i }).click()
  const chooser = page.getByRole('region', { name: 'Contact Center Activity Overview contents' })
  await expect(chooser).toBeVisible()
  await expect(chooser.getByText('Queue abandonment rate', { exact: true })).toBeVisible()
  await expect(chooser.getByRole('radio', { name: 'Chart' })).toBeVisible()
  await chooser.getByRole('button', { name: 'Show selected' }).click()
  await expect.poll(() => submitted).toBeTruthy()
  expect(submitted).toMatchObject({ question: 'Show Queue abandonment rate.', reportId: 'contact-center-activity-overview', selectedContentIds: ['queue-abandonment-rate'], presentationPreference: 'auto' })
})

test('a text response keeps progress inside the conversation and removes it after the reply', async ({ page }) => {
  const workspace = emptyWorkspace()
  workspace.sessions.push({ id: 'session-status', title: 'Status request', projectId: null, createdAt: today, updatedAt: today, messages: [{ id: 'status-user', role: 'user', text: 'Show sales.', createdAt: today, requestId: 'request-status' }] })
  workspace.requests.push({ id: 'request-status', sessionId: 'session-status', question: 'Show sales.', status: 'pending', phase: 'Analyzing your question', userMessageId: 'status-user', createdAt: today })
  await mockWorkspace(page, workspace)
  await page.route('**/api/requests/request-status', async route => {
    Object.assign(workspace.requests[0], { status: 'completed', phase: 'Complete', artifactIds: [] })
    workspace.sessions[0].messages.push({ id: 'status-answer', role: 'assistant', text: 'Ready.', createdAt: today, requestId: 'request-status' })
    await route.fulfill({ json: workspace.requests[0] })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Status request', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Ask an analytics question' })).toBeInViewport()
  const status = page.locator('.conversation-content').getByRole('status')
  await expect(status).toHaveText('Analyzing your question')
  await expect(status).toHaveAccessibleName('Analyzing your question')
  await expect(status.getByRole('img')).toHaveCount(0)
  await expect(status).toHaveCount(0, { timeout: 4_000 })
  await expect(page.getByText('Ready.', { exact: true })).toBeVisible()
})

test('uses a simplified sidebar with a supervisor briefing', async ({ page }) => {
  await mockWorkspace(page, emptyWorkspace())
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Saved charts' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dashboards' })).toHaveCount(0)
  await page.getByRole('button', { name: 'AI suggestions' }).click()
  await expect(page.getByRole('heading', { name: 'Morning supervisor briefing' })).toBeVisible()
})

test('uses Spring typography and exposes catalog questions', async ({ page }) => {
  await mockWorkspace(page, emptyWorkspace())
  await page.goto('/')
  await expect(page.locator('.analytics-app')).toHaveCSS('font-family', /Inter/)
  await page.getByRole('button', { name: /Queue abandonment/i }).click()
  await expect(page.getByRole('combobox', { name: 'Ask an analytics question' })).toHaveValue(/abandonment rates across five fictional queues/i)
  await page.getByRole('button', { name: /Browse questions/i }).click()
  await expect(page.getByRole('button', { name: /Campaign success/i })).toBeVisible()
  const dialog = page.locator('.catalog-dialog-content')
  const bounds = await dialog.boundingBox()
  expect(bounds?.width).toBeGreaterThan(500)
  const surface = page.locator('.sui-dialog-body').filter({ has: dialog })
  const surfaceBounds = await surface.boundingBox()
  expect(surfaceBounds).not.toBeNull()
  for (const question of await page.locator('.catalog-question').all()) {
    const questionBounds = await question.boundingBox()
    expect(questionBounds).not.toBeNull()
    expect(questionBounds!.x).toBeGreaterThanOrEqual(surfaceBounds!.x - 1)
    expect(questionBounds!.x + questionBounds!.width).toBeLessThanOrEqual(surfaceBounds!.x + surfaceBounds!.width + 1)
  }
  await expect(page.locator('.catalog-question-content').first()).toHaveCSS('display', 'flex')
})

test('lays dashboard widgets out as a readable grid without a nested action strip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const workspace = workspaceWithDashboard()
  await mockWorkspace(page, workspace)
  await page.route('**/api/dashboards/dashboard-team', async route => {
    const patch = route.request().postDataJSON() as { widgets: Workspace['dashboards'][number]['widgets'] }
    workspace.dashboards[0].widgets = patch.widgets
    await route.fulfill({ json: workspace.dashboards[0] })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Analytics', exact: true }).click()
  await page.getByRole('button', { name: 'Team dashboard' }).click()
  const widgets = page.locator('.dashboard-widget')
  await expect(widgets).toHaveCount(3)
  await expect(widgets.first().locator('.widget-tools')).toBeHidden()
  const [first, second] = await Promise.all([widgets.nth(0).boundingBox(), widgets.nth(1).boundingBox()])
  expect(first?.width).toBeGreaterThan(second?.width ?? 0)
})

test('a historical answer keeps its chart inline and offers data inspection', async ({ page }) => {
  await mockWorkspace(page, workspaceWithConversation())
  await page.goto('/')
  await openHistoricalConversation(page)
  await expect(page.getByText('All five regions are represented in this synthetic report.')).toBeVisible()
  await expect(page.getByRole('complementary', { name: /analysis panel/i })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /Sales by region/i })).toBeVisible()
  await expect(page.locator('.renderer-control')).toContainText('Render with')
  await expect(page.locator('.synthetic-label')).toHaveCount(0)
  await expect(page.locator('.chart-frame').first()).toHaveCSS('height', '280px')
  const renderers = page.getByRole('radio')
  await expect(renderers).toHaveCount(3)
  const [echarts, chartjs] = await Promise.all([renderers.nth(0).boundingBox(), renderers.nth(1).boundingBox()])
  expect(chartjs!.x).toBeGreaterThanOrEqual(echarts!.x + echarts!.width)
  await page.getByRole('button', { name: /View data/i }).click()
  await expect(page.getByRole('table')).toContainText('Central')
  await expect(page.getByRole('table')).toContainText('50')
})

test('chart actions offer an explicit add-to-project flow', async ({ page }) => {
  await mockWorkspace(page, workspaceWithConversation())
  await page.goto('/')
  await openHistoricalConversation(page)
  await page.getByRole('button', { name: 'More chart actions' }).click()
  await page.getByRole('menuitem', { name: 'Add chart to project' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add chart to project' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Select Analytics' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add to project' })).toBeDisabled()
})

test('recent conversations and projects expose confirmed deletion', async ({ page }) => {
  const workspace = workspaceWithConversation()
  await mockWorkspace(page, workspace)
  await page.route('**/api/sessions/session-first', async route => {
    workspace.sessions = workspace.sessions.filter(session => session.id !== 'session-first')
    await route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete Weekly performance' }).click()
  await expect(page.getByText('Delete this conversation?')).toBeVisible()
  const deleteDialog = page.locator('.sui-dialog-body').filter({ hasText: 'Delete this conversation?' })
  await expect(deleteDialog.locator('.sui-dialog-title-root')).toHaveText('Delete this conversation?')
  await expect(deleteDialog.locator('.sui-dialog-actions-root')).toBeVisible()
  await expect(deleteDialog.getByRole('button', { name: 'Delete conversation' })).toHaveClass(/contained-danger/)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Delete this conversation?')).toHaveCount(0)
  await page.getByRole('button', { name: 'Delete Weekly performance' }).click()
  await page.getByRole('button', { name: 'Delete conversation' }).click()
  await expect(page.getByRole('button', { name: 'Weekly performance', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete Analytics' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete Analytics' }).click()
  await expect(page.getByText('Delete this project?')).toBeVisible()
})

test('uses suggestions when clarification choices are empty', async ({ page }) => {
  const workspace = workspaceWithConversation()
  workspace.sessions[0].messages[1].choices = []
  workspace.sessions[0].messages[1].suggestions = ['Compare abandonment rates across queues.']
  await mockWorkspace(page, workspace)
  await page.goto('/')
  await openHistoricalConversation(page)
  await expect(page.getByRole('button', { name: 'Compare abandonment rates across queues.' })).toBeVisible()
})

test('catalog follow-ups submit a fresh synthetic question instead of inheriting a chart', async ({ page }) => {
  const workspace = workspaceWithConversation()
  const prompt = 'Compare fictional dispositions across five queues as a grouped bar chart.'
  workspace.sessions[0].messages[1].suggestions = [prompt]
  await mockWorkspace(page, workspace)
  await page.route('**/api/conversation', async route => {
    await route.fulfill({ json: { id: 'request-catalog', sessionId: 'session-first', question: prompt, status: 'pending', createdAt: today } })
  })
  await page.goto('/')
  await openHistoricalConversation(page)
  await page.getByRole('button', { name: prompt }).click()
  await expect(page.getByText(/About: Sales by region/)).toHaveCount(0)
  await expect(page.getByText(prompt).last()).toBeVisible()
})

test('catalog suggestions omit the previous chart from the request', async ({ page }) => {
  const workspace = workspaceWithConversation()
  const prompt = 'Compare fictional dispositions across five queues as a grouped bar chart.'
  workspace.sessions[0].messages[1].suggestions = [prompt]
  await mockWorkspace(page, workspace)
  let contextArtifactId: string | undefined
  await page.route('**/api/conversation', async route => {
    contextArtifactId = (route.request().postDataJSON() as { contextArtifactId?: string }).contextArtifactId
    await route.fulfill({ json: { id: 'request-catalog', sessionId: 'session-first', question: prompt, status: 'pending', createdAt: today } })
  })
  await page.goto('/')
  await openHistoricalConversation(page)
  await page.getByRole('button', { name: prompt }).click()
  await expect.poll(() => contextArtifactId).toBeUndefined()
})

test('clarification choices submit with the chart that prompted the choice', async ({ page }) => {
  const workspace = workspaceWithConversation()
  workspace.sessions[0].messages.push({
    id: 'message-clarification', role: 'assistant',
    text: 'Which pyramid style should I use for this chart?',
    choices: ['Funnel pyramid', 'Population pyramid'], createdAt: today,
  })
  await mockWorkspace(page, workspace)
  let contextArtifactId: string | undefined
  await page.route('**/api/conversation', async route => {
    contextArtifactId = (route.request().postDataJSON() as { contextArtifactId?: string }).contextArtifactId
    await route.fulfill({ json: { id: 'request-clarification', sessionId: 'session-first', question: 'Population pyramid', status: 'pending', createdAt: today } })
  })
  await page.goto('/')
  await openHistoricalConversation(page)
  await page.getByRole('button', { name: 'Population pyramid' }).click()
  await expect.poll(() => contextArtifactId).toBe('artifact-regions')
})

test('renderer switch retains the current chart until the target finishes', async ({ page }) => {
  await mockWorkspace(page, workspaceWithConversation())
  await page.goto('/')
  await openHistoricalConversation(page)
  const card = page.getByTestId('chart-card').filter({ has: page.getByRole('heading', { name: 'Sales by region' }) })
  await expect(card.getByTestId('chart-host')).toHaveAttribute('data-renderer', 'echarts')
  await card.getByRole('radio', { name: 'Chart.js' }).click()
  await expect(card.getByTestId('chart-host').first()).toHaveAttribute('data-renderer', 'echarts')
  await expect(card.getByTestId('chart-host').last()).toHaveAttribute('data-renderer', 'chartjs')
  await expect(card.getByRole('radio', { name: 'Chart.js' })).toHaveAttribute('aria-checked', 'true')
})

test('chart controls use one compact selection and no duplicate navigation rail', async ({ page }) => {
  await mockWorkspace(page, workspaceWithConversation())
  await page.goto('/')
  await openHistoricalConversation(page)
  await expect(page.getByRole('radiogroup', { name: 'Chart renderer' })).toBeVisible()
  await expect(page.locator('.app-rail')).toHaveCount(0)
})

for (const width of [375, 768, 1024, 1440]) {
  test(`workspace stays within a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await mockWorkspace(page, workspaceWithConversation())
    await page.goto('/')
    await openHistoricalConversation(page, width)
    await expect(page.getByText('All five regions are represented in this synthetic report.')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
}
