import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { restoreDemoWorkspace, writeDemoSeed } from './seedCli.ts'

const workspace = JSON.stringify({
  version: 4, revision: 42, sessions: [], projects: [{ id: 'project-inbox', name: 'Analytics' }], datasets: [], artifacts: [], savedCharts: [], dashboards: [], requests: [], preferences: {}, briefings: [], responseCache: {},
})

describe('demo seed CLI helpers', () => {
  it('exports a sanitized workspace seed and restores it only into an absent target', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rcx-demo-'))
    const source = path.join(directory, 'source.json')
    const seed = path.join(directory, 'workspace.seed.json')
    const restored = path.join(directory, 'restored.json')
    await writeFile(source, workspace)
    await writeDemoSeed(source, seed)
    await restoreDemoWorkspace(seed, restored)
    expect(JSON.parse(await readFile(restored, 'utf8')).revision).toBe(1)
    await expect(restoreDemoWorkspace(seed, restored)).rejects.toThrow(/already exists/i)
  })
})

it('keeps Replit and LLM onboarding free of provider credentials', async () => {
  const fs = await import('node:fs/promises')
  const [environment, handoff] = await Promise.all([
    fs.readFile('.env.example', 'utf8'),
    fs.readFile('LLM_HANDOFF.md', 'utf8'),
  ])
  expect(environment).toContain('AI_PROVIDER=codex')
  expect(environment).not.toMatch(/sk-|gho_|github_pat_/)
  expect(handoff).toContain('never commit')
  expect(handoff).toContain('demo:restore')
})

it('keeps Replit-specific setup separate from application configuration', async () => {
  const replitGuide = await (await import('node:fs/promises')).readFile('replit/README.md', 'utf8')
  expect(replitGuide).toContain('DATABASE_URL')
  expect(replitGuide).toContain('RCX_DEMO_BOOTSTRAP')
  expect(replitGuide).toContain('orchestrator')
})
