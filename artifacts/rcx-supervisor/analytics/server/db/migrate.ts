import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import { operationalMigrationsDirectory } from '../runtimePaths.ts'

export async function migrateDatabase(pool: Pool) {
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  await client.query("SELECT pg_advisory_xact_lock(hashtext('rcx-data-migrations'))")
  await client.query('CREATE SCHEMA IF NOT EXISTS rcx_data')
  await client.query('CREATE TABLE IF NOT EXISTS rcx_data.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
   // The host bundles this module to CommonJS, where import.meta.url has no
   // source location. The migration files remain under analytics/server.
   const directory=operationalMigrationsDirectory()
  for(const name of (await readdir(directory)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()) {
   const sql=await readFile(path.join(directory,name),'utf8'),checksum=createHash('sha256').update(sql).digest('hex')
   const existing=await client.query('SELECT checksum FROM rcx_data.migrations WHERE name=$1',[name])
   if(existing.rows.length) {if(existing.rows[0].checksum!==checksum) throw new Error(`Applied migration ${name} was modified.`);continue}
   await client.query(sql)
   await client.query('INSERT INTO rcx_data.migrations(name,checksum) VALUES($1,$2)',[name,checksum])
  }
  await client.query('COMMIT')
 } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
}
