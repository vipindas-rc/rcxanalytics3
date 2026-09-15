import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Pool } from 'pg'

export async function migrateExamplesDatabase(pool: Pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rcx-examples-migrations'))")
    await client.query('CREATE SCHEMA IF NOT EXISTS rcx_examples')
    await client.query('CREATE TABLE IF NOT EXISTS rcx_examples.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
    const directory = fileURLToPath(new URL('./migrations/', import.meta.url))
    for (const name of (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()) {
      const sql = await readFile(path.join(directory, name), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await client.query('SELECT checksum FROM rcx_examples.migrations WHERE name=$1', [name])
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied synthetic-examples migration ${name} was modified.`)
        continue
      }
      await client.query(sql)
      await client.query('INSERT INTO rcx_examples.migrations(name,checksum) VALUES($1,$2)', [name, checksum])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
