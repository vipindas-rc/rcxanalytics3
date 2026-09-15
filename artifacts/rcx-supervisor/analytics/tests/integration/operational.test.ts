import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { migrateDatabase } from '../../server/db/migrate'
import { PostgresOperationalService } from '../../server/operational/service'
import { isolatedTestDatabaseUrl } from './databaseSafety'
import { createDisposableDatabase } from './disposableDatabase'

const testUrl = isolatedTestDatabaseUrl()
const scope = { start: '2026-09-01T00:00:00.000Z', end: '2026-09-04T00:00:00.000Z' }

// These tests never read DATABASE_URL or the user's workspace, and never truncate data.
// Every case uses a unique namespace; the dedicated test database owns its lifecycle.
describe.skipIf(!testUrl)('persistent operational reporting (requires TEST_DATABASE_URL)', () => {
  let pool: Pool
  let dispose: (() => Promise<void>) | undefined
  let isolatedUrl: string
  let service: PostgresOperationalService
  beforeAll(async () => {
    const database = await createDisposableDatabase('operational')
    pool = database.pool
    isolatedUrl = database.url
    dispose = database.dispose
    await migrateDatabase(pool)
    service = new PostgresOperationalService(pool)
  })
  afterAll(async () => { await dispose?.() })

  it('generates once and returns the same records after reconnecting', async () => {
    const input = { ...scope, datasetId: `qa-${crypto.randomUUID()}`, seed: 31 }
    const first = await service.ensureCoverage(input)
    expect(first.generated).toBe(true)
    const report = await service.query({ ...scope, revisionId: first.revisionId, intent: 'activity' })
    expect(report.rows.length).toBeGreaterThan(0)
    expect(report.datasetId).toBe(first.datasetId)
    expect(report.revisionId).toBe(first.revisionId)
    const secondPool = new Pool({ connectionString: isolatedUrl, max: 1 })
    try {
      const restarted = new PostgresOperationalService(secondPool)
      const repeated = await restarted.ensureCoverage(input)
      expect(repeated.generated).toBe(false)
      expect(repeated.revisionId).toBe(first.revisionId)
      const reopened = await restarted.query({ ...scope, revisionId: repeated.revisionId, intent: 'activity' })
      expect(reopened).toEqual(report)
    } finally { await secondPool.end() }
  })

  it('deduplicates concurrent first-time coverage across service instances', async () => {
    const input = { ...scope, datasetId: `qa-${crypto.randomUUID()}`, seed: 32 }
    const other = new PostgresOperationalService(pool)
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => (index % 2 ? service : other).ensureCoverage(input)))
    expect(new Set(results.map(result => result.revisionId)).size).toBe(1)
    expect(results.filter(result => result.generated)).toHaveLength(1)
  })

  it('reconciles filtered evidence and keeps table pagination out of totals', async () => {
    const coverage = await service.ensureCoverage({ ...scope, datasetId: `qa-${crypto.randomUUID()}`, seed: 33 })
    const request = { ...scope, revisionId: coverage.revisionId, intent: 'activity' as const }
    const all = await service.query(request)
    const ai = await service.query({ ...request, agentType: 'ai' })
    const human = await service.query({ ...request, agentType: 'human' })
    expect(all.evidence.activeAgents.total).toBe(all.evidence.activeAgents.ai + all.evidence.activeAgents.human)
    expect(all.evidence.interactions.ai + all.evidence.interactions.human - all.evidence.interactions.transferred).toBe(all.evidence.interactions.total)
    expect(ai.evidence.activeAgents.human).toBe(0)
    expect(human.evidence.activeAgents.ai).toBe(0)
    expect(ai.evidence.activeAgents.total + human.evidence.activeAgents.total).toBe(all.evidence.activeAgents.total)
    expect(ai.evidence.scope.agentType).toBe('ai')
    expect(ai.evidence.handlingMinutes.total + human.evidence.handlingMinutes.total).toBeCloseTo(all.evidence.handlingMinutes.total)
    const page = await service.query({ ...request, limit: 1, offset: 0 })
    expect(page.rows).toHaveLength(1)
    expect(page.evidence.activeAgents).toEqual(all.evidence.activeAgents)
    expect(page.evidence.handlingMinutes).toEqual(all.evidence.handlingMinutes)
  })

  it('returns a legitimately empty covered interval without regenerating data', async () => {
    const input = { ...scope, datasetId: `qa-${crypto.randomUUID()}`, seed: 35 }
    const coverage = await service.ensureCoverage(input)
    // The deterministic hourly fixture has no handling segments at 00:40–00:45.
    const empty = await service.query({ revisionId: coverage.revisionId, start: '2026-09-02T00:40:00.000Z', end: '2026-09-02T00:45:00.000Z', intent: 'activity' })
    expect(empty.rows).toEqual([])
    expect(empty.evidence.activeAgents.total).toBe(0)
    expect(empty.evidence.interactions.total).toBe(0)
    const reused = await service.ensureCoverage(input)
    expect(reused.generated).toBe(false)
    expect(reused.revisionId).toBe(coverage.revisionId)
  })

  it('rolls back generation failure before marking coverage complete', async () => {
    const suffix = crypto.randomUUID().replaceAll('-', '')
    const datasetId = `qa-${suffix}`
    const trigger = `qa_fail_${suffix}`
    await pool.query(`CREATE FUNCTION rcx_data.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA injected insert failure'; END $$`)
    try {
      await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON rcx_data.handling_segments FOR EACH ROW WHEN (NEW.dataset_id = '${datasetId}') EXECUTE FUNCTION rcx_data.${trigger}()`)
      await expect(service.ensureCoverage({ ...scope, datasetId, seed: 36 })).rejects.toThrow(/QA injected insert failure/)
      for (const table of ['datasets', 'batches', 'interactions', 'handling_segments', 'revisions']) {
        const identity = table === 'datasets' ? 'id' : 'dataset_id'
        expect((await pool.query(`SELECT count(*)::int AS count FROM rcx_data.${table} WHERE ${identity}=$1`, [datasetId])).rows[0].count).toBe(0)
      }
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON rcx_data.handling_segments`)
      await pool.query(`DROP FUNCTION IF EXISTS rcx_data.${trigger}()`)
    }
    const retry = await service.ensureCoverage({ ...scope, datasetId, seed: 36 })
    expect(retry.generated).toBe(true)
    expect((await service.query({ ...scope, revisionId: retry.revisionId })).rows.length).toBeGreaterThan(0)
  })

  it('rejects changes and appended records in published evidence', async () => {
    const coverage = await service.ensureCoverage({ ...scope, datasetId: `qa-${crypto.randomUUID()}`, seed: 37 })
    const before = await service.query({ ...scope, revisionId: coverage.revisionId })
    await expect(pool.query("UPDATE rcx_data.agents SET name='Changed' WHERE dataset_id=$1", [coverage.datasetId])).rejects.toThrow(/immutable/i)
    await expect(pool.query(`INSERT INTO rcx_data.interactions(dataset_id,id,batch_id,started_at,ended_at,channel)
      SELECT dataset_id,'extra-interaction',batch_id,started_at,ended_at,channel FROM rcx_data.interactions WHERE dataset_id=$1 LIMIT 1`, [coverage.datasetId])).rejects.toThrow(/published coverage/i)
    await expect(pool.query('DELETE FROM rcx_data.revision_batches WHERE revision_id=$1', [coverage.revisionId])).rejects.toThrow(/immutable/i)
    expect(await service.query({ ...scope, revisionId: coverage.revisionId })).toEqual(before)
  })

  it('includes carry-in handling and clips duration at the requested midnight boundary', async () => {
    const start = '2026-09-02T00:00:00.000Z'
    const end = '2026-09-02T00:02:00.000Z'
    const coverage = await service.ensureCoverage({ start, end, datasetId: `qa-${crypto.randomUUID()}`, seed: 38 })
    const result = await service.query({ start, end, revisionId: coverage.revisionId })
    const carryIn = result.rows.filter(row => String(row.interactionId).startsWith('2026-09-01-'))
    expect(carryIn.length).toBeGreaterThan(0)
    expect(carryIn.every(row => row.startedAt === start && Number(row.activeMinutes) > 0 && Number(row.activeMinutes) <= 2)).toBe(true)
    expect(result.rows.reduce((sum, row) => sum + Number(row.activeMinutes), 0)).toBeCloseTo(result.evidence.handlingMinutes.total)
  })

  it('retains old revision values when date coverage is extended', async () => {
    const input = { ...scope, datasetId: `qa-${crypto.randomUUID()}`, seed: 34 }
    const initial = await service.ensureCoverage(input)
    const before = await service.query({ ...scope, revisionId: initial.revisionId })
    await service.ensureCoverage({ ...input, end: '2026-09-08T00:00:00.000Z' })
    expect(await service.query({ ...scope, revisionId: initial.revisionId })).toEqual(before)
  })
})
