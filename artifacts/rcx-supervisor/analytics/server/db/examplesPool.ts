import { Pool } from 'pg'

export function examplesDatabaseUrl(environment: Record<string, string | undefined> = process.env): string {
  const connectionString = environment.SYNTHETIC_DATABASE_URL ?? environment.DATABASE_URL
  if (!connectionString) throw new Error('SYNTHETIC_DATABASE_URL or DATABASE_URL is required for persistent synthetic examples. Configure PostgreSQL before starting the API.')
  return connectionString
}

export function createExamplesDatabasePool(connectionString = examplesDatabaseUrl()) {
  return new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 })
}
