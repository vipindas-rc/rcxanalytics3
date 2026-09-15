import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { PostgresSyntheticExamplesService } from './examples/service.ts'
import { migrateExamplesDatabase } from './examples/migrate.ts'
import { isolatedSyntheticExamplesTestDatabaseUrl } from './examples/databaseSafety.ts'

const testUrl = isolatedSyntheticExamplesTestDatabaseUrl()
const period = { start: '2026-09-01T00:00:00.000Z', end: '2026-09-04T00:00:00.000Z' }

describe.skipIf(!testUrl)('independent examples database acceptance', () => {
  let firstPool: Pool
  let secondPool: Pool
  let first: PostgresSyntheticExamplesService
  let second: PostgresSyntheticExamplesService

  beforeAll(async () => {
    firstPool = new Pool({ connectionString: testUrl, max: 5 })
    secondPool = new Pool({ connectionString: testUrl, max: 5 })
    await migrateExamplesDatabase(firstPool)
    first = new PostgresSyntheticExamplesService(firstPool)
    second = new PostgresSyntheticExamplesService(secondPool)
  })
  afterAll(async () => { await Promise.all([firstPool?.end(), secondPool?.end()]) })

  it('twenty first-time requests across two pools publish one unfamiliar-domain revision', async () => {
    const input = {
      ...period, domain: `product-adoption-${crypto.randomUUID()}`, datasetId: `acceptance-product-${crypto.randomUUID()}`, seed: 149,
      definition: { title: 'Product adoption by plan', dimensions: [{ id: 'plan', name: 'Plan' }], measures: [{ id: 'adoptedAccounts', name: 'Adopted accounts', unit: 'accounts', minimum: 10, maximum: 90 }] },
      recipe: { entityCount: 3 },
    }
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).prepareExample(input)))
    expect(new Set(results.map(result => result.revisionId)).size).toBe(1)
    expect(results.filter(result => result.generated)).toHaveLength(1)
    const query = { ...period, domain: input.domain, revisionId: results[0].revisionId }
    const original = await first.queryExample(query)
    expect(original.rows.length).toBeGreaterThan(0)
    const extended = await second.prepareExample({ ...input, end: '2026-09-06T00:00:00.000Z' })
    expect(extended.revisionId).not.toBe(results[0].revisionId)
    expect(await second.queryExample(query)).toEqual(original)
  })

  it('queue rates reconcile with independently summed persisted source numerators and denominators', async () => {
    const prepared = await first.prepareExample({ ...period, domain: 'queue-abandonment', datasetId: `acceptance-queue-${crypto.randomUUID()}`, seed: 157 })
    const result = await first.queryExample({ ...period, domain: 'queue-abandonment', revisionId: prepared.revisionId })
    const oracle = (await firstPool.query(
      `SELECT g.dimensions->>'queueName' AS queue,
              sum((g.measures->>'offered')::numeric)::float8 AS offered,
              sum((g.measures->>'abandoned')::numeric)::float8 AS abandoned
       FROM rcx_examples.generic_records g
       JOIN rcx_examples.revision_batches rb ON rb.batch_id = g.batch_id
       WHERE rb.revision_id = $1 AND g.owner_day >= $2::date AND g.owner_day < $3::date
       GROUP BY g.dimensions->>'queueName'`,
      [prepared.revisionId, period.start, period.end],
    )).rows
    expect(oracle).toHaveLength(5)
    for (const source of oracle) {
      const actual = result.rows.find(row => row.queue === source.queue)!
      expect(actual, source.queue).toBeDefined()
      expect(actual.offered).toBe(source.offered)
      expect(actual.abandoned).toBe(source.abandoned)
      expect(Number(actual.abandonmentRate)).toBe(Number((source.abandoned / source.offered * 100).toFixed(2)))
    }
    const totalOffered = oracle.reduce((sum, row) => sum + row.offered, 0)
    const totalAbandoned = oracle.reduce((sum, row) => sum + row.abandoned, 0)
    expect((result.evidence as { abandonmentRate: number }).abandonmentRate).toBeCloseTo(totalAbandoned / totalOffered * 100, 8)
  })
})
