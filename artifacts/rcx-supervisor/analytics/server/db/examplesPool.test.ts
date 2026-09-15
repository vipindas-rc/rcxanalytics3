import { describe, expect, it } from 'vitest'
import { examplesDatabaseUrl } from './examplesPool.ts'

describe('examples database configuration', () => {
  it('uses a dedicated synthetic database when present', () => {
    expect(examplesDatabaseUrl({ DATABASE_URL: 'postgres://operational', SYNTHETIC_DATABASE_URL: 'postgres://examples' })).toBe('postgres://examples')
  })

  it('uses the Replit DATABASE_URL when a separate database is not provisioned', () => {
    expect(examplesDatabaseUrl({ DATABASE_URL: 'postgres://replit' })).toBe('postgres://replit')
  })
})
