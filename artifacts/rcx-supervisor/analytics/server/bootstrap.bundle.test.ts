import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('production bootstrap bundle', () => {
  it('loads as CommonJS and retains both source migration directories', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'analytics-bootstrap-cjs-'))
    const outfile = path.join(directory, 'bootstrap.cjs')
    try {
      await build({
        entryPoints: [path.resolve(process.cwd(), 'server/bootstrap.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        logLevel: 'silent',
      })
      const bundled = await import(pathToFileURL(outfile).href)
      const supervisorRoot = path.resolve(process.cwd(), '..')
      expect(bundled.analyticsServerRoot(supervisorRoot)).toBe(path.join(supervisorRoot, 'analytics', 'server'))
      expect(bundled.operationalMigrationsDirectory(supervisorRoot)).toBe(path.join(supervisorRoot, 'analytics', 'server', 'migrations'))
      expect(bundled.examplesMigrationsDirectory(supervisorRoot)).toBe(path.join(supervisorRoot, 'analytics', 'server', 'examples', 'migrations'))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})