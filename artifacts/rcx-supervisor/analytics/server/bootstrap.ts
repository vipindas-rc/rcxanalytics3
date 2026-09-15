import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir } from 'node:fs/promises'
import type { AnalyticsRuntime } from './lifecycle.ts'
import { Store } from './store.ts'
import { codexModel } from './inference.ts'
import { openAIModel } from './openaiProvider.ts'
import { createApp } from './app.ts'
import { createDatabasePool } from './db/pool.ts'
import { createExamplesDatabasePool } from './db/examplesPool.ts'
import { migrateDatabase } from './db/migrate.ts'
import { migrateExamplesDatabase } from './examples/migrate.ts'
import { PostgresOperationalService } from './operational/service.ts'
import { PostgresSyntheticExamplesService } from './examples/service.ts'
import { providerStatus, selectProvider } from './providerSelection.ts'
import { createOpenAIOperationalAgents } from './openaiOperationalAgents.ts'
import { shouldBootstrapDemo } from './demo/replitBootstrap.ts'
import { bootstrapDemoData } from './demo/replitDataBootstrap.ts'
import { analyticsServerRoot } from './runtimePaths.ts'

export { analyticsServerRoot, examplesMigrationsDirectory, operationalMigrationsDirectory } from './runtimePaths.ts'

const directory = analyticsServerRoot()
const elapsed = (startedAt: number) => `${Date.now() - startedAt}ms`
// The legacy Supervisor gateway explicitly selected OpenAI for its child
// process. Keep this guard separate from standalone Analytics configuration.
export const SUPERVISOR_ANALYTICS_PROVIDER = 'openai'

/**
 * Initializes Analytics without listening on a port. The Supervisor lifecycle
 * owns listening, readiness, and shutdown when Analytics is embedded.
 */
export async function initializeAnalyticsRuntime(options: {
  provider?: string
  demoBootstrap?: boolean
  deterministicTestModel?: boolean
  log?: (message: string) => void
} = {}): Promise<AnalyticsRuntime> {
  const log = options.log ?? (message => console.info(`[analytics] ${message}`))
  const demoBootstrap = options.demoBootstrap ?? shouldBootstrapDemo()
  const pool = createDatabasePool()
  const examplesPool = createExamplesDatabasePool()
  try {
    let startedAt = Date.now()
    await migrateDatabase(pool)
    log(`operational migrations completed in ${elapsed(startedAt)}`)
    startedAt = Date.now()
    await migrateExamplesDatabase(examplesPool)
    log(`examples migrations completed in ${elapsed(startedAt)}`)

    const store = new Store(pool)
    startedAt = Date.now()
    await store.initialize(
      path.join(directory, 'data', 'workspace.json'),
      ...(demoBootstrap ? [path.join(directory, '../demo/workspace.seed.json')] : []),
    )
    log(`workspace initialization completed in ${elapsed(startedAt)}`)

    const operationalService = new PostgresOperationalService(pool)
    const examplesService = new PostgresSyntheticExamplesService(examplesPool)
    startedAt = Date.now()
    await bootstrapDemoData(demoBootstrap, operationalService, examplesService)
    log(`demo bootstrap ${demoBootstrap ? 'completed' : 'skipped'} in ${elapsed(startedAt)}`)
    await mkdir(path.join(directory, 'sandbox'), { recursive: true })

    // The host supplies its provider explicitly. Standalone callers retain
    // selectProvider's default when no provider was configured.
    const provider = selectProvider({
      provider: options.provider,
      directory: path.join(directory, 'sandbox'),
      codex: codexModel,
      openai: openAIModel,
    })
    const deterministicTestModel = async () => ({
      kind: 'text' as const, text: 'Deterministic test response.', choices: [], suggestions: [], charts: [], operations: [],
    })
    const useDeterministicTestModel = options.deterministicTestModel ?? process.env.ANALYTICS_TEST_MODEL === 'deterministic'
    const operationalAgents = provider.provider === 'openai' && !useDeterministicTestModel
      ? createOpenAIOperationalAgents()
      : undefined
    const app = createApp(
      store,
      useDeterministicTestModel ? deterministicTestModel : provider.model,
      operationalService,
      operationalAgents,
      examplesService,
    )
    app.get('/api/status', async (_q, response) => {
      if (provider.provider === 'openai') {
        return response.json(await providerStatus({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }))
      }
      try {
        const result = await promisify(execFile)('codex', ['login', 'status'], { timeout: 5000 })
        const detail = `${result.stdout}\n${result.stderr}`.trim()
        return response.json({ provider: 'codex', connected: /logged in/i.test(detail), detail })
      } catch {
        return response.json({ provider: 'codex', connected: false, detail: 'Codex login is unavailable.' })
      }
    })
    return { app, close: async () => { await Promise.all([pool.end(), examplesPool.end()]) } }
  } catch (error) {
    await Promise.allSettled([pool.end(), examplesPool.end()])
    throw error
  }
}