import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Store } from '../../server/store.ts'
import { migrateDatabase } from '../../server/db/migrate.ts'
import { migrateExamplesDatabase } from '../../server/examples/migrate.ts'
import { createDisposableDatabase } from './disposableDatabase.ts'

const required = !!process.env.TEST_DATABASE_URL
const owned: Array<Awaited<ReturnType<typeof createDisposableDatabase>>> = []
afterEach(async () => { await Promise.all(owned.splice(0).map(database => database.dispose())) })

async function setup() {
  const database = await createDisposableDatabase('store')
  owned.push(database)
  await migrateDatabase(database.pool)
  await migrateExamplesDatabase(database.pool)
  return { database, store: new Store(database.pool) }
}

describe.skipIf(!required)('PostgreSQL Store persistence', () => {
  it('migrates repeatedly, imports a legacy source once, and preserves saved identity', async () => {
    const { database, store } = await setup()
    await migrateDatabase(database.pool)
    await migrateExamplesDatabase(database.pool)
    const directory = await mkdtemp(path.join(os.tmpdir(), 'analytics-legacy-'))
    const source = path.join(directory, 'workspace.json')
    await writeFile(source, JSON.stringify({ version: 3, revision: 7, sessions: [], projects: [{ id: 'saved-project', name: 'Saved' }], datasets: [], artifacts: [], savedCharts: [], dashboards: [], requests: [], preferences: {}, briefings: [] }))
    await store.initialize(source)
    await store.mutate(workspace => workspace.projects[0].name = 'Edited')
    await new Store(database.pool).initialize(source)
    const workspace = await store.read()
    expect(workspace.projects[0]).toMatchObject({ id: 'saved-project', name: 'Edited' })
    expect(Number((await database.pool.query('SELECT revision FROM rcx_data.analytics_workspace WHERE workspace_id=1')).rows[0].revision)).toBe(workspace.revision)
  })

  it('recovers pending requests after restart and rolls back thrown mutations', async () => {
    const { database, store } = await setup()
    await store.initialize()
    await store.mutate(workspace => workspace.requests.push({ id: 'pending', sessionId: 'none', question: 'x', status: 'pending', phase: 'Working', userMessageId: 'message', createdAt: 'now' }))
    const before = await store.read()
    await expect(store.mutate(() => { throw new Error('injected mutation error') })).rejects.toThrow('injected')
    expect((await store.read()).revision).toBe(before.revision)
    await new Store(database.pool).initialize()
    expect((await store.read()).requests[0]).toMatchObject({ status: 'failed', phase: 'Interrupted' })
  })

  it('keeps no-op revisions stable and serializes concurrent independent writers', async () => {
    const { database, store } = await setup()
    await store.initialize()
    const second = new Store(database.pool)
    const revision = (await store.read()).revision
    await store.mutate(() => undefined)
    expect((await store.read()).revision).toBe(revision)
    await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? store : second).mutate(workspace => workspace.projects.push({ id: `project-${index}`, name: `Project ${index}` }))))
    const workspace = await store.read()
    expect(workspace.projects).toHaveLength(21)
    expect(workspace.revision).toBe(revision + 20)
  })
})