import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

describe('standalone Analytics Vite proxy', () => {
  it('maps the browser /api/analytics prefix onto the server /api routes', () => {
    const proxy = (config.server as { proxy: Record<string, { target: string, rewrite: (path: string) => string }> }).proxy['/api/analytics']
    expect(proxy.target).toBe('http://127.0.0.1:5174')
    expect(proxy.rewrite('/api/analytics/workspace')).toBe('/api/workspace')
    expect(proxy.rewrite('/api/analytics')).toBe('/api')
  })
})