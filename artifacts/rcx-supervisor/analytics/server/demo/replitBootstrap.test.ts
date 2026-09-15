import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureDemoWorkspace, shouldBootstrapDemo } from './replitBootstrap.ts'

const seed = JSON.stringify({ version: 4, revision: 1, sessions: [], projects: [{ id: 'project-inbox', name: 'Analytics' }], datasets: [], artifacts: [], savedCharts: [], dashboards: [], requests: [], preferences: {}, briefings: [], responseCache: {} })

describe('Replit bootstrap', () => {
  it('enables the demo bootstrap in Replit or when explicitly requested', () => {
    expect(shouldBootstrapDemo({ REPLIT_DEV_DOMAIN: 'demo.replit.dev' })).toBe(true)
    expect(shouldBootstrapDemo({ RCX_DEMO_BOOTSTRAP: 'true' })).toBe(true)
    expect(shouldBootstrapDemo({})).toBe(false)
  })

  it('hydrates a missing workspace once without replacing a later workspace', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rcx-replit-'))
    const seedPath = path.join(directory, 'seed.json')
    const targetPath = path.join(directory, 'workspace.json')
    await (await import('node:fs/promises')).writeFile(seedPath, seed)
    expect(await ensureDemoWorkspace(seedPath, targetPath)).toBe(true)
    expect(JSON.parse(await readFile(targetPath, 'utf8')).version).toBe(4)
    expect(await ensureDemoWorkspace(seedPath, targetPath)).toBe(false)
  })
})
