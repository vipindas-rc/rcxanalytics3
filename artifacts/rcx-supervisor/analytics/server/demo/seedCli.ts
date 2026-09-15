import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Workspace } from '../../src/lib/model.ts'
import { assertSafeDemoWorkspace, sanitizeWorkspaceForDemo } from './workspaceSeed.ts'

function parseWorkspace(raw: string, source: string): Workspace {
  try { return JSON.parse(raw) as Workspace } catch { throw new Error(`Demo workspace at ${source} is not valid JSON.`) }
}

export async function writeDemoSeed(sourcePath: string, seedPath: string): Promise<void> {
  const source = parseWorkspace(await readFile(sourcePath, 'utf8'), sourcePath)
  const clean = sanitizeWorkspaceForDemo(source)
  await mkdir(path.dirname(seedPath), { recursive: true })
  await writeFile(seedPath, `${JSON.stringify(clean, null, 2)}\n`)
}

export async function restoreDemoWorkspace(seedPath: string, targetPath: string, force = false): Promise<void> {
  if (!force) {
    try { await access(targetPath); throw new Error(`Workspace already exists at ${targetPath}. Use --force to replace it.`) } catch (error: unknown) {
      if (error instanceof Error && /already exists/.test(error.message)) throw error
    }
  }
  const workspace = parseWorkspace(await readFile(seedPath, 'utf8'), seedPath)
  assertSafeDemoWorkspace(workspace)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, `${JSON.stringify(workspace, null, 2)}\n`)
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invoked) {
  const action = process.argv[2]
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const source = process.argv[3] ?? path.join(root, 'server/data/workspace.json')
  const target = action === 'export' ? path.join(root, 'demo/workspace.seed.json') : path.join(root, 'server/data/workspace.json')
  if (action === 'export') await writeDemoSeed(source, target)
  else if (action === 'restore') await restoreDemoWorkspace(path.join(root, 'demo/workspace.seed.json'), target, process.argv.includes('--force'))
  else throw new Error('Use `export` or `restore`.')
}
