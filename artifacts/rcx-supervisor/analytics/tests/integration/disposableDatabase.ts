import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { isolatedTestDatabaseUrl } from './databaseSafety.ts'

type DisposableDatabase = { url: string; pool: Pool; dispose: () => Promise<void> }

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

/**
 * Creates a database owned by this test process. TEST_DATABASE_URL is only an
 * administrator connection template; application pools receive the generated URL.
 */
export async function createDisposableDatabase(label = 'run'): Promise<DisposableDatabase> {
  const template = isolatedTestDatabaseUrl()
  if (!template) throw new Error('TEST_DATABASE_URL is required for isolated database tests; no runtime database fallback is allowed.')
  const target = new URL(template)
  const database = `rcx_test_${label.replaceAll(/[^a-z0-9]/gi, '_').slice(0, 20)}_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  target.pathname = `/${database}`
  const adminUrl = new URL(template)
  adminUrl.pathname = '/postgres'
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  } catch (error) {
    await admin.end()
    throw new Error(`Unable to create isolated database ${database}. TEST_DATABASE_URL must have local PostgreSQL administrator privileges. ${(error as Error).message}`)
  }
  const pool = new Pool({ connectionString: target.toString(), max: 5 })
  let disposed = false
  return {
    url: target.toString(),
    pool,
    async dispose() {
      if (disposed) return
      disposed = true
      await pool.end()
      try {
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`)
      } finally {
        await admin.end()
      }
    },
  }
}