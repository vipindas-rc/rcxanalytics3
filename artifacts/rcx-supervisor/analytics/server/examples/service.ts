import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { WORKFLOW_GENERATOR_VERSION, generateWorkflowVolumeDay } from './workflowGenerator.ts'
import { QUEUE_ABANDONMENT_GENERATOR_VERSION, generateQueueAbandonmentDay } from './queueAbandonmentGenerator.ts'

export type WorkflowCoverageInput = { datasetId?: string; start: string; end: string; seed?: number }
export type WorkflowCoverageResult = { datasetId: string; revisionId: string; start: string; end: string; generated: boolean }
export type WorkflowVolumeQuery = { revisionId: string; start: string; end: string }
export type QueueAbandonmentCoverageInput = WorkflowCoverageInput
export type QueueAbandonmentQuery = WorkflowVolumeQuery
export type GenericDimension = { id: string; name: string; values?: string[] }
export type GenericMeasure = { id: string; name: string; unit: string; minimum?: number; maximum?: number }
export type GenericDefinitionInput = { title: string; version?: string; dimensions: GenericDimension[]; measures: GenericMeasure[]; assumptions?: string[] }
export type GenericRecipeInput = { version?: string; entityCount?: number }
export type GenericExampleInput = WorkflowCoverageInput & { domain: string; definition?: GenericDefinitionInput; recipe?: GenericRecipeInput }
export type GenericExampleQuery = WorkflowVolumeQuery & { domain: string }
export type SyntheticExampleDomain = 'workflow-volume' | 'queue-abandonment'
export interface SyntheticExampleService {
  prepareWorkflowVolume(input: WorkflowCoverageInput): Promise<WorkflowCoverageResult>
  prepareQueueAbandonment(input: QueueAbandonmentCoverageInput): Promise<WorkflowCoverageResult>
  prepareGenericExample(input: GenericExampleInput): Promise<WorkflowCoverageResult>
  prepareExample(input: GenericExampleInput): Promise<WorkflowCoverageResult>
  queryWorkflowVolume(input: WorkflowVolumeQuery): Promise<Awaited<ReturnType<PostgresSyntheticExamplesService['queryWorkflowVolume']>>>
  queryQueueAbandonment(input: QueueAbandonmentQuery): Promise<Awaited<ReturnType<PostgresSyntheticExamplesService['queryQueueAbandonment']>>>
  queryExample(input: GenericExampleQuery): Promise<Awaited<ReturnType<PostgresSyntheticExamplesService['queryExample']>>>
}

const DEFINITION_VERSION = 'workflow-volume-definition-v1'
const ASSUMPTIONS = ['Workflow interaction volumes are daily, non-overlapping fictional counts generated from a deterministic seed.']
const QUEUE_DEFINITION_VERSION = 'queue-abandonment-definition-v1'
const QUEUE_ASSUMPTIONS = ['Queue abandonment is represented as distinct offered and abandoned calls per queue per day. Abandoned calls are a subset of offered calls.']
const GENERIC_PRIMITIVES_VERSION = 'generic-primitives-v1'

const category = (id: string, name: string) => ({ id, name, type: 'category' as const })
const number = (id: string, name: string, unit: string) => ({ id, name, type: 'number' as const, unit })

export class PostgresSyntheticExamplesService implements SyntheticExampleService {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async prepareWorkflowVolume(input: WorkflowCoverageInput) {
    return this.ensureWorkflowVolumeCoverage(input)
  }

  async prepareQueueAbandonment(input: QueueAbandonmentCoverageInput) {
    return this.ensureQueueAbandonmentCoverage(input)
  }

  async prepareGenericExample(input: GenericExampleInput) {
    return this.prepareExample(input)
  }

  async prepareExample(input: GenericExampleInput) {
    if (input.domain === 'workflow-volume') return this.prepareWorkflowVolume(input)
    if (input.domain === 'queue-abandonment') return this.prepareQueueAbandonment(input)
    return this.ensureGenericCoverage(input)
  }

  async ensureWorkflowVolumeCoverage(input: WorkflowCoverageInput): Promise<WorkflowCoverageResult> {
    const period = normalizePeriod(input.start, input.end)
    const seed = input.seed ?? 20260914
    if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer.')
    const datasetId = input.datasetId ?? `workflow-volume-${WORKFLOW_GENERATOR_VERSION}-${seed}`
    if (!datasetId || datasetId.length > 200) throw new Error('Invalid synthetic example identity.')

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rcx-examples:${datasetId}:workflow-volume`])
      await this.ensureRegistry(client, 'workflow-volume')
      await client.query(
        `INSERT INTO rcx_examples.datasets(id,domain,seed,generator_version,definition_version,assumptions)
         VALUES($1,'workflow-volume',$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`,
        [datasetId, seed, WORKFLOW_GENERATOR_VERSION, DEFINITION_VERSION, JSON.stringify(ASSUMPTIONS)],
      )
      const stored = (await client.query('SELECT domain,seed,generator_version,definition_version FROM rcx_examples.datasets WHERE id=$1', [datasetId])).rows[0]
      if (!stored || stored.domain !== 'workflow-volume' || Number(stored.seed) !== seed || stored.generator_version !== WORKFLOW_GENERATOR_VERSION || stored.definition_version !== DEFINITION_VERSION) {
        throw new Error('Synthetic example identity already belongs to a different generator, seed, or definition.')
      }
      const covered = new Set((await client.query("SELECT to_char(owner_day,'YYYY-MM-DD') AS day FROM rcx_examples.coverage_batches WHERE dataset_id=$1 AND domain='workflow-volume'", [datasetId])).rows.map((row) => String(row.day)))
      const missing = period.days.filter((day) => !covered.has(day))
      for (const ownerDay of missing) await this.insertWorkflowDay(client, datasetId, ownerDay, seed)

      let revisionId = (await client.query('SELECT id FROM rcx_examples.revisions WHERE dataset_id=$1 AND sealed ORDER BY ordinal DESC LIMIT 1', [datasetId])).rows[0]?.id as string | undefined
      if (missing.length || !revisionId) {
        revisionId = randomUUID()
        await client.query('INSERT INTO rcx_examples.revisions(id,dataset_id) VALUES($1,$2)', [revisionId, datasetId])
        await client.query('INSERT INTO rcx_examples.revision_batches(revision_id,batch_id) SELECT $1,id FROM rcx_examples.coverage_batches WHERE dataset_id=$2', [revisionId, datasetId])
        await client.query('UPDATE rcx_examples.revisions SET sealed=true WHERE id=$1', [revisionId])
      }
      await client.query('COMMIT')
      return { datasetId, revisionId, start: period.start, end: period.end, generated: missing.length > 0 }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async ensureQueueAbandonmentCoverage(input: QueueAbandonmentCoverageInput): Promise<WorkflowCoverageResult> {
    const period = normalizePeriod(input.start, input.end)
    const seed = input.seed ?? 20260914
    if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer.')
    const datasetId = input.datasetId ?? `queue-abandonment-${QUEUE_ABANDONMENT_GENERATOR_VERSION}-${seed}`
    if (!datasetId || datasetId.length > 200) throw new Error('Invalid synthetic example identity.')

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rcx-examples:${datasetId}:queue-abandonment`])
      await this.ensureRegistry(client, 'queue-abandonment')
      await client.query(
        `INSERT INTO rcx_examples.datasets(id,domain,seed,generator_version,definition_version,assumptions)
         VALUES($1,'queue-abandonment',$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`,
        [datasetId, seed, QUEUE_ABANDONMENT_GENERATOR_VERSION, QUEUE_DEFINITION_VERSION, JSON.stringify(QUEUE_ASSUMPTIONS)],
      )
      const stored = (await client.query('SELECT domain,seed,generator_version,definition_version FROM rcx_examples.datasets WHERE id=$1', [datasetId])).rows[0]
      if (!stored || stored.domain !== 'queue-abandonment' || Number(stored.seed) !== seed || stored.generator_version !== QUEUE_ABANDONMENT_GENERATOR_VERSION || stored.definition_version !== QUEUE_DEFINITION_VERSION) {
        throw new Error('Synthetic example identity already belongs to a different generator, seed, or definition.')
      }
      const covered = new Set((await client.query("SELECT to_char(owner_day,'YYYY-MM-DD') AS day FROM rcx_examples.coverage_batches WHERE dataset_id=$1 AND domain='queue-abandonment'", [datasetId])).rows.map((row) => String(row.day)))
      const missing = period.days.filter((day) => !covered.has(day))
      for (const ownerDay of missing) await this.insertQueueDay(client, datasetId, ownerDay, seed)
      let revisionId = (await client.query('SELECT id FROM rcx_examples.revisions WHERE dataset_id=$1 AND sealed ORDER BY ordinal DESC LIMIT 1', [datasetId])).rows[0]?.id as string | undefined
      if (missing.length || !revisionId) {
        revisionId = randomUUID()
        await client.query('INSERT INTO rcx_examples.revisions(id,dataset_id) VALUES($1,$2)', [revisionId, datasetId])
        await client.query('INSERT INTO rcx_examples.revision_batches(revision_id,batch_id) SELECT $1,id FROM rcx_examples.coverage_batches WHERE dataset_id=$2', [revisionId, datasetId])
        await client.query('UPDATE rcx_examples.revisions SET sealed=true WHERE id=$1', [revisionId])
      }
      await client.query('COMMIT')
      return { datasetId, revisionId, start: period.start, end: period.end, generated: missing.length > 0 }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private async ensureGenericCoverage(input: GenericExampleInput): Promise<WorkflowCoverageResult> {
    const period = normalizePeriod(input.start, input.end)
    const definition = validateGenericDefinition(input.domain, input.definition)
    const recipe = validateGenericRecipe(input.recipe)
    if (period.days.length * recipe.entityCount > 10_000) throw new Error('This synthetic example would generate more than 10,000 records. Narrow the period or entity count.')
    const seed = input.seed ?? 20260914
    if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer.')
    const datasetId = input.datasetId ?? `generic-${input.domain}-${GENERIC_PRIMITIVES_VERSION}-${seed}`
    if (!datasetId || datasetId.length > 200) throw new Error('Invalid synthetic example identity.')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rcx-examples:${datasetId}:${input.domain}`])
      await this.ensureGenericRegistry(client, input.domain, definition, recipe)
      await client.query(
        `INSERT INTO rcx_examples.datasets(id,domain,seed,generator_version,definition_version,assumptions)
         VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
        [datasetId, input.domain, seed, GENERIC_PRIMITIVES_VERSION, definition.version, JSON.stringify(definition.assumptions)],
      )
      const stored = (await client.query('SELECT domain,seed,generator_version,definition_version FROM rcx_examples.datasets WHERE id=$1', [datasetId])).rows[0]
      if (!stored || stored.domain !== input.domain || Number(stored.seed) !== seed || stored.generator_version !== GENERIC_PRIMITIVES_VERSION || stored.definition_version !== definition.version) {
        throw new Error('Synthetic example identity already belongs to a different domain, generator, seed, or definition.')
      }
      const covered = new Set((await client.query('SELECT to_char(owner_day,\'YYYY-MM-DD\') AS day FROM rcx_examples.coverage_batches WHERE dataset_id=$1 AND domain=$2', [datasetId, input.domain])).rows.map((row) => String(row.day)))
      const missing = period.days.filter((day) => !covered.has(day))
      for (const ownerDay of missing) await this.insertGenericDay(client, datasetId, input.domain, ownerDay, seed, definition, recipe)
      let revisionId = (await client.query('SELECT id FROM rcx_examples.revisions WHERE dataset_id=$1 AND sealed ORDER BY ordinal DESC LIMIT 1', [datasetId])).rows[0]?.id as string | undefined
      if (missing.length || !revisionId) {
        revisionId = randomUUID()
        await client.query('INSERT INTO rcx_examples.revisions(id,dataset_id) VALUES($1,$2)', [revisionId, datasetId])
        await client.query('INSERT INTO rcx_examples.revision_batches(revision_id,batch_id) SELECT $1,id FROM rcx_examples.coverage_batches WHERE dataset_id=$2', [revisionId, datasetId])
        await client.query('UPDATE rcx_examples.revisions SET sealed=true WHERE id=$1', [revisionId])
      }
      await client.query('COMMIT')
      return { datasetId, revisionId, start: period.start, end: period.end, generated: missing.length > 0 }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async queryWorkflowVolume(input: WorkflowVolumeQuery) {
    const period = normalizePeriod(input.start, input.end)
    const revision = (await this.pool.query('SELECT dataset_id FROM rcx_examples.revisions WHERE id=$1 AND sealed', [input.revisionId])).rows[0]
    if (!revision) throw new Error('The saved synthetic example revision is unavailable.')
    const coverage = (await this.pool.query(
      "SELECT to_char(b.owner_day,'YYYY-MM-DD') AS day FROM rcx_examples.revision_batches rb JOIN rcx_examples.coverage_batches b ON b.id=rb.batch_id WHERE rb.revision_id=$1 AND b.domain='workflow-volume'",
      [input.revisionId],
    )).rows.map((row) => String(row.day))
    if (period.days.some((day) => !coverage.includes(day))) throw new Error('This saved synthetic example revision does not cover the requested period. Prepare coverage before querying it.')
    const rows = (await this.pool.query(
      `SELECT w.workflow_id AS "workflowId", max(w.workflow_name) AS "workflow", sum(w.interaction_volume)::int AS "interactionVolume"
       FROM rcx_examples.revision_batches rb
       JOIN rcx_examples.workflow_volumes w ON w.batch_id=rb.batch_id
       WHERE rb.revision_id=$1 AND w.owner_day >= $2::date AND w.owner_day < $3::date
       GROUP BY w.workflow_id ORDER BY "interactionVolume" DESC, "workflowId"`,
      [input.revisionId, period.start, period.end],
    )).rows
    const totalInteractions = rows.reduce((total, row) => total + Number(row.interactionVolume), 0)
    return {
      datasetId: String(revision.dataset_id),
      revisionId: input.revisionId,
      rows,
      fields: [category('workflowId', 'Workflow ID'), category('workflow', 'Workflow'), number('interactionVolume', 'Interaction Volume', 'interactions')],
      evidence: {
        datasetId: String(revision.dataset_id),
        revisionId: input.revisionId,
        scope: { start: period.start, end: period.end, timezone: 'UTC' },
        totalInteractions,
        definitions: { interactionVolume: 'Sum of daily fictional interaction counts assigned to each workflow in the reporting period.' },
        provenance: { synthetic: true, generatorVersion: WORKFLOW_GENERATOR_VERSION, definitionVersion: DEFINITION_VERSION, assumptions: ASSUMPTIONS },
        coverage: { complete: true, ownerDays: coverage.sort(), timezone: 'UTC' },
      },
      pagination: { offset: 0, limit: rows.length, total: rows.length },
    }
  }

  async queryQueueAbandonment(input: QueueAbandonmentQuery) {
    const period = normalizePeriod(input.start, input.end)
    const revision = (await this.pool.query('SELECT dataset_id FROM rcx_examples.revisions WHERE id=$1 AND sealed', [input.revisionId])).rows[0]
    if (!revision) throw new Error('The saved synthetic example revision is unavailable.')
    const coverage = (await this.pool.query(
      "SELECT to_char(b.owner_day,'YYYY-MM-DD') AS day FROM rcx_examples.revision_batches rb JOIN rcx_examples.coverage_batches b ON b.id=rb.batch_id WHERE rb.revision_id=$1 AND b.domain='queue-abandonment'",
      [input.revisionId],
    )).rows.map((row) => String(row.day))
    if (period.days.some((day) => !coverage.includes(day))) throw new Error('This saved synthetic example revision does not cover the requested period. Prepare coverage before querying it.')
    const rows = (await this.pool.query(
      `SELECT r.dimensions->>'queueId' AS "queueId", max(r.dimensions->>'queueName') AS "queue", sum((r.measures->>'offered')::integer)::int AS offered, sum((r.measures->>'abandoned')::integer)::int AS abandoned,
        round((sum((r.measures->>'abandoned')::numeric) / nullif(sum((r.measures->>'offered')::numeric), 0)) * 100, 2)::float8 AS "abandonmentRate"
       FROM rcx_examples.revision_batches rb
       JOIN rcx_examples.generic_records r ON r.batch_id=rb.batch_id
       WHERE rb.revision_id=$1 AND r.domain='queue-abandonment' AND r.owner_day >= $2::date AND r.owner_day < $3::date
       GROUP BY r.dimensions->>'queueId' ORDER BY "abandonmentRate" DESC, "queueId"`,
      [input.revisionId, period.start, period.end],
    )).rows
    const offered = rows.reduce((total, row) => total + Number(row.offered), 0)
    const abandoned = rows.reduce((total, row) => total + Number(row.abandoned), 0)
    const abandonmentRate = offered === 0 ? 0 : (abandoned / offered) * 100
    return {
      datasetId: String(revision.dataset_id),
      revisionId: input.revisionId,
      rows,
      fields: [category('queueId', 'Queue ID'), category('queue', 'Queue'), number('offered', 'Offered', 'calls'), number('abandoned', 'Abandoned', 'calls'), number('abandonmentRate', 'Abandonment Rate', 'percent')],
      evidence: {
        datasetId: String(revision.dataset_id),
        revisionId: input.revisionId,
        scope: { start: period.start, end: period.end, timezone: 'UTC' },
        offered,
        abandoned,
        abandonmentRate,
        definitions: { offered: 'Distinct fictional calls offered to a queue.', abandoned: 'Offered calls ended by the customer before answer.', abandonmentRate: 'Abandoned calls divided by offered calls, expressed as a percentage.' },
        provenance: { synthetic: true, generatorVersion: QUEUE_ABANDONMENT_GENERATOR_VERSION, definitionVersion: QUEUE_DEFINITION_VERSION, assumptions: QUEUE_ASSUMPTIONS },
        coverage: { complete: true, ownerDays: coverage.sort(), timezone: 'UTC' },
      },
      pagination: { offset: 0, limit: rows.length, total: rows.length },
    }
  }

  async queryExample(input: GenericExampleQuery) {
    if (input.domain === 'workflow-volume') return this.queryWorkflowVolume(input)
    if (input.domain === 'queue-abandonment') return this.queryQueueAbandonment(input)
    const period = normalizePeriod(input.start, input.end)
    const revision = (await this.pool.query('SELECT dataset_id,domain,definition_version FROM rcx_examples.revisions r JOIN rcx_examples.datasets d ON d.id=r.dataset_id WHERE r.id=$1 AND r.sealed', [input.revisionId])).rows[0]
    if (!revision || revision.domain !== input.domain) throw new Error('The saved synthetic example revision is unavailable for this domain.')
    const metadata = (await this.pool.query('SELECT title,fields,formulas,assumptions FROM rcx_examples.definitions WHERE id=$1 AND version=$2', [`generic:${input.domain}`, revision.definition_version])).rows[0]
    if (!metadata) throw new Error('The saved synthetic example definition is unavailable.')
    const coverage = (await this.pool.query(
      'SELECT to_char(b.owner_day,\'YYYY-MM-DD\') AS day FROM rcx_examples.revision_batches rb JOIN rcx_examples.coverage_batches b ON b.id=rb.batch_id WHERE rb.revision_id=$1 AND b.domain=$2',
      [input.revisionId, input.domain],
    )).rows.map((row) => String(row.day))
    if (period.days.some((day) => !coverage.includes(day))) throw new Error('This saved synthetic example revision does not cover the requested period. Prepare coverage before querying it.')
    const rawRows = (await this.pool.query(
      `SELECT r.dimensions, r.measures FROM rcx_examples.revision_batches rb
       JOIN rcx_examples.generic_records r ON r.batch_id=rb.batch_id
       WHERE rb.revision_id=$1 AND r.domain=$2 AND r.owner_day >= $3::date AND r.owner_day < $4::date
       ORDER BY r.id`,
      [input.revisionId, input.domain, period.start, period.end],
    )).rows as Array<{ dimensions: Record<string, string>; measures: Record<string, string | number> }>
    const fields = metadata.fields as Array<{ id: string; name: string; type: 'category' | 'number'; unit?: string }>
    const numberFields = fields.filter((field) => field.type === 'number')
    const measureIds = new Set(numberFields.map((field) => field.id))
    const percentageMeasureIds = new Set(numberFields.filter((field) => field.unit === '%' || field.unit === 'percent').map((field) => field.id))
    const grouped = new Map<string, { row: Record<string, string | number>; sums: Record<string, number>; counts: Record<string, number> }>()
    const totalsByMeasure: Record<string, { sum: number; count: number }> = {}
    for (const raw of rawRows) {
      const dimensions = raw.dimensions ?? {}
      const measures = raw.measures ?? {}
      const key = JSON.stringify(dimensions)
      const current = grouped.get(key) ?? { row: { ...dimensions }, sums: {}, counts: {} }
      for (const [id, value] of Object.entries(measures)) {
        if (!measureIds.has(id)) continue
        current.sums[id] = (current.sums[id] ?? 0) + Number(value)
        current.counts[id] = (current.counts[id] ?? 0) + 1
        const total = totalsByMeasure[id] ?? { sum: 0, count: 0 }
        total.sum += Number(value)
        total.count += 1
        totalsByMeasure[id] = total
      }
      grouped.set(key, current)
    }
    const rows = [...grouped.values()].map((group) => {
      for (const id of measureIds) group.row[id] = percentageMeasureIds.has(id) ? (group.sums[id] ?? 0) / Math.max(group.counts[id] ?? 1, 1) : group.sums[id] ?? 0
      return group.row
    })
    const totals = Object.fromEntries([...measureIds].map((id) => {
      const total = totalsByMeasure[id] ?? { sum: 0, count: 0 }
      return [id, percentageMeasureIds.has(id) ? total.sum / Math.max(total.count, 1) : total.sum]
    }))
    return {
      datasetId: String(revision.dataset_id),
      revisionId: input.revisionId,
      rows,
      fields,
      evidence: {
        datasetId: String(revision.dataset_id),
        revisionId: input.revisionId,
        scope: { start: period.start, end: period.end, timezone: 'UTC' },
        totals,
        definitions: metadata.formulas,
        provenance: { synthetic: true, generatorVersion: GENERIC_PRIMITIVES_VERSION, definitionVersion: String(revision.definition_version), assumptions: metadata.assumptions },
        coverage: { complete: true, ownerDays: coverage.sort(), timezone: 'UTC' },
      },
      pagination: { offset: 0, limit: rows.length, total: rows.length },
    }
  }

  private async insertWorkflowDay(client: PoolClient, datasetId: string, ownerDay: string, seed: number) {
    const batchId = randomUUID()
    const batch = generateWorkflowVolumeDay(ownerDay, seed)
    await client.query("INSERT INTO rcx_examples.coverage_batches(id,dataset_id,domain,owner_day) VALUES($1,$2,'workflow-volume',$3)", [batchId, datasetId, ownerDay])
    for (const row of batch.rows) {
      await client.query(
        'INSERT INTO rcx_examples.workflow_volumes(dataset_id,id,batch_id,workflow_id,workflow_name,owner_day,interaction_volume) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [datasetId, row.id, batchId, row.workflowId, row.workflowName, row.ownerDay, row.interactionVolume],
      )
    }
    await client.query('UPDATE rcx_examples.coverage_batches SET sealed=true WHERE id=$1', [batchId])
  }

  private async insertQueueDay(client: PoolClient, datasetId: string, ownerDay: string, seed: number) {
    const batchId = randomUUID()
    const batch = generateQueueAbandonmentDay(ownerDay, seed)
    await client.query("INSERT INTO rcx_examples.coverage_batches(id,dataset_id,domain,owner_day) VALUES($1,$2,'queue-abandonment',$3)", [batchId, datasetId, ownerDay])
    for (const row of batch.rows) {
      await client.query('INSERT INTO rcx_examples.entities(dataset_id,id,entity_type,display_name,attributes) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING', [datasetId, `queue:${row.queueId}`, 'queue', row.queueName, JSON.stringify({ queueId: row.queueId })])
      await client.query(
        `INSERT INTO rcx_examples.generic_records(dataset_id,id,batch_id,domain,owner_day,entity_id,dimensions,measures)
         VALUES($1,$2,$3,'queue-abandonment',$4,$5,$6::jsonb,$7::jsonb)`,
        [datasetId, row.id, batchId, row.ownerDay, `queue:${row.queueId}`, JSON.stringify({ queueId: row.queueId, queueName: row.queueName }), JSON.stringify({ offered: row.offered, abandoned: row.abandoned })],
      )
    }
    await client.query('UPDATE rcx_examples.coverage_batches SET sealed=true WHERE id=$1', [batchId])
  }

  private async ensureRegistry(client: PoolClient, domain: SyntheticExampleDomain) {
    const definition = domain === 'workflow-volume'
      ? { id: 'workflow-volume', version: DEFINITION_VERSION, title: 'Workflow Interaction Volume', fields: [{ id: 'workflow', type: 'category' }, { id: 'interactionVolume', type: 'number', unit: 'interactions' }], formulas: { interactionVolume: 'sum(daily workflow interactions)' }, assumptions: ASSUMPTIONS, generatorVersion: WORKFLOW_GENERATOR_VERSION }
      : { id: 'queue-abandonment', version: QUEUE_DEFINITION_VERSION, title: 'Queue Abandonment', fields: [{ id: 'queue', type: 'category' }, { id: 'offered', type: 'number', unit: 'calls' }, { id: 'abandoned', type: 'number', unit: 'calls' }, { id: 'abandonmentRate', type: 'number', unit: 'percent' }], formulas: { abandonmentRate: 'abandoned / offered * 100' }, assumptions: QUEUE_ASSUMPTIONS, generatorVersion: QUEUE_ABANDONMENT_GENERATOR_VERSION }
    await client.query(
      'INSERT INTO rcx_examples.definitions(id,version,domain,title,fields,formulas,assumptions) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) ON CONFLICT DO NOTHING',
      [definition.id, definition.version, domain, definition.title, JSON.stringify(definition.fields), JSON.stringify(definition.formulas), JSON.stringify(definition.assumptions)],
    )
    await client.query(
      'INSERT INTO rcx_examples.recipes(id,version,definition_id,definition_version,generator_version,configuration) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING',
      [`${domain}-recipe`, definition.version, definition.id, definition.version, definition.generatorVersion, JSON.stringify({ seedRequired: true, periodGrain: 'day', bounded: true })],
    )
  }

  private async ensureGenericRegistry(client: PoolClient, domain: string, definition: ValidGenericDefinition, recipe: ValidGenericRecipe) {
    const definitionId = `generic:${domain}`
    const fields = [
      ...definition.dimensions.map((field) => ({ ...field, type: 'category' })),
      ...definition.measures.map(({ minimum: _minimum, maximum: _maximum, ...field }) => ({ ...field, type: 'number' })),
    ]
    const formulas = Object.fromEntries(definition.measures.map((field) => [field.id, `sum(daily synthetic ${field.unit})`]))
    await client.query(
      'INSERT INTO rcx_examples.definitions(id,version,domain,title,fields,formulas,assumptions) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) ON CONFLICT DO NOTHING',
      [definitionId, definition.version, domain, definition.title, JSON.stringify(fields), JSON.stringify(formulas), JSON.stringify(definition.assumptions)],
    )
    const storedDefinition = (await client.query('SELECT title,fields,formulas,assumptions FROM rcx_examples.definitions WHERE id=$1 AND version=$2', [definitionId, definition.version])).rows[0]
    if (!storedDefinition || storedDefinition.title !== definition.title || canonicalJson(storedDefinition.fields) !== canonicalJson(fields) || canonicalJson(storedDefinition.formulas) !== canonicalJson(formulas) || canonicalJson(storedDefinition.assumptions) !== canonicalJson(definition.assumptions)) {
      throw new Error('The requested generic definition version conflicts with existing immutable metadata.')
    }
    const configuration = { entityCount: recipe.entityCount, periodGrain: 'day', bounded: true }
    await client.query(
      'INSERT INTO rcx_examples.recipes(id,version,definition_id,definition_version,generator_version,configuration) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING',
      [`generic:${domain}:recipe`, recipe.version, definitionId, definition.version, GENERIC_PRIMITIVES_VERSION, JSON.stringify(configuration)],
    )
    const storedRecipe = (await client.query('SELECT definition_id,definition_version,generator_version,configuration FROM rcx_examples.recipes WHERE id=$1 AND version=$2', [`generic:${domain}:recipe`, recipe.version])).rows[0]
    if (!storedRecipe || storedRecipe.definition_id !== definitionId || storedRecipe.definition_version !== definition.version || storedRecipe.generator_version !== GENERIC_PRIMITIVES_VERSION || canonicalJson(storedRecipe.configuration) !== canonicalJson(configuration)) {
      throw new Error('The requested generic recipe version conflicts with existing immutable metadata.')
    }
  }

  private async insertGenericDay(client: PoolClient, datasetId: string, domain: string, ownerDay: string, seed: number, definition: ValidGenericDefinition, recipe: ValidGenericRecipe) {
    const batchId = randomUUID()
    await client.query('INSERT INTO rcx_examples.coverage_batches(id,dataset_id,domain,owner_day) VALUES($1,$2,$3,$4)', [batchId, datasetId, domain, ownerDay])
    for (let index = 1; index <= recipe.entityCount; index += 1) {
      const entityId = `generic:${domain}:${index}`
      const dimensions = Object.fromEntries(definition.dimensions.map((field, dimensionIndex) => {
        const values = field.values
        const fallback = dimensionIndex === 0 ? `${field.name} ${index}` : `${field.name} group ${(index % 3) + 1}`
        return [field.id, values?.[(index - 1) % values.length] ?? fallback]
      }))
      const measures = Object.fromEntries(definition.measures.map((field) => [field.id, generatedMeasure(seed, domain, ownerDay, index, field)]))
      await client.query('INSERT INTO rcx_examples.entities(dataset_id,id,entity_type,display_name,attributes) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING', [datasetId, entityId, domain, String(dimensions[definition.dimensions[0].id]), JSON.stringify(dimensions)])
      await client.query(
        'INSERT INTO rcx_examples.generic_records(dataset_id,id,batch_id,domain,owner_day,entity_id,dimensions,measures) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
        [datasetId, `${ownerDay}:${entityId}`, batchId, domain, ownerDay, entityId, JSON.stringify(dimensions), JSON.stringify(measures)],
      )
    }
    await client.query('UPDATE rcx_examples.coverage_batches SET sealed=true WHERE id=$1', [batchId])
  }
}

type ValidGenericDefinition = Required<Pick<GenericDefinitionInput, 'title' | 'version' | 'dimensions' | 'measures' | 'assumptions'>>
type ValidGenericRecipe = Required<Pick<GenericRecipeInput, 'version' | 'entityCount'>>

function validateGenericDefinition(domain: string, input: GenericDefinitionInput | undefined): ValidGenericDefinition {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(domain)) throw new Error('Generic synthetic domains must use a lowercase slug of 2–64 characters.')
  if (!input || typeof input.title !== 'string' || input.title.trim().length < 2 || input.title.length > 120 || !Array.isArray(input.dimensions) || !Array.isArray(input.measures)) {
    throw new Error(`A typed definition is required to prepare unfamiliar domain '${domain}'.`)
  }
  const version = input.version ?? 'v1'
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(version) || input.dimensions.length < 1 || input.dimensions.length > 4 || input.measures.length < 1 || input.measures.length > 4) {
    throw new Error('Generic definition versions and field counts are invalid.')
  }
  const fields = [...input.dimensions, ...input.measures]
  const ids = new Set<string>()
  for (const field of fields) {
    if (!field || !/^[a-z][a-zA-Z0-9]*$/.test(field.id) || typeof field.name !== 'string' || field.name.trim().length < 1 || field.name.length > 80 || ids.has(field.id)) {
      throw new Error('Generic definition field identities must be unique and typed.')
    }
    ids.add(field.id)
  }
  for (const dimension of input.dimensions) {
    if (dimension.values !== undefined && (!Array.isArray(dimension.values) || dimension.values.length < 1 || dimension.values.length > 20 || new Set(dimension.values).size !== dimension.values.length || dimension.values.some((value) => typeof value !== 'string' || value.trim().length < 1 || value.length > 80))) {
      throw new Error('Generic dimension values must contain 1–20 unique labels.')
    }
  }
  for (const measure of input.measures) {
    const minimum = measure.minimum ?? 1
    const maximum = measure.maximum ?? 100
    if (typeof measure.unit !== 'string' || measure.unit.trim().length < 1 || measure.unit.length > 40 || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum || maximum > 1_000_000) {
      throw new Error('Generic measures need bounded integer ranges and units.')
    }
  }
  const assumptions = input.assumptions ?? [`${input.title.trim()} is a deterministic synthetic example, not operational reporting data.`]
  if (!Array.isArray(assumptions) || assumptions.length > 6 || assumptions.some((assumption) => typeof assumption !== 'string' || assumption.length > 300)) throw new Error('Generic assumptions are invalid.')
  return { title: input.title.trim(), version, dimensions: input.dimensions, measures: input.measures, assumptions }
}

function validateGenericRecipe(input: GenericRecipeInput | undefined): ValidGenericRecipe {
  const version = input?.version ?? 'v1'
  const entityCount = input?.entityCount ?? 4
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(version) || !Number.isInteger(entityCount) || entityCount < 1 || entityCount > 10_000) throw new Error('Generic recipes require a version and 1–10,000 entities.')
  return { version, entityCount }
}

function generatedMeasure(seed: number, domain: string, ownerDay: string, entityIndex: number, field: GenericMeasure) {
  const minimum = field.minimum ?? 1
  const maximum = field.maximum ?? 100
  const digest = createHash('sha256').update(`${GENERIC_PRIMITIVES_VERSION}:${seed}:${domain}:${ownerDay}:${entityIndex}:${field.id}`).digest()
  return minimum + (digest.readUInt32BE(0) % (maximum - minimum + 1))
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizePeriod(start: string, end: string) {
  const first = Date.parse(start)
  const last = Date.parse(end)
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first || last - first > 366 * 86_400_000) {
    throw new Error('Choose a valid reporting period of at most 366 days.')
  }
  const days: string[] = []
  for (let time = Math.floor(first / 86_400_000) * 86_400_000; time < last; time += 86_400_000) days.push(new Date(time).toISOString().slice(0, 10))
  return { start: new Date(first).toISOString(), end: new Date(last).toISOString(), days }
}
