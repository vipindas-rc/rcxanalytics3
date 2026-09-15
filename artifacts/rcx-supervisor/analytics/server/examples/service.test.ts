import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { migrateExamplesDatabase } from './migrate.ts'
import { PostgresSyntheticExamplesService } from './service.ts'
import { isolatedSyntheticExamplesTestDatabaseUrl } from './databaseSafety.ts'

const testUrl = isolatedSyntheticExamplesTestDatabaseUrl()
const scope = { start: '2026-09-01T00:00:00.000Z', end: '2026-09-04T00:00:00.000Z' }

describe.skipIf(!testUrl)('persistent workflow-volume examples', () => {
  let pool: Pool
  let service: PostgresSyntheticExamplesService

  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl, max: 4 })
    await migrateExamplesDatabase(pool)
    service = new PostgresSyntheticExamplesService(pool)
  })
  afterAll(async () => { await pool?.end() })

  it('creates workflow coverage once and reopens the same immutable revision', async () => {
    const input = { ...scope, datasetId: `workflow-qa-${crypto.randomUUID()}`, seed: 9 }
    const first = await service.ensureWorkflowVolumeCoverage(input)
    expect(first.generated).toBe(true)
    const report = await service.queryWorkflowVolume({ ...scope, revisionId: first.revisionId })
    expect(report.rows).toHaveLength(4)
    expect(report.evidence.totalInteractions).toBeGreaterThan(0)
    expect(report.evidence.provenance.synthetic).toBe(true)
    const repeated = await service.ensureWorkflowVolumeCoverage(input)
    expect(repeated).toEqual({ ...first, generated: false })
    expect(await service.queryWorkflowVolume({ ...scope, revisionId: repeated.revisionId })).toEqual(report)
  })

  it('creates a new revision when coverage extends without changing the old one', async () => {
    const input = { ...scope, datasetId: `workflow-qa-${crypto.randomUUID()}`, seed: 10 }
    const first = await service.ensureWorkflowVolumeCoverage(input)
    const before = await service.queryWorkflowVolume({ ...scope, revisionId: first.revisionId })
    const extended = await service.ensureWorkflowVolumeCoverage({ ...input, end: '2026-09-06T00:00:00.000Z' })
    expect(extended.revisionId).not.toBe(first.revisionId)
    expect(await service.queryWorkflowVolume({ ...scope, revisionId: first.revisionId })).toEqual(before)
  })

  it('requires requested coverage instead of silently generating it during query', async () => {
    const coverage = await service.ensureWorkflowVolumeCoverage({ ...scope, datasetId: `workflow-qa-${crypto.randomUUID()}`, seed: 11 })
    await expect(service.queryWorkflowVolume({ revisionId: coverage.revisionId, start: '2026-09-09T00:00:00.000Z', end: '2026-09-10T00:00:00.000Z' })).rejects.toThrow(/coverage/i)
  })
})

describe.skipIf(!testUrl)('persistent queue-abandonment examples', () => {
  let pool: Pool
  let service: PostgresSyntheticExamplesService

  beforeAll(async () => {
    pool = new Pool({ connectionString: testUrl, max: 4 })
    await migrateExamplesDatabase(pool)
    service = new PostgresSyntheticExamplesService(pool)
  })
  afterAll(async () => { await pool?.end() })

  it('reuses persisted queue coverage and calculates the abandonment rate from offered calls', async () => {
    const input = { ...scope, datasetId: `queue-qa-${crypto.randomUUID()}`, seed: 12 }
    const first = await service.prepareQueueAbandonment(input)
    const report = await service.queryQueueAbandonment({ ...scope, revisionId: first.revisionId })
    const offered = report.rows.reduce((total, row) => total + Number(row.offered), 0)
    const abandoned = report.rows.reduce((total, row) => total + Number(row.abandoned), 0)
    expect(report.evidence.offered).toBe(offered)
    expect(report.evidence.abandoned).toBe(abandoned)
    expect(report.evidence.abandonmentRate).toBeCloseTo((abandoned / offered) * 100)
    expect(await service.prepareQueueAbandonment(input)).toEqual({ ...first, generated: false })
  })

  it('persists a bounded unfamiliar generic domain when its typed definition and recipe are supplied', async () => {
    const domain = `product-adoption-${crypto.randomUUID()}`
    const prepared = await service.prepareExample({
      domain,
      ...scope,
      seed: 13,
      definition: {
        title: 'Product Adoption',
        dimensions: [{ id: 'product', name: 'Product', values: ['Starter', 'Growth', 'Enterprise'] }],
        measures: [{ id: 'adoptedAccounts', name: 'Adopted Accounts', unit: 'accounts', minimum: 20, maximum: 90 }],
      },
      recipe: { entityCount: 3 },
    })
    const report = await service.queryExample({ revisionId: prepared.revisionId, domain, ...scope })
    expect(report.rows).toHaveLength(3)
    expect(report.rows.every((row) => Number(row.adoptedAccounts) >= 20)).toBe(true)
    expect(report.evidence.provenance.definitionVersion).toBe('v1')
    expect(await service.prepareExample({
      domain, ...scope, seed: 13,
      definition: { title: 'Product Adoption', dimensions: [{ id: 'product', name: 'Product', values: ['Starter', 'Growth', 'Enterprise'] }], measures: [{ id: 'adoptedAccounts', name: 'Adopted Accounts', unit: 'accounts', minimum: 20, maximum: 90 }] },
      recipe: { entityCount: 3 },
    })).toEqual({ ...prepared, generated: false })
  })

  it('averages percentage measures across daily records and retains supplied dimension values', async () => {
    const input = {
      domain: `resolution-quality-${crypto.randomUUID()}`,
      datasetId: `resolution-quality-${crypto.randomUUID()}`,
      ...scope,
      seed: 14,
      definition: {
        title: 'Resolution Quality',
        dimensions: [{ id: 'plan', name: 'Plan', values: ['Starter', 'Growth'] }],
        measures: [{ id: 'resolutionRate', name: 'Resolution Rate', unit: '%', minimum: 60, maximum: 95 }],
      },
      recipe: { entityCount: 2 },
    }
    const prepared = await service.prepareExample(input)
    const report = await service.queryExample({ revisionId: prepared.revisionId, domain: input.domain, ...scope })
    const source = (await pool.query(
      `SELECT g.dimensions->>'plan' AS plan, avg((g.measures->>'resolutionRate')::numeric)::float8 AS rate
       FROM rcx_examples.generic_records g JOIN rcx_examples.revision_batches rb ON rb.batch_id=g.batch_id
       WHERE rb.revision_id=$1 GROUP BY g.dimensions->>'plan'`,
      [prepared.revisionId],
    )).rows
    expect(report.rows.map((row) => row.plan).sort()).toEqual(['Growth', 'Starter'])
    for (const row of source) expect(Number(report.rows.find((result) => result.plan === row.plan)?.resolutionRate)).toBeCloseTo(row.rate)
  })
})
