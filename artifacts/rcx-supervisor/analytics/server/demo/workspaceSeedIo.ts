import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Workspace } from '../../src/lib/model.ts'
import { assertSafeDemoWorkspace, sanitizeWorkspaceForDemo } from './workspaceSeed.ts'

function parseWorkspace(raw: string, source: string): Workspace {
  try { return JSON.parse(raw) as Workspace } catch { throw new Error(`Demo workspace at ${source} is not valid JSON.`) }
}

/**
 * Import-safe demo seed operations shared by the CLI and Replit bootstrap.
 * This module intentionally has no process-argument handling or top-level
 * await, so embedding Analytics in the Supervisor CommonJS server does not
 * pull a CLI entry point into the runtime dependency graph.
 */
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