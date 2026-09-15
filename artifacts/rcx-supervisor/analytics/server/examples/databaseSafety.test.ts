import { afterEach, describe, expect, it, vi } from 'vitest'
import { isolatedSyntheticExamplesTestDatabaseUrl } from './databaseSafety.ts'

afterEach(() => vi.unstubAllEnvs())

describe('synthetic examples test database isolation', () => {
  it('accepts only an explicit local synthetic test database distinct from the app database', () => {
    vi.stubEnv('SYNTHETIC_DATABASE_URL', 'postgresql://127.0.0.1/rcx_synthetic')
    vi.stubEnv('TEST_SYNTHETIC_DATABASE_URL', 'postgresql://127.0.0.1/rcx_synthetic_test')
    expect(isolatedSyntheticExamplesTestDatabaseUrl()).toContain('rcx_synthetic_test')
  })

  it('rejects a test URL that points to the application synthetic database', () => {
    vi.stubEnv('SYNTHETIC_DATABASE_URL', 'postgresql://127.0.0.1/rcx_synthetic_test')
    vi.stubEnv('TEST_SYNTHETIC_DATABASE_URL', 'postgresql://127.0.0.1/rcx_synthetic_test')
    expect(() => isolatedSyntheticExamplesTestDatabaseUrl()).toThrow(/differ/i)
  })
})
