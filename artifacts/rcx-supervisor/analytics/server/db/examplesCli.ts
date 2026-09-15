import { createExamplesDatabasePool } from './examplesPool.ts'
import { migrateExamplesDatabase } from '../examples/migrate.ts'
import { PostgresSyntheticExamplesService } from '../examples/service.ts'

const pool = createExamplesDatabasePool()
try {
  await migrateExamplesDatabase(pool)
  if (process.argv.includes('--seed')) {
    const service = new PostgresSyntheticExamplesService(pool)
    const workflow = await service.prepareWorkflowVolume({
      start: '2026-08-31T00:00:00Z',
      end: '2026-09-14T00:00:00Z',
    })
    const queue = await service.prepareQueueAbandonment({
      start: '2026-08-31T00:00:00Z',
      end: '2026-09-14T00:00:00Z',
    })
    console.log(JSON.stringify({ workflow, queue }, null, 2))
  } else {
    console.log('Synthetic examples database migrations are current.')
  }
} finally {
  await pool.end()
}
