import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createDisposableDatabase } from '../tests/integration/disposableDatabase.ts'
import { migrateDatabase } from '../server/db/migrate.ts'
import { migrateExamplesDatabase } from '../server/examples/migrate.ts'

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for the isolated Supervisor gateway test host.')
const workspace = path.resolve(process.cwd(), '../../..')
const analytics = process.cwd()
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
async function freePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1').once('listening', resolve).once('error', reject))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return String(port)
}
const run = (args: string[], cwd: string, env: Record<string, string> = {}) => new Promise<void>((resolve, reject) => {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`)))
})
const database = await createDisposableDatabase('gateway')
let host: ReturnType<typeof spawn> | undefined
let hostExited: Promise<void> | undefined
try {
  const hostPort = process.env.GATEWAY_TEST_PORT ?? await freePort()
  const analyticsPort = await freePort()
  await migrateDatabase(database.pool)
  await migrateExamplesDatabase(database.pool)
  await run(['--filter', '@workspace/rcx-supervisor', 'build'], workspace)
  const environment = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: database.url, SYNTHETIC_DATABASE_URL: database.url, PORT: hostPort, ANALYTICS_PORT: analyticsPort, ANALYTICS_TEST_MODEL: 'deterministic', NODE_ENV: 'production' }
  host = spawn(command, ['--filter', '@workspace/rcx-supervisor', 'start'], { cwd: workspace, env: environment, stdio: 'inherit', detached: true })
  hostExited = new Promise((resolve, reject) => host!.once('exit', code => code === 0 ? resolve() : reject(new Error(`Gateway host exited unexpectedly (${code}).`))).once('error', reject))
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${hostPort}/analytics`)).ok && (await fetch(`http://127.0.0.1:${hostPort}/analytics-api/status`)).ok) break } catch {}
    if (attempt === 99) throw new Error('Isolated Supervisor gateway host did not become ready.')
    await Promise.race([hostExited, sleep(250)])
  }
  await Promise.race([run(['exec', 'playwright', 'test', '-c', 'playwright.gateway.config.ts'], analytics, { PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${hostPort}` }), hostExited])
} finally {
  if (host?.pid) {
    process.kill(-host.pid, 'SIGTERM')
    await Promise.race([hostExited?.catch(() => {}), sleep(5_000)])
    try { process.kill(-host.pid, 'SIGKILL') } catch {}
  }
  await database.dispose()
}