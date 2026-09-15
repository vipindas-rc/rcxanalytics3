import { expect, test } from '@playwright/test'

test('embedded Analytics uses the Supervisor iframe gateway and persists mutations', async ({ page }) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  await page.goto('/analytics')
  const frame = page.frameLocator('iframe[title="Analytics"]')
  await expect(frame.getByRole('combobox', { name: 'Ask an analytics question' })).toBeVisible()
  await frame.getByRole('button', { name: /Queue abandonment/i }).click()
  await expect(frame.getByRole('combobox', { name: 'Ask an analytics question' })).not.toBeEmpty()
  const session = await frame.locator('body').evaluate(async () => {
    const created = await fetch('/analytics-api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    if (!created.ok) throw new Error(await created.text())
    return created.json()
  })
  const request = await frame.locator('body').evaluate(async (sessionId) => {
    const response = await fetch('/analytics-api/conversation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, requestId: 'gateway-deterministic', question: 'Explain workflow interaction volume without a chart.' }) })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, session.id)
  await expect.poll(async () => frame.locator('body').evaluate(async (requestId) => (await fetch(`/analytics-api/requests/${requestId}`)).json(), request.id)).toMatchObject({ status: 'completed' })
  await page.reload()
  await expect.poll(async () => frame.locator('body').evaluate(async () => (await fetch('/analytics-api/workspace')).json())).toMatchObject({ sessions: expect.arrayContaining([expect.objectContaining({ id: session.id })]) })
  await frame.locator('body').evaluate(() => parent.postMessage({ type: 'rcx.analytics.navigate', version: 1, state: { view: 'saved', sessionId: null, projectId: null, dashboardId: null } }, location.origin))
  await expect(page).toHaveURL(/analyticsView=saved/)
  expect(requests.some(path => path.startsWith('/analytics-api/'))).toBe(true)
  expect(requests.some(path => path.startsWith('/api/') && !path.startsWith('/analytics-api/'))).toBe(false)
  expect(errors).toEqual([])
})