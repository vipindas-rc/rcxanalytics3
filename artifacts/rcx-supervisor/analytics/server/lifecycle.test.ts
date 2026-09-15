import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAnalyticsLifecycle, type AnalyticsRuntime } from './lifecycle.ts'
import { Store } from './store.ts'
import { createApp } from './app.ts'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

function responseCode(body: unknown): string {
  if (!body || typeof body !== 'object' || !('code' in body) || typeof body.code !== 'string') {
    throw new Error('Expected the readiness response to include a string code.')
  }
  return body.code
}

async function hostFor(runtime: Promise<AnalyticsRuntime>, timeout = 1_000) {
  const lifecycle = createAnalyticsLifecycle({ initialize: () => runtime, initializationTimeoutMs: timeout, log: () => {} })
  const host = express()
  host.use('/analytics-api', lifecycle.middleware)
  const server = host.listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise<void>((resolve, reject) => server.once('listening', resolve).once('error', reject))
  const port = (server.address() as { port: number }).port
  const request = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`)
    return { response, body: await response.json() }
  }
  return { lifecycle, request, url: `http://127.0.0.1:${port}` }
}

describe('Supervisor Analytics gateway lifecycle', () => {
  it('returns a bounded readiness response, then adapts the gateway to Analytics /api routes', async () => {
    let release!: (runtime: AnalyticsRuntime) => void
    const runtime = new Promise<AnalyticsRuntime>(resolve => { release = resolve })
    const { lifecycle, request, url } = await hostFor(runtime)
    void lifecycle.start().catch(() => {})
    const unavailable = await request('/analytics-api/status')
    expect(unavailable.response.status).toBe(503)
    expect(unavailable.response.headers.get('retry-after')).toBe('2')
    expect(unavailable.body).toEqual({ error: 'Analytics is initializing. Retry shortly.', code: 'analytics_initializing' })

    const analytics = express()
    analytics.get('/api/status', (req, response) => response.json({ path: req.path, requestId: req.get('x-request-id') }))
    release({ app: analytics, close: async () => {} })
    await lifecycle.start()
    const ready = await fetch(`${url}/analytics-api/status`, { headers: { 'x-request-id': 'request-42' } })
    expect(ready.status).toBe(200)
    await expect(ready.json()).resolves.toEqual({ path: '/api/status', requestId: 'request-42' })
  })

  it('keeps serving readiness 503 while a slow initializer remains eligible to become ready', async () => {
    let release!: (runtime: AnalyticsRuntime) => void
    let closed = false
    const runtime = new Promise<AnalyticsRuntime>(resolve => { release = resolve })
    const { lifecycle, request } = await hostFor(runtime, 5)
    void lifecycle.start().catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 15))
    expect(responseCode((await request('/analytics-api/workspace')).body)).toBe('analytics_initializing')
    const analytics = express()
    analytics.get('/api/workspace', (_request, response) => response.json({ ready: true }))
    release({ app: analytics, close: async () => { closed = true } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(closed).toBe(false)
    expect((await request('/analytics-api/workspace')).body).toEqual({ ready: true })
  })

  it('preserves a newly returned session ID through the real host parser and gateway adapter', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'analytics-gateway-session-'))
    const store = new Store(path.join(directory, 'workspace.json'))
    await store.initialize()
    const analytics = createApp(store, async () => ({ kind: 'text', text: 'Ready' }))
    const lifecycle = createAnalyticsLifecycle({ initialize: async () => ({ app: analytics, close: async () => {} }), log: () => {} })
    const host = express()
    host.use(express.json())
    host.use('/analytics-api', lifecycle.middleware)
    const server = host.listen(0, '127.0.0.1')
    servers.push(server)
    await new Promise<void>((resolve, reject) => server.once('listening', resolve).once('error', reject))
    await lifecycle.start()
    const port = (server.address() as { port: number }).port
    const post = async (endpoint: string, body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}/analytics-api${endpoint}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.json() as { id?: string } }
    }
    const session = await post('/sessions', {})
    expect(session.status).toBe(201)
    expect(session.body.id).toMatch(/^session-/)
    const conversation = await post('/conversation', {
      sessionId: session.body.id,
      requestId: 'gateway-session-race',
      question: 'Hello',
    })
    expect(conversation.status).toBe(202)
  })
})