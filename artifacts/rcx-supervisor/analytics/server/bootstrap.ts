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
import { providerCapabilities, selectProvider } from './providerSelection.ts'
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
  let pool: ReturnType<typeof createDatabasePool> | undefined
  let examplesPool: ReturnType<typeof createExamplesDatabasePool> | undefined
  let operationalService: PostgresOperationalService | undefined
  let examplesService: PostgresSyntheticExamplesService | undefined
  const operationalReadiness = { ready: false, detail: 'Operational PostgreSQL is unavailable.' }
  const examplesReadiness = { ready: false, detail: 'Synthetic examples PostgreSQL is unavailable.' }
  try {
    let startedAt = Date.now()
    try {
      pool = createDatabasePool()
      await migrateDatabase(pool)
      operationalService = new PostgresOperationalService(pool)
      operationalReadiness.ready = true
      operationalReadiness.detail = `Operational PostgreSQL is ready (${elapsed(startedAt)}).`
      log(`operational migrations completed in ${elapsed(startedAt)}`)
    } catch (error) {
      operationalReadiness.detail = 'Operational PostgreSQL is unavailable.'
      log(`Operational PostgreSQL is unavailable: ${error instanceof Error ? error.message : String(error)}`)
      await pool?.end()
      pool = undefined
    }
    startedAt = Date.now()
    try {
      examplesPool = createExamplesDatabasePool()
      await migrateExamplesDatabase(examplesPool)
      examplesService = new PostgresSyntheticExamplesService(examplesPool)
      examplesReadiness.ready = true
      examplesReadiness.detail = `Synthetic examples PostgreSQL is ready (${elapsed(startedAt)}).`
      log(`examples migrations completed in ${elapsed(startedAt)}`)
    } catch (error) {
      examplesReadiness.detail = 'Synthetic examples PostgreSQL is unavailable.'
      log(`Synthetic examples PostgreSQL is unavailable: ${error instanceof Error ? error.message : String(error)}`)
      await examplesPool?.end()
      examplesPool = undefined
    }

    const store = new Store(pool ?? path.join(directory, 'data', 'workspace.json'))
    startedAt = Date.now()
    await store.initialize(
      path.join(directory, 'data', 'workspace.json'),
      ...(demoBootstrap ? [path.join(directory, '../demo/workspace.seed.json')] : []),
    )
    log(`workspace initialization completed in ${elapsed(startedAt)}`)

    startedAt = Date.now()
    if (demoBootstrap && operationalService && examplesService) {
      await bootstrapDemoData(true, operationalService, examplesService)
      log(`demo bootstrap completed in ${elapsed(startedAt)}`)
    } else {
      log(`demo bootstrap skipped${demoBootstrap ? ' because a database dependency is unavailable' : ''} in ${elapsed(startedAt)}`)
    }
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
    const providerConnection = provider.provider === 'openai'
      ? Boolean(process.env.OPENAI_API_KEY)
      : await (async () => {
        try {
          const result = await promisify(execFile)('codex', ['login', 'status'], { timeout: 5000 })
          return /logged in/i.test(`${result.stdout}\n${result.stderr}`)
        } catch {
          return false
        }
      })()
    const configuredProvider = useDeterministicTestModel
      ? providerCapabilities({ provider: 'deterministic', model: 'deterministic-test', connected: true, operationalReview: false })
      : providerCapabilities({ provider: provider.provider, model: provider.provider === 'openai' ? process.env.OPENAI_MODEL : 'gpt-5.6-luna', connected: providerConnection, operationalReview: !!operationalAgents })
    const app = createApp(
      store,
      useDeterministicTestModel ? deterministicTestModel : provider.model,
      operationalService,
      operationalAgents,
      examplesService,
      { operationalPostgres: operationalReadiness, syntheticExamplesPostgres: examplesReadiness, provider: configuredProvider },
    )
    return { app, close: async () => { await Promise.all([pool?.end(), examplesPool?.end()]) } }
  } catch (error) {
    await Promise.allSettled([pool?.end(), examplesPool?.end()].filter(Boolean))
    throw error
  }
}