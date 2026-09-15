export function isolatedSyntheticExamplesTestDatabaseUrl(value = process.env.TEST_SYNTHETIC_DATABASE_URL): string | undefined {
  if (!value) return undefined
  const url = new URL(value)
  const database = url.pathname.replace(/^\//, '')
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^rcx_synthetic_test(?:_[a-z0-9_]+)?$/i.test(database)) {
    throw new Error('TEST_SYNTHETIC_DATABASE_URL must name a local rcx_synthetic_test or rcx_synthetic_test_<run> database.')
  }
  if (process.env.SYNTHETIC_DATABASE_URL === value) {
    throw new Error('The synthetic examples test database must differ from SYNTHETIC_DATABASE_URL.')
  }
  return value
}
