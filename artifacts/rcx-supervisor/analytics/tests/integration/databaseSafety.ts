/** Tests must opt into a dedicated local database; never infer the application URL. */
export function isolatedTestDatabaseUrl(value = process.env.TEST_DATABASE_URL): string | undefined {
  if (!value) return undefined
  const parsed = new URL(value)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    || !/^rcx_test(?:_[a-z0-9_]+)?$/i.test(parsed.pathname.slice(1))) {
    throw new Error('TEST_DATABASE_URL must name a local rcx_test or rcx_test_<run> database.')
  }
  if (process.env.DATABASE_URL && value === process.env.DATABASE_URL) {
    throw new Error('The test database must differ from the application DATABASE_URL.')
  }
  return value
}
