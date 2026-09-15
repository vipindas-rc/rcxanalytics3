import { access } from 'node:fs/promises'
import { restoreDemoWorkspace } from './workspaceSeedIo.ts'

export function shouldBootstrapDemo(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.RCX_DEMO_BOOTSTRAP === 'true' || Boolean(environment.REPLIT_DEV_DOMAIN)
}

export async function ensureDemoWorkspace(seedPath: string, workspacePath: string): Promise<boolean> {
  try { await access(workspacePath); return false } catch { await restoreDemoWorkspace(seedPath, workspacePath); return true }
}
