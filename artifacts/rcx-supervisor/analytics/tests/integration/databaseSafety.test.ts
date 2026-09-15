import { afterEach, describe, expect, it, vi } from 'vitest'
import { isolatedTestDatabaseUrl } from './databaseSafety'

afterEach(() => vi.unstubAllEnvs())

describe('integration database isolation', () => {
  it('does not fall back to the application database', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/rcx_app')
    vi.stubEnv('TEST_DATABASE_URL', '')
    expect(isolatedTestDatabaseUrl()).toBeUndefined()
  })
  it.each(['postgresql://localhost/rcx_app', 'postgresql://remote.example/rcx_test', 'https://localhost/rcx_test'])('rejects unsafe test destination %s', value => {
    expect(() => isolatedTestDatabaseUrl(value)).toThrow(/local rcx_test/)
  })
  it('rejects the exact application URL even if its name looks like a test database', () => {
    const value = 'postgresql://localhost/rcx_test_shared'
    vi.stubEnv('DATABASE_URL', value)
    expect(() => isolatedTestDatabaseUrl(value)).toThrow(/differ/)
  })
  it('accepts an explicitly isolated local test database', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/rcx_app')
    expect(isolatedTestDatabaseUrl('postgresql://127.0.0.1/rcx_test_run1')).toBe('postgresql://127.0.0.1/rcx_test_run1')
  })
})
