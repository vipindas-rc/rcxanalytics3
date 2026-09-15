const value = process.env.TEST_SYNTHETIC_DATABASE_URL
if (!value) throw new Error('TEST_SYNTHETIC_DATABASE_URL is required for persistent synthetic examples tests.')
const parsed = new URL(value)
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !/^rcx_synthetic_test(?:_[a-z0-9_]+)?$/i.test(parsed.pathname.slice(1))) throw new Error('TEST_SYNTHETIC_DATABASE_URL must name a local rcx_synthetic_test database.')