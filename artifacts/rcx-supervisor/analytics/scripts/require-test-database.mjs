const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL is required. It must be a local rcx_test database template with CREATE/DROP DATABASE privileges.')
const parsed = new URL(url)
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^rcx_test(?:_[a-z0-9_]+)?$/i.test(parsed.pathname.slice(1))) {
  throw new Error('TEST_DATABASE_URL must name local rcx_test or rcx_test_<run>; the database tests create disposable child databases and never use DATABASE_URL.')
}